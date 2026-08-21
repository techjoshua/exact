/* eslint-disable @typescript-eslint/no-explicit-any -- This test intentionally models external, private, or invalid values that production contracts reject. */
import { describe, expect, it } from 'vitest';
import { type Component } from '@exactjs/core';
import {
	exactComponentContract,
	exactComponentType,
	type ExactComponentContract
} from '@exactjs/core/framework/component-contracts';
import { ssrRootExecutionBlueprint } from './render/root-execution-cache.js';

describe('SSR root execution blueprint cache', () => {
	it('reuses root and dynamic component preparations while detecting replaced authority', () => {
		function Root(this: Component<{ value: string }>) {
			return () => this.state.value;
		}
		function Dynamic() {
			return () => 'dynamic';
		}
		const compiledRoot = attachContract(Root, 'component:Root', executionContract('root-task'));
		const compiledDynamic = attachContract(
			Dynamic,
			'component:Dynamic',
			executionContract('dynamic-task')
		);

		const cache = ssrRootExecutionBlueprint(compiledRoot);
		expect(ssrRootExecutionBlueprint(compiledRoot)).toBe(cache);
		const root = cache.resolve(compiledRoot);
		expect(cache.resolve(compiledRoot)).toBe(root);
		const dynamic = cache.resolve(compiledDynamic);
		expect(cache.resolve(compiledDynamic)).toBe(dynamic);
		expect(dynamic.execution?.transitionsById.has('dynamic-task')).toBe(true);

		compiledDynamic[exactComponentContract] = {
			...executionContract('replacement-task'),
			definition: fixtureDefinition(compiledDynamic)
		};
		const replacement = cache.resolve(compiledDynamic);
		expect(replacement).not.toBe(dynamic);
		expect(replacement.execution?.transitionsById.has('replacement-task')).toBe(true);
	});
});

function attachContract<T extends (...args: any[]) => any>(
	component: T,
	id: string,
	contract: ExactComponentContract
): T & Record<typeof exactComponentContract | typeof exactComponentType, any> {
	return Object.assign(component, {
		[exactComponentType]: id,
		[exactComponentContract]: { ...contract, definition: fixtureDefinition(component) }
	});
}

function fixtureDefinition(component: (...args: any[]) => any) {
	return {
		version: 1 as const,
		instantiate: component,
		state: [],
		tasks: [],
		reactive: [],
		render: 'returned-function' as const,
		capabilities: ['tasks'] as const
	};
}

function executionContract(taskId: string): ExactComponentContract {
	return {
		version: 2,
		placement: 'server',
		role: 'executor',
		implementations: [],
		continuations: [],
		executors: [],
		boundaries: [],
		execution: {
			version: 1,
			ports: [['state', 'value', 'output']],
			transitions: [[taskId, taskId, 'setup', 'server', 'blocking', 'latest', [], [0]]],
			reactive: []
		}
	};
}
