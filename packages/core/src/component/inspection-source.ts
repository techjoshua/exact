const exactInspectionSources = new WeakMap<CallableFunction, string>();

/**
 * Attaches compiler-owned source identity to a runtime callback without exposing the callback.
 *
 * This helper is emitted only by inspection-instrumented builds. The WeakMap does not alter the
 * callback, invoke user code, or retain a callback after its owning registration is collected.
 */
export function markExactInspectionSource<Callback extends CallableFunction>(
	sourceEntityId: string,
	callback: Callback
): Callback {
	if (sourceEntityId) exactInspectionSources.set(callback, sourceEntityId);
	return callback;
}

/** Reads compiler-owned source identity while a component resource is registered. */
export function readExactInspectionSource(callback: CallableFunction): string | undefined {
	return exactInspectionSources.get(callback);
}
