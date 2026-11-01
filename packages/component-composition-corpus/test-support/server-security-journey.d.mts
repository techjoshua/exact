import type {
	handleExactRequest,
	defineExactOperationContract,
	createExactServerDebugRuntime,
	createExactContextRuntime,
	openExactRequestScope
} from '../../server/src/index.js';
/** Checks security decisions and resource ownership in source and native execution runtimes. */
export function verifyServerSecurity(api: {
	handleExactRequest: typeof handleExactRequest;
	defineExactOperationContract: typeof defineExactOperationContract;
	createExactServerDebugRuntime: typeof createExactServerDebugRuntime;
	createExactContextRuntime: typeof createExactContextRuntime;
	openExactRequestScope: typeof openExactRequestScope;
}): Promise<true>;
