import type {
	previewExactValue,
	redactExactValue
} from '../../devtools-protocol/src/value-preview.js';
import type {
	paginateExactInspection,
	EXACT_INSPECTION_METHODS,
	parseExactInspectionRequest
} from '../../devtools-protocol/src/query.js';
import type {
	createExactRuntimeInspectionOwner,
	inspectExactRuntimeComponent
} from '../../core/src/component/inspection.js';
import type { createFrameworkComponentDomain } from '../../core/src/component/domain.js';
import type { createFrameworkFixtureComponentInstance } from '../../core/src/testing/runtime.js';
import type { defineTask } from '../../core/src/tasks/runtime.js';
/** Exercises ordinary protocol observations, redaction paths and dispatch authority in all hosts. */
export function verifyInspectionPreviewOwnership(api: {
	previewExactValue: typeof previewExactValue;
	redactExactValue: typeof redactExactValue;
	paginateExactInspection: typeof paginateExactInspection;
	EXACT_INSPECTION_METHODS: typeof EXACT_INSPECTION_METHODS;
	parseExactInspectionRequest: typeof parseExactInspectionRequest;
}): true;
/** Exercises public component and task snapshot ownership in source, native hosts and browsers. */
export function verifyInspectionObservationOwnership(api: {
	createExactRuntimeInspectionOwner: typeof createExactRuntimeInspectionOwner;
	inspectExactRuntimeComponent: typeof inspectExactRuntimeComponent;
	createFrameworkComponentDomain: typeof createFrameworkComponentDomain;
	createFrameworkFixtureComponentInstance: typeof createFrameworkFixtureComponentInstance;
	defineTask: typeof defineTask;
}): Promise<true>;
