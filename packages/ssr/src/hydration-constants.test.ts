import { expect, it } from 'vitest';
import { decodeReactiveProtocolValue } from '@exactjs/core';
import { createServerBoundary } from '@exactjs/core/runtime/render';
import { renderToString } from './index.js';
import { renderHydrationScript, serializeHydrationPayload } from './hydration.js';

const decode = (json: string) => decodeReactiveProtocolValue(JSON.parse(json));

it.each([undefined, NaN, Infinity, -Infinity, -0])(
	'preserves constants in document, resumption and island values (%s)',
	async (value) => {
		const state = { value, rows: [value], map: new Map([['key', value]]), set: new Set([value]) };
		const script = (html: string) => decode(html.match(/>(.*)<\/script>/s)![1]!);
		expect(script(renderHydrationScript({ state }))).toEqual({ state });
		expect(script(renderHydrationScript({}, undefined, [['Panel', [[0, state]]]]))).toEqual([
			1,
			64,
			[['Panel', [[0, state]]]]
		]);
		expect(decode(serializeHydrationPayload(state))).toEqual(state);
		const result = await renderToString(createServerBoundary('panel', 'Panel', state));
		const payload = result.html
			.match(/data-exact-client-props="([^"]*)"/)![1]!
			.replace(/&quot;/g, '"')
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>');
		expect(decode(payload)).toEqual({ props: state });
	}
);

it('preserves a lone constant without needing a collection encoding cache', () => {
	for (const value of [undefined, NaN, Infinity, -Infinity, -0]) {
		const json = renderHydrationScript({ state: { own: value } }).match(/>(.*)<\/script>/s)![1]!;
		const result = decode(json) as { state: { own: unknown } };
		expect(Object.hasOwn(result.state, 'own')).toBe(true);
		expect(Object.is(result.state.own, value)).toBe(true);
	}
});
