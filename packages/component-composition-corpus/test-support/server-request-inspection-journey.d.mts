import type {
	createExactServerDebugRuntime,
	defineExactOperationContract,
	handleExactRequest
} from '../../server/src/index.js';
type ServerInspectionApi = {
	createExactServerDebugRuntime: typeof createExactServerDebugRuntime;
	defineExactOperationContract: typeof defineExactOperationContract;
	handleExactRequest: typeof handleExactRequest;
};
/** Checks parent/session/request retirement and continued business execution in native hosts. */
export function verifyServerRequestInspectionLifetime(api: ServerInspectionApi): Promise<true>;
/** Checks UTF-8 response sizing and complete newest observation suffixes through the public server. */
export function verifyServerObservationByteBounds(api: ServerInspectionApi): Promise<true>;
