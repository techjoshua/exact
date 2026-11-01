import { expect, it } from 'vitest';
import { taskClosureRuntime } from '../test-support/task-closure-runtime.js';

it('publishes every activation of one authored task method without sharing consumer identity', async () => {
	const fixture = await taskClosureRuntime('repeated');
	expect(fixture.operations).toHaveLength(3);
	const values: number[] = [];
	for (const operation of fixture.operations) {
		const value =
			operation.dependencies[0]?.source === 'argument'
				? 3
				: Number(operation.dependencies[0]?.path);
		values.push(value);
		const result = await fixture.invoke({ n: 10 }, operation, value);
		expect(result.state).toEqual({ n: 10 + value });
		expect(result.value).toBe(operation.invocation ? 10 + value : undefined);
	}
	expect(fixture.module.trace).toEqual(values.flatMap((value) => [value, 10, 10 + value]));
	expect(fixture.module.cleaned).toEqual(values);
	expect(fixture.reports).toEqual([]);
});

it('keeps an escaped method and arrow on their cancelled creating generation', async () => {
	const fixture = await taskClosureRuntime('generation');
	const gates = fixture.module.gates as Map<string, () => void>;
	const cleaned = fixture.module.cleaned as string[];
	const controller = new AbortController();
	const cancelled = fixture
		.invoke({ request: 'A', n: 0 }, undefined, undefined, controller.signal)
		.catch((error) => error);
	await expect.poll(() => gates.has('A')).toBe(true);
	controller.abort();
	expect(await cancelled).toMatchObject({ name: 'AbortError' });
	await expect.poll(() => cleaned.includes('A:0')).toBe(true);
	expect(await fixture.invoke({ request: 'B', n: 10 })).toMatchObject({
		state: { n: 11 },
		value: 11
	});
	gates.get('A')!();
	expect(await fixture.invoke({ request: 'C', n: 20 })).toMatchObject({
		state: { n: 21 },
		value: 21
	});
	expect(fixture.module.trace).toEqual([
		'rejected',
		'method',
		'AbortError',
		'rejected',
		'arrow',
		'AbortError',
		'B',
		'method',
		11,
		'rejected',
		'method',
		'AbortError',
		'rejected',
		'arrow',
		'AbortError',
		'C',
		'method',
		21
	]);
	expect(cleaned).toEqual(['A:0', 'B:method', 'B:11', 'C:method', 'C:21']);
	expect(fixture.reports).toEqual([]);
});

it('preserves async closure pre-effects while fencing the post-await put and releasing once', async () => {
	const fixture = await taskClosureRuntime('async');
	const gates = fixture.module.gates as Map<string, () => void>;
	const readers = fixture.module.readers as Map<string, () => number>;
	const cleaned = fixture.module.cleaned as unknown[];
	const normal = fixture.invoke({ label: 'normal', n: 10 });
	await expect.poll(() => gates.has('normal')).toBe(true);
	expect(readers.get('normal')!()).toBe(11);
	gates.get('normal')!();
	expect(await normal).toMatchObject({ state: { n: 13 }, value: 13 });
	const controller = new AbortController();
	const cancelled = fixture
		.invoke({ label: 'cancel', n: 20 }, undefined, undefined, controller.signal)
		.catch((error) => error);
	await expect.poll(() => gates.has('cancel')).toBe(true);
	expect(readers.get('cancel')!()).toBe(21);
	controller.abort();
	expect(await cancelled).toMatchObject({ name: 'AbortError' });
	await expect.poll(() => cleaned.includes('cancel')).toBe(true);
	gates.get('cancel')!();
	const following = fixture.invoke({ label: 'next', n: 30 });
	await expect.poll(() => gates.has('next')).toBe(true);
	gates.get('next')!();
	expect(await following).toMatchObject({ state: { n: 33 }, value: 33 });
	expect(readers.get('cancel')!()).toBe(21);
	expect(fixture.module.trace).toEqual([
		'normal',
		'acquire',
		'normal',
		'pre',
		11,
		'normal',
		'post',
		13,
		'normal',
		'dispose',
		'cancel',
		'acquire',
		'cancel',
		'pre',
		21,
		'cancel',
		'dispose',
		'next',
		'acquire',
		'next',
		'pre',
		31,
		'next',
		'post',
		33,
		'next',
		'dispose'
	]);
	expect(cleaned).toEqual(['normal', 13, 'cancel', 21, 'next', 33]);
	expect(fixture.reports).toEqual([]);
});

it('preserves method reference, receiver, defaults and invocation-local storage under reentry', async () => {
	const fixture = await taskClosureRuntime('evaluation');
	const state = {
		left: { value: 'before', sibling: 'keep' },
		n: 1,
		item: { value: 0 },
		mode: 'equal'
	};
	for (let generation = 0; generation < 2; generation++) {
		expect(await fixture.invoke(state)).toMatchObject({
			state: { item: { value: 2 } },
			value: {
				selected: 3,
				omitted: 1,
				supplied: 4,
				changed: 99,
				old: 1,
				current: 2,
				name: 'run',
				length: 0,
				same: true
			}
		});
	}
	expect(fixture.reports).toEqual([]);
});

it('leaves a separately owned detached child on its own signal after parent cancellation', async () => {
	const fixture = await taskClosureRuntime('child');
	const gates = fixture.module.gates as Map<string, () => void>;
	const cleaned = fixture.module.cleaned as string[];
	const parent = fixture.tasks.reduce((left, right) =>
		(left.workLength ?? 0) > (right.workLength ?? 0) ? left : right
	);
	const sourceParent = fixture.operations.find((operation) => operation.id === parent.id)!;
	expect(sourceParent).toBeDefined();
	const controller = new AbortController();
	const cancelled = fixture
		.invoke({ n: 0 }, sourceParent, undefined, controller.signal)
		.catch((error) => error);
	await expect.poll(() => gates.has('child')).toBe(true);
	controller.abort();
	expect(await cancelled).toMatchObject({ name: 'AbortError' });
	await expect.poll(() => cleaned.includes('parent')).toBe(true);
	gates.get('child')!();
	gates.delete('child');
	await expect.poll(() => cleaned.includes('child')).toBe(true);
	expect(fixture.module.trace).toEqual(['same', false, 'child-put', 1]);
	const following = fixture.invoke({ n: 0 }, sourceParent);
	await expect.poll(() => gates.has('child')).toBe(true);
	gates.get('child')!();
	expect(await following).toMatchObject({ value: 1 });
	// Parent publication for detached child work is a separate unresolved contract.
	expect(cleaned).toEqual(['parent', 'child', 'child', 'parent']);
	expect(fixture.reports).toEqual([]);
});

it('preserves a typed ordinary declaration default, native call identity and resources', async () => {
	const fixture = await taskClosureRuntime('function-default');
	expect(Object.keys(fixture.module).sort()).toEqual([
		'Page',
		'Page_ExactServer_1',
		'cleaned',
		'hooks',
		'trace'
	]);
	const trace = [
		'default',
		'acquire',
		'fn',
		7,
		0,
		2,
		'dispose',
		'acquire',
		'fn',
		9,
		1,
		2,
		'dispose'
	];
	for (let generation = 1; generation <= 2; generation++) {
		const result = await fixture.invoke({
			left: { value: 'before', sibling: 'keep' },
			n: 1,
			item: { value: 0 },
			mode: 'equal'
		});
		expect(result.ok).toBe(true);
		expect(result.state).toEqual({ n: 6 });
		expect(result.value).toEqual({
			one: { tag: 7, v: 2, n: 4, args: 0 },
			two: { tag: 9, v: 2, n: 6, args: 1 },
			name: 'apply',
			length: 0
		});
		expect(fixture.module.trace).toEqual(Array.from({ length: generation }, () => trace).flat());
		expect(fixture.module.cleaned).toEqual(
			Array.from({ length: generation }, () => ['before', 6]).flat()
		);
	}
	expect(fixture.reports).toEqual([]);
});
