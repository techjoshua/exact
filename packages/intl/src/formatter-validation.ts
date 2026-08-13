import type {
	IntlBindingDescriptorV1,
	IntlFiniteOptionsV1,
	IntlFiniteValueV1,
	IntlFormatterV1
} from './contracts.js';
import {
	requireBinding,
	requireBoundedString,
	requireExactKeys,
	requireRecord
} from './validation-primitives.js';
import { intlUnitDefinitions } from './unit-definitions.js';

const bindingTypes = new Set([
	'string',
	'number',
	'bigint',
	'boolean',
	'temporal-date',
	'temporal-time',
	'temporal-date-time',
	'temporal-instant',
	'temporal-zoned-date-time',
	'temporal-duration',
	'monetary',
	'measurement',
	'structure',
	'opaque-structure'
]);

const numberOptionNames = new Set([
	'useGrouping',
	'minimumIntegerDigits',
	'minimumFractionDigits',
	'maximumFractionDigits',
	'minimumSignificantDigits',
	'maximumSignificantDigits',
	'roundingIncrement',
	'roundingMode',
	'roundingPriority',
	'trailingZeroDisplay',
	'notation',
	'compactDisplay',
	'signDisplay',
	'numberingSystem',
	'unitDisplay'
]);
const dateTimeOptionNames = new Set([
	'dateStyle',
	'timeStyle',
	'calendar',
	'dayPeriod',
	'numberingSystem',
	'localeMatcher',
	'timeZone',
	'hour12',
	'hourCycle',
	'formatMatcher',
	'weekday',
	'era',
	'year',
	'month',
	'day',
	'dayPeriod',
	'hour',
	'minute',
	'second',
	'fractionalSecondDigits',
	'timeZoneName'
]);
const genericOptionNames = new Set([
	'style',
	'type',
	'numeric',
	'fallback',
	'languageDisplay',
	'dialectHandling',
	'length',
	'width'
]);

/** Internal domain operation that validate formatter without publishing an application API. */
export function validateFormatter(
	input: unknown,
	bindings: readonly IntlBindingDescriptorV1[],
	path: string
): IntlFormatterV1 {
	const formatter = requireRecord(input, `${path}.formatter`);
	if (typeof formatter.kind !== 'string') throw new TypeError(`${path}.formatter.kind is required`);
	const options = validateOptions(
		formatter.options,
		formatter.kind === 'date-time'
			? dateTimeOptionNames
			: formatter.kind === 'number' || formatter.kind === 'currency' || formatter.kind === 'unit'
				? numberOptionNames
				: genericOptionNames,
		`${path}.formatter.options`
	);
	switch (formatter.kind) {
		case 'number':
			requireExactKeys(formatter, ['kind', 'options']);
			return Object.freeze({ kind: 'number', options });
		case 'currency':
			requireExactKeys(formatter, ['kind', 'currency', 'display', 'options']);
			if (!/^[A-Z]{3}$/.test(String(formatter.currency)))
				throw new TypeError(`${path}.formatter.currency must be an ISO 4217 code`);
			if (!['symbol', 'narrowSymbol', 'code', 'name'].includes(String(formatter.display)))
				throw new TypeError(`${path}.formatter.display is unsupported`);
			return Object.freeze({
				kind: 'currency',
				currency: String(formatter.currency),
				display: formatter.display as 'symbol' | 'narrowSymbol' | 'code' | 'name',
				options
			});
		case 'date-time':
			requireExactKeys(formatter, ['kind', 'temporalKind', 'range', 'options'], ['range']);
			if (
				typeof formatter.temporalKind !== 'string' ||
				!bindingTypes.has(formatter.temporalKind) ||
				!formatter.temporalKind.startsWith('temporal-')
			)
				throw new TypeError(`${path}.formatter.temporalKind is unsupported`);
			if (formatter.range !== undefined && formatter.range !== true)
				throw new TypeError(`${path}.formatter.range must be true when present`);
			return Object.freeze({
				kind: 'date-time',
				temporalKind: formatter.temporalKind as IntlBindingDescriptorV1['type'],
				...(formatter.range === true ? { range: true as const } : {}),
				options
			});
		case 'unit':
			requireExactKeys(
				formatter,
				['kind', 'quantity', 'usage', 'sourceUnit', 'convertTo', 'precision', 'options'],
				['convertTo', 'precision']
			);
			const quantity = requireBoundedString(formatter.quantity, `${path}.formatter.quantity`);
			const sourceUnit = requireBoundedString(formatter.sourceUnit, `${path}.formatter.sourceUnit`);
			const convertTo =
				formatter.convertTo === undefined
					? undefined
					: requireBoundedString(formatter.convertTo, `${path}.formatter.convertTo`);
			if (formatter.precision !== undefined && formatter.precision !== 'source')
				throw new TypeError(`${path}.formatter.precision is unsupported`);
			validateUnitDimensions(quantity, sourceUnit, convertTo, path);
			return Object.freeze({
				kind: 'unit',
				quantity,
				usage: requireBoundedString(formatter.usage, `${path}.formatter.usage`),
				sourceUnit,
				...(convertTo ? { convertTo } : {}),
				...(formatter.precision === 'source' ? { precision: 'source' as const } : {}),
				options
			});
		case 'relative-time': {
			requireExactKeys(formatter, ['kind', 'unitBinding', 'options']);
			const unitBinding = requireBinding(
				formatter.unitBinding,
				bindings,
				`${path}.formatter.unitBinding`
			).index;
			return Object.freeze({ kind: 'relative-time', unitBinding, options });
		}
		case 'relative-duration': {
			requireExactKeys(formatter, ['kind', 'fields', 'zero', 'options']);
			if (!Array.isArray(formatter.fields) || formatter.fields.length === 0)
				throw new TypeError(`${path}.formatter.fields must be a non-empty array`);
			const allowed = new Set(['years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds']);
			const fields = formatter.fields.map((field, index) => {
				if (typeof field !== 'string' || !allowed.has(field))
					throw new TypeError(`${path}.formatter.fields[${index}] is unsupported`);
				return field as import('./contracts.js').IntlRelativeDurationField;
			});
			if (new Set(fields).size !== fields.length)
				throw new TypeError(`${path}.formatter.fields contains duplicates`);
			return Object.freeze({
				kind: 'relative-duration',
				fields: Object.freeze(fields),
				zero: requireBoundedString(formatter.zero, `${path}.formatter.zero`),
				options
			});
		}
		case 'duration':
			requireExactKeys(formatter, ['kind', 'purpose', 'options'], ['purpose']);
			return Object.freeze({
				kind: 'duration',
				...(formatter.purpose === undefined
					? {}
					: { purpose: requireBoundedString(formatter.purpose, `${path}.formatter.purpose`) }),
				options
			});
		case 'display-name':
			requireExactKeys(formatter, ['kind', 'domain', 'options']);
			return Object.freeze({
				kind: 'display-name',
				domain: requireBoundedString(formatter.domain, `${path}.formatter.domain`),
				options
			});
		case 'list':
			requireExactKeys(formatter, ['kind', 'options']);
			return Object.freeze({ kind: 'list', options });
		default:
			throw new TypeError(`${path}.formatter kind "${formatter.kind}" is unsupported`);
	}
}

function validateUnitDimensions(
	quantity: string,
	sourceUnit: string,
	convertTo: string | undefined,
	path: string
): void {
	const sourceDimension = intlUnitDefinitions[sourceUnit]?.dimension;
	if (!sourceDimension) {
		if (quantity !== 'unit' || convertTo)
			throw new TypeError(`${path}.formatter.sourceUnit is incompatible with ${quantity}`);
		return;
	}
	if (sourceDimension !== quantity)
		throw new TypeError(`${path}.formatter.sourceUnit is incompatible with ${quantity}`);
	if (!convertTo) return;
	const destinationDimension = intlUnitDefinitions[convertTo]?.dimension;
	if (!sourceDimension || destinationDimension !== sourceDimension)
		throw new TypeError(
			`${path}.formatter.convertTo is dimensionally incompatible with ${sourceUnit}`
		);
}

function validateOptions(
	input: unknown,
	allowed: ReadonlySet<string>,
	path: string
): IntlFiniteOptionsV1 {
	const record = requireRecord(input, path);
	const result: Record<string, IntlFiniteValueV1> = Object.create(null) as Record<
		string,
		IntlFiniteValueV1
	>;
	for (const key of Object.keys(record).sort()) {
		if (!allowed.has(key)) throw new TypeError(`${path}.${key} is not supported`);
		result[key] = validateFiniteValue(record[key], `${path}.${key}`, 0);
	}
	return Object.freeze(result);
}

function validateFiniteValue(input: unknown, path: string, depth: number): IntlFiniteValueV1 {
	if (input === null || typeof input === 'boolean' || typeof input === 'string') return input;
	if (typeof input === 'number') {
		if (!Number.isFinite(input)) throw new TypeError(`${path} must be finite`);
		return Object.is(input, -0) ? 0 : input;
	}
	if (!Array.isArray(input) || depth >= 8) throw new TypeError(`${path} is not finite option data`);
	return Object.freeze(
		input.map((entry, index) => validateFiniteValue(entry, `${path}[${index}]`, depth + 1))
	);
}
