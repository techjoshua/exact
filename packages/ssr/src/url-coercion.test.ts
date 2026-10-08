import { expect, it } from 'vitest';
import { BLOCKED_JAVASCRIPT_URL } from '@exactjs/core';
import { changingUrl } from '../../component-composition-corpus/test-support/url-coercion.js';
import { renderAttrs, renderCompiledNativeAttribute } from './markup.js';
import { renderToString, renderToHydratableProgressiveHtmlStream } from './index.js';
import { createOperation } from './test-support/native-operations.js';

it.each(['primitive', 'string'] as const)(
	'checks the same URL it publishes through %s conversion',
	async (method) => {
		for (const first of ['/safe?first=1&second=2', 'javascript:probe']) {
			const expected = first.startsWith('/')
				? '/safe?first=1&amp;second=2'
				: BLOCKED_JAVASCRIPT_URL;
			for (const mode of [false, true, 19] as const) {
				const fixture = changingUrl(first, 'javascript:unchecked', method);
				const html =
					mode === true
						? renderCompiledNativeAttribute(fixture.value, 3, 'href', 'href', 'a')
						: renderAttrs({ href: fixture.value }, mode, 'a');
				expect(html).toBe(` href="${expected}"`);
				expect(fixture.calls()).toBe(1);
			}
			for (const streaming of [false, true]) {
				const fixture = changingUrl(first, 'javascript:unchecked', method);
				const operation = createOperation('a', { href: fixture.value }, 'Link');
				const html = streaming
					? await new Response(
							renderToHydratableProgressiveHtmlStream(operation, { markers: false })
						).text()
					: (await renderToString(operation, { markers: false })).html;
				expect(html).toContain(`href="${expected}"`);
				expect(fixture.calls()).toBe(1);
			}
		}
	}
);
