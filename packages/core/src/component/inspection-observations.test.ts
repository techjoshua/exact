import type { ComponentFunction } from './contracts.js';
import { verifyInspectionObservationOwnership } from '../../../component-composition-corpus/test-support/inspection-observation-journey.mjs';
import { expect, it, onTestFinished } from 'vitest';
import { createFrameworkFixtureComponentInstance } from '../testing.js';
import {
	createExactRuntimeInspectionOwner,
	defineTask,
	inspectExactRuntimeComponent,
	type Component
} from '../index.js';
import { createFrameworkComponentDomain } from './domain.js';

/** Owns an attached fixture and releases it even when a regression assertion fails. */
function fixture<State extends object>(
	type: ComponentFunction<State, Record<string, unknown>>,
	cleanup: (callback: () => void) => void
) {
	const owner = createExactRuntimeInspectionOwner({ buildKey: 'build', executionRoot: 'page' });
	owner.attach('session', { publish() {} });
	cleanup(() => owner.detach());
	const instance = createFrameworkFixtureComponentInstance(
		type,
		{},
		undefined,
		undefined,
		createFrameworkComponentDomain({ executionRoot: 'page', inspection: owner })
	);
	cleanup(() => instance.unmount());
	return { owner, instance };
}

it.each(['throwing', 'object', 'empty', 'normal'])(
	'reads component name data without invoking metadata accessors (%s)',
	(mode) => {
		const type = function Named() {
			return () => null;
		};
		const { instance } = fixture(type, onTestFinished);
		let reads = 0;
		Object.defineProperty(
			type,
			'name',
			mode === 'throwing' || mode === 'object'
				? {
						configurable: true,
						get() {
							reads++;
							if (mode === 'throwing') throw new Error('metadata');
							return { privateState: 'must not escape' };
						}
					}
				: { configurable: true, value: mode === 'empty' ? '' : 'Readable' }
		);
		const snapshot = inspectExactRuntimeComponent(instance)!;
		expect(reads).toBe(0);
		expect(snapshot.name).toBe(mode === 'normal' ? 'Readable' : 'Anonymous');
	}
);

it('returns writable component and task observations without exposing retained history', async ({
	onTestFinished
}) => {
	let execution!: PromiseLike<{ total: number }>;
	function Calculator(this: Component<{ count?: number }>) {
		this.state.count = 2;
		const calculate = defineTask<[number], { total: number }>(
			{ label: 'Collect' },
			async (value) => ({ total: value * 2 })
		);
		execution = calculate(2);
		return () => null;
	}
	const { instance } = fixture(Calculator, onTestFinished);
	await execution;
	const observation = inspectExactRuntimeComponent(instance)!;
	const task = observation.tasks.find((entry) => entry.name === 'Collect')!;
	const name: { name: string } = observation;
	name.name = 'Observation';
	const label: { name?: string } = task;
	label.name = 'Changed';
	if (task.result?.kind !== 'object' || task.result.entries[0]?.value.kind !== 'scalar')
		throw new Error('result control');
	const scalar: { value: string | number | boolean | null } = task.result.entries[0].value;
	scalar.value = 99;
	(task.result.entries as unknown[]).length = 0;
	(observation.tasks as unknown[]).length = 0;
	const next = inspectExactRuntimeComponent(instance)!;
	expect(next.name).toBe('Calculator');
	expect(next.tasks.find((entry) => entry.name === 'Collect')?.result).toMatchObject({
		entries: [{ key: 'total', value: { kind: 'scalar', value: 4 } }]
	});
	expect(instance.state.count).toBe(2);
	if (false) {
		// @ts-expect-error Component observation fields retain TypeScript readonly declarations.
		observation.name = 'Changed';
	}
});

it('keeps inspection method handles as ordinary JavaScript properties', ({ onTestFinished }) => {
	const { owner, instance } = fixture(function Body() {
		return () => null;
	}, onTestFinished);
	let calls = 0;
	owner.publish = () => {
		calls++;
	};
	owner.publish({ kind: 'state.change', component: instance });
	expect(calls).toBe(1);
});

it('runs the shared component observation ownership journey', async () => {
	expect(
		await verifyInspectionObservationOwnership({
			createExactRuntimeInspectionOwner,
			createFrameworkComponentDomain,
			createFrameworkFixtureComponentInstance,
			defineTask,
			inspectExactRuntimeComponent
		})
	).toBe(true);
});
