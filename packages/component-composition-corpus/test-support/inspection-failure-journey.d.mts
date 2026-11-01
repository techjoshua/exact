import type { createExactRuntimeInspectionOwner } from '../../core/src/component/inspection.js';
import type { createFrameworkComponentDomain } from '../../core/src/component/domain.js';
import type { createFrameworkFixtureComponentInstance } from '../../core/src/testing.js';
import type { defineTask, bindTaskForHost } from '../../core/src/tasks/runtime.js';
/** Executes the failure ownership control shared by source, native and browser checks. */
export function verifyInspectedFailureOwnership(api: {
	createExactRuntimeInspectionOwner: typeof createExactRuntimeInspectionOwner;
	createFrameworkComponentDomain: typeof createFrameworkComponentDomain;
	createFrameworkFixtureComponentInstance: typeof createFrameworkFixtureComponentInstance;
	defineTask: typeof defineTask;
	bindTaskForHost: typeof bindTaskForHost;
}): Promise<true>;
