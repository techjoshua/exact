import type {
	ExactInvocationResult,
	ExactManualInvocationResult,
	ExactManualPatch,
	ExactPatch
} from './types.js';

const trustedHtmlBrand = Symbol('exact.trusted-html');

/** HTML explicitly authorized for an application-owned server patch boundary. */
export type ExactTrustedHtml = Readonly<{
	value: string;
	readonly [trustedHtmlBrand]: true;
}>;

/**
 * Explicitly authorizes authored HTML for contextual parsing by the owning hydration root.
 * Callers must escape or sanitize every untrusted value before invoking this capability.
 */
export function unsafeExactHtml(value: string): ExactTrustedHtml {
	if (typeof value !== 'string') throw new TypeError('Trusted eXact HTML must be a string');
	return Object.freeze({ value, [trustedHtmlBrand]: true as const });
}

/** Converts an authored result to its ordinary wire representation or rejects raw HTML. */
export function normalizeExactManualResult(
	result: ExactManualInvocationResult
): ExactInvocationResult {
	const { html, patches, ...values } = result;
	return {
		...values,
		...(html === undefined ? {} : { html: trustedHtmlValue(html) }),
		...(patches === undefined ? {} : { patches: patches.map(normalizeManualPatch) })
	};
}

function normalizeManualPatch(patch: ExactManualPatch): ExactPatch {
	if (patch.type === 'replace') return { ...patch, html: trustedHtmlValue(patch.html) };
	if (patch.type === 'list' && patch.html !== undefined)
		return { ...patch, html: trustedHtmlValue(patch.html) };
	return patch as ExactPatch;
}

function trustedHtmlValue(value: ExactTrustedHtml): string {
	if (!value || typeof value !== 'object' || value[trustedHtmlBrand] !== true)
		throw new TypeError('Raw HTML requires unsafeExactHtml() at an application server boundary');
	return value.value;
}
