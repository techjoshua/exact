import { describe, expect, it } from 'vitest';
import { type AnyComponentFunction } from '@exactjs/core';
import {
	exactComponentContract,
	exactComponentIdentity,
	type ExactComponentExecutionContract
} from '@exactjs/core/framework/component-contracts';
import { prepareClientIslandExecutionSlice } from './execution-slice.js';
import { CyclicSliceIsland, SetupSliceIsland } from '../test-support/execution-slice.fixtures.js';

describe('lazy island execution slices', () => {
	it('admits only setup transitions owned by the loaded island root', () => {
		const component = compiledIsland(SetupSliceIsland, {
			version: 1,
			ports: [],
			transitions: [transition('setup', 'setup'), transition('interaction', 'interaction')],
			reactive: []
		});
		const slice = prepareClientIslandExecutionSlice(component);
		expect([...slice.get(exactComponentIdentity(component))!]).toEqual(['setup']);
		expect(prepareClientIslandExecutionSlice(component)).toBe(slice);
	});

	it('rejects an opaque cyclic transition graph instead of remaining loading', () => {
		const component = compiledIsland(CyclicSliceIsland, {
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

function compiledIsland(
	component: AnyComponentFunction,
	execution: ExactComponentExecutionContract
): AnyComponentFunction {
	const componentRecord = component as unknown as Record<PropertyKey, unknown>;
	const contract = componentRecord[exactComponentContract] as
		| { execution?: ExactComponentExecutionContract }
		| undefined;
	if (!contract) throw new Error('Execution-slice fixture was not compiled by exactc');
	contract.execution = execution;
	return component;
}
