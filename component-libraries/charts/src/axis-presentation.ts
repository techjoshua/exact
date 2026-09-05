import {
	formatIntlDateTimeValue,
	formatIntlMeasurementValue,
	formatIntlNumberValue,
	resolveIntlMeasurementPresentation,
	restoreIntlMeasurementValue,
	type IntlEnvironment,
	type IntlMeasurementPresentation
} from '@exactjs/intl';
import type { ChartCoordinator } from './contexts.js';
import { resolveGeometryDomain, type ChartGeometryDomain } from './geometry.js';
import type { ChartLayout } from './layout.js';
import type { ChartSeriesRegistration } from './model.js';
import { linearTicks, scaleLinear } from './scales.js';

/** Resolves one intl-owned measurement plan for the visible vertical values. */
export function resolveChartMeasurement(
	chart: ChartCoordinator,
	series: readonly ChartSeriesRegistration[],
	environment: IntlEnvironment | undefined
): IntlMeasurementPresentation | undefined {
	const request = primaryVerticalAxis(chart)?.props.measurement;
	if (!request || !environment) return undefined;
	const values = series.flatMap((entry) =>
		[...entry.data.values()].flatMap(({ props }) =>
			props.defined === false
				? []
				: [
						props.value,
						...(props.minimum === undefined ? [] : [props.minimum]),
						...(props.maximum === undefined ? [] : [props.maximum])
					]
		)
	);
	if (!values.length) return undefined;
	return resolveIntlMeasurementPresentation(environment, {
		...request,
		unitComposition: 'single',
		values
	});
}

/** Combines inferred domains with explicit axis constraints. */
export function resolveChartDomains(
	chart: ChartCoordinator,
	series: readonly ChartSeriesRegistration[],
	measurement: IntlMeasurementPresentation | undefined
): ChartGeometryDomain {
	const inferred = resolveGeometryDomain(chart.props.type, series, measurement);
	return Object.freeze({
		...inferred,
		x: primaryHorizontalAxis(chart)?.props.domain ?? inferred.x,
		y: primaryVerticalAxis(chart)?.props.domain ?? inferred.y
	});
}

/** Presents localized ticks for the primary vertical axis. */
export function presentVerticalTicks(
	chart: ChartCoordinator,
	domain: ChartGeometryDomain,
	layout: ChartLayout,
	measurement: IntlMeasurementPresentation | undefined,
	environment: IntlEnvironment | undefined
) {
	return linearTicks(domain.y, primaryVerticalAxis(chart)?.props.tickCount ?? 5).map((value) => ({
		id: String(value),
		value: measurement
			? formatIntlMeasurementValue(measurement, restoreIntlMeasurementValue(measurement, value))
			: environment
				? formatIntlNumberValue(environment, value, { maximumSignificantDigits: 6 })
				: String(Number(value.toPrecision(6))),
		x: layout.left,
		y: scaleLinear({ domain: domain.y, range: [layout.bottom, layout.top] }, value)
	}));
}

/** Presents the numeric value domain along the bottom of a horizontal chart. */
export function presentHorizontalValueTicks(
	chart: ChartCoordinator,
	domain: ChartGeometryDomain,
	layout: ChartLayout,
	measurement: IntlMeasurementPresentation | undefined,
	environment: IntlEnvironment | undefined
) {
	return linearTicks(domain.y, primaryHorizontalAxis(chart)?.props.tickCount ?? 5).map((value) => ({
		id: String(value),
		value: measurement
			? formatIntlMeasurementValue(measurement, restoreIntlMeasurementValue(measurement, value))
			: environment
				? formatIntlNumberValue(environment, value, { maximumSignificantDigits: 6 })
				: String(Number(value.toPrecision(6))),
		x: scaleLinear({ domain: domain.y, range: [layout.left, layout.right] }, value),
		y: layout.bottom
	}));
}

/** Presents category, numeric, or temporal ticks for the primary horizontal axis. */
export function presentHorizontalTicks(
	chart: ChartCoordinator,
	domain: ChartGeometryDomain,
	layout: ChartLayout,
	environment: IntlEnvironment | undefined
) {
	if (domain.xKind === 'category')
		return domain.categories.map((value, index) => ({
			id: value,
			value,
			x: layout.left + (layout.plotWidth / Math.max(1, domain.categories.length)) * (index + 0.5),
			y: layout.bottom
		}));
	const axis = primaryHorizontalAxis(chart);
	return linearTicks(domain.x, axis?.props.tickCount ?? 5).map((value) => ({
		id: String(value),
		value:
			axis?.props.scale === 'time'
				? formatChartCoordinate(new Date(value), environment)
				: environment
					? formatIntlNumberValue(environment, value)
					: String(Number(value.toPrecision(6))),
		x: scaleLinear({ domain: domain.x, range: [layout.left, layout.right] }, value),
		y: layout.bottom
	}));
}

/** Presents one category label at each horizontal chart row. */
export function presentRowCategories(
	series: readonly ChartSeriesRegistration[],
	layout: ChartLayout,
	environment: IntlEnvironment | undefined
) {
	const rows = series.flatMap((entry) =>
		[...entry.data.values()]
			.filter((datum) => datum.props.defined !== false)
			.map((datum) => ({ entry, datum }))
	);
	const rowHeight = layout.plotHeight / Math.max(1, rows.length);
	return rows.map(({ entry, datum }, index) => ({
		id: `${entry.props.id}:${datum.props.id}`,
		value:
			datum.label?.presentation?.value ??
			datum.props.label ??
			formatChartCoordinate(datum.props.x, environment),
		x: layout.left,
		y: layout.top + index * rowHeight + rowHeight / 2
	}));
}

/** Formats one source-domain value without taking locale or unit ownership into charts. */
export function formatChartValue(
	value: number,
	measurement: IntlMeasurementPresentation | undefined,
	environment?: IntlEnvironment
): string {
	return measurement
		? formatIntlMeasurementValue(measurement, value)
		: environment
			? formatIntlNumberValue(environment, value)
			: String(value);
}

/** Formats a coordinate through public intl presentation when a locale is active. */
export function formatChartCoordinate(
	value: string | number | Date,
	environment: IntlEnvironment | undefined
): string {
	if (value instanceof Date)
		return environment
			? formatIntlDateTimeValue(environment, value, {
					dateStyle: 'medium',
					timeStyle: 'short'
				})
			: value.toISOString();
	if (typeof value === 'number' && environment) return formatIntlNumberValue(environment, value);
	return String(value);
}

function primaryVerticalAxis(chart: ChartCoordinator) {
	return [...chart.model.axes.values()].find(
		(axis) => axis.props.position === 'left' || axis.props.position === 'right'
	);
}

function primaryHorizontalAxis(chart: ChartCoordinator) {
	return [...chart.model.axes.values()].find(
		(axis) => axis.props.position === 'top' || axis.props.position === 'bottom'
	);
}
