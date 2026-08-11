import { describe, expect, it } from 'vitest';
import {
	exactComponentContract,
	exactComponentType,
	type ComponentFunction,
	type ExactComponentExecutionContract
} from '@exactjs/core';
import { prepareClientIslandExecutionSlice } from './execution-slice.js';

describe('lazy island execution slices', () => {
	it('admits only setup transitions owned by the loaded island root', () => {
		const component = compiledIsland({
			version: 1,
			ports: [],
			transitions: [
				transition('setup', 'setup'),
				transition('interaction', 'interaction')
			],
			reactive: []
		});
		const slice = prepareClientIslandExecutionSlice(component);
		expect([...slice.get('component:Island')!]).toEqual(['setup']);
		expect(prepareClientIslandExecutionSlice(component)).toBe(slice);
	});

	it('rejects an opaque cyclic transition graph instead of remaining loading', () => {
		const component = compiledIsland({
			version: 1,
			ports: [
				{ index: 0, kind: 'derived', path: 'a', direction: 'inout' },
				{ index: 1, kind: 'derived', path: 'b', direction: 'inout' }
			],
			transitions: [
				{ ...transition('a', 'setup'), inputs: [1], outputs: [0] },
				{ ...transition('b', 'setup'), inputs: [0], outputs: [1] }
			],
			reactive: []
		});
		expect(() => prepareClientIslandExecutionSlice(component)).toThrow(
			/eXact island dependency cycle/
		);
	});
});

function transition(
	id: string,
	activation: 'setup' | 'interaction'
): ExactComponentExecutionContract['transitions'][number] {
	return {
		id,
		taskId: id,
		activation,
		placement: 'client',
		readiness: 'nonblocking',
		concurrency: 'latest',
		inputs: [],
		outputs: []
	};
}

function compiledIsland(execution: ExactComponentExecutionContract): ComponentFunction<any, any> {
	const implementation = function Island() {
		return () => null;
	};
	return Object.assign(implementation, {
		[exactComponentType]: 'component:Island',
		[exactComponentContract]: {
			version: 2 as const,
			placement: 'client' as const,
			role: 'client' as const,
			implementations: [
				{ id: 'component:Island', name: 'Island', role: 'client-island' as const, implementation }
			],
			continuations: [],
			executors: [],
			boundaries: [],
			execution
		}
	}) as ComponentFunction<any, any>;
}
