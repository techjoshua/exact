import {
	exactComponentContract,
	exactComponentType
} from '@exactjs/core/framework/component-contracts';
import { createExactFrameworkFixtureArtifact } from '@exactjs/core/testing';
import { describe, expect, it } from 'vitest';
import {
	composeExactExecutorContract,
	createExactHydrationConfig,
	defineExactOperationContract,
	defineExactBoundaryContract
} from './executor-contract.js';

describe('@exactjs/server executor contracts', () => {
	it('composes explicitly imported executable component contracts', () => {
		const execute = () => ({ state: {} });
		const component = Object.assign(() => () => undefined, {
			[exactComponentType]: 'Page',
			[exactComponentContract]: {
				version: 3 as const,
				placement: 'server' as const,
				role: 'executor' as const,
				implementations: [],
				continuations: [
					defineExactOperationContract('save', {
						componentId: 'Page',
						reads: [{ path: 'project.id', kind: 'read', confidence: 'exact' }],
						writes: [{ path: 'project.title', kind: 'write', confidence: 'exact' }],
						boundaries: ['page']
					})
				],
				executors: [
					{
						id: 'save',
						componentId: 'Page',
						execute
					}
				],
				boundaries: [
					defineExactBoundaryContract('page', {
						componentId: 'Page',
						ownerComponentId: 'Page',
						kind: 'root'
					})
				]
			}
		});
		createExactFrameworkFixtureArtifact(component, 'Page', 'server');

		const contract = composeExactExecutorContract([component], {
			endpoint: '/__exact',
			endpoints: { invocations: { save: 'https://executor.test/__exact' } }
		});

		expect(contract).toMatchObject({
			version: 1,
			endpoint: '/__exact',
			invocations: {
				save: {
					componentId: 'Page',
					stateReads: [{ path: 'project.id' }],
					stateWrites: [{ path: 'project.title' }],
					boundaries: ['page']
				}
			},
			executors: { save: { componentId: 'Page', execute } },
			boundaries: { page: { ownerComponentId: 'Page' } }
		});
		expect(createExactHydrationConfig(contract, { state: { project: { id: 'p1' } } })).toEqual({
			endpoint: '/__exact',
			endpoints: { invocations: { save: 'https://executor.test/__exact' } },
			state: { project: { id: 'p1' } },
			continuations: {
				save: {
					...contract.invocations.save,
					serverContexts: [],
					serverContextWrites: []
				}
			}
		});
		expect(
			createExactHydrationConfig(contract, {
				state: { project: { id: 'p1' } },
				includeContinuations: false
			})
		).toEqual({
			endpoint: '/__exact',
			endpoints: { invocations: { save: 'https://executor.test/__exact' } },
			state: { project: { id: 'p1' } }
		});
	});

	it('rejects conflicting application authority and malformed routes', () => {
		const first = defineExactOperationContract('save', { componentId: 'Page' });
		const second = defineExactOperationContract('save', { componentId: 'OtherPage' });
		const component = Object.assign(() => () => undefined, {
			[exactComponentType]: 'Page',
			[exactComponentContract]: {
				version: 3 as const,
				placement: 'server' as const,
				role: 'executor' as const,
				implementations: [],
				continuations: [first],
				executors: [],
				boundaries: []
			}
		});
		createExactFrameworkFixtureArtifact(component, 'Page', 'server');

		expect(() =>
			composeExactExecutorContract([component], { invocations: { save: second } })
		).toThrow('Conflicting eXact executor invocation save');
		expect(() =>
			composeExactExecutorContract([], {
				endpoints: { invocations: { save: '' } }
			})
		).toThrow('Malformed eXact endpoint routes');
	});
});
