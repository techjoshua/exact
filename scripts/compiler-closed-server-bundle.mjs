/** Rejects generic component and client-reactivity machinery in compiler-closed SSR bundles. */
export function assertCompilerClosedServerBundle(source) {
	// Compiler-closed roots share the renderer's optional output-extension pipeline. Its presence
	// is intentional; generic component, task-owner, and client-reactivity runtimes are not.
	for (const signature of [
		'ComponentInstanceImpl',
		'createGenericSsrComponentInstance',
		'renderGenericComponentAsync',
		'registerGenericSsrComponentRenderer',
		'SsrReadinessOwner',
		'createTaskOwnerRecord',
		'setScheduledWorkContextCapture',
		'createReactiveBase',
		'createErrorContextWithLimit',
		'function computed',
		'function flushSync',
		'function withEffectScope',
		'encodeReactiveProtocolValue',
		'metadataByCollection',
		'function peek',
		'function clientBoundaryProps',
		'function* renderClientBoundaryChunks',
		'function orderEnhancementEntries',
		'function applyPreparedTargetTree',
		'function renderVNodeAsync',
		'function renderGenericSsrComponent',
		'function renderResumableComponentBoundary',
		'function serializeHydrationPayload',
		'function componentHtml',
		'__exactExecution_'
	]) {
		if (source.includes(signature))
			throw new Error(`Compiler-closed server bundle retained generic runtime ${signature}`);
	}
}
