/** Checks JSON-only response publication through source or built invocation functions. */
export function verifyJsonResponseOwnership(api: {
	invokeExact: typeof import('../../hydrate/src/invocations.js').invokeExact;
	invokeExactBatch: typeof import('../../hydrate/src/invocations.js').invokeExactBatch;
}): Promise<void>;
