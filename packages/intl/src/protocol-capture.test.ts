import { expect, it } from 'vitest';
import { validateIntlCatalog, validateIntlRuntimeDescriptor } from './validation.js';
import { measurementDescriptor } from './test-support/measurement-descriptor.js';
import { canonicalizeIntlValue } from './canonical.js';
import { prepareIntlActivation } from './prepared.js';
import { registerIntlArtifacts } from './artifacts.js';

it('publishes the binding kind that was checked, with one getter read', () => {
	let reads = 0;
	const descriptor = measurementDescriptor('length', 'road', 'meter', {});
	const binding = {
		index: 0,
		type: 'measurement',
		get kind() {
			return ++reads === 1 ? 'value' : 'unsupported';
		}
	};
	const validated = validateIntlRuntimeDescriptor({ ...descriptor, bindings: [binding] });
	expect(validated.bindings[0]?.kind).toBe('value');
	expect(reads).toBe(1);
});

it('preserves null-prototype and nonenumerable field controls', () => {
	const descriptor = measurementDescriptor('length', 'road', 'meter', {});
	const binding = Object.assign(Object.create(null) as Record<string, unknown>, {
		index: 0,
		type: 'measurement'
	});
	let reads = 0;
	Object.defineProperty(binding, 'kind', {
		get() {
			reads++;
			return 'value';
		}
	});
	expect(
		validateIntlRuntimeDescriptor({ ...descriptor, bindings: [binding] }).bindings[0]?.kind
	).toBe('value');
	expect(reads).toBe(1);
});

it('rejects nonstring selector and currency fields without coercing them', () => {
	const descriptor = measurementDescriptor('length', 'road', 'meter', {});
	const selectors = {
		...descriptor,
		bindings: [{ index: 0, kind: 'selector', type: 'number' }],
		source: [
			{
				kind: 'select',
				binding: 0,
				selection: { toString: () => 'exact' },
				cases: [],
				fallback: []
			}
		]
	};
	expect(() => validateIntlRuntimeDescriptor(selectors)).toThrow('unsupported selection kind');
	for (const field of ['currency', 'display']) {
		const formatter: Record<string, unknown> = {
			kind: 'currency',
			currency: 'USD',
			display: 'symbol',
			options: {},
			[field]: { toString: () => (field === 'currency' ? 'USD' : 'symbol') }
		};
		expect(() =>
			validateIntlRuntimeDescriptor({
				...descriptor,
				source: [{ kind: 'format', bindings: [0], formatter }],
				capabilities: ['currency']
			})
		).toThrow();
	}
});

it('captures target fields before a later getter changes the caller record', () => {
	const descriptor = measurementDescriptor('length', 'road', 'meter', {});
	let reads = 0;
	const target = {
		kind: 'property',
		get name() {
			return ++reads === 1 ? 'title' : 'unsupported';
		}
	};
	expect(validateIntlRuntimeDescriptor({ ...descriptor, target }).target).toEqual({
		kind: 'property',
		name: 'title'
	});
	expect(reads).toBe(1);
});

it('rejects coercible objects where the wire contract requires string discriminants', () => {
	const descriptor = measurementDescriptor('length', 'road', 'meter', {});
	expect(() =>
		validateIntlRuntimeDescriptor({
			...descriptor,
			bindings: [{ index: 0, type: 'measurement', kind: { toString: () => 'value' } }]
		})
	).toThrow();
});

it('validates every array entry without calling an authored map method', () => {
	const descriptor = measurementDescriptor('length', 'road', 'meter', {});
	const bindings = [{ index: 0, kind: 'unsupported', type: 'measurement' }];
	Object.defineProperty(bindings, 'map', {
		value: () => [{ index: 0, kind: 'value', type: 'measurement' }]
	});
	expect(() => validateIntlRuntimeDescriptor({ ...descriptor, bindings })).toThrow();
});

it('rejects sparse binding, pattern and catalog arrays', () => {
	const descriptor = measurementDescriptor('length', 'road', 'meter', {});
	expect(() => validateIntlRuntimeDescriptor({ ...descriptor, bindings: Array(1) })).toThrow();
	expect(() => validateIntlRuntimeDescriptor({ ...descriptor, source: Array(1) })).toThrow();
	expect(() =>
		validateIntlCatalog(
			{
				protocol: 1,
				locale: 'fr',
				owner: descriptor.owner,
				messages: { [descriptor.key]: Array(1) }
			},
			[descriptor]
		)
	).toThrow();
});

it('does not let companion input arrays replace descriptor validation', () => {
	const inputs = [{ protocol: 'invalid' }];
	Object.defineProperty(inputs, 'map', { value: () => [] });
	expect(() => registerIntlArtifacts('capture-invalid-array', 1, inputs, [])).toThrow();
});

it('canonicalizes actual array values without calling an authored map method', () => {
	const input = ['value'];
	Object.defineProperty(input, 'map', { value: () => ['invalid JSON'] });
	expect(canonicalizeIntlValue(input)).toBe('["value"]');
	expect(() => canonicalizeIntlValue(Array(1))).toThrow();
});

it('publishes the same structure entries that passed validation', () => {
	const descriptor = measurementDescriptor('length', 'road', 'meter', {});
	const structural = {
		...descriptor,
		bindings: [{ index: 0, kind: 'element', type: 'structure', exactlyOnce: true }],
		source: [{ kind: 'element', binding: 0, value: [{ kind: 'text', value: 'content' }] }],
		capabilities: ['element']
	};
	let iterations = 0;
	const factory = () => undefined;
	const structures = [factory];
	Object.defineProperty(structures, Symbol.iterator, {
		value: function* () {
			yield ++iterations === 1 ? factory : 42;
		}
	});
	const activation = prepareIntlActivation(structural, [], structures);
	expect(activation.structures[0]).toBe(factory);
	expect(iterations).toBe(0);
});
