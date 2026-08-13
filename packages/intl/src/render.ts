import type { Child } from '@exactjs/core';
import type { IntlFiniteOptionsV1, IntlFormatterV1, IntlPatternV1 } from './contracts.js';
import type { IntlEnvironment } from './environment.js';
import {
	dateTimeFormatter,
	displayNamesFormatter,
	durationFormatter,
	listFormatter,
	numberFormatter,
	pluralRulesFormatter,
	relativeTimeFormatter
} from './formatter-cache.js';
import { resolveIntlBinding, type PreparedIntlActivation } from './prepared.js';
import { convertIntlUnit, intlUnitDefinitions } from './unit-definitions.js';
import { resolveCldrUnitPreference } from './unit-preferences.js';

/** Renders a prepared source message or its current validated translation. */
export function renderIntlActivation(
	activation: PreparedIntlActivation,
	environment: IntlEnvironment
): Child[] {
	const { descriptor } = activation;
	const pattern =
		environment.find(descriptor.owner, descriptor.key, descriptor) ?? descriptor.source;
	const usedStructures = new Set<number>();
	const output = renderPattern(pattern, activation, environment, usedStructures);
	for (const binding of descriptor.bindings)
		if (
			(binding.kind === 'element' || binding.kind === 'opaque') &&
			!usedStructures.has(binding.index)
		)
			throw new TypeError(`Intl pattern omitted required structural binding ${binding.index}`);
	return output;
}

function renderPattern(
	pattern: IntlPatternV1,
	activation: PreparedIntlActivation,
	environment: IntlEnvironment,
	usedStructures: Set<number>
): Child[] {
	const children: Child[] = [];
	for (const node of pattern) {
		switch (node.kind) {
			case 'text':
				children.push(node.value);
				break;
			case 'value':
				children.push(asChild(resolveIntlBinding(activation, node.binding)));
				break;
			case 'format':
				children.push(
					formatValue(
						node.formatter,
						node.bindings.map((binding) => resolveIntlBinding(activation, binding)),
						environment,
						activation
					)
				);
				break;
			case 'select': {
				const value = resolveIntlBinding(activation, node.binding);
				const rangeValue =
					node.rangeBinding === undefined
						? undefined
						: resolveIntlBinding(activation, node.rangeBinding);
				const exact =
					node.selection === 'plural-cardinal' || node.selection === 'plural-ordinal'
						? node.cases.find((candidate) => candidate.key === `=${String(value)}`)?.value
						: undefined;
				const key = selectionKey(node.selection, value, rangeValue, environment);
				const selected =
					exact ?? node.cases.find((candidate) => candidate.key === key)?.value ?? node.fallback;
				children.push(...renderPattern(selected, activation, environment, usedStructures));
				break;
			}
			case 'element': {
				markStructureUsed(node.binding, usedStructures);
				const factory = resolveIntlBinding(activation, node.binding);
				if (typeof factory !== 'function')
					throw new TypeError('Intl element binding is not callable');
				children.push(
					factory(
						renderPattern(node.value, activation, environment, usedStructures),
						activation.values
					)
				);
				break;
			}
			case 'opaque': {
				markStructureUsed(node.binding, usedStructures);
				const factory = resolveIntlBinding(activation, node.binding);
				if (typeof factory !== 'function')
					throw new TypeError('Intl opaque binding is not callable');
				children.push(factory(activation.values));
				break;
			}
		}
	}
	return children;
}

function selectionKey(
	selection: string,
	value: unknown,
	rangeValue: unknown,
	environment: IntlEnvironment
): string {
	if (selection === 'boolean') return String(Boolean(value));
	if (selection === 'exact') return String(value);
	if (typeof value !== 'number') throw new TypeError('Intl plural selectors require a number');
	const rules = pluralRulesFormatter(
		environment,
		selection === 'plural-ordinal' || selection === 'plural-range-ordinal' ? 'ordinal' : 'cardinal'
	);
	if (selection !== 'plural-range-cardinal' && selection !== 'plural-range-ordinal')
		return rules.select(value);
	if (typeof rangeValue !== 'number')
		throw new TypeError('Intl plural-range selectors require two numbers');
	const selectRange = (
		rules as Intl.PluralRules & {
			selectRange?: (start: number, end: number) => string;
		}
	).selectRange;
	if (!selectRange) throw new TypeError('Intl.PluralRules.selectRange() is unavailable');
	return selectRange.call(rules, value, rangeValue);
}

function formatValue(
	formatter: IntlFormatterV1,
	values: readonly unknown[],
	environment: IntlEnvironment,
	activation: PreparedIntlActivation
): Child {
	const first = values[0];
	switch (formatter.kind) {
		case 'number':
			return numberFormatter(environment, nativeOptions(formatter.options)).format(first as number);
		case 'currency':
			return numberFormatter(environment, {
				...nativeOptions(formatter.options),
				style: 'currency',
				currency: formatter.currency,
				currencyDisplay: formatter.display
			}).format(first as number);
		case 'unit':
			return formatUnitRange(formatter, values, environment);
		case 'date-time':
			if (formatter.range) {
				return dateTimeFormatter(environment, nativeOptions(formatter.options)).formatRange(
					first as Date,
					values[1] as Date
				);
			}
			return dateTimeFormatter(environment, nativeOptions(formatter.options)).format(first as Date);
		case 'relative-time': {
			const unit = resolveIntlBinding(activation, formatter.unitBinding);
			return relativeTimeFormatter(environment, nativeOptions(formatter.options)).format(
				Number(first),
				String(unit) as Intl.RelativeTimeFormatUnit
			);
		}
		case 'relative-duration': {
			if (typeof first !== 'object' || first === null) return formatter.zero;
			for (const field of formatter.fields) {
				const value = Number((first as Record<string, unknown>)[field]);
				if (!Number.isFinite(value) || Math.abs(value) === 0) continue;
				return relativeTimeFormatter(environment, nativeOptions(formatter.options)).format(
					-Math.abs(value),
					field.slice(0, -1) as Intl.RelativeTimeFormatUnit
				);
			}
			return formatter.zero;
		}
		case 'display-name':
			return displayNamesFormatter(environment, {
				...nativeOptions(formatter.options),
				type: formatter.domain as Intl.DisplayNamesType
			}).of(String(first));
		case 'list':
			return listFormatter(environment, nativeOptions(formatter.options)).format(
				(Array.isArray(first) ? first : values).map(String)
			);
		case 'duration': {
			const duration = durationFormatter(environment, nativeOptions(formatter.options));
			return duration?.format(first) ?? String(first);
		}
	}
}

function formatUnitRange(
	formatter: Extract<IntlFormatterV1, { kind: 'unit' }>,
	values: readonly unknown[],
	environment: IntlEnvironment
): string {
	const preference =
		formatter.convertTo ??
		environment.unitPreferences[
			`${formatter.quantity}/${formatter.usage}` as keyof typeof environment.unitPreferences
		] ??
		resolveCldrUnitPreference(
			environment.state.locale,
			formatter.quantity,
			formatter.usage,
			values.map(Number),
			formatter.sourceUnit
		);
	const destinations = Array.isArray(preference)
		? preference
		: [preference ?? formatter.sourceUnit];
	const options = sourcePrecisionOptions(formatter, values, destinations);
	if (destinations.length > 1) {
		if (values.length !== 1)
			throw new TypeError('Mixed-unit intl formatting requires one source value');
		return formatMixedUnit(
			Number(values[0]),
			formatter.sourceUnit,
			destinations,
			environment,
			options
		);
	}
	const destination = destinations[0] ?? formatter.sourceUnit;
	const converted = values.map((value) =>
		convertIntlUnit(Number(value), formatter.sourceUnit, destination)
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
	formatter: Extract<IntlFormatterV1, { kind: 'unit' }>,
	values: readonly unknown[],
	destinations: readonly string[]
): Record<string, unknown> {
	const options = nativeOptions(formatter.options);
	if (
		(formatter.precision !== undefined && formatter.precision !== 'source') ||
		options.maximumFractionDigits !== undefined ||
		options.maximumSignificantDigits !== undefined
	)
		return options;
	const sourceFractionDigits = Math.max(0, ...values.map(visibleFractionDigits));
	const nonzeroFractionDigits =
		destinations.length === 1
			? Math.max(
					0,
					...values.map((value) =>
						minimumNonzeroFractionDigits(
							convertIntlUnit(Number(value), formatter.sourceUnit, destinations[0]!),
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

/** Adds precision only when baseline rounding would erase a finite nonzero converted value. */
function minimumNonzeroFractionDigits(value: number, baselineFractionDigits: number): number {
	const magnitude = Math.abs(value);
	if (!Number.isFinite(magnitude) || magnitude === 0 || magnitude >= 1) return 0;
	const baselineScale = 10 ** baselineFractionDigits;
	if (Math.round(magnitude * baselineScale) / baselineScale !== 0) return 0;
	return Math.min(20, Math.max(0, Math.ceil(-Math.log10(magnitude))));
}

function visibleFractionDigits(value: unknown): number {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return 0;
	const [coefficient, exponentText] = String(numeric).toLowerCase().split('e');
	const fraction = coefficient?.split('.')[1]?.length ?? 0;
	const exponent = exponentText === undefined ? 0 : Number(exponentText);
	return Math.max(0, Math.min(20, fraction - exponent));
}

function formatMixedUnit(
	value: number,
	source: string,
	destinations: readonly string[],
	environment: IntlEnvironment,
	options: Record<string, unknown>
): string {
	if (destinations.length !== 2)
		throw new TypeError('Protocol-1 mixed-unit formatting supports exactly two destination units');
	const first = convertIntlUnit(value, source, destinations[0]!);
	const firstPart = first < 0 ? Math.ceil(first) : Math.floor(first);
	const firstInSecond = convertIntlUnit(firstPart, destinations[0]!, destinations[1]!);
	const secondPart = convertIntlUnit(value, source, destinations[1]!) - firstInSecond;
	const unitDisplay = String(options.unitDisplay ?? 'short') as 'long' | 'short' | 'narrow';
	const numberOptions = options;
	const parts = [destinations[0]!, destinations[1]!].map((unit, index) => {
		const part = index === 0 ? firstPart : secondPart;
		const formatter = nativeUnitFormatter(environment, unit, { ...numberOptions, unitDisplay });
		return formatter?.format(part) ?? formatUnitSymbol(part, unit, environment, numberOptions);
	});
	return listFormatter(environment, {
		type: 'unit',
		style: unitDisplay === 'long' ? 'long' : 'short'
	}).format(parts);
}

function nativeUnitFormatter(
	environment: IntlEnvironment,
	unit: string,
	options: Record<string, unknown>
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
	options: Record<string, unknown>
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

function nativeOptions(options: IntlFiniteOptionsV1): Record<string, unknown> {
	return options as Record<string, unknown>;
}

function asChild(value: unknown): Child {
	return value as Child;
}

function markStructureUsed(binding: number, used: Set<number>): void {
	if (used.has(binding))
		throw new TypeError(`Intl pattern duplicated structural binding ${binding}`);
	used.add(binding);
}
