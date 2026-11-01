type ServerApi = typeof import('../../server/src/index.js');
type ContractApi = Pick<
	ServerApi,
	| 'defineExactOperationContract'
	| 'defineExactBoundaryContract'
	| 'composeExactExecutorContract'
	| 'createExactHydrationConfig'
>;
type RequestApi = Pick<ServerApi, 'handleExactRequest' | 'defineExactOperationContract'>;
/** Checks returned contract records and nested mutable aliases. */
export function verifyServerContractValues(api: ContractApi): void;
/** Checks alternating contract and implementation ownership through public request dispatch. */
export function verifyContinuationContractCache(api: RequestApi): Promise<void>;
/** Checks that context observation aliases do not change request context execution. */
export function verifyServerContextValues(
	api: RequestApi & { createContext: typeof import('@exactjs/core').createContext }
): Promise<void>;
