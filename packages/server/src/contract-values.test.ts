import { it } from 'vitest';
import { createContext } from '@exactjs/core';
import * as server from './index.js';
import {
	verifyServerContractValues,
	verifyContinuationContractCache,
	verifyServerContextValues
} from '../../component-composition-corpus/test-support/server-contract-journey.mjs';
it('returns ordinary contract records and retains nested aliases', () =>
	verifyServerContractValues(server));
it('pairs cached continuation authority with its executor', () =>
	verifyContinuationContractCache(server));
it('keeps context observations ordinary and request values private', () =>
	verifyServerContextValues({ ...server, createContext }));

/** Compile-only controls keep readonly diagnostics alongside observable alias behavior. */
function readonlyDeclarations(
	operation: ReturnType<typeof server.defineExactOperationContract>,
	boundary: ReturnType<typeof server.defineExactBoundaryContract>,
	observation: server.ExactServerContextAccessObservation
) {
	// @ts-expect-error Contract identifiers remain readonly in TypeScript.
	operation.id = 'changed';
	// @ts-expect-error Boundary ownership remains readonly in TypeScript.
	boundary.ownerComponentId = 'changed';
	// @ts-expect-error Observation fields remain readonly in TypeScript.
	observation.token = 'changed';
}
void readonlyDeclarations;
