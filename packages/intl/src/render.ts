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
import { formatPreparedIntlMeasurement } from './measurement-presentation.js';
import { resolveIntlBinding, type PreparedIntlActivation } from './prepared.js';

/** Renders a prepared source message or its current validated translation. */
export function renderIntlActivation(
	activation: PreparedIntlActivation,
	environment: IntlEnvironment
): Child[] {
	const { descriptor } = activation;
	const pattern =
		environment.find(descriptor.owner, descriptor.key, descriptor) ?? descriptor.source;
	return renderIntlPatternActivation(pattern, activation, environment);
}

/** Renders the authored source pattern for a prepared activation without catalog lookup. */
export function renderIntlSourceActivation(
	activation: PreparedIntlActivation,
	environment: IntlEnvironment
): Child[] {
	return renderIntlPatternActivation(activation.descriptor.source, activation, environment);
}

function renderIntlPatternActivation(
	pattern: IntlPatternV1,
	activation: PreparedIntlActivation,
	environment: IntlEnvironment
): Child[] {
	const { descriptor } = activation;
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
			return formatPreparedIntlMeasurement(environment, formatter, values);
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
