import type { handleExactRequest, defineExactOperationContract } from '../../server/src/index.js';
import type { mergeStateForContract } from '../../hydrate/src/state.js';
import type { stateNodeMatchesWrites } from '../../core/src/framework/protocol-records.js';
/** Paired server and hydration selection cases for data-only authorization. */
export const stateAuthorityCases: readonly string[];
/** Checks that selected array metadata cannot grant or remove publication authority. */
export function verifyStateAuthority(
	api: {
		handleExactRequest: typeof handleExactRequest;
		defineExactOperationContract: typeof defineExactOperationContract;
		mergeStateForContract: typeof mergeStateForContract;
	},
	selectedCase?: string
): Promise<void>;
/** Checks wide and nested selection while preserving rejection and getter order. */
export function verifyStateAuthorityLookup(
	api: { stateNodeMatchesWrites: typeof stateNodeMatchesWrites },
	count?: number
): void;
/** Checks indexed output and deletion permissions without conflating collection authority. */
export function verifyStatePathSelections(
	api: {
		stateOutputPathsMatchWrites: typeof import('../../core/src/framework/protocol-records.js').stateOutputPathsMatchWrites;
		stateDeletionPathsMatchWrites: typeof import('../../core/src/framework/protocol-records.js').stateDeletionPathsMatchWrites;
	},
	count?: number
): void;
