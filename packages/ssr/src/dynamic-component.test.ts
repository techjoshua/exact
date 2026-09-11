import { Fragment } from '@exactjs/core';
import { createServerDynamicComponent } from '@exactjs/core/runtime/dynamic-components';
import { describe, expect, it } from 'vitest';
import { renderToStream, renderToString } from './index.js';
import { readStreamText } from './test-support/streams.js';
import { createOperation } from './test-support/native-operations.js';

describe('@exactjs/ssr dynamic component boundaries', () => {
	it('publishes an inert marker without reading the client resolver', async () => {
		const vnode = createServerDynamicComponent('fixture:dynamic');
		const result = await renderToString(vnode);
		const streamed = await readStreamText(renderToStream(vnode));
		expect(result.html).toContain('exact:dynamic:fixture:dynamic');
		expect(streamed).toBe(result.html);
	});

	it('emits only authorized immutable selected-artifact hints with a request bound', async () => {
		const early: (readonly string[])[] = [];
		const first = createServerDynamicComponent('fixture:first');
		const second = createServerDynamicComponent('fixture:second');
		const result = await renderToString(createOperation(Fragment, null, first, first, second), {
			maxDynamicComponentPreloads: 1,
			dynamicComponentArtifacts: {
				'fixture:first': {
					url: '/assets/first.abc.mjs',
					authorized: true,
					immutable: true,
					integrity: 'sha384-YWJj',
					crossOrigin: 'anonymous'
				},
				'fixture:second': {
					url: 'javascript:alert(1)',
					authorized: true,
					immutable: true
				}
			},
			onEarlyHints: (links) => early.push(links)
		});
		expect(result.preloadLinks).toEqual([
			'</assets/first.abc.mjs>; rel=modulepreload; integrity="sha384-YWJj"; crossorigin=anonymous'
		]);
		expect(result.html.match(/rel="modulepreload"/g)).toHaveLength(1);
		expect(early).toEqual([result.preloadLinks]);
		expect(result.html).not.toContain('javascript:');
	});
});
