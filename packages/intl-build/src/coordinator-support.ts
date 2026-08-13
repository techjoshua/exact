import type { AnalyzedMessageDescriptorV1, IntlRuntimeDescriptorV1 } from '@exactjs/intl';
import type { IntlSourceAnalysis } from '@exactjs/intl-analyzer';
import { intl } from '@exactjs/core';

/** Removes analyzer-only diagnostics and ownership facts from one runtime descriptor. */
export function runtimeDescriptor(
	descriptor: AnalyzedMessageDescriptorV1
): IntlRuntimeDescriptorV1 {
	const {
		ownerComponentId: _ownerComponentId,
		canonicalTranslation: _canonicalTranslation,
		sourceRange: _sourceRange,
		...runtime
	} = descriptor;
	return runtime;
}

/** Creates an inert analysis result when only package activation code was injected. */
export function emptyIntlAnalysis(code: string): IntlSourceAnalysis {
	return Object.freeze({
		code,
		descriptors: Object.freeze([]),
		descriptorOwnerOrdinals: Object.freeze([]),
		diagnostics: Object.freeze([]),
		clientRequirements: Object.freeze([])
	});
}

/** Narrows package metadata to an ordinary JSON object record. */
export function objectRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

/** Validates one bounded application or package catalog owner. */
export function boundedOwner(value: unknown): string {
	if (typeof value !== 'string' || value.length === 0 || value.length > 256)
		throw new TypeError('Intl owner must be a bounded application package name');
	return value;
}

/** Canonicalizes one build configuration locale. */
export function canonicalBuildLocale(value: unknown, field: string): string {
	if (typeof value !== 'string') throw new TypeError(`Intl ${field} must be a BCP 47 locale`);
	const locale = intl.getCanonicalLocales(value)[0];
	if (!locale) throw new TypeError(`Intl ${field} must be a BCP 47 locale`);
	return locale;
}
