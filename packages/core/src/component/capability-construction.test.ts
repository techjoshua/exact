import { describe, expect, it } from 'vitest';
import '../runtime/lifecycle.js';
import '../runtime/collections.js';

import { exactComponentContract, exactComponentType } from '../component-contracts.js';
import { createExactCompatibilityArtifact } from '../component-contract/runtime-artifacts.js';
import { createFrameworkComponentDomain } from './domain.js';
import { taskOwnerForHost } from '../tasks/owner-hosts.js';
import '../tasks/runtime.js';
import type { Component, ComponentFunction } from './contracts.js';
import { createComponentInstance, createFrameworkFixtureComponentInstance } from './runtime.js';

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
				version: 2 as const,
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
				definition: {
					version: 1 as const,
					instantiate: implementation,
					abi: 0,
					state: [],
					tasks: [],
					reactive: [],
					render: 'returned-function' as const,
					capabilities: []
				}
			}
		}) as ComponentFunction<{}, Record<string, unknown>>;

		const instance = createComponentInstance(StaticPanel, {});
		expect(instance.runtimeABI).toBe(0);
		expect(taskOwnerForHost(instance)).toBeUndefined();
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

	it('allocates ownership when the canonical definition declares task capability', () => {
		const implementation = function TaskPanel(this: Component<{}>) {
			return () => null;
		};
		const TaskPanel = Object.assign(implementation, {
			[exactComponentType]: 'component:TaskPanel',
			[exactComponentContract]: {
				version: 2 as const,
				placement: 'isomorphic' as const,
				role: 'client' as const,
				implementations: [],
				continuations: [],
				executors: [],
				boundaries: [],
				execution: { version: 1 as const, ports: [], transitions: [], reactive: [] },
				definition: {
					version: 1 as const,
					instantiate: implementation,
					abi: 8,
					state: [],
					tasks: ['setup'],
					reactive: [],
					render: 'returned-function' as const,
					capabilities: ['tasks'] as const
				}
			}
		}) as ComponentFunction<{}, Record<string, unknown>>;

		const instance = createComponentInstance(TaskPanel, {});
		expect(taskOwnerForHost(instance)).toBeDefined();
		instance.unmount();
	});
});
import '../runtime/component-tasks.js';
