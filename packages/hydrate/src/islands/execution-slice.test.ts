import { describe, expect, it } from 'vitest';
import { type AnyComponentFunction } from '@exactjs/core';
import {
	exactComponentContract,
	exactComponentType,
	type ExactComponentExecutionContract
} from '@exactjs/core/framework/component-contracts';
import { prepareClientIslandExecutionSlice } from './execution-slice.js';

describe('lazy island execution slices', () => {
	it('admits only setup transitions owned by the loaded island root', () => {
		const component = compiledIsland({
			version: 1,
			ports: [],
			transitions: [transition('setup', 'setup'), transition('interaction', 'interaction')],
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
				['derived', 'a', 'inout'],
				['derived', 'b', 'inout']
			],
			transitions: [
				['a', 'a', 'setup', 'client', 'nonblocking', 'latest', [1], [0]],
				['b', 'b', 'setup', 'client', 'nonblocking', 'latest', [0], [1]]
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
	return [id, id, activation, 'client', 'nonblocking', 'latest', [], []];
}

function compiledIsland(execution: ExactComponentExecutionContract): AnyComponentFunction {
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
	}) as AnyComponentFunction;
}
