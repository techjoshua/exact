import { describe, expect, it } from 'vitest';
import {
	decodeExactValueWithSchema,
	isExactValueSerializationSchema,
	type ExactValueSerializationSchema
} from './value-serialization.js';

const schema = [
	1,
	'rows',
	[2, [1, 'id', 0, 'details', [1, 'ready', 0]]],
	'label',
	0
] as const satisfies ExactValueSerializationSchema;

describe('component-local value serialization', () => {
	it('reconstructs finite nested plain values from positional arrays', () => {
		expect(
			decodeExactValueWithSchema(
				[
					[
						['first', [true]],
						['second', [false]]
					],
					'queue'
				],
				schema
			)
		).toEqual({
			rows: [
				{ id: 'first', details: { ready: true } },
				{ id: 'second', details: { ready: false } }
			],
			label: 'queue'
		});
	});

	it('validates bounded nested schemas and unique fields', () => {
		expect(isExactValueSerializationSchema(schema)).toBe(true);
		expect(isExactValueSerializationSchema([2, [1, 'id', 0]])).toBe(true);
		expect(isExactValueSerializationSchema([1, 'same', 0, 'same', 0])).toBe(false);
	});

	it('rejects malformed positional lengths', () => {
		expect(() => decodeExactValueWithSchema([[]], schema)).toThrow(
			'Malformed positional eXact component value'
		);
	});
});
