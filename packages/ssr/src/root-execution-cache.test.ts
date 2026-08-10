import { describe, expect, it } from 'vitest';
import {
	exactComponentContract,
	exactComponentType,
	type Component,
	type ExactComponentContract
} from '@exactjs/core';
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

		compiledDynamic[exactComponentContract] = executionContract('replacement-task');
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
		[exactComponentContract]: contract
	});
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
			ports: [{ index: 0, kind: 'state', path: 'value', direction: 'output' }],
			transitions: [
				{
					id: taskId,
					taskId,
					activation: 'setup',
					placement: 'server',
					readiness: 'blocking',
					concurrency: 'latest',
					inputs: [],
					outputs: [0]
				}
			],
			reactive: []
		}
	};
}
