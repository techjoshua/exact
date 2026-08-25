import { describe, expect, it } from 'vitest';
import { isExactComponentContract } from './contract-validation.js';

describe('component contract validation', () => {
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
		const definition = {
			version: 1,
			instantiate,
			construct: instantiate,
			abi: 0,
			state: [],
			props: [],
			capabilities: [],
			server: {
				version: 1,
				classification: 'dynamic',
				lane: 'generic',
				publication: { kind: 'resumption', name: 'Panel' }
			}
		};
		const contract = {
			version: 2,
			placement: 'isomorphic',
			role: 'render',
			implementations: [],
			continuations: [continuation],
			executors: [],
			boundaries: [],
			resumption,
			definition
		};

		expect(isExactComponentContract(contract, componentId)).toBe(true);
		expect(
			isExactComponentContract(
				{ ...contract, definition: { ...definition, state: undefined } },
				componentId
			)
		).toBe(false);
		expect(
			isExactComponentContract(
				{ ...contract, definition: { ...definition, props: undefined } },
				componentId
			)
		).toBe(false);
		expect(
			isExactComponentContract(
				{
					...contract,
					definition: { ...definition, server: { ...definition.server, publication: undefined } }
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
