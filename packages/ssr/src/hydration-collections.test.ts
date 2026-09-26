import { registerReactiveListKey } from '@exactjs/reactive';
import { expect, it, vi } from 'vitest';
import { decodeReactiveProtocolValue } from '@exactjs/core';
import { createServerBoundary } from '@exactjs/core/runtime/render';
import { renderToString } from './index.js';
import { jsonUnsafePath, renderHydrationScript, serializeHydrationPayload } from './hydration.js';
import { validateJsonSafeHydrationValue } from './hydration-json.js';

const values = [
	[
		'map',
		() =>
			new Map([
				['second', { label: '</script>two' }],
				['first', { label: 'one' }]
			])
	],
	['set', () => new Set(['second', 'first'])],
	['nested', () => ({ rows: new Map([[1, new Set(['a', 'b'])]]) })]
] as const;

it.each(values)(
	'round trips %s through document, resumption, and island publication',
	async (_name, create) => {
		const value = create();
		const state = { value };
		const decodeScript = (html: string) =>
			decodeReactiveProtocolValue(JSON.parse(html.match(/>(.*)<\/script>/s)![1]));
		expect(decodeScript(renderHydrationScript({ state }))).toMatchObject({ state });
		expect(decodeScript(renderHydrationScript({}, undefined, [['Panel', [[0, value]]]]))).toEqual([
			1,
			64,
			[['Panel', [[0, value]]]]
		]);
		expect(JSON.parse(serializeHydrationPayload(state))).not.toEqual({ value: {} });
		expect(decodeReactiveProtocolValue(JSON.parse(serializeHydrationPayload(state)))).toEqual(
			state
		);
		const result = await renderToString(createServerBoundary('panel', 'Panel', state));
		const payload = result.html
			.match(/data-exact-client-props="([^"]*)"/)![1]!
			.replace(/&quot;/g, '"')
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>');
		expect(decodeReactiveProtocolValue(JSON.parse(payload))).toEqual({ props: state });
	}
);

it('rejects unsafe collection values without invoking accessors and bounds collection traversal', () => {
	const get = vi.fn(() => 'secret');
	const accessor = Object.defineProperty({}, 'secret', { enumerable: true, get });
	const cycle = new Map<string, unknown>();
	cycle.set('self', cycle);
	for (const value of [
		new Map([[{}, 'bad key']]),
		new Set([accessor]),
		new Map([['fn', () => 1]]),
		cycle
	]) {
		expect(jsonUnsafePath(value)).toBeDefined();
		expect(validateJsonSafeHydrationValue(value, {})).toBeDefined();
		expect(() => renderHydrationScript({ state: { value } })).toThrow();
	}
	expect(get).not.toHaveBeenCalled();
	for (const value of [
		new Map([
			['a', 1],
			['b', 2]
		]),
		new Set([1, 2])
	]) {
		expect(validateJsonSafeHydrationValue(value, { maxNodes: 1 })).toBeDefined();
		expect(validateJsonSafeHydrationValue({ value }, { maxDepth: 1 })).toBeDefined();
	}
});

it('encodes each publication of a shared keyed array and nested collection', () => {
	const rows = [{ id: 'a', label: 'first' }];
	registerReactiveListKey(
		rows,
		(item) => (item as { id: string }).id,
		'shared hydration',
		'member:id'
	);
	const state = {
		first: rows,
		second: rows,
		map: new Map([['a', { rows, selected: new Set(['a']) }]])
	};
	const payload = JSON.parse(renderHydrationScript({ state }).match(/>(.*)<\/script>/s)![1]);
	expect(payload.state.first.$exact).toBe('keyed-collection');
	expect(payload.state.second).toEqual(payload.state.first);
	expect(decodeReactiveProtocolValue(payload)).toEqual({ state });
});

it('rejects collection serialization hooks without executing them', () => {
	const hook = vi.fn(() => []);
	for (const value of [
		Object.defineProperty(new Map([['a', 1]]), 'toJSON', { get: hook }),
		Object.defineProperty(new Set(['a']), Symbol.iterator, { get: hook }),
		new (class extends Map<string, number> {})()
	]) {
		expect(jsonUnsafePath(value)).toBeDefined();
		expect(validateJsonSafeHydrationValue(value, {})).toBeDefined();
		expect(() => renderHydrationScript({ state: { value } })).toThrow();
	}
	expect(hook).not.toHaveBeenCalled();
});
