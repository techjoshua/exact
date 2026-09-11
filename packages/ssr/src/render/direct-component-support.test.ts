import { type Child } from '@exactjs/core';
import {
	createCompiledFragmentReceipt,
	createCompiledIntrinsicReceipt
} from '@exactjs/core/runtime/component-operations';
import {
	createPreparedServerComponentReference,
	createPreparedServerKeyedChild
} from '@exactjs/core/framework/server-render-structure';
import { describe, expect, it } from 'vitest';
import { createDirectSsrComponentFrame } from './direct-component-support.js';
import { renderToString } from './render-output.js';
import {
	SinkFragments,
	resetSinkFixture,
	sinkFixtureDisposals,
	sinkFixtureStarts
} from './program-sink.fixtures.test.js';

describe('direct server map', () => {
	it.each([undefined, 'rows-->\u{1F680}'])(
		'preserves fragment and item markers for key %s',
		async (id) => {
			for (const markers of [false, true]) {
				for (const values of [[], ['<&', 'second']]) {
					const render = (value: string) => createCompiledIntrinsicReceipt('span', null, value);
					const direct = createDirectSsrComponentFrame().map(values, (value) => value, render, id);
					const generic = createCompiledFragmentReceipt(
						{ key: id },
						...values.map((value) => createPreparedServerKeyedChild(render(value), value))
					);
					expect((await renderToString(direct as Child, { markers })).html).toBe(
						(await renderToString(generic, { markers })).html
					);
				}
			}
		}
	);

	it('snapshots iterable input before invoking item render and key callbacks', () => {
		const reads: string[] = [];
		function* input() {
			reads.push('iterate:first');
			yield 'first';
			reads.push('iterate:second');
			yield 'second';
		}
		createDirectSsrComponentFrame().map(
			input(),
			(value) => {
				reads.push(`key:${value}`);
				return value;
			},
			(value) => {
				reads.push(`render:${value}`);
				return value;
			}
		);
		expect(reads).toEqual([
			'iterate:first',
			'iterate:second',
			'render:first',
			'key:first',
			'render:second',
			'key:second'
		]);
	});

	it.each([false, true])(
		'releases scheduled children after list completion or abort=%s',
		async (abort) => {
			const release = resetSinkFixture();
			const controller = new AbortController();
			const list = createDirectSsrComponentFrame().map(
				['pending'],
				(value) => value,
				() => createPreparedServerComponentReference(SinkFragments, {})
			);
			const result = renderToString(list as Child, { signal: controller.signal });
			void result.catch(() => undefined);
			try {
				expect(sinkFixtureStarts()).toBe(1);
				expect(sinkFixtureDisposals()).toBe(0);
				if (abort) controller.abort(new Error('List aborted'));
				release();
				if (abort) await expect(result).rejects.toThrow('List aborted');
				else expect((await result).html).toContain('Ready');
				expect(sinkFixtureDisposals()).toBe(1);
			} finally {
				release();
				await result.catch(() => undefined);
			}
		}
	);

	it('renders keyed intrinsic children in order through the shared renderer', async () => {
		const frame = createDirectSsrComponentFrame();
		const reads: string[] = [];
		const output = frame.map(
			['first', 'second'],
			(value) => {
				reads.push(`key:${value}`);
				return value;
			},
			(value) => {
				reads.push(`render:${value}`);
				return createCompiledIntrinsicReceipt('span', null, value);
			},
			'items'
		);
		const result = await renderToString(output as Child);
		expect(reads).toEqual(['render:first', 'key:first', 'render:second', 'key:second']);
		expect(result.html).toContain('<span>first</span>');
		expect(result.html).toContain('<span>second</span>');
		expect(result.html.indexOf('first')).toBeLessThan(result.html.indexOf('second'));
	});
});
