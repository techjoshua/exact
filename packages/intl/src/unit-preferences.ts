import { intl } from '@exactjs/core';
import { cldrUnitPreferenceData, cldrUnitSystems, intlCldrVersion } from './cldr-unit-data.js';
import { convertIntlUnit, intlUnitDefinitions } from './unit-definitions.js';

interface CldrUnitPreference {
	readonly unit: string;
	readonly geq?: number;
}

type CldrRegionPreferences = Readonly<Record<string, readonly CldrUnitPreference[]>>;
type CldrPreferenceData = Readonly<Record<string, CldrRegionPreferences>>;

const preferenceData = cldrUnitPreferenceData as CldrPreferenceData;

const cldrUnitAliases: Readonly<Record<string, string>> = Object.freeze({
	foodcalorie: 'kilocalorie',
	'inch-ofhg': 'inch-of-mercury',
	'millimeter-ofhg': 'millimeter-of-mercury'
});

export { intlCldrVersion };

/**
 * Selects the CLDR-preferred destination for one semantic measurement.
 *
 * Region-specific data falls back to CLDR's world region. Thresholds are evaluated after converting
 * the largest absolute input endpoint to the candidate unit, so a range retains one display unit.
 * Unsupported CLDR units are skipped rather than weakening dimensional validation.
 */
export function resolveCldrUnitPreference(
	locale: string,
	quantity: string,
	usage: string,
	values: readonly number[],
	sourceUnit: string
): string | readonly string[] | undefined {
	const preferencesByRegion = preferenceData[`${quantity}/${usage}`];
	if (!preferencesByRegion) return undefined;
	const preferences =
		preferencesByRegion[preferenceRegion(locale, preferencesByRegion)] ??
		preferencesByRegion['001'];
	if (!preferences) return undefined;
	for (const preference of preferences) {
		const destination = supportedDestination(preference.unit);
		if (!destination) continue;
		if (
			preference.geq === undefined ||
			largestMagnitude(values, sourceUnit, firstUnit(destination)) >= preference.geq
		)
			return destination;
	}
	return undefined;
}

/** Applies CLDR region and measurement-system fallback ordering for one preference table. */
function preferenceRegion(locale: string, preferences: CldrRegionPreferences): string {
	const parsed = intl.Locale(locale);
	const region = unicodeRegionOverride(parsed) ?? parsed.maximize().region ?? '001';
	const measurementSystem = unicodeMeasurementSystem(parsed);
	if (!measurementSystem) return region;
	const regional = preferences[region] ?? preferences['001'] ?? [];
	if (regional.every((entry) => unitMatchesMeasurementSystem(entry.unit, measurementSystem)))
		return region;
	return measurementSystem === 'ussystem' ? 'US' : measurementSystem === 'uksystem' ? 'GB' : '001';
}

function unicodeMeasurementSystem(locale: Intl.Locale): string | undefined {
	return unicodeExtensionValue(locale, 'ms');
}

function unicodeRegionOverride(locale: Intl.Locale): string | undefined {
	const override = unicodeExtensionValue(locale, 'rg');
	const region = /^([a-z]{2}|[0-9]{3})zzzz$/iu.exec(override ?? '')?.[1];
	return region?.toUpperCase();
}

function unicodeExtensionValue(locale: Intl.Locale, key: string): string | undefined {
	const capable = locale as Intl.Locale & {
		getUnicodeExtensionValue?: (extensionKey: string) => string | undefined;
	};
	const native = capable.getUnicodeExtensionValue?.(key);
	if (native) return native;
	return new RegExp(`(?:^|-)${key}-([a-z0-9-]+?)(?=-[a-z0-9]{2}(?:-|$)|$)`, 'iu').exec(
		locale.toString()
	)?.[1];
}

/** Derives system compatibility for prefixed, dimensional, and compound CLDR unit identifiers. */
function unitMatchesMeasurementSystem(unit: string, requested: string): boolean {
	const systems = cldrUnitSystems[unit as keyof typeof cldrUnitSystems] as
		| readonly string[]
		| undefined;
	return systems?.includes(requested) ?? false;
}

function supportedDestination(unit: string): string | readonly string[] | undefined {
	const aliased = cldrUnitAliases[unit] ?? unit;
	if (intlUnitDefinitions[aliased]) return aliased;
	const parts = aliased.split('-and-').map((part) => cldrUnitAliases[part] ?? part);
	return parts.length === 2 && parts.every((part) => intlUnitDefinitions[part])
		? Object.freeze(parts)
		: undefined;
}

function firstUnit(destination: string | readonly string[]): string {
	return typeof destination === 'string' ? destination : destination[0]!;
}

function largestMagnitude(values: readonly number[], source: string, destination: string): number {
	return Math.max(
		0,
		...values.map((value) => Math.abs(convertIntlUnit(value, source, destination)))
	);
}
