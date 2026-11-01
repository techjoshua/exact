import type { createExactClientEventStore } from '../../devtools-runtime/src/client-events.js';
import type { createExactServerDebugRuntime } from '../../server/src/debug/runtime.js';
/** Runs client event ownership and delivery in source, native hosts and browsers. */
export function verifyClientEventOwnership(api: {
	createExactClientEventStore: typeof createExactClientEventStore;
}): true;
/** Runs request-owned event capture through the public server runtime. */
export function verifyServerEventOwnership(api: {
	createExactServerDebugRuntime: typeof createExactServerDebugRuntime;
}): Promise<true>;
