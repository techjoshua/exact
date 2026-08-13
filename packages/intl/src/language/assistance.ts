import { intl } from '@exactjs/core';
import type { IntlBindingDescriptorV1, IntlPatternV1 } from '../contracts.js';
import type {
	IntlCompletionValue,
	IntlLanguageDescriptor,
	IntlLocaleDiagnostic,
	IntlNativeLanguageAnalysis
} from './analysis-contracts.js';
import { projectIntlTranslationContract } from '../translation-contract.js';
import { intlUnitIdentifiers } from '../unit-definitions.js';

/** Summarizes analyzer-proven behavior for hover and inlay presentation. */
export function describeIntlInference(descriptor: IntlLanguageDescriptor): string[] {
	const result = new Set<string>();
	for (const capability of descriptor.capabilities) result.add(capability.replaceAll('-', ' '));
	visitPattern(descriptor.source, result);
	for (const binding of descriptor.bindings) {
		const formatter = isRecord(binding.formatter) ? binding.formatter : undefined;
		if (typeof formatter?.kind === 'string') result.add(formatter.kind.replaceAll('-', ' '));
	}
	return [...result].sort();
}

/** Explains formatter evidence and generic translator placeholders. */
export function describeIntlInferenceDetails(descriptor: IntlLanguageDescriptor): string[] {
	const result: string[] = [];
	for (const binding of descriptor.bindings) {
		const formatter = isRecord(binding.formatter) ? binding.formatter : undefined;
		if (!formatter || typeof formatter.kind !== 'string') continue;
		const fields = Object.entries(formatter)
			.filter(([key, value]) => key !== 'kind' && value !== undefined && !isRecord(value))
			.map(([key, value]) => `${key}=${String(value)}`);
		result.push(
			`${String(binding.name ?? formatter.kind)} uses ${formatter.kind}${fields.length ? ` (${fields.join(', ')})` : ''}`
		);
	}
	const projection = projectIntlTranslationContract(
		descriptor.bindings as unknown as readonly IntlBindingDescriptorV1[],
		descriptor.source as unknown as IntlPatternV1
	);
	if (projection.placeholders.length)
		result.push(
			`Placeholders: ${projection.placeholders.map((placeholder) => `${placeholder.id} ${placeholder.name} (${placeholder.role})`).join(', ')}`
		);
	return result;
}

/** Returns finite values appropriate for one active intl enhancement attribute. */
export function intlCompletionValues(
	attribute: string,
	before: string
): readonly IntlCompletionValue[] {
	const semanticUnits: readonly IntlCompletionValue[] = [
		['distance-road', 'Road-distance unit inferred for the active locale'],
		['height-person', 'Person-height unit inferred for the active locale'],
		['temperature-weather', 'Weather-temperature unit inferred for the active locale'],
		['area-land', 'Land-area unit inferred for the active locale'],
		['mass-person', 'Person-mass unit inferred for the active locale'],
		['volume-liquid', 'Liquid-volume unit inferred for the active locale'],
		['speed-road', 'Road-speed unit inferred for the active locale'],
		['pressure-weather', 'Weather-pressure unit inferred for the active locale'],
		['energy-food', 'Food-energy unit inferred for the active locale'],
		['power-engine', 'Engine-power unit inferred for the active locale'],
		['fuel-economy-road', 'Road fuel-economy unit inferred for the active locale'],
		['digital-storage', 'Digital-storage unit inferred for the active locale']
	].map(([label, detail]) => ({ label: label!, detail: detail! }));
	if (attribute === 'unit') return semanticUnits;
	if (attribute === 'source-unit' || attribute === 'convert-to')
		return intlUnitIdentifiers.map((label) => ({ label, detail: 'Supported measurement unit' }));
	if (attribute === 'currency')
		return intl
			.supportedValuesOf('currency')
			.map((label) => ({ label, detail: 'ISO 4217 currency supported by Intl' }));
	if (attribute === 'display')
		return ['symbol', 'narrowSymbol', 'code', 'name'].map((label) => ({
			label,
			detail: 'Currency or unit display style'
		}));
	if (/intl:(?:aria-label|placeholder|title)\s*=/u.test(before))
		return ['display-name:languageCode', 'display-name:regionCode', 'display-name:currency'].map(
			(label) => ({ label, detail: 'Semantic formatter role for this translated property' })
		);
	return [];
}

/** Determines whether one descriptor contains linguistic source text. */
export function intlDescriptorRequiresTranslation(descriptor: IntlLanguageDescriptor): boolean {
	const visit = (pattern: readonly Readonly<Record<string, unknown>>[]): boolean =>
		pattern.some((operation) => {
			if (operation.kind === 'text')
				return typeof operation.value === 'string' && operation.value.trim().length > 0;
			if (Array.isArray(operation.value) && visit(asPattern(operation.value))) return true;
			if (Array.isArray(operation.fallback) && visit(asPattern(operation.fallback))) return true;
			return (
				Array.isArray(operation.cases) &&
				operation.cases.some(
					(item) => isRecord(item) && Array.isArray(item.value) && visit(asPattern(item.value))
				)
			);
		});
	return visit(descriptor.source);
}

/** Presents catalog coverage without treating formatter-only descriptors as untranslated text. */
export function describeIntlCoverage(
	descriptor: IntlLanguageDescriptor,
	locales: readonly string[],
	missing: readonly string[]
): Readonly<{ label: string; tooltip: string }> {
	if (!intlDescriptorRequiresTranslation(descriptor))
		return {
			label: 'formatter-only',
			tooltip:
				'This formatter-only descriptor uses locale data and requires no catalog translation.'
		};
	return {
		label: `${locales.length} locale${locales.length === 1 ? '' : 's'}`,
		tooltip: [
			locales.length
				? `Translated into ${locales.join(', ')}.`
				: 'No matching translations were found.',
			...(missing.length ? [`Missing required locales: ${missing.join(', ')}.`] : [])
		].join(' ')
	};
}

/** Finds literal native formatter locales that contradict the source locale inside intl regions. */
export function intlLiteralLocaleDiagnostics(
	source: string,
	native: IntlNativeLanguageAnalysis,
	sourceLocale: string
): IntlLocaleDiagnostic[] {
	const diagnostics: IntlLocaleDiagnostic[] = [];
	const pattern =
		/(?:new\s+Intl\.[A-Za-z]+|Intl\.[A-Za-z]+|\.toLocale(?:String|DateString|TimeString))\s*\(\s*(['"])([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)\1/gu;
	for (const match of source.matchAll(pattern)) {
		const locale = match[2]!;
		const offset = match.index! + match[0].lastIndexOf(locale);
		if (
			!native.regions.some(
				(region) =>
					offset >= region.element.start && offset <= region.element.start + region.element.length
			)
		)
			continue;
		let canonical: string;
		try {
			canonical = intl.getCanonicalLocales(locale)[0] ?? locale;
		} catch {
			continue;
		}
		if (intlLocalesAgree(canonical, sourceLocale)) continue;
		diagnostics.push({
			code: 'locale-contradicts-source',
			severity: 'warning',
			range: { start: offset, end: offset + locale.length },
			summary: `Literal locale ${canonical} contradicts source locale ${sourceLocale}.`,
			explanation:
				'Omit the locale to use the active localization context, or use the configured source locale in authored fallback code.'
		});
	}
	return diagnostics;
}

/** Canonicalizes a locale for coverage comparison while retaining invalid input for diagnostics. */
export function canonicalIntlLocale(locale: string): string {
	try {
		return intl.getCanonicalLocales(locale)[0] ?? locale;
	} catch {
		return locale;
	}
}

/** Compares locale identifiers after native canonicalization. */
export function intlLocalesAgree(left: string, right: string): boolean {
	return canonicalIntlLocale(left) === canonicalIntlLocale(right);
}

function visitPattern(
	pattern: readonly Readonly<Record<string, unknown>>[],
	result: Set<string>
): void {
	for (const operation of pattern) {
		if (operation.kind === 'select' && typeof operation.selection === 'string')
			result.add(operation.selection.replaceAll('-', ' '));
		if (
			operation.kind === 'format' &&
			isRecord(operation.formatter) &&
			typeof operation.formatter.kind === 'string'
		)
			result.add(operation.formatter.kind.replaceAll('-', ' '));
		if (Array.isArray(operation.value)) visitPattern(asPattern(operation.value), result);
		if (Array.isArray(operation.fallback)) visitPattern(asPattern(operation.fallback), result);
		if (Array.isArray(operation.cases))
			for (const item of operation.cases)
				if (isRecord(item) && Array.isArray(item.value))
					visitPattern(asPattern(item.value), result);
	}
}

function asPattern(value: unknown[]): readonly Readonly<Record<string, unknown>>[] {
	return value as Readonly<Record<string, unknown>>[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
