import { describe, expect, it } from 'vitest';
import {
	composeExactComponentDescriptors,
	composeExactContinuationDescriptors,
	exactClientComponentDescriptor,
	readExactComponentDescriptor
} from './descriptors.js';

describe('component artifact descriptors', () => {
	it('reads positional descriptors and composes their runtime lookup names', () => {
		const island = () => undefined;
		const component = Object.assign(() => undefined, {
			[exactClientComponentDescriptor]: [
				2,
				[['island-id', 'Panel_ExactClient_1', island]],
				[
					{
						id: 'search',
						stateReads: [{ path: 'query', kind: 'read', confidence: 'exact' }],
						stateWrites: [{ path: 'results', kind: 'write', confidence: 'exact' }],
						publicContexts: [],
						serverContexts: [],
						boundaries: ['results']
					}
				]
			] as const
		});

		expect(readExactComponentDescriptor(component, 'client')).toEqual([
			2,
			[['island-id', 'Panel_ExactClient_1', island]],
			[
				{
					id: 'search',
					stateReads: [{ path: 'query', kind: 'read', confidence: 'exact' }],
					stateWrites: [{ path: 'results', kind: 'write', confidence: 'exact' }],
					publicContexts: [],
					serverContexts: [],
					boundaries: ['results']
				}
			]
		]);
		expect(composeExactComponentDescriptors([component], 'client')).toEqual({
			Panel_ExactClient_1: island
		});
		expect(composeExactComponentDescriptors([component], 'server')).toEqual({});
		expect(composeExactContinuationDescriptors([component], 'client')).toEqual({
			search: expect.objectContaining({ boundaries: ['results'] })
		});
	});

	it('rejects conflicting implementations for one runtime lookup name', () => {
		const component = (implementation: () => void) =>
			Object.assign(() => undefined, {
				[exactClientComponentDescriptor]: [
					2,
					[['component-id', 'duplicate', implementation]],
					[]
				] as const
			});
		expect(() =>
			composeExactComponentDescriptors(
				[component(() => undefined), component(() => undefined)],
				'client'
			)
		).toThrow('Conflicting eXact component descriptor duplicate');
	});
});
