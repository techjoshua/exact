import type { IntlFiniteOptionsV1 } from './contracts.js';
import type { IntlEnvironment } from './environment.js';
import { listFormatter, numberFormatter } from './formatter-cache.js';
import { convertIntlUnit, intlUnitDefinitions, type IntlUnitName } from './unit-definitions.js';
import { resolveCldrUnitPreference } from './unit-preferences.js';

/** Number-format options that cannot replace the semantic unit selected by intl. */
export type IntlMeasurementNumberOptions = Omit<Intl.NumberFormatOptions, 'style' | 'unit'>;

/** Public request for one locale-aware semantic measurement presentation. */
export interface IntlMeasurementPresentationRequest {
	readonly quantity: string;
	readonly usage: string;
	readonly sourceUnit: IntlUnitName;
	/** `auto` and omission use application policy followed by CLDR preferences. */
	readonly convertTo?: 'auto' | IntlUnitName;
	/** Axis-like consumers can require one numeric destination for geometry. */
	readonly unitComposition?: 'mixed' | 'single';
	readonly precision?: 'source';
	readonly options?: IntlMeasurementNumberOptions;
	/** Representative values used for CLDR magnitude thresholds and source precision. */
	readonly values: readonly number[];
}

/** Intl-owned immutable decision used to convert and format related measurement values. */
export interface IntlMeasurementPresentation {
	readonly locale: string;
	readonly quantity: string;
	readonly usage: string;
	readonly sourceUnit: IntlUnitName;
	readonly destinationUnits: readonly IntlUnitName[];
	readonly unitComposition: 'mixed' | 'single';
	readonly precision?: 'source';
	readonly options: IntlMeasurementNumberOptions;
}

interface MeasurementPresentationOwner {
	readonly environment: IntlEnvironment;
	readonly generation: number;
}

const presentationEnvironments = new WeakMap<
	IntlMeasurementPresentation,
	MeasurementPresentationOwner
>();

/** Resolves application policy and CLDR preferences once for a related set of values. */
export function resolveIntlMeasurementPresentation(
	environment: IntlEnvironment,
	request: IntlMeasurementPresentationRequest
): IntlMeasurementPresentation {
	validateMeasurementRequest(request);
	const preference =
		request.convertTo && request.convertTo !== 'auto'
			? request.convertTo
			: (environment.unitPreferences[
					`${request.quantity}/${request.usage}` as keyof typeof environment.unitPreferences
				] ??
				resolveCldrUnitPreference(
					environment.state.locale,
					request.quantity,
					request.usage,
					request.values,
					request.sourceUnit
				));
	const preferred = Array.isArray(preference) ? preference : [preference ?? request.sourceUnit];
	const composition = request.unitComposition ?? 'mixed';
	const destinations = Object.freeze(
		(composition === 'single' ? preferred.slice(0, 1) : preferred).map((unit) =>
			assertCompatibleUnit(request.sourceUnit, assertUnitName(unit))
		)
	);
	const presentation = Object.freeze({
		locale: environment.state.locale,
		quantity: request.quantity,
		usage: request.usage,
		sourceUnit: request.sourceUnit,
		destinationUnits: destinations,
		unitComposition: composition,
		...(request.precision ? { precision: request.precision } : {}),
		options: Object.freeze({ ...(request.options ?? {}) })
	});
	presentationEnvironments.set(presentation, {
		environment,
		generation: environment.state.generation
	});
	return presentation;
}

/** Converts one source value through a scalar measurement presentation. @exact pure */
export function convertIntlMeasurementValue(
	presentation: IntlMeasurementPresentation,
	value: number
): number {
	if (presentation.destinationUnits.length !== 1)
		throw new TypeError('A mixed-unit intl presentation does not have one numeric value');
	return convertIntlUnit(value, presentation.sourceUnit, presentation.destinationUnits[0]!);
}

/** Converts one scalar destination value back to its declared source unit. @exact pure */
export function restoreIntlMeasurementValue(
	presentation: IntlMeasurementPresentation,
	value: number
): number {
	if (presentation.destinationUnits.length !== 1)
		throw new TypeError('A mixed-unit intl presentation does not have one numeric value');
	return convertIntlUnit(value, presentation.destinationUnits[0]!, presentation.sourceUnit);
}

/** Formats one source value with the destination and locale fixed by the presentation. */
export function formatIntlMeasurementValue(
	presentation: IntlMeasurementPresentation,
	value: number
): string {
	return formatIntlMeasurementValues(presentation, [value]);
}

/** Formats a source range with one destination-unit decision. */
export function formatIntlMeasurementRange(
	presentation: IntlMeasurementPresentation,
	start: number,
	end: number
): string {
	return formatIntlMeasurementValues(presentation, [start, end]);
}

/** Internal bridge used by existing compiler-prepared unit formatters. */
export function formatPreparedIntlMeasurement(
	environment: IntlEnvironment,
	formatter: Readonly<{
		quantity: string;
		usage: string;
		sourceUnit: string;
		convertTo?: string;
		precision?: 'source';
		options: IntlFiniteOptionsV1;
	}>,
	values: readonly unknown[]
): string {
	const sourceUnit = assertUnitName(formatter.sourceUnit);
	const convertTo = formatter.convertTo && assertUnitName(formatter.convertTo);
	const numeric = values.map(Number);
	const presentation = resolveIntlMeasurementPresentation(environment, {
		quantity: formatter.quantity,
		usage: formatter.usage,
		sourceUnit,
		...(convertTo ? { convertTo } : {}),
		...(formatter.precision ? { precision: formatter.precision } : {}),
		options: formatter.options as IntlMeasurementNumberOptions,
		values: numeric
	});
	return formatIntlMeasurementValues(presentation, numeric);
}

function formatIntlMeasurementValues(
	presentation: IntlMeasurementPresentation,
	values: readonly number[]
): string {
	if (values.length < 1 || values.length > 2)
		throw new TypeError('Intl measurement formatting requires one value or one range');
	for (const value of values)
		if (!Number.isFinite(value)) throw new TypeError('Intl measurement values must be finite');
	const environment = requirePresentationEnvironment(presentation);
	const destinations = presentation.destinationUnits;
	const options = sourcePrecisionOptions(presentation, values);
	if (destinations.length > 1) {
		if (values.length !== 1)
			throw new TypeError('Mixed-unit intl formatting requires one source value');
		return formatMixedUnit(values[0]!, presentation.sourceUnit, destinations, environment, options);
	}
	const destination = destinations[0] ?? presentation.sourceUnit;
	const converted = values.map((value) =>
		convertIntlUnit(value, presentation.sourceUnit, destination)
	);
	const unit = nativeUnitFormatter(environment, destination, options);
	if (converted.length < 2)
		return (
			unit?.format(converted[0]!) ??
			formatUnitSymbol(converted[0]!, destination, environment, options)
		);
	if (!unit)
		return `${numberFormatter(environment, options).format(converted[0]!)}–${formatUnitSymbol(converted[1]!, destination, environment, options)}`;
	const nativeRange = (
		unit as Intl.NumberFormat & { formatRange?: (start: number, end: number) => string }
	).formatRange;
	if (nativeRange) return nativeRange.call(unit, converted[0]!, converted[1]!);
	const number = numberFormatter(environment, options);
	return `${number.format(converted[0]!)}–${unit.format(converted[1]!)}`;
}

function sourcePrecisionOptions(
	presentation: IntlMeasurementPresentation,
	values: readonly number[]
): Intl.NumberFormatOptions {
	const options = presentation.options;
	if (
		presentation.precision !== 'source' ||
		options.maximumFractionDigits !== undefined ||
		options.maximumSignificantDigits !== undefined
	)
		return options;
	const sourceFractionDigits = Math.max(0, ...values.map(visibleFractionDigits));
	const nonzeroFractionDigits =
		presentation.destinationUnits.length === 1
			? Math.max(
					0,
					...values.map((value) =>
						minimumNonzeroFractionDigits(
							convertIntlUnit(value, presentation.sourceUnit, presentation.destinationUnits[0]!),
							sourceFractionDigits
						)
					)
				)
			: 0;
	return {
		...options,
		maximumFractionDigits: Math.max(sourceFractionDigits, nonzeroFractionDigits)
	};
}

function minimumNonzeroFractionDigits(value: number, baselineFractionDigits: number): number {
	const magnitude = Math.abs(value);
	if (!Number.isFinite(magnitude) || magnitude === 0 || magnitude >= 1) return 0;
	const baselineScale = 10 ** baselineFractionDigits;
	if (Math.round(magnitude * baselineScale) / baselineScale !== 0) return 0;
	return Math.min(20, Math.max(0, Math.ceil(-Math.log10(magnitude))));
}

function visibleFractionDigits(value: number): number {
	if (!Number.isFinite(value)) return 0;
	const [coefficient, exponentText] = String(value).toLowerCase().split('e');
	const fraction = coefficient?.split('.')[1]?.length ?? 0;
	const exponent = exponentText === undefined ? 0 : Number(exponentText);
	return Math.max(0, Math.min(20, fraction - exponent));
}

function formatMixedUnit(
	value: number,
	source: string,
	destinations: readonly string[],
	environment: IntlEnvironment,
	options: Intl.NumberFormatOptions
): string {
	if (destinations.length !== 2)
		throw new TypeError('Protocol-1 mixed-unit formatting supports exactly two destination units');
	const first = convertIntlUnit(value, source, destinations[0]!);
	const firstPart = first < 0 ? Math.ceil(first) : Math.floor(first);
	const firstInSecond = convertIntlUnit(firstPart, destinations[0]!, destinations[1]!);
	const secondPart = convertIntlUnit(value, source, destinations[1]!) - firstInSecond;
	const unitDisplay = options.unitDisplay ?? 'short';
	const parts = [destinations[0]!, destinations[1]!].map((unit, index) => {
		const part = index === 0 ? firstPart : secondPart;
		const formatter = nativeUnitFormatter(environment, unit, { ...options, unitDisplay });
		return formatter?.format(part) ?? formatUnitSymbol(part, unit, environment, options);
	});
	return listFormatter(environment, {
		type: 'unit',
		style: unitDisplay === 'long' ? 'long' : 'short'
	}).format(parts);
}

function nativeUnitFormatter(
	environment: IntlEnvironment,
	unit: string,
	options: Intl.NumberFormatOptions
): Intl.NumberFormat | undefined {
	try {
		return numberFormatter(environment, { ...options, style: 'unit', unit });
	} catch (error) {
		if (error instanceof RangeError) return undefined;
		throw error;
	}
}

function formatUnitSymbol(
	value: number,
	unit: string,
	environment: IntlEnvironment,
	options: Intl.NumberFormatOptions
): string {
	const symbol = intlUnitDefinitions[unit]?.symbol;
	if (!symbol) throw new TypeError(`Unsupported intl unit ${unit}`);
	const proxy = numberFormatter(environment, {
		...options,
		style: 'unit',
		unit: 'meter',
		unitDisplay: 'short'
	});
	return proxy
		.formatToParts(value)
		.map((part) => (part.type === 'unit' ? symbol : part.value))
		.join('');
}

function requirePresentationEnvironment(
	presentation: IntlMeasurementPresentation
): IntlEnvironment {
	const owner = presentationEnvironments.get(presentation);
	if (!owner) throw new TypeError('Intl measurement presentation was not created by intl');
	if (owner.generation !== owner.environment.state.generation)
		throw new TypeError(
			'Intl measurement presentation must be resolved again after an intl update'
		);
	return owner.environment;
}

function assertUnitName(value: string): IntlUnitName {
	if (!intlUnitDefinitions[value]) throw new TypeError(`Unsupported intl unit ${value}`);
	return value as IntlUnitName;
}

function assertCompatibleUnit(source: IntlUnitName, destination: IntlUnitName): IntlUnitName {
	if (intlUnitDefinitions[source].dimension !== intlUnitDefinitions[destination].dimension)
		throw new TypeError(`Unsupported intl unit conversion from ${source} to ${destination}`);
	return destination;
}

function validateMeasurementRequest(request: IntlMeasurementPresentationRequest): void {
	if (!request.quantity.trim()) throw new TypeError('Intl measurement quantity is required');
	if (!request.usage.trim()) throw new TypeError('Intl measurement usage is required');
	const source = intlUnitDefinitions[request.sourceUnit];
	if (!source) throw new TypeError(`Unsupported intl unit ${request.sourceUnit}`);
	if (request.convertTo && request.convertTo !== 'auto') {
		const destination = intlUnitDefinitions[request.convertTo];
		if (!destination || destination.dimension !== source.dimension)
			throw new TypeError(
				`Unsupported intl unit conversion from ${request.sourceUnit} to ${request.convertTo}`
			);
	}
	if (!request.values.length)
		throw new TypeError('Intl measurement presentation requires representative values');
	for (const value of request.values)
		if (!Number.isFinite(value)) throw new TypeError('Intl measurement values must be finite');
}
