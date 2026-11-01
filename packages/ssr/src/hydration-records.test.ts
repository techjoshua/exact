import { verifyIslandPublicationBudget } from '../../component-composition-corpus/test-support/hydration-record-journey.js';
import { reactive, registerReactiveListKey } from '@exactjs/reactive';
import { decodeReactiveProtocolValue } from '@exactjs/core';
import { createServerBoundary } from '@exactjs/core/runtime/render';
import { expect, it } from 'vitest';
import { renderToString } from './index.js';
import { renderHydrationScript, serializeHydrationPayload } from './hydration.js';

const literals = [
	{ $exact: 'map', version: 1, entries: [] },
	{ $exact: 'set', version: 1, values: [] },
	{ $exact: 'keyed-collection', version: 1 },
	{ $exact: 'map', version: 2, record: [] },
	JSON.parse('{"$exact":"map","version":1,"__proto__":{"safe":true},"constructor":"data"}')
];

function readScript(html: string): unknown {
	return decodeReactiveProtocolValue(JSON.parse(html.match(/>(.*)<\/script>/s)![1]!));
}

it('preserves literal records across document, resumption, and island publication', async () => {
	for (const record of literals) {
		const value = { record, map: new Map([['record', record]]), set: new Set([record]) };
		expect(readScript(renderHydrationScript({ state: { value } }))).toMatchObject({
			state: { value }
		});
		expect(readScript(renderHydrationScript({}, undefined, [['Panel', [[0, value]]]]))).toEqual([
			1,
			64,
			[['Panel', [[0, value]]]]
		]);
		expect(decodeReactiveProtocolValue(JSON.parse(serializeHydrationPayload(value)))).toEqual(
			value
		);
		const result = await renderToString(createServerBoundary('panel', 'Panel', value));
		const props = result.html
			.match(/data-exact-client-props="([^"]*)"/)![1]!
			.replace(/&quot;/g, '"')
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>');
		expect(decodeReactiveProtocolValue(JSON.parse(props))).toEqual({ props: value });
	}
});
it('normalizes reactive proxy identity across collection and record replacements', () => {
	const state = reactive({
		rows: [{ id: 'a', record: literals[0] }],
		nested: { map: new Map([['key', literals[1]]]) }
	});
	const release = registerReactiveListKey(
		state.rows,
		(item) => (item as { id: string }).id,
		'hydration-records',
		'id'
	);
	try {
		expect(readScript(renderHydrationScript({ state }))).toMatchObject({ state });
	} finally {
		release();
	}
});
it('checks encoded graph limits before publishing wrapped values', () => {
	for (const value of [new Set(['value']), literals[0]]) {
		const state = { value };
		const json = renderHydrationScript({ state }).match(/>(.*)<\/script>/s)![1]!;
		const pending: unknown[] = [JSON.parse(json)];
		let nodes = 0;
		while (pending.length) {
			const item = pending.pop();
			nodes++;
			if (item && typeof item === 'object') pending.push(...Object.values(item));
		}
		expect(() => renderHydrationScript({ state, maxHydrationNodes: nodes - 1 })).toThrow(
			'graph limits'
		);
		expect(() => renderHydrationScript({ state, maxHydrationNodes: nodes })).not.toThrow();
	}
	expect(() =>
		renderHydrationScript({ state: { record: literals[0] }, maxHydrationDepth: 3 })
	).toThrow('graph limits');
	expect(() =>
		renderHydrationScript({ state: { record: literals[0] }, maxHydrationDepth: 5 })
	).not.toThrow();
});
it('keeps invisible marker properties out of ordinary JSON and refuses accessor markers', () => {
	const record = Object.defineProperty({ label: 'ordinary' }, '$exact', {
		value: 'map',
		enumerable: false
	});
	expect(readScript(renderHydrationScript({ state: { record } }))).toMatchObject({
		state: { record: { label: 'ordinary' } }
	});
	let reads = 0;
	const accessor = Object.defineProperty({}, '$exact', {
		enumerable: true,
		get() {
			reads++;
			return 'map';
		}
	});
	expect(() => renderHydrationScript({ state: { accessor } })).toThrow('JSON-serializable');
	expect(reads).toBe(0);
});

it('rejects a keyed island graph that grows past the default encoded-node boundary', async () => {
	await verifyIslandPublicationBudget({
		registerReactiveListKey,
		renderToString,
		createServerBoundary
	});
});
