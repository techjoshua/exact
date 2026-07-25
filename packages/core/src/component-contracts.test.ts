import { describe, expect, it } from 'vitest';
import {
	composeExactComponentContracts,
	exactComponentContract,
	readExactComponentContract
} from './component-contracts.js';

describe('@exactjs/core component contracts', () => {
	it('reads and composes target-local executable contracts', () => {
		const island = () => undefined;
		const component = Object.assign(() => undefined, {
			[exactComponentContract]: {
				version: 1 as const,
				id: 'component:Page',
				placement: 'server' as const,
				role: 'client' as const,
				implementations: [
					{
						id: 'island:Page:1',
						name: 'Page_ExactClient_1',
						role: 'client-island' as const,
						implementation: island
					}
				],
				continuations: [
					{
						id: 'task:Page:1',
						componentId: 'component:Page',
						readiness: 'blocking' as const,
						dependencies: [],
						stateReads: [],
						stateWrites: [],
						publicContexts: [],
						serverContexts: [],
						contextWrites: [],
						boundaries: ['boundary:Page']
					}
				],
				executors: [],
				boundaries: [
					{
						id: 'boundary:Page',
						componentId: 'component:Page',
						ownerComponentId: 'component:Page',
						kind: 'client-island'
					}
				],
				resumption: {
					componentId: 'component:Page',
					statePaths: ['count'],
					valueCaptures: [],
					contexts: [],
					boundaries: ['boundary:Page']
				}
			}
		});

		expect(readExactComponentContract(component)?.id).toBe('component:Page');
		expect(composeExactComponentContracts([component], 'client')).toMatchObject({
			implementations: { Page_ExactClient_1: island },
			implementationsById: { 'island:Page:1': island },
			continuations: { 'task:Page:1': { componentId: 'component:Page' } },
			executors: {},
			boundaries: { 'boundary:Page': { kind: 'client-island' } },
			resumptions: { 'component:Page': { statePaths: ['count'] } }
		});
	});

	it('rejects conflicting stable implementation ids', () => {
		const contract = (implementation: () => void) =>
			Object.assign(() => undefined, {
				[exactComponentContract]: {
					version: 1 as const,
					id: 'component:Page',
					placement: 'client' as const,
					role: 'client' as const,
					implementations: [
						{
							id: 'island:Page:1',
							name: 'Page_ExactClient_1',
							role: 'client-island' as const,
							implementation
						}
					],
					continuations: [],
					executors: [],
					boundaries: []
				}
			});

		expect(() =>
			composeExactComponentContracts(
				[contract(() => undefined), contract(() => undefined)],
				'client'
			)
		).toThrow('Conflicting eXact component implementation island:Page:1');
	});

	it('rejects incomplete continuation metadata instead of assuming an older shape', () => {
		const component = Object.assign(() => undefined, {
			[exactComponentContract]: {
				version: 1,
				id: 'component:Page',
				placement: 'client',
				role: 'client',
				implementations: [],
				continuations: [
					{
						id: 'task:Page',
						componentId: 'component:Page',
						dependencies: [],
						stateReads: [],
						stateWrites: [],
						publicContexts: [],
						serverContexts: [],
						boundaries: []
					}
				],
				executors: [],
				boundaries: []
			}
		});

		expect(() => readExactComponentContract(component)).toThrow(
			'Unsupported eXact component contract'
		);
	});
});
