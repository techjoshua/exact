import type {
	ExactInvocationRequest,
	ExactInvocationHandler,
	ExactInvocationResult,
	ExactManualInvocationResult,
	ExactServerContext
} from '../types.js';
import { normalizeExactManualResult } from '../trusted-html.js';

const frameworkHandlerBrand = Symbol.for('@exactjs/server/framework-handler');

type BrandedFrameworkHandler = Function & { [frameworkHandlerBrand]?: true };

/** Server handler whose HTML provenance is owned by the compiler or SSR renderer. */
export type ExactFrameworkInvocationHandler = ExactInvocationHandler;

/** Marks a compiler/renderer-owned handler whose HTML is already governed by framework escaping. */
export function markExactFrameworkInvocationHandler<T extends ExactFrameworkInvocationHandler>(
	handler: T
): T {
	Object.defineProperty(handler, frameworkHandlerBrand, {
		configurable: false,
		enumerable: false,
		value: true,
		writable: false
	});
	return handler;
}

/** Returns whether a handler was created by a trusted framework renderer boundary. */
export function isExactFrameworkInvocationHandler(handler: Function): boolean {
	return (handler as BrandedFrameworkHandler)[frameworkHandlerBrand] === true;
}

/** Normalizes an authored result while leaving renderer-owned wire HTML intact. */
export function normalizeExactHandlerResult(
	handler: ExactInvocationHandler,
	result: ExactInvocationResult | ExactManualInvocationResult
): ExactInvocationResult {
	return isExactFrameworkInvocationHandler(handler)
		? (result as ExactInvocationResult)
		: normalizeExactManualResult(result as ExactManualInvocationResult);
}
