import { expect, it, onTestFinished } from 'vitest';
import { createFrameworkFixtureComponentInstance } from '../testing.js';
import { createFrameworkComponentDomain } from '../component/domain.js';
import { createExactRuntimeInspectionOwner } from '../component/inspection.js';
import { taskOwnerForHost } from './owner-hosts.js';
import { executeTaskFrame } from './frame-runtime.js';
import { defineTask, bindTaskForHost } from './runtime.js';
import { verifyInspectedFailureOwnership } from '../../../component-composition-corpus/test-support/inspection-failure-journey.mjs';
import { isExactRuntimeInspectionEvent } from '@exactjs/devtools-protocol';

it('executes the shared inspected task failure ownership journey', () =>
	verifyInspectedFailureOwnership({
		createExactRuntimeInspectionOwner,
		createFrameworkComponentDomain,
		createFrameworkFixtureComponentInstance,
		defineTask,
		bindTaskForHost
	}));

for (const attached of [false, true])
	it(`keeps primary failure and later progress with unprintable reasons (inspection=${attached})`, async () => {
		const events: string[] = [];
		const inspection = createExactRuntimeInspectionOwner({
			buildKey: 'test',
			executionRoot: 'page'
		});
		const instance = createFrameworkFixtureComponentInstance(
			function Failure() {
				return () => null;
			},
			{},
			undefined,
			undefined,
			createFrameworkComponentDomain({ executionRoot: 'page', inspection })
		);
		onTestFinished(() => {
			instance.unmount();
			inspection.detach();
		});
		if (attached)
			inspection.attach('session', {
				publish(event) {
					expect(isExactRuntimeInspectionEvent(event)).toBe(true);
					events.push(event.kind);
				}
			});
		const owner = taskOwnerForHost(instance)!;
		for (const failure of [
			{
				[Symbol.toPrimitive](): never {
					throw new Error('conversion');
				}
			},
			new Proxy(
				{},
				{
					getPrototypeOf(): never {
						throw new Error('prototype');
					}
				}
			),
			undefined,
			false,
			new Error('x'.repeat(4096))
		]) {
			await expect(
				executeTaskFrame({ owner }, () => {
					throw failure;
				})
			).rejects.toBe(failure);
			expect(owner.frames.size).toBe(0);
			expect(await executeTaskFrame({ owner }, () => 42)).toBe(42);
		}
		if (attached) expect(events.filter((kind) => kind === 'task.fail')).toHaveLength(5);
	});

it('keeps inspection metadata failures outside task execution', async () => {
	const inspection = createExactRuntimeInspectionOwner({ buildKey: 'test', executionRoot: 'page' });
	const type = function FailureMetadata() {
		return () => null;
	};
	const instance = createFrameworkFixtureComponentInstance(
		type,
		{},
		undefined,
		undefined,
		createFrameworkComponentDomain({ executionRoot: 'page', inspection })
	);
	const descriptor = Object.getOwnPropertyDescriptor(type, 'name')!;
	onTestFinished(() => {
		Object.defineProperty(type, 'name', descriptor);
		instance.unmount();
		inspection.detach();
	});
	inspection.attach('session', { publish() {} });
	let reads = 0;
	Object.defineProperty(type, 'name', {
		configurable: true,
		get(): never {
			reads++;
			throw new Error('metadata');
		}
	});
	const owner = taskOwnerForHost(instance)!;
	expect(await executeTaskFrame({ owner }, () => 42)).toBe(42);
	expect(owner.frames.size).toBe(0);
	expect(reads).toBe(0);
});
