type ReactiveApi = typeof import('@exactjs/reactive');
/** Checks ordinary diagnostics alongside invalidation and disposal. */
export function verifyComputedObservationValues(
	api: Pick<
		ReactiveApi,
		'reactive' | 'computed' | 'inspectComputed' | 'createEffectScope' | 'withEffectScope'
	>
): void;
/** Checks registry diagnostics without changing compiler-owned membership. */
export function verifyRegistryObservationValues(
	api: Pick<
		typeof import('../../core/src/component-registry/operations.js'),
		'inspectComponentRegistry' | 'hasComponent'
	>,
	registry: import('../../core/src/component-registry/contracts.js').AnyComponentRegistry
): void;
/** Checks ordinary recorder metadata and independent captured inputs. */
export function verifyRecorderObservationValues(api: {
	ExactProtocolRecorder: typeof import('../../testing/src/protocol.js').ExactProtocolRecorder;
}): Promise<void>;
