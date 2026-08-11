import { describe, expect, it } from 'vitest';

import { exactComponentContract, exactComponentType } from '../component-contracts.js';
import { taskOwnerForHost } from '../tasks/owner-hosts.js';
import '../tasks/runtime.js';
import type { Component, ComponentFunction } from './contracts.js';
import { createComponentInstance } from './runtime.js';

describe('compiled component capability construction', () => {
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
				execution: { version: 1 as const, ports: [], transitions: [], reactive: [] }
			}
		}) as ComponentFunction<{}, Record<string, unknown>>;

		const instance = createComponentInstance(StaticPanel, {});
		expect(taskOwnerForHost(instance)).toBeUndefined();
		instance.unmount();
	});

	it('retains the generic task-owner fallback for uncompiled components', () => {
		const instance = createComponentInstance(function Compilerless(this: Component<{}>) {
			return () => null;
		}, {});
		expect(taskOwnerForHost(instance)).toBeDefined();
		instance.unmount();
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
