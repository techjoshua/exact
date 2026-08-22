import { describe, expect, it } from 'vitest';
import {
	createContext,
	createExactRuntimeInspectionOwner,
	defineTask,
	inspectExactRuntimeComponent,
	markExactInspectionSource,
	type Component
} from '../index.js';
import { createFrameworkFixtureComponentInstance } from '../runtime/render.js';
import { createFrameworkComponentDomain } from './domain.js';
import type { ExactRuntimeInspectionEvent } from '@exactjs/devtools-protocol';

describe('component runtime inspection', () => {
	it('retains no pre-attachment history and emits ordered immutable lifecycle and state paths', () => {
		function Counter(this: Component<{ count?: number }>) {
			this.state.count = 1;
			return () => null;
		}
		const owner = createExactRuntimeInspectionOwner({
			buildKey: 'build',
			executionRoot: 'page'
		});
		const instance = createFrameworkFixtureComponentInstance(
			Counter,
			{},
			undefined,
			undefined,
			createFrameworkComponentDomain({ executionRoot: 'page', inspection: owner })
		);
		const events: ExactRuntimeInspectionEvent[] = [];
		owner.attach('session', { publish: (event) => events.push(event) });

		instance.markMounted();
		instance.state.count = 2;
		instance.updateProps({});
		instance.unmount();

		expect(events.map((event) => event.kind)).toEqual([
			'component.mount',
			'component.activate',
			'state.change',
			'props.change',
			'component.unmount',
			'component.deactivate'
		]);
		expect(events[2]).toMatchObject({ path: 'state.count', sequence: 3 });
		expect(events.every(Object.isFrozen)).toBe(true);
		expect(events.some((event) => event.kind === 'component.construct')).toBe(false);
	});

	it('isolates sink failures from application mutations and lifecycle', () => {
		function Counter(this: Component<{ count?: number }>) {
			return () => null;
		}
		const owner = createExactRuntimeInspectionOwner({
			buildKey: 'build',
			executionRoot: 'page'
		});
		const instance = createFrameworkFixtureComponentInstance(
			Counter,
			{},
			undefined,
			undefined,
			createFrameworkComponentDomain({ executionRoot: 'page', inspection: owner })
		);
		owner.attach('session', {
			publish() {
				throw new Error('diagnostic consumer failed');
			}
		});

		expect(() => {
			instance.markMounted();
			instance.state.count = 1;
			instance.unmount();
		}).not.toThrow();
	});

	it('projects public context values while redacting secret and server-resource contexts', () => {
		const Public = createContext('public-user');
		const Secret = createContext('payment-token', { keep: 'secret', scope: 'request' });
		const Resource = createContext('database', { keep: 'server', scope: 'application' });
		function Provider(this: Component<{}>) {
			this.setContext(Public, { name: 'Ada' });
			this.setContext(Secret, 'must-never-appear');
			this.setContext(Resource, { password: 'must-never-appear' });
			return () => null;
		}
		const owner = createExactRuntimeInspectionOwner({
			buildKey: 'build',
			executionRoot: 'page'
		});
		const instance = createFrameworkFixtureComponentInstance(
			Provider,
			{},
			undefined,
			undefined,
			createFrameworkComponentDomain({ executionRoot: 'page', inspection: owner })
		);
		owner.attach('session', { publish() {} });

		const snapshot = inspectExactRuntimeComponent(instance)!;
		expect(snapshot.contexts).toEqual([
			expect.objectContaining({ name: 'public-user', availability: 'value' }),
			{
				name: 'payment-token',
				scope: 'request',
				availability: 'secret',
				secretName: 'payment-token'
			},
			{
				name: 'database',
				scope: 'application',
				availability: 'resource',
				type: 'server-resource'
			}
		]);
		expect(JSON.stringify(snapshot)).not.toContain('must-never-appear');
	});

	it('retains bounded redacted task arguments and results after execution settles', async () => {
		let executions!: readonly PromiseLike<{
			total: number;
			token: string;
		}>[];
		function Calculator(this: Component<{}>) {
			const calculate = defineTask<
				[{ amount: number; token: string }],
				{ total: number; token: string }
			>(
				{ label: 'Calculate' },
				markExactInspectionSource(
					'Calculator:task:calculate',
					async (input: { amount: number; token: string }) => ({
						total: input.amount * 2,
						token: input.token
					})
				)
			);
			executions = [
				calculate({ amount: 2, token: 'first-secret' }),
				calculate({ amount: 4, token: 'second-secret' })
			];
			return () => null;
		}
		const owner = createExactRuntimeInspectionOwner({
			buildKey: 'build',
			executionRoot: 'page',
			maxTaskExecutions: 1,
			redact: (path) => (path.at(-1) === 'token' ? 'secret' : undefined)
		});
		owner.attach('session', { publish() {} });
		const instance = createFrameworkFixtureComponentInstance(
			Calculator,
			{},
			undefined,
			undefined,
			createFrameworkComponentDomain({ executionRoot: 'page', inspection: owner })
		);

		await Promise.all(executions);

		const tasks = inspectExactRuntimeComponent(instance)!.tasks;
		expect(tasks).toHaveLength(1);
		expect(tasks[0]).toMatchObject({
			name: 'Calculate',
			status: 'settled',
			generation: 2,
			completedGeneration: 2,
			arguments: { kind: 'object', type: 'Array' },
			result: { kind: 'object', type: 'Object' }
		});
		expect(tasks[0]!.settledAt).toBeGreaterThanOrEqual(tasks[0]!.startedAt!);
		expect(JSON.stringify(tasks)).not.toContain('second-secret');
		expect(JSON.stringify(tasks)).toContain('secret');

		owner.detach('session');
		expect(inspectExactRuntimeComponent(instance)).toBeUndefined();
	});

	it('retains failed task status and safe Error details', async () => {
		let failure!: PromiseLike<never>;
		function Worker(this: Component<{}>) {
			const fail = defineTask<[], never>(
				{ label: 'Reject shipment' },
				markExactInspectionSource('Worker:task:reject', async () => {
					throw new TypeError('shipment is invalid');
				})
			);
			failure = fail();
			return () => null;
		}
		const owner = createExactRuntimeInspectionOwner({ buildKey: 'build', executionRoot: 'page' });
		owner.attach('session', { publish() {} });
		const instance = createFrameworkFixtureComponentInstance(
			Worker,
			{},
			undefined,
			undefined,
			createFrameworkComponentDomain({ executionRoot: 'page', inspection: owner })
		);

		await expect(Promise.resolve(failure)).rejects.toThrow('shipment is invalid');

		const task = inspectExactRuntimeComponent(instance)!.tasks[0]!;
		expect(task).toMatchObject({
			status: 'failed',
			failedGeneration: 1,
			error: {
				kind: 'object',
				type: 'TypeError',
				entries: [{ key: 'message', value: { kind: 'scalar', value: 'shipment is invalid' } }]
			}
		});
	});
});
import '../runtime/contexts.js';
