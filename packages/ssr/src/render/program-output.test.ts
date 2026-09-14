import { describe, expect, it } from 'vitest';
import { createSsrContext } from './context.js';
import { SsrOutputLimitError } from './limits.js';
import { renderWriterSequence } from '../test-support/program-writer-fixture.js';

describe('ordered SSR program output', () => {
	it('waits for pending segments before executing later work', async () => {
		const calls: number[] = [];
		let resolve!: (html: string) => void;
		const pending = new Promise<string>((ready) => {
			resolve = ready;
		});
		const result = renderWriterSequence(
			createSsrContext({}),
			['a', { id: 1 }, 'c', { id: 2 }],
			(segment) => {
				calls.push(segment.id);
				return segment.id === 1 ? pending : 'd';
			}
		);
		expect(calls).toEqual([1]);
		resolve('b');
		expect(await result).toBe('abcd');
		expect(calls).toEqual([1, 2]);
	});

	it('preserves output bounds for a completed span and after suspension', async () => {
		expect(() =>
			renderWriterSequence(createSsrContext({ maxOutputBytes: 3 }), ['abcd'], () => '')
		).toThrow(SsrOutputLimitError);
		await expect(
			renderWriterSequence(createSsrContext({ maxOutputBytes: 3 }), ['ab', {}], () =>
				Promise.resolve('cd')
			)
		).rejects.toThrow(SsrOutputLimitError);
	});

	it('does not execute later segments after a rejected component', async () => {
		const failure = new Error('component failed');
		const calls: number[] = [];
		await expect(
			renderWriterSequence(createSsrContext({}), [{ id: 1 }, { id: 2 }], (segment) => {
				calls.push(segment.id);
				return Promise.reject(failure);
			})
		).rejects.toBe(failure);
		expect(calls).toEqual([1]);
	});
});

describe('compiled document host ownership', () => {
	it('retains document ancestry across pending children and releases it on failure', async () => {
		const context = createSsrContext({});
		let reject!: (error: Error) => void;
		const pending = new Promise<string>((_resolve, fail) => {
			reject = fail;
		});
		const result = renderWriterSequence(
			context,
			['<html>', {}],
			() => renderWriterSequence(context, ['<body>', {}], () => pending, 'body'),
			'html'
		);
		expect(context.hostStack).toEqual(['html', 'body']);
		const failure = new Error('failed descendant');
		reject(failure);
		await expect(result).rejects.toBe(failure);
		expect(context.hostStack).toEqual([]);
	});

	it('rejects duplicate and nested document hosts through the shared host contract', () => {
		const context = createSsrContext({});
		expect(() =>
			renderWriterSequence(
				context,
				[{}, {}],
				() => renderWriterSequence(context, ['<head></head>'], () => '', 'head'),
				'html'
			)
		).toThrow(/at most one <head>/);
		expect(context.hostStack).toEqual([]);
		const nested = createSsrContext({});
		expect(() =>
			renderWriterSequence(
				nested,
				[{}],
				() => renderWriterSequence(nested, ['<html></html>'], () => '', 'html'),
				'html'
			)
		).toThrow(/nested or duplicate/);
		expect(nested.hostStack).toEqual([]);
	});

	it('accounts for the doctype in the complete output bound', () => {
		const context = createSsrContext({ maxOutputBytes: 14 });
		expect(() => renderWriterSequence(context, ['<html></html>'], () => '', 'html')).toThrow(
			SsrOutputLimitError
		);
		expect(context.hostStack).toEqual([]);
	});
});
