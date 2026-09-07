import { describe, expect, it, vi } from 'vitest';
import type { ExactValueSerializationSchema } from '@exactjs/core/framework/component-contracts';
import { ProjectedRecords } from './positional-projection.fixtures.test.js';
import { validateJsonSafeHydrationValue } from './hydration-json.js';
import { readServerComponentReference } from './render/server-component-reference.js';
import { createOperation } from './test-support/native-operations.js';
import {
	readPositionalProjector,
	registerPositionalProjector
} from './runtime/positional-projection.js';

vi.mock(
	'@exactjs/ssr/runtime/positional-projection',
	() => import('./runtime/positional-projection.js')
);

describe('compiled positional projection', () => {
	const schema = readServerComponentReference(createOperation(ProjectedRecords, { rows: [] }))!
		.contract.artifact.serialization!;
	const interpreted = structuredClone(schema);
	const item = (schema as readonly unknown[])[2] as readonly [2, ExactValueSerializationSchema];
	const record = item[1];
	const rows = () =>
		Array.from({ length: 20 }, (_, index) => ({
			id: String(index),
			title: '<script>🚀',
			count: index,
			detail: { text: 'detail' }
		}));
	function validate(selected: ExactValueSerializationSchema, make: () => unknown, limits = {}) {
		const payload = { state: null };
		const error = validateJsonSafeHydrationValue(payload, {
			...limits,
			structurallyKnownRoot: payload,
			positionalRoot: { componentId: 'test:projection', props: { rows: make() }, schema: selected }
		});
		return { error, payload };
	}

	it('executes native emitted code with the same positional output', () => {
		const project = readPositionalProjector(record)!;
		expect(project).toBeTypeOf('function');
		const observed = vi.fn(project);
		registerPositionalProjector(record, 1, observed);
		try {
			expect(validate(schema, rows)).toEqual(validate(interpreted, rows));
			expect(observed).toHaveBeenCalledTimes(20);
			observed.mockClear();
			const short = () => rows().slice(0, 3);
			expect(validate(schema, short)).toEqual(validate(interpreted, short));
			expect(observed).not.toHaveBeenCalled();
		} finally {
			registerPositionalProjector(record, 1, project);
		}
	});

	it.each(['missing', 'extra', 'getter', 'cycle', 'prototype', 'nonfinite'])(
		'preserves %s failure behavior',
		(mutation) => {
			const make = () => {
				const values = rows();
				const first = values[0]! as Record<string, unknown>;
				if (mutation === 'missing') delete first.title;
				if (mutation === 'extra') first.extra = true;
				if (mutation === 'getter')
					Object.defineProperty(first, 'id', {
						enumerable: true,
						get() {
							delete first.title;
							return 'id';
						}
					});
				if (mutation === 'cycle') first.detail = first;
				if (mutation === 'prototype') Object.setPrototypeOf(first, null);
				if (mutation === 'nonfinite') first.count = Number.NaN;
				return values;
			};
			const result = validate(schema, make);
			const reference = validate(interpreted, make);
			expect(result.error).toEqual(reference.error);
			if (!result.error) expect(result.payload).toEqual(reference.payload);
		}
	);

	it.each([{ maxDepth: 2 }, { maxNodes: 10 }, { maxNodes: 1 }])(
		'preserves traversal limits %j',
		(limits) => {
			expect(validate(schema, rows, limits).error).toEqual(
				validate(interpreted, rows, limits).error
			);
		}
	);

	it('falls back for unsupported projector versions and legacy tuples', () => {
		const project = readPositionalProjector(record)!;
		const unsupported = vi.fn(project);
		registerPositionalProjector(record, 2, unsupported);
		try {
			expect(validate(schema, rows)).toEqual(validate(interpreted, rows));
			expect(unsupported).not.toHaveBeenCalled();
		} finally {
			registerPositionalProjector(record, 1, project);
		}
	});
});
