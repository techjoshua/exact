/** Reports that the experimental transition-type API is not implemented. */
export function addTransitionType(): never {
	throw new Error('React API addTransitionType is not supported by eXact compatibility');
}
/** Reports that the experimental cache-refresh hook is not implemented. */
export function unstable_useCacheRefresh(): never {
	throw new Error('React API unstable_useCacheRefresh is not supported by eXact compatibility');
}
/** Reports that the removed legacy factory API is not implemented. */
export function createFactory(): never {
	throw new Error('React API createFactory is not supported by eXact compatibility');
}
