import { describe, expect, it } from 'vitest';
import { isExactComponentContract } from './contract-validation.js';

describe('component contract validation', () => {
	it('accepts an explicit foreign compatibility server lane without direct executable fields', () => {
		const componentId = 'component:CompatibilityIsland';
		const instantiate = () => undefined;
		const contract = {
			version: 3,
			placement: 'server',
			role: 'executor',
			implementations: [],
			continuations: [],
			executors: [],
			boundaries: [],
			execution: { version: 1, ports: [], transitions: [], reactive: [] },
			artifact: {
				version: 1,
				target: 'server',
				id: componentId,
				issue() {},
				write() {},
				dispose() {},
				instantiate,
				construct: instantiate,
				abi: 0,
				state: [],
				props: [],
				capabilities: ['compatibility'],
				execution: { version: 1, classification: 'dynamic', lane: 'compatibility' }
			}
		};
		expect(isExactComponentContract(contract, componentId)).toBe(true);
	});
	it('requires server publication to match an isomorphic resumption continuation', () => {
		const componentId = 'component:Panel';
		const instantiate = () => undefined;
		const continuation = {
			id: 'task:load',
			kind: 'task',
			componentId,
			readiness: 'nonblocking',
			dependencies: [],
			stateReads: [],
			stateWrites: [],
			publicContexts: [],
			serverContexts: [],
			contextWrites: [],
			boundaries: []
		};
		const resumption = {
			componentId,
			statePaths: [],
			stateInputs: [],
			valueCaptures: [],
			contexts: [],
			boundaries: []
		};
		const artifact = {
			version: 1,
			target: 'server',
			id: componentId,
			issue() {},
			write() {},
			dispose() {},
			instantiate,
			construct: instantiate,
			abi: 0,
			state: [],
			props: [],
			capabilities: [],
			execution: {
				version: 1,
				classification: 'dynamic',
				lane: 'generic',
				publication: { kind: 'resumption', name: 'Panel' }
			}
		};
		const contract = {
			version: 3,
			placement: 'isomorphic',
			role: 'render',
			implementations: [],
			continuations: [continuation],
			executors: [],
			boundaries: [],
			resumption,
			artifact
		};

		expect(isExactComponentContract(contract, componentId)).toBe(true);
		expect(
			isExactComponentContract(
				{ ...contract, artifact: { ...artifact, state: undefined } },
				componentId
			)
		).toBe(false);
		expect(
			isExactComponentContract(
				{ ...contract, artifact: { ...artifact, props: undefined } },
				componentId
			)
		).toBe(false);
		expect(
			isExactComponentContract(
				{
					...contract,
					artifact: {
						...artifact,
						execution: { ...artifact.execution, publication: undefined }
					}
				},
				componentId
			)
		).toBe(false);
		expect(
			isExactComponentContract(
				{ ...contract, continuations: [], resumption: undefined },
				componentId
			)
		).toBe(false);
	});
});
