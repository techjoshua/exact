import { expect, it } from 'vitest';
import { decodeReactiveProtocolValue, encodeReactiveProtocolValue } from './protocol.js';

const constants = [undefined, NaN, Infinity, -Infinity, -0];

it.each(constants)('preserves a constant through JSON in every value position (%s)', (value) => {
	const roundTrip = (input: unknown) =>
		decodeReactiveProtocolValue(JSON.parse(JSON.stringify(encodeReactiveProtocolValue(input))));
	expect(Object.is(roundTrip(value), value)).toBe(true);
	const decoded = roundTrip({
		own: value,
		rows: [value],
		map: new Map([['key', value]]),
		set: new Set([value])
	}) as {
		own: unknown;
		rows: unknown[];
		map: Map<string, unknown>;
		set: Set<unknown>;
	};
	expect(Object.hasOwn(decoded, 'own')).toBe(true);
	expect(Object.is(decoded.own, value)).toBe(true);
	expect(Object.is(decoded.rows[0], value)).toBe(true);
	expect(Object.is(decoded.map.get('key'), value)).toBe(true);
	expect(decoded.set.has(value)).toBe(true);
});

it('keeps constant-shaped application records literal, including nested reserved records', () => {
	const input = {
		$exact: 'map',
		version: 1,
		constant: 'undefined',
		child: { $exact: 'map', version: 1, constant: 'NaN' },
		own: undefined
	};
	expect(
		decodeReactiveProtocolValue(JSON.parse(JSON.stringify(encodeReactiveProtocolValue(input))))
	).toEqual(input);
});

it.each(['unknown', null, ['NaN'], 0])('rejects an invalid constant token (%s)', (constant) => {
	expect(() => decodeReactiveProtocolValue({ $exact: 'map', version: 1, constant })).toThrow(
		/Malformed eXact/
	);
});

it.each([
	{ $exact: 'map', version: 2, constant: 'NaN' },
	{ $exact: 'map', version: 1, constant: 'NaN', entries: [] },
	{ $exact: 'map', version: 1, constant: 'NaN', extra: true }
])('rejects ambiguous or unsupported constant capsules (%s)', (value) => {
	expect(() => decodeReactiveProtocolValue(value)).toThrow(/Malformed eXact/);
});

it.each([null, true, false, 0, 1.5, 'undefined', 'NaN', 'Infinity', '-Infinity', '-0'])(
	'retains ordinary scalar representation (%s)',
	(value) => {
		expect(encodeReactiveProtocolValue(value)).toBe(value);
		expect(decodeReactiveProtocolValue(JSON.parse(JSON.stringify(value)))).toBe(value);
	}
);

it('retains keyed metadata and refreshes item identity when a constant changes', async () => {
	const { reactive, registerReactiveListKey } = await import('./index.js');
	const rows = reactive([{ id: 'row', value: undefined as unknown }]);
	const release = registerReactiveListKey(
		rows,
		(item) => (item as { id: string }).id,
		'constants',
		'member:id'
	);
	try {
		let previous: unknown;
		for (const value of [undefined, null, NaN, Infinity, -Infinity, -0, 0, 'undefined']) {
			rows[0]!.value = value;
			const encoded = encodeReactiveProtocolValue(rows) as { $exact: string; itemsHash: string };
			expect(encoded.$exact).toBe('keyed-collection');
			expect(encoded.itemsHash).not.toBe(previous);
			previous = encoded.itemsHash;
			const decoded = decodeReactiveProtocolValue(
				JSON.parse(JSON.stringify(encoded))
			) as typeof rows;
			expect(Object.is(decoded[0]!.value, value)).toBe(true);
		}
	} finally {
		release();
	}
});
