import type { captureReactiveMutations } from '../../reactive/src/internal/deps.js';
import type { createIntlEnvironment, intlLocaleMetadata } from '../../intl/src/environment.js';
import type {
	resolveIntlMeasurementPresentation,
	convertIntlMeasurementValue,
	formatIntlMeasurementValue
} from '../../intl/src/measurement-presentation.js';
/** Runs the public observation and revision journey in source, native and browser hosts. */
export function verifyIntlMeasurementOwnership(api: {
	intlLocaleMetadata: typeof intlLocaleMetadata;
	captureReactiveMutations: typeof captureReactiveMutations;
	createIntlEnvironment: typeof createIntlEnvironment;
	resolveIntlMeasurementPresentation: typeof resolveIntlMeasurementPresentation;
	convertIntlMeasurementValue: typeof convertIntlMeasurementValue;
	formatIntlMeasurementValue: typeof formatIntlMeasurementValue;
}): true;
import type { watch } from '../../reactive/src/observation.js';
import type { flushSync } from '../../reactive/src/internal/scheduler.js';
/** Executes isolated policy copies, captured propagation, reentrancy and rollback through public APIs. */
export function verifyIntlPolicyOwnership(api: {
	createIntlEnvironment: typeof createIntlEnvironment;
	captureReactiveMutations: typeof captureReactiveMutations;
	watch: typeof watch;
	flushSync: typeof flushSync;
}): true;
import type { registerIntlArtifacts, snapshotIntlArtifacts } from '../../intl/src/artifacts.js';
/** Executes owned catalog replay and transactional scope publication controls in each runtime. */
export function verifyIntlCatalogOwnership(api: {
	createIntlEnvironment: typeof createIntlEnvironment;
	registerIntlArtifacts: typeof registerIntlArtifacts;
	snapshotIntlArtifacts: typeof snapshotIntlArtifacts;
	captureReactiveMutations: typeof captureReactiveMutations;
}): true;
/** Runs retained locale-scope lazy source and override controls through native and browser exports. */
export function verifyIntlScopedSources(api: {
	createIntlEnvironment: typeof createIntlEnvironment;
	registerIntlArtifacts: typeof registerIntlArtifacts;
	snapshotIntlArtifacts: typeof snapshotIntlArtifacts;
}): true;
