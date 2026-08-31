import { createFrameworkFixtureComponentInstance } from '../testing.js';
import { describe, expect, it } from 'vitest';
import '../runtime/lifecycle.js';
import '../runtime/collections.js';

import { exactComponentContract, exactComponentType } from '../component-contracts.js';
import { createExactCompatibilityArtifact } from '../testing/runtime-artifacts.js';
import {
	attachExactCompiledClientComponent,
	disposeExactClientComponent,
	receiveExactClientComponentProps
} from '../component-abi/compiled-runtime.js';
import { createFrameworkComponentDomain } from './domain.js';
import { taskOwnerForHost } from '../tasks/owner-hosts.js';
import '../tasks/runtime.js';
import type { Component, ComponentFunction } from './contracts.js';
import { ComponentInstanceImpl, createComponentInstance } from './runtime.js';
import { RenderComponentInstance } from './render-instance.js';
import { constructRenderComponentInstance } from './render-instance-construction.js';
import { TaskComponentInstance } from './task-instance.js';
import { constructTaskComponentInstance } from './task-instance-construction.js';
import {
	readIndexedReactiveSlot,
	setIndexedReactiveSlot
} from '@exactjs/reactive/framework/runtime';

describe('compiled component capability construction', () => {
	it('releases component-owned resources with the durable instance', () => {
		let disposed = false;
		const instance = createFrameworkFixtureComponentInstance(function Owner(this: Component<{}>) {
			const resource = this.own({
				dispose() {
					disposed = true;
				}
			});
			expect(resource).toBeDefined();
			return () => null;
		}, {});

		expect(disposed).toBe(false);
		instance.unmount();
		expect(disposed).toBe(true);
	});

	it('does not allocate a task owner for a compiler-proven task-free component', () => {
		const implementation = function StaticPanel(this: Component<{}>) {
			return () => null;
		};
		const StaticPanel = Object.assign(implementation, {
			[exactComponentType]: 'component:StaticPanel',
			[exactComponentContract]: {
				version: 3 as const,
				placement: 'isomorphic' as const,
				role: 'client' as const,
				implementations: [
					{
						id: 'component:StaticPanel',
						name: 'StaticPanel',
						role: 'root' as const,
						implementation
					}
				],
				continuations: [],
				executors: [],
				boundaries: [],
				execution: { version: 1 as const, ports: [], transitions: [], reactive: [] },
				artifact: {
					version: 1 as const,
					target: 'client' as const,
					id: 'component:StaticPanel',
					attach: attachExactCompiledClientComponent,
					receive: receiveExactClientComponentProps,
					dispose: disposeExactClientComponent,
					instantiate: implementation,
					construct: constructRenderComponentInstance,
					abi: 0,
					state: [],
					props: [],
					tasks: [],
					reactive: [],
					render: 'returned-function' as const,
					capabilities: []
				}
			}
		}) as ComponentFunction<{}, Record<string, unknown>>;

		const instance = createComponentInstance(StaticPanel, {});
		expect(instance.runtimeABI).toBe(0);
		expect(instance).toBeInstanceOf(RenderComponentInstance);
		expect(taskOwnerForHost(instance)).toBeUndefined();
		instance.unmount();
	});

	it('applies receiver-owned indexed input updates once per finalized prop batch', () => {
		let applications = 0;
		let initialLoading: unknown;
		const implementation = function InputPanel(this: Component<{ loading: boolean }>) {
			inputs.apply(this as unknown as Readonly<{ state: object; props: object }>, 1, 0);
			initialLoading = this.state.loading;
			return () => null;
		};
		const inputs = {
			bindings: [[0, 1, 0]] as const,
			apply(
				instance: Readonly<{ state: object; props: object }>,
				dirtyLow: number,
				_dirtyHigh: number
			) {
				if ((dirtyLow & 1) === 0) return;
				applications++;
				const value = readIndexedReactiveSlot(instance.props, 0);
				setIndexedReactiveSlot(instance.state, 0, !value);
				if (value === 'throw') throw new Error('projection failed');
			}
		};
		const artifact = {
			version: 1 as const,
			target: 'client' as const,
			id: 'component:InputPanel',
			attach: attachExactCompiledClientComponent,
			receive: receiveExactClientComponentProps,
			dispose: disposeExactClientComponent,
			instantiate: implementation,
			construct: constructRenderComponentInstance,
			abi: 0,
			inputs,
			state: ['loading'],
			props: ['initialData'],
			capabilities: []
		};
		const InputPanel = Object.assign(implementation, {
			[exactComponentType]: 'component:InputPanel',
			[exactComponentContract]: {
				version: 3 as const,
				placement: 'isomorphic' as const,
				role: 'client' as const,
				implementations: [],
				continuations: [],
				executors: [],
				boundaries: [],
				artifact
			}
		}) as ComponentFunction<{ loading: boolean }, { initialData?: object | string }>;

		const instance = createComponentInstance(InputPanel, {});
		expect(initialLoading).toBe(true);
		expect(applications).toBe(1);

		artifact.receive.call(artifact, instance, { initialData: {} });
		expect(instance.state.loading).toBe(false);
		expect(applications).toBe(2);
		artifact.receive.call(artifact, instance, { initialData: instance.props.initialData });
		expect(applications).toBe(2);

		expect(() => artifact.receive.call(artifact, instance, { initialData: 'throw' })).toThrow(
			'projection failed'
		);
		expect(instance.state.loading).toBe(false);
		expect(instance.props.initialData).not.toBe('throw');
		instance.unmount();
	});

	it('gives explicit framework fixtures the task owner needed by low-level tests', () => {
		const instance = createFrameworkFixtureComponentInstance(function FrameworkFixture(
			this: Component<{}>
		) {
			return () => null;
		}, {});
		expect(taskOwnerForHost(instance)).toBeDefined();
		instance.unmount();
	});

	it('executes a target-local server compatibility adapter once', () => {
		const adapter = createExactCompatibilityArtifact(
			function CompatibilityAdapter(this: Component<{}>) {
				return () => null;
			},
			'@exactjs/core:test-server-compatibility',
			'server'
		);
		const instance = createComponentInstance(
			adapter,
			{},
			undefined,
			undefined,
			createFrameworkComponentDomain({ executionRoot: 'server-test', target: 'server' })
		);

		expect(instance.runtimeABI).toBe(31);
		instance.unmount();
	});

	it('rejects raw functions at the compiled construction boundary', () => {
		expect(() =>
			createComponentInstance(function Raw(this: Component<{}>) {
				return () => null;
			}, {})
		).toThrow('compiled component artifact');
	});

	it('allocates ownership when the target artifact declares task capability', () => {
		const implementation = function TaskPanel(this: Component<{}>) {
			return () => null;
		};
		const TaskPanel = Object.assign(implementation, {
			[exactComponentType]: 'component:TaskPanel',
			[exactComponentContract]: {
				version: 3 as const,
				placement: 'isomorphic' as const,
				role: 'client' as const,
				implementations: [],
				continuations: [],
				executors: [],
				boundaries: [],
				execution: { version: 1 as const, ports: [], transitions: [], reactive: [] },
				artifact: {
					version: 1 as const,
					target: 'client' as const,
					id: 'component:TaskPanel',
					attach: attachExactCompiledClientComponent,
					receive: receiveExactClientComponentProps,
					dispose: disposeExactClientComponent,
					instantiate: implementation,
					construct: constructTaskComponentInstance,
					abi: 8,
					state: [],
					props: [],
					tasks: ['setup'],
					reactive: [],
					render: 'returned-function' as const,
					capabilities: ['tasks'] as const
				}
			}
		}) as ComponentFunction<{}, Record<string, unknown>>;

		const instance = createComponentInstance(TaskPanel, {});
		expect(instance).toBeInstanceOf(TaskComponentInstance);
		expect(instance).not.toBeInstanceOf(ComponentInstanceImpl);
		expect(taskOwnerForHost(instance)).toBeDefined();
		instance.unmount();
	});

	it('releases task ownership when task-only construction fails', () => {
		let constructing: Component<{}> | undefined;
		const implementation = function FailingTaskPanel(this: Component<{}>) {
			constructing = this;
			throw new Error('setup failed');
		};
		const FailingTaskPanel = Object.assign(implementation, {
			[exactComponentType]: 'component:FailingTaskPanel',
			[exactComponentContract]: {
				version: 3 as const,
				placement: 'isomorphic' as const,
				role: 'client' as const,
				implementations: [],
				continuations: [],
				executors: [],
				boundaries: [],
				execution: { version: 1 as const, ports: [], transitions: [], reactive: [] },
				artifact: {
					version: 1 as const,
					target: 'client' as const,
					id: 'component:FailingTaskPanel',
					attach: attachExactCompiledClientComponent,
					receive: receiveExactClientComponentProps,
					dispose: disposeExactClientComponent,
					instantiate: implementation,
					construct: constructTaskComponentInstance,
					abi: 8,
					state: [],
					props: [],
					tasks: ['setup'],
					reactive: [],
					render: 'returned-function' as const,
					capabilities: ['tasks'] as const
				}
			}
		}) as ComponentFunction<{}, Record<string, unknown>>;

		expect(() => createComponentInstance(FailingTaskPanel, {})).toThrow('setup failed');
		expect(constructing).toBeDefined();
		expect(taskOwnerForHost(constructing!)?.disposed).toBe(true);
	});
});
import '../runtime/component-tasks.js';
