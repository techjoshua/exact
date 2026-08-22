/** Disposes one component-owned resource through its supported explicit lifetime protocol. */
export function disposeComponentResource(
	resource: Disposable | AsyncDisposable | { dispose(): unknown }
): unknown {
	if ('dispose' in resource) return resource.dispose();
	if (Symbol.dispose in resource) return resource[Symbol.dispose]();
	return resource[Symbol.asyncDispose]();
}
