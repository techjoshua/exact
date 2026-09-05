import { describe, expect, it } from 'vitest';
import {
	composeExactComponentContracts,
	composePreparedExactComponentContracts,
	exactComponentContract,
	exactComponentIdentity,
	exactComponentType,
	readExactClientExecutableComponentContract,
	readExactExecutableComponentContract,
	readExactComponentContract,
	readExactServerExecutableComponentContract
} from './component-contracts.js';
import {
	createExactCompatibilityArtifact,
	createExactCompiledDynamicBoundaryArtifact
} from './testing/runtime-artifacts.js';
import { allCompiledComponentABI } from './component/compiled-abi.js';

describe('@exactjs/core component contracts', () => {
	const construct = () => undefined;
	const clientArtifact = (
		id: string,
		instantiate: () => unknown = construct,
		overrides: Record<string, unknown> = {}
	) => ({
		version: 1 as const,
		target: 'client' as const,
		id,
		instantiate,
		construct,
		attach() {},
		receive() {},
		dispose() {},
		abi: 0,
		state: [],
		props: [],
		capabilities: [],
		...overrides
	});
	const serverArtifact = (
		id: string,
		instantiate: () => unknown,
		execution: Record<string, unknown>
	) => ({
		version: 1 as const,
		target: 'server' as const,
		id,
		instantiate,
		construct,
		issue() {},
		write() {},
		dispose() {},
		abi: 0,
		state: [],
		props: [],
		capabilities: [],
		execution
	});
	it('limits an opaque framework boundary to dynamic rendering and interactions', () => {
		const Boundary = createExactCompiledDynamicBoundaryArtifact(
			function Boundary() {},
			'@exactjs/core:test-dynamic-boundary',
			'client'
		);

		expect(readExactExecutableComponentContract(Boundary).artifact.capabilities).toEqual([
			'dynamic-components',
			'interactions'
		]);
		expect(readExactExecutableComponentContract(Boundary).artifact.abi).toBe(1);
	});

	it('constructs a complete artifact only for an explicit foreign compatibility boundary', () => {
		const Component = createExactCompatibilityArtifact(
			function Component() {},
			'@exactjs/core:test-compatibility',
			'client'
		);

		expect(readExactExecutableComponentContract(Component)).toMatchObject({
			placement: 'client',
			role: 'client',
			artifact: {
				instantiate: Component,
				capabilities: ['compatibility', 'collections', 'dynamic-components']
			}
		});
		expect(() =>
			createExactCompatibilityArtifact(
				function Invalid() {},
				'compatibility:invalid',
				'default' as 'client'
			)
		).toThrow('target-local artifact target');
	});

	it('composes a build-prepared client artifact after descriptive inventories are erased', () => {
		const component = Object.assign(function Prepared() {}, {
			[exactComponentType]: 'component:Prepared',
			[exactComponentContract]: {
				artifact: clientArtifact('component:Prepared')
			}
		});

		const contracts = composePreparedExactComponentContracts([component], 'client');

		expect(contracts.artifacts['component:Prepared']).toBe(
			component[exactComponentContract].artifact
		);
		expect(contracts.implementationsById['component:Prepared']).toBe(component);
		expect(contracts.continuations).toEqual({});
	});

	it('reads and composes target-local executable contracts', () => {
		const island = () => undefined;
		const component = Object.assign(() => undefined, {
			[exactComponentType]: 'component:Page',
			[exactComponentContract]: {
				version: 3 as const,
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
					stateInputs: [],
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
				},
				artifact: clientArtifact('component:Page')
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
					version: 3 as const,
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
					boundaries: [],
					artifact: clientArtifact('component:Page')
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
				version: 3,
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
				boundaries: [],
				artifact: clientArtifact('component:Page')
			}
		});

		expect(() => readExactComponentContract(component)).toThrow(
			'Unsupported eXact component contract'
		);
	});

	it.each([
		['generic', undefined],
		['direct', () => () => null]
	] as const)('validates compiler-projected %s server execution metadata', (lane, render) => {
		const implementation = () => () => null;
		const server =
			lane === 'direct'
				? {
						version: 1 as const,
						classification: 'scheduled' as const,
						lane,
						deferredTaskProps: ['request'],
						render
					}
				: {
						version: 1 as const,
						classification: 'scheduled' as const,
						lane,
						deferredTaskProps: ['request']
					};
		const component = Object.assign(implementation, {
			[exactComponentType]: 'component:ServerPage',
			[exactComponentContract]: {
				version: 3 as const,
				placement: 'server' as const,
				role: 'executor' as const,
				implementations: [
					{
						id: 'implementation:ServerPage',
						name: 'ServerPage',
						role: 'root' as const,
						implementation
					}
				],
				continuations: [],
				executors: [],
				boundaries: [],
				artifact: {
					...serverArtifact('component:ServerPage', implementation, server),
					abi: lane === 'direct' ? 9 : 8
				}
			}
		});

		expect(readExactServerExecutableComponentContract(component).artifact.execution).toEqual(
			server
		);
	});

	it.each([1, 2])('rejects obsolete component contract version %s before adoption', (version) => {
		const component = Object.assign(() => undefined, {
			[exactComponentType]: 'component:Legacy',
			[exactComponentContract]: {
				version,
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

	it.each([
		['artifact identity', { id: 'component:Other' }],
		['artifact target', { target: 'server' }],
		['required attach operation', { attach: undefined }]
	])('rejects a client artifact with malformed %s', (_case, override) => {
		const component = Object.assign(() => undefined, {
			[exactComponentType]: 'component:MalformedClient',
			[exactComponentContract]: {
				version: 3 as const,
				placement: 'client' as const,
				role: 'client' as const,
				implementations: [],
				continuations: [],
				executors: [],
				boundaries: [],
				artifact: {
					...clientArtifact('component:MalformedClient'),
					...override
				}
			}
		});

		expect(() => readExactExecutableComponentContract(component)).toThrow(
			'Unsupported eXact component contract'
		);
	});

	it('validates the complete partition boundary discriminator contract', () => {
		const component = Object.assign(() => undefined, {
			[exactComponentType]: 'component:Reports',
			[exactComponentContract]: {
				version: 3 as const,
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
				],
				artifact: serverArtifact('component:Reports', construct, {
					version: 1,
					classification: 'synchronous',
					lane: 'direct',
					render: construct
				})
			}
		});

		expect(readExactComponentContract(component)?.boundaries[0]).toMatchObject({
			discriminatorKind: 'branch',
			discriminatorValues: ['local-branch', 'remote-branch']
		});
	});

	it('validates compiler-generated component update programs and their masks', () => {
		const instantiate = () => undefined;
		const component = Object.assign(() => undefined, {
			[exactComponentType]: 'component:Updates',
			[exactComponentContract]: {
				version: 3 as const,
				placement: 'client' as const,
				role: 'client' as const,
				implementations: [],
				continuations: [],
				executors: [],
				boundaries: [],
				artifact: clientArtifact('component:Updates', instantiate, {
					updates: { bindings: [[0, 1, 0]], apply() {} }
				})
			}
		});

		expect(
			readExactClientExecutableComponentContract(component).artifact.updates?.bindings
		).toEqual([[0, 1, 0]]);
	});

	it('validates compiler-generated component update programs wider than 64 operations', () => {
		const instantiate = () => undefined;
		const updates = {
			bindings: [
				[0, 1, 0, 0],
				[1, 0, 0, 1]
			] as const,
			words: 3,
			apply() {}
		};
		const component = Object.assign(() => undefined, {
			[exactComponentType]: 'component:WideUpdates',
			[exactComponentContract]: {
				version: 3 as const,
				placement: 'client' as const,
				role: 'client' as const,
				implementations: [],
				continuations: [],
				executors: [],
				boundaries: [],
				artifact: clientArtifact('component:WideUpdates', instantiate, { updates })
			}
		});

		expect(readExactClientExecutableComponentContract(component).artifact.updates).toBe(updates);
	});

	it('rejects an invalid component update mask before adopting its artifact', () => {
		const instantiate = () => undefined;
		const component = Object.assign(() => undefined, {
			[exactComponentType]: 'component:InvalidUpdates',
			[exactComponentContract]: {
				version: 3 as const,
				placement: 'client' as const,
				role: 'client' as const,
				implementations: [],
				continuations: [],
				executors: [],
				boundaries: [],
				artifact: clientArtifact('component:InvalidUpdates', instantiate, {
					updates: { bindings: [[0, -1, 0]], apply() {} }
				})
			}
		});

		expect(() => readExactExecutableComponentContract(component)).toThrow(
			'Unsupported eXact component contract'
		);
	});

	it('rejects a wide component update whose binding width does not match its artifact', () => {
		const instantiate = () => undefined;
		const component = Object.assign(() => undefined, {
			[exactComponentType]: 'component:InvalidWideUpdates',
			[exactComponentContract]: {
				version: 3 as const,
				placement: 'client' as const,
				role: 'client' as const,
				implementations: [],
				continuations: [],
				executors: [],
				boundaries: [],
				artifact: clientArtifact('component:InvalidWideUpdates', instantiate, {
					updates: { bindings: [[0, 0, 0]], words: 3, apply() {} }
				})
			}
		});

		expect(() => readExactExecutableComponentContract(component)).toThrow(
			'Unsupported eXact component contract'
		);
	});

	it('rejects runtime ABI bits outside the supported compiler contract', () => {
		const instantiate = () => undefined;
		const component = Object.assign(() => undefined, {
			[exactComponentType]: 'component:InvalidRuntimeABI',
			[exactComponentContract]: {
				version: 3 as const,
				placement: 'client' as const,
				role: 'client' as const,
				implementations: [],
				continuations: [],
				executors: [],
				boundaries: [],
				artifact: clientArtifact('component:InvalidRuntimeABI', instantiate, {
					abi: allCompiledComponentABI + 1
				})
			}
		});

		expect(() => readExactExecutableComponentContract(component)).toThrow(
			'Unsupported eXact component contract'
		);
	});

	it('rejects compiled definitions without the current runtime ABI', () => {
		const instantiate = () => undefined;
		const component = Object.assign(() => undefined, {
			[exactComponentType]: 'component:MissingRuntimeABI',
			[exactComponentContract]: {
				version: 3 as const,
				placement: 'client' as const,
				role: 'client' as const,
				implementations: [],
				continuations: [],
				executors: [],
				boundaries: [],
				artifact: {
					...clientArtifact('component:MissingRuntimeABI', instantiate),
					abi: undefined
				}
			}
		});

		expect(() => readExactExecutableComponentContract(component)).toThrow(
			'Unsupported eXact component contract'
		);
	});

	it('rejects compiled definitions without compiler-linked construction', () => {
		const instantiate = () => undefined;
		const component = Object.assign(() => undefined, {
			[exactComponentType]: 'component:MissingConstruction',
			[exactComponentContract]: {
				version: 3 as const,
				placement: 'client' as const,
				role: 'client' as const,
				implementations: [],
				continuations: [],
				executors: [],
				boundaries: [],
				artifact: {
					...clientArtifact('component:MissingConstruction', instantiate),
					construct: undefined
				}
			}
		});

		expect(() => readExactExecutableComponentContract(component)).toThrow(
			'Unsupported eXact component contract'
		);
	});

	it('rejects contract records owned by a different branded component', () => {
		const component = Object.assign(() => undefined, {
			[exactComponentType]: 'component:Page',
			[exactComponentContract]: {
				version: 3 as const,
				placement: 'client' as const,
				role: 'client' as const,
				implementations: [],
				continuations: [],
				executors: [],
				boundaries: [],
				artifact: clientArtifact('component:Page'),
				resumption: {
					componentId: 'component:Other',
					statePaths: [],
					stateInputs: [],
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
			version: 3 as const,
			placement,
			role: 'client' as const,
			implementations: [],
			continuations: [],
			executors: [],
			boundaries: [],
			artifact: clientArtifact('component:Replaceable')
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
