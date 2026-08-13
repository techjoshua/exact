import { intlUnitIdentifiers } from '@exactjs/intl/internal';
import { intl } from '@exactjs/core';
import {
	sourceLanguageInference,
	type SourceOrdinalWrapper
} from './source-language-inferences.js';

const profiledUnitDisplays = ['long', 'short', 'narrow'] as const;
const baselineOperands = [0, 1, 2, 3, 5, 10, 11, 21, 22, 100, 1.5] as const;
const profileCache = new Map<string, SourceLocaleProfile>();

/** Locale evidence supplied by one localized currency label. */
export interface SourceCurrencyLabel {
	readonly currency: string;
	readonly display: 'symbol' | 'name';
}

/** Bounded native-Intl vocabulary consumed by one native source-analysis request. */
export interface SourceLocaleProfile {
	readonly unitLabels: Readonly<Record<string, string>>;
	readonly currencyLabels: Readonly<Record<string, SourceCurrencyLabel>>;
	readonly defaultCurrencyLabels: readonly string[];
	readonly ordinalMarkers: readonly string[];
	readonly ordinalWrappers: readonly SourceOrdinalWrapper[];
}

/**
 * Builds the source-language vocabulary needed by native semantic analysis. JavaScript owns this
 * boundary because its `Intl` implementation is also used by application builds and previews.
 */
export function sourceLocaleProfile(sourceLocale: string): SourceLocaleProfile {
	const locale = intl.Locale(sourceLocale).toString();
	const cached = profileCache.get(locale);
	if (cached) return cached;

	const operands = pluralOperands(locale);
	const languageInference = sourceLanguageInference(locale);
	const result = Object.freeze({
		unitLabels: mergeRecords(collectUnitLabels(locale, operands), languageInference.unitLabels),
		currencyLabels: mergeRecords(
			collectCurrencyLabels(locale, operands),
			languageInference.currencyLabels
		),
		defaultCurrencyLabels: Object.freeze([...(languageInference.defaultCurrencyLabels ?? [])]),
		ordinalMarkers: Object.freeze([...(languageInference.ordinalMarkers ?? [])]),
		ordinalWrappers: Object.freeze([...(languageInference.ordinalWrappers ?? [])])
	});
	profileCache.set(locale, result);
	return result;
}

function mergeRecords<Value>(
	generated: Readonly<Record<string, Value>>,
	supplement: Readonly<Record<string, Value>> | undefined
): Readonly<Record<string, Value>> {
	return Object.freeze({ ...(supplement ?? {}), ...generated });
}

function pluralOperands(locale: string): readonly number[] {
	const rules = intl.PluralRules(locale);
	const missing = new Set(rules.resolvedOptions().pluralCategories);
	const operands = new Set<number>(baselineOperands);
	const candidates = [
		...Array.from({ length: 201 }, (_, value) => value),
		...Array.from({ length: 101 }, (_, value) => value + 0.1),
		...Array.from({ length: 101 }, (_, value) => value + 0.5)
	];
	for (const value of candidates) {
		if (!missing.delete(rules.select(value))) continue;
		operands.add(value);
		if (missing.size === 0) break;
	}
	return [...operands];
}

function collectUnitLabels(
	locale: string,
	operands: readonly number[]
): Readonly<Record<string, string>> {
	const labels = new Map<string, string>();
	const ambiguous = new Set<string>();
	for (const unit of intlUnitIdentifiers) {
		for (const unitDisplay of profiledUnitDisplays) {
			let formatter: Intl.NumberFormat;
			try {
				formatter = intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay });
			} catch (error) {
				if (error instanceof RangeError) continue;
				throw error;
			}
			for (const value of operands) collectParts(formatter, value, 'unit', unit, labels, ambiguous);
		}
	}
	return Object.freeze(Object.fromEntries(labels));
}

function collectCurrencyLabels(
	locale: string,
	operands: readonly number[]
): Readonly<Record<string, SourceCurrencyLabel>> {
	const labels = new Map<string, SourceCurrencyLabel>();
	const ambiguous = new Set<string>();
	for (const currency of intl.supportedValuesOf('currency')) {
		for (const display of ['symbol', 'name'] as const) {
			const formatter = intl.NumberFormat(locale, {
				style: 'currency',
				currency,
				currencyDisplay: display
			});
			for (const value of operands) {
				for (const part of formatter.formatToParts(value)) {
					if (part.type !== 'currency') continue;
					const label = normalizeLabel(part.value);
					// ISO codes already have stronger syntax-level evidence and mean code display.
					if (!label || label === currency.toLowerCase() || ambiguous.has(label)) continue;
					const evidence = Object.freeze({ currency, display });
					const previous = labels.get(label);
					if (
						previous &&
						(previous.currency !== evidence.currency || previous.display !== evidence.display)
					) {
						labels.delete(label);
						ambiguous.add(label);
					} else labels.set(label, evidence);
				}
			}
		}
	}
	return Object.freeze(Object.fromEntries(labels));
}

function collectParts(
	formatter: Intl.NumberFormat,
	value: number,
	partType: Intl.NumberFormatPartTypes,
	evidence: string,
	labels: Map<string, string>,
	ambiguous: Set<string>
): void {
	for (const part of formatter.formatToParts(value)) {
		if (part.type !== partType) continue;
		const label = normalizeUnitLabel(part.value);
		if (!label || ambiguous.has(label)) continue;
		const previous = labels.get(label);
		if (previous && previous !== evidence) {
			labels.delete(label);
			ambiguous.add(label);
		} else labels.set(label, evidence);
	}
}

function normalizeUnitLabel(value: string): string {
	return value.normalize('NFKC').trim();
}

function normalizeLabel(value: string): string {
	return value.normalize('NFKC').trim().toLowerCase();
}
