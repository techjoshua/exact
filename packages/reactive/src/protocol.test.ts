import { describe, expect, it } from 'vitest';
import {
	decodeReactiveProtocolValue,
	encodeReactiveProtocolValue,
	reactive,
	registerReactiveListKey
} from './index.js';

describe('@exactjs/reactive protocol', () => {
	it('round-trips keyed collections through a transparent protocol envelope', () => {
		const records = [
			{ id: 'a', title: 'A' },
			{ id: 'b', title: 'B' }
		];
		registerReactiveListKey(records, (item) => (item as { id: string }).id, 'test', 'member:id');
		const encoded = encodeReactiveProtocolValue({ records }) as {
			records: Record<string, unknown>;
		};
		expect(encoded.records).toMatchObject({
			$exact: 'keyed-collection',
			version: 1,
			keys: ['a', 'b']
		});
		expect(encoded.records.itemHashes as string[]).toHaveLength(2);
		const decoded = decodeReactiveProtocolValue(JSON.parse(JSON.stringify(encoded))) as {
			records: typeof records;
		};
		expect(Array.isArray(decoded.records)).toBe(true);
		expect(decoded.records).toEqual(records);
		expect(Object.keys(decoded.records)).toEqual(['0', '1']);
	});

	it('rejects malformed keyed collection envelopes', () => {
		expect(() =>
			decodeReactiveProtocolValue({
				$exact: 'keyed-collection',
				version: 1,
				keys: ['a'],
				keyHash: '0'.repeat(32),
				itemHashes: [],
				itemsHash: '0'.repeat(32),
				items: [{ id: 'a' }]
			})
		).toThrow('Malformed eXact keyed-collection envelope');
	});

	it('round-trips Maps and Sets without losing order or key types', () => {
		const encoded = encodeReactiveProtocolValue({
			lookup: new Map<unknown, unknown>([
				['one', { value: 1 }],
				[2, new Set(['a', 'b'])],
				[false, null]
			])
		});
		const decoded = decodeReactiveProtocolValue(JSON.parse(JSON.stringify(encoded))) as {
			lookup: Map<unknown, unknown>;
		};

		expect([...decoded.lookup.keys()]).toEqual(['one', 2, false]);
		expect(decoded.lookup.get('one')).toEqual({ value: 1 });
		expect(decoded.lookup.get(2)).toEqual(new Set(['a', 'b']));
	});

	it('rejects unsafe Map keys and malformed collection envelopes', () => {
		expect(() => encodeReactiveProtocolValue(new Map([[{}, 'value']]))).toThrow(
			'eXact Map protocol keys'
		);
		expect(() =>
			decodeReactiveProtocolValue({
				$exact: 'map',
				version: 1,
				entries: [[{}, 'value']]
			})
		).toThrow('Malformed eXact Map envelope');
		expect(() =>
			decodeReactiveProtocolValue({
				$exact: 'set',
				version: 1,
				values: [],
				unexpected: true
			})
		).toThrow('Malformed eXact Set envelope');
	});

	it('rejects conflicting key extractors registered for one collection', () => {
		const state = reactive({ records: [{ id: 'a', slug: 'first' }] });
		registerReactiveListKey(state.records, (item) => (item as { id: string }).id, 'Tasks.tsx:10');

		expect(() =>
			registerReactiveListKey(
				state.records,
				(item) => (item as { slug: string }).slug,
				'Sidebar.tsx:20'
			)
		).toThrow('Conflicting this.map() key extractors');
	});

	it('uses compiler key metadata instead of recreated function identity', () => {
		const state = reactive({ records: [{ id: 'a' }] });
		registerReactiveListKey(
			state.records,
			(item) => (item as { id: string }).id,
			'ListA',
			'member:id'
		);
		expect(() =>
			registerReactiveListKey(
				state.records,
				function differentSource(item) {
					return (item as { id: string }).id;
				},
				'ListB',
				'member:id'
			)
		).not.toThrow();
		expect(() =>
			registerReactiveListKey(
				state.records,
				(item) => (item as { id: string }).id,
				'ListC',
				'member:slug'
			)
		).toThrow('Conflicting this.map() key extractors');
	});
});
