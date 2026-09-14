import { createEnhancementNode } from '@exactjs/core';
import { describe, expect, it } from 'vitest';
import { createSsrContext } from './context.js';
import { renderOperationEnhancements } from './operation-enhancements.js';
import { renderWriterSequence } from '../test-support/program-writer-fixture.js';
import type { SsrProgramSink } from './program-sink.js';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((accept, fail) => {
		resolve = accept;
		reject = fail;
	});
	return { promise, resolve, reject };
}

function recordingSink() {
	const writes: string[] = [];
	const flushes: Array<{ reason: string; html: string }> = [];
	const sink: SsrProgramSink = {
		write(html) {
			writes.push(html);
		},
		ready() {},
		flush(reason) {
			flushes.push({ reason, html: writes.join('') });
		}
	};
	return { sink, writes, flushes };
}

describe('render-program sink ownership', () => {
	it('publishes the completed head while the body remains pending', async () => {
		const context = createSsrContext({});
		const { sink, writes, flushes } = recordingSink();
		context.writerSink = sink;
		const task = deferred<string>();
		const result = renderWriterSequence(
			context,
			['<html>', { head: true }, { head: false }, '</html>'],
			(part) =>
				part.head
					? renderWriterSequence(
							context,
							['<head><link rel="stylesheet" href="app.css"></head>'],
							() => '',
							'head'
						)
					: renderWriterSequence(context, ['<body>', {}, '</body>'], () => task.promise, 'body'),
			'html'
		);
		expect(flushes[0]).toEqual({
			reason: 'head',
			html: '<!doctype html><html><head><link rel="stylesheet" href="app.css"></head>'
		});
		expect(flushes.some((flush) => flush.reason === 'await' && flush.html.endsWith('<body>'))).toBe(
			true
		);
		expect(writes.join('')).not.toContain('</body>');
		expect(context.hostStack).toEqual(['html', 'body']);
		task.resolve('Ready');
		expect(await result).toBe('');
		expect(writes.join('')).toBe(
			'<!doctype html><html><head><link rel="stylesheet" href="app.css"></head><body>Ready</body></html>'
		);
		expect(context.hostStack).toEqual([]);
	});

	it('does not start later children until a write drains, including the final write', async () => {
		const context = createSsrContext({});
		const { sink, writes } = recordingSink();
		const first = deferred<void>(),
			final = deferred<void>();
		let pending: Promise<void> | undefined = first.promise;
		sink.ready = () => pending;
		context.writerSink = sink;
		let children = 0;
		const result = renderWriterSequence(context, ['a', {}], () => {
			children++;
			pending = final.promise;
			return 'b';
		});
		expect(writes).toEqual(['a']);
		expect(children).toBe(0);
		pending = undefined;
		first.resolve();
		await first.promise;
		await Promise.resolve();
		expect(children).toBe(1);
		expect(writes).toEqual(['a', 'b']);
		let settled = false;
		const observed = Promise.resolve(result).then((value) => {
			settled = true;
			return value;
		});
		await Promise.resolve();
		expect(settled).toBe(false);
		pending = undefined;
		final.resolve();
		expect(await observed).toBe('');
	});

	it('releases document ancestry when pressure rejects without starting later work', async () => {
		const context = createSsrContext({});
		const { sink } = recordingSink();
		const pressure = deferred<void>();
		let blocked = false;
		sink.write = () => {
			blocked = true;
		};
		sink.ready = () => (blocked ? pressure.promise : undefined);
		context.writerSink = sink;
		let children = 0;
		const result = renderWriterSequence(
			context,
			['<html>', {}],
			() => {
				children++;
				return '';
			},
			'html'
		);
		const failure = new Error('reader cancelled');
		pressure.reject(failure);
		await expect(result).rejects.toBe(failure);
		expect(children).toBe(0);
		expect(context.hostStack).toEqual([]);
	});

	it('observes abandoned child rejection when flushing throws', async () => {
		const context = createSsrContext({});
		const { sink } = recordingSink();
		const child = deferred<string>();
		const failure = new Error('transport failed');
		sink.flush = () => {
			throw failure;
		};
		context.writerSink = sink;
		const result = renderWriterSequence(context, [{}], () => child.promise, 'html');
		expect(context.hostStack).toEqual(['html']);
		child.reject(new Error('abandoned task failed'));
		await expect(result).rejects.toBe(failure);
		expect(context.hostStack).toEqual([]);
		await new Promise((resolve) => setTimeout(resolve, 0));
	});

	it('retains nested host ownership until the child settles after an asynchronous flush failure', async () => {
		const context = createSsrContext({});
		const { sink } = recordingSink();
		const child = deferred<string>();
		const pressure = deferred<void>();
		sink.flush = () => pressure.promise;
		context.writerSink = sink;
		const result = renderWriterSequence(
			context,
			['<html>', {}],
			() => renderWriterSequence(context, ['<body>', {}], () => child.promise, 'body'),
			'html'
		);
		let settled = false;
		const observed = Promise.resolve(result).then(
			() => {
				settled = true;
			},
			(error) => {
				settled = true;
				return error;
			}
		);
		const failure = new Error('transport failed');
		pressure.reject(failure);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(settled).toBe(false);
		expect(context.hostStack).toEqual(['html', 'body']);
		child.reject(new Error('request cancelled'));
		expect(await observed).toBe(failure);
		expect(context.hostStack).toEqual([]);
	});

	it.each(['success', 'failure'] as const)(
		'restores nested enhancement captures on %s',
		async (outcome) => {
			const context = createSsrContext({});
			const { sink, writes } = recordingSink();
			context.writerSink = sink;
			const child = deferred<string>();
			const enhancement = createEnhancementNode([]);
			const result = renderOperationEnhancements(
				context,
				enhancement,
				() => {
					expect(context.writerSink).toBeUndefined();
					return renderOperationEnhancements(
						context,
						enhancement,
						() => renderWriterSequence(context, ['before', {}, 'after'], () => child.promise),
						undefined,
						{},
						() => ''
					);
				},
				undefined,
				{},
				() => ''
			);
			expect(writes).toEqual([]);
			expect(context.writerSink).toBeUndefined();
			if (outcome === 'success') {
				child.resolve('middle');
				expect(await result).toBe('beforemiddleafter');
			} else {
				const failure = new Error('enhanced child failed');
				child.reject(failure);
				await expect(result).rejects.toBe(failure);
			}
			expect(context.writerSink).toBe(sink);
			expect(context.enhancementOperationRoutes?.length ?? 0).toBe(0);
			expect(writes).toEqual([]);
		}
	);
});
