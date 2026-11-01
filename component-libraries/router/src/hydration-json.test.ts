import { expect, it, onTestFinished, vi } from 'vitest';
import {
	createExactRouter,
	hydrationDataFromSnapshot,
	hydrationEnvelopeFromSnapshot
} from './core.js';
import { createMemoryLocationSource } from './index.js';

it('publishes shared sibling loader data as JSON copies', () => {
	const shared = { value: 42 };
	const router = createExactRouter({
		source: createMemoryLocationSource('/'),
		routes: [{ id: 'root', index: true }],
		hydrationData: { loaderData: { root: { left: shared, right: shared } } }
	});
	onTestFinished(() => router.dispose());
	const data = hydrationDataFromSnapshot(router.getSnapshot());
	expect(JSON.parse(JSON.stringify(data))).toEqual({
		loaderData: { root: { left: { value: 42 }, right: { value: 42 } } },
		actionData: {},
		errors: {}
	});
	expect(hydrationEnvelopeFromSnapshot(router.getSnapshot()).data).toEqual(data);
	expect(() => hydrationDataFromSnapshot(router.getSnapshot(), { maxNodes: 5 })).toThrow(
		/graph limits/
	);
});

it('rejects ancestor cycles while publishing route hydration data', () => {
	const cyclic: { self?: unknown } = {};
	cyclic.self = cyclic;
	const router = createExactRouter({
		source: createMemoryLocationSource('/'),
		routes: [{ id: 'root', index: true }],
		hydrationData: { loaderData: { root: cyclic } }
	});
	onTestFinished(() => router.dispose());
	expect(() => hydrationDataFromSnapshot(router.getSnapshot())).toThrow(/not JSON-safe/);
});

it.each(['object getter', 'hidden array getter', 'hidden JSON hook'])(
	'rejects %s without executing authored code during hydration validation',
	(kind) => {
		const invoke = vi.fn(() => 42);
		const value: object = kind === 'hidden array getter' ? [] : {};
		if (kind === 'hidden array getter') Object.defineProperty(value, '0', { get: invoke });
		else if (kind === 'object getter')
			Object.defineProperty(value, 'value', { get: invoke, enumerable: true });
		else Object.defineProperty(value, 'toJSON', { value: invoke });
		const router = createExactRouter({
			source: createMemoryLocationSource('/'),
			routes: [{ id: 'root', index: true }],
			hydrationData: { loaderData: { root: value } }
		});
		onTestFinished(() => router.dispose());
		expect(() => hydrationDataFromSnapshot(router.getSnapshot())).toThrow(/not JSON-safe/);
		expect(invoke).not.toHaveBeenCalled();
	}
);

it('counts sparse array cells against the route hydration graph budget', () => {
	const router = createExactRouter({
		source: createMemoryLocationSource('/'),
		routes: [{ id: 'root', index: true }],
		hydrationData: { loaderData: { root: new Array(5) } }
	});
	onTestFinished(() => router.dispose());
	expect(() => hydrationDataFromSnapshot(router.getSnapshot(), { maxNodes: 6 })).toThrow(
		/graph limits/
	);
	expect(
		JSON.parse(JSON.stringify(hydrationDataFromSnapshot(router.getSnapshot(), { maxNodes: 20 })))
			.loaderData.root
	).toEqual([null, null, null, null, null]);
});

it('publishes hidden array data indices and ignores a non-callable hidden toJSON field', () => {
	const values: string[] = [];
	Object.defineProperty(values, '0', { value: 'visible JSON cell' });
	const record = { value: 42 };
	Object.defineProperty(record, 'toJSON', { value: 1 });
	const router = createExactRouter({
		source: createMemoryLocationSource('/'),
		routes: [{ id: 'root', index: true }],
		hydrationData: { loaderData: { root: { values, record } } }
	});
	onTestFinished(() => router.dispose());
	expect(
		JSON.parse(JSON.stringify(hydrationDataFromSnapshot(router.getSnapshot()))).loaderData.root
	).toEqual({ values: ['visible JSON cell'], record: { value: 42 } });
});
