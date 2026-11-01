import type { createExactServerDebugRuntime } from '../../server/src/debug/runtime.js';
/** Checks server catalog authority through public exports in source and native hosts. */
export function verifyServerCatalogOwnership(api: {
	createExactServerDebugRuntime: typeof createExactServerDebugRuntime;
}): Promise<true>;
