import { describe, expect, it } from 'vitest';
import {
	composeExactComponentContracts,
	exactComponentContract,
	exactComponentIdentity,
	exactComponentType,
	isExactComponent,
	markExactComponent,
	readExactComponentContract
} from './component-contracts.js';

describe('@exactjs/core component contracts', () => {
	it('brands native library components without inventing an executable contract', () => {
		const Component = markExactComponent(function Component() {}, '@exactjs/core:test-component');

		expect(isExactComponent(Component)).toBe(true);
		expect(readExactComponentContract(Component)).toBeUndefined();
		expect(exactComponentIdentity(Component)).toBe('@exactjs/core:test-component');
	});

	it('reads and composes target-local executable contracts', () => {
		const island = () => undefined;
		const component = Object.assign(() => undefined, {
			[exactComponentType]: 'component:Page',
			[exactComponentContract]: {
				version: 2 as const,
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
						kind: 'task' as const,
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
					},
					{
						id: 'boundary:Page:children',
						componentId: '',
						ownerComponentId: 'component:Page',
						kind: 'server-slot'
					}
				],
				resumption: {
					componentId: 'component:Page',
					statePaths: ['count'],
					valueCaptures: [],
					contexts: [],
					boundaries: ['boundary:Page']
				},
				execution: {
					version: 1 as const,
					ports: [['state', 'count', 'inout']] as const,
					transitions: [
						['task:Page:1', 'task:Page:1', 'setup', 'server', 'blocking', 'latest', [0], [0]]
					] as const,
					reactive: [
						{
							name: 'count',
							provenance: 'state' as const,
							allocation: 'live-slot' as const,
							dependencies: []
						}
					]
				}
			}
		});

		expect(exactComponentIdentity(component)).toBe('component:Page');
		const validated = readExactComponentContract(component)!;
		expect(validated.role).toBe('client');
		expect(Object.isFrozen(validated)).toBe(true);
		expect(Object.isFrozen(validated.execution?.transitions)).toBe(true);
		expect(readExactComponentContract(component)).toBe(validated);
		expect(composeExactComponentContracts([component], 'client')).toMatchObject({
			implementations: { Page_ExactClient_1: island },
			implementationsById: { 'island:Page:1': island },
			continuations: { 'task:Page:1': { componentId: 'component:Page' } },
			executors: {},
			boundaries: {
				'boundary:Page': { kind: 'client-island' },
				'boundary:Page:children': { kind: 'server-slot' }
			},
			resumptions: { 'component:Page': { statePaths: ['count'] } },
			executions: { 'component:Page': { version: 1 } }
		});
	});

	it('rejects conflicting stable implementation ids', () => {
		const contract = (implementation: () => void) =>
			Object.assign(() => undefined, {
				[exactComponentType]: 'component:Page',
				[exactComponentContract]: {
					version: 2 as const,
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
			[exactComponentType]: 'component:Page',
			[exactComponentContract]: {
				version: 2,
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

	it('rejects pre-partition component contract versions before adoption', () => {
		const component = Object.assign(() => undefined, {
			[exactComponentType]: 'component:Legacy',
			[exactComponentContract]: {
				version: 1,
				placement: 'client',
				role: 'client',
				implementations: [],
				continuations: [],
				executors: [],
				boundaries: []
			}
		});

		expect(() => readExactComponentContract(component)).toThrow(
			'Unsupported eXact component contract'
		);
	});

	it('validates the complete partition boundary discriminator contract', () => {
		const component = Object.assign(() => undefined, {
			[exactComponentType]: 'component:Reports',
			[exactComponentContract]: {
				version: 2 as const,
				placement: 'server' as const,
				role: 'executor' as const,
				implementations: [],
				continuations: [],
				executors: [],
				boundaries: [
					{
						id: 'conditional-range',
						componentId: 'component:Reports',
						ownerComponentId: 'component:Reports',
						kind: 'partition-range',
						planVersion: 1,
						buildKey: 'build',
						planEdgeId: 'conditional-range',
						parentPlanId: 'reports',
						fallbackPlanId: 'reports',
						patchTargets: ['conditional-range', 'remote-branch'],
						discriminatorKind: 'branch' as const,
						discriminatorValues: ['local-branch', 'remote-branch'],
						generation: 1
					}
				]
			}
		});

		expect(readExactComponentContract(component)?.boundaries[0]).toMatchObject({
			discriminatorKind: 'branch',
			discriminatorValues: ['local-branch', 'remote-branch']
		});
	});

	it('rejects contract records owned by a different branded component', () => {
		const component = Object.assign(() => undefined, {
			[exactComponentType]: 'component:Page',
			[exactComponentContract]: {
				version: 2 as const,
				placement: 'client' as const,
				role: 'client' as const,
				implementations: [],
				continuations: [],
				executors: [],
				boundaries: [],
				resumption: {
					componentId: 'component:Other',
					statePaths: [],
					valueCaptures: [],
					contexts: [],
					boundaries: []
				}
			}
		});

		expect(() => readExactComponentContract(component)).toThrow(
			'Unsupported eXact component contract'
		);
	});

	it('revalidates a replaced contract attachment while reusing an unchanged frozen contract', () => {
		const contract = (placement: 'client' | 'server') => ({
			version: 2 as const,
			placement,
			role: 'client' as const,
			implementations: [],
			continuations: [],
			executors: [],
			boundaries: []
		});
		const component = Object.assign(() => undefined, {
			[exactComponentType]: 'component:Replaceable',
			[exactComponentContract]: contract('client')
		});

		const first = readExactComponentContract(component)!;
		expect(readExactComponentContract(component)).toBe(first);
		component[exactComponentContract] = contract('server');
		const second = readExactComponentContract(component)!;
		expect(second).not.toBe(first);
		expect(second.placement).toBe('server');
		expect(Object.isFrozen(second)).toBe(true);
	});
});
