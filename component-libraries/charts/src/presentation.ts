import {
	convertIntlMeasurementValue,
	type IntlEnvironment,
	type IntlMeasurementPresentation
} from '@exactjs/intl';
import type { ResolvedTheme, ThemeSurfaceBundle } from '@exactjs/theme';
import type { ChartType } from './contracts.js';
import type { ChartCoordinator } from './contexts.js';
import {
	linePath,
	positionSeries,
	type ChartGeometryDomain,
	type PositionedDatum
} from './geometry.js';
import { resolveChartLayout, type ChartLayout } from './layout.js';
import type { ChartDatumRegistration, ChartSeriesRegistration } from './model.js';
import type {
	ChartPresentation,
	PresentedBar,
	PresentedLine,
	PresentedRange,
	PresentedRow
} from './presentation-contracts.js';
import {
	resolveChartSeriesStyles,
	type ChartSeriesStyle,
	validateChartModel
} from './model-validation.js';
import {
	formatChartCoordinate,
	formatChartValue,
	presentHorizontalTicks,
	presentHorizontalValueTicks,
	presentRowCategories,
	presentVerticalTicks,
	resolveChartDomains,
	resolveChartMeasurement
} from './axis-presentation.js';
import { scaleLinear } from './scales.js';

/** Resolves all dynamic chart values inside one explicit component-owned computation. @exact pure */
export function createChartPresentation(
	chart: ChartCoordinator,
	environment: IntlEnvironment | undefined,
	theme: ResolvedTheme | undefined,
	surface: ThemeSurfaceBundle | undefined,
	_revision: number,
	_presentationRevision: number,
	_intlGeneration: number | undefined,
	_hiddenSeries = ''
): ChartPresentation {
	const allSeries = [...chart.model.series.values()];
	validateChartModel(chart, allSeries);
	const hidden = new Set(_hiddenSeries ? _hiddenSeries.split('\u0000') : []);
	const series = allSeries.filter((entry) => !hidden.has(entry.props.id));
	const layout = resolveChartLayout(chart.props);
	const measurement = resolveChartMeasurement(chart, series, environment);
	const domain = resolveChartDomains(chart, series, measurement);
	const styles = resolveChartSeriesStyles(allSeries, theme, surface);
	const orientation =
		chart.props.type === 'horizontal-bar' || chart.props.type === 'range'
			? ('horizontal' as const)
			: ('vertical' as const);
	const ticks =
		orientation === 'horizontal'
			? presentHorizontalValueTicks(chart, domain, layout, measurement, environment)
			: presentVerticalTicks(chart, domain, layout, measurement, environment);
	const categories =
		orientation === 'horizontal'
			? presentRowCategories(series, layout, environment)
			: presentHorizontalTicks(chart, domain, layout, environment);
	const lines = presentLines(
		chart.props.type,
		series,
		domain,
		layout,
		styles,
		measurement,
		environment
	);
	const bars = presentBars(
		chart.props.type,
		series,
		domain,
		layout,
		styles,
		measurement,
		environment
	);
	const ranges = presentRanges(
		chart.props.type,
		series,
		domain,
		layout,
		styles,
		measurement,
		environment
	);
	const marks = [
		...lines.flatMap((entry) => entry.points),
		...bars.map((entry) => ({ ...entry, x: entry.x + entry.width / 2 })),
		...ranges.map((entry) => ({ ...entry, x: entry.marker }))
	];
	const legend = chart.model.hasLegend
		? allSeries.map((entry) => ({
				id: entry.props.id,
				label:
					entry.label?.presentation?.value ?? entry.textLabel ?? entry.props.name ?? entry.props.id,
				color: styles.get(entry.props.id)!.color,
				pattern: styles.get(entry.props.id)!.pattern,
				hidden: hidden.has(entry.props.id)
			}))
		: [];
	const axisLabels = [...chart.model.axes.values()].flatMap((axis) => {
		const value = axis.label?.presentation?.value ?? axis.textLabel;
		return value === undefined
			? []
			: [{ id: axis.props.id, position: axis.props.position, value } as const];
	});
	return Object.freeze({
		orientation,
		layout,
		domain,
		...(measurement === undefined ? {} : { measurement }),
		ticks: Object.freeze(ticks),
		categories: Object.freeze(categories),
		lines: Object.freeze(lines),
		bars: Object.freeze(bars),
		ranges: Object.freeze(ranges),
		marks: Object.freeze(marks),
		rows: Object.freeze(presentRows(chart.props.type, series, measurement, environment)),
		legend: Object.freeze(legend),
		axisLabels: Object.freeze(axisLabels)
	});
}

function presentLines(
	type: ChartType,
	series: readonly ChartSeriesRegistration[],
	domain: ChartGeometryDomain,
	layout: ChartLayout,
	styles: ReadonlyMap<string, ChartSeriesStyle>,
	measurement: IntlMeasurementPresentation | undefined,
	environment: IntlEnvironment | undefined
): PresentedLine[] {
	if (type !== 'line' && type !== 'area') return [];
	let markIndex = 0;
	return series.map((entry) => {
		const style = styles.get(entry.props.id)!;
		const points = positionSeries(entry, domain, layout, measurement);
		const path = linePath(points);
		return {
			id: entry.props.id,
			labelId: `${entry.chartId}-series-${safeId(entry.props.id)}-label`,
			color: style.color,
			pattern: style.pattern,
			path,
			...(type === 'area' && points.length ? { area: areaPath(points, layout.bottom) } : {}),
			points: points.map((point) => ({
				id: point.id,
				index: markIndex++,
				x: point.x,
				y: point.y,
				label: datumLabelValue(entry, point.id, measurement, environment),
				...datumDescription(entry, point.id),
				...datumDescriptionId(entry, point.id),
				seriesId: entry.props.id
			}))
		};
	});
}

function presentBars(
	type: ChartType,
	series: readonly ChartSeriesRegistration[],
	domain: ChartGeometryDomain,
	layout: ChartLayout,
	styles: ReadonlyMap<string, ChartSeriesStyle>,
	measurement: IntlMeasurementPresentation | undefined,
	environment: IntlEnvironment | undefined
): PresentedBar[] {
	if (type === 'horizontal-bar')
		return presentHorizontalBars(series, domain, layout, styles, measurement, environment);
	if (type !== 'bar' && type !== 'stacked-bar') return [];
	const band = layout.plotWidth / Math.max(1, domain.categories.length);
	const groupedWidth = (band * 0.72) / Math.max(1, series.length);
	const positive = new Map<string, number>();
	const negative = new Map<string, number>();
	let markIndex = 0;
	return series.flatMap((entry, seriesIndex) => {
		const style = styles.get(entry.props.id)!;
		return [...entry.data.values()]
			.filter((datum) => datum.props.defined !== false)
			.map((datum) => {
				const category = String(datum.props.x);
				const categoryIndex = Math.max(0, domain.categories.indexOf(category));
				const value = projectValue(measurement, datum.props.value);
				const totals = value >= 0 ? positive : negative;
				const base = type === 'stacked-bar' ? (totals.get(category) ?? 0) : 0;
				if (type === 'stacked-bar') totals.set(category, base + value);
				const y0 = scaleLinear({ domain: domain.y, range: [layout.bottom, layout.top] }, base);
				const y1 = scaleLinear(
					{ domain: domain.y, range: [layout.bottom, layout.top] },
					base + value
				);
				return {
					id: `${entry.props.id}:${datum.props.id}`,
					index: markIndex++,
					x:
						layout.left +
						categoryIndex * band +
						band * 0.14 +
						(type === 'stacked-bar' ? 0 : seriesIndex * groupedWidth),
					y: Math.min(y0, y1),
					width: type === 'stacked-bar' ? band * 0.72 : groupedWidth,
					height: Math.max(1, Math.abs(y1 - y0)),
					color: style.color,
					label: datumLabelValue(entry, datum.props.id, measurement, environment),
					...datumDescription(entry, datum.props.id),
					...datumDescriptionId(entry, datum.props.id),
					seriesId: entry.props.id,
					pattern: style.pattern
				};
			});
	});
}

function presentHorizontalBars(
	series: readonly ChartSeriesRegistration[],
	domain: ChartGeometryDomain,
	layout: ChartLayout,
	styles: ReadonlyMap<string, ChartSeriesStyle>,
	measurement: IntlMeasurementPresentation | undefined,
	environment: IntlEnvironment | undefined
): PresentedBar[] {
	const rows = series.flatMap((entry) =>
		[...entry.data.values()]
			.filter((datum) => datum.props.defined !== false)
			.map((datum) => [entry, datum] as const)
	);
	const rowHeight = layout.plotHeight / Math.max(1, rows.length);
	const zero = scaleLinear({ domain: domain.y, range: [layout.left, layout.right] }, 0);
	return rows.map(([entry, datum], index) => {
		const end = scaleLinear(
			{ domain: domain.y, range: [layout.left, layout.right] },
			projectValue(measurement, datum.props.value)
		);
		const style = styles.get(entry.props.id)!;
		return {
			id: `${entry.props.id}:${datum.props.id}`,
			index,
			x: Math.min(zero, end),
			y: layout.top + index * rowHeight + rowHeight * 0.14,
			width: Math.max(1, Math.abs(end - zero)),
			height: rowHeight * 0.72,
			color: style.color,
			label: datumLabelValue(entry, datum.props.id, measurement, environment),
			...datumDescription(entry, datum.props.id),
			...datumDescriptionId(entry, datum.props.id),
			seriesId: entry.props.id,
			pattern: style.pattern
		};
	});
}

function presentRanges(
	type: ChartType,
	series: readonly ChartSeriesRegistration[],
	domain: ChartGeometryDomain,
	layout: ChartLayout,
	styles: ReadonlyMap<string, ChartSeriesStyle>,
	measurement: IntlMeasurementPresentation | undefined,
	environment: IntlEnvironment | undefined
): PresentedRange[] {
	if (type !== 'range') return [];
	const rows = series.flatMap((entry) =>
		[...entry.data.values()]
			.filter((datum) => datum.props.defined !== false)
			.map((datum) => [entry, datum] as const)
	);
	const rowHeight = layout.plotHeight / Math.max(1, rows.length);
	return rows.map(([entry, datum], index) => {
		const scale = { domain: domain.y, range: [layout.left, layout.right] } as const;
		const style = styles.get(entry.props.id)!;
		const scaleValue = (value: number) => scaleLinear(scale, projectValue(measurement, value));
		const marks = Object.freeze(
			Object.entries(datum.props.marks ?? {}).map(([name, value]) => ({
				id: `${entry.props.id}:${datum.props.id}:${name}`,
				x: scaleValue(value),
				name,
				value: formatChartValue(value, measurement, environment)
			}))
		);
		const summary = rangeSummary(datum.props, marks, measurement, environment);
		return {
			id: `${entry.props.id}:${datum.props.id}`,
			index,
			x1: scaleValue(datum.props.minimum ?? datum.props.value),
			x2: scaleValue(datum.props.maximum ?? datum.props.value),
			marker: scaleValue(datum.props.value),
			y: layout.top + index * rowHeight + rowHeight / 2,
			color: style.color,
			label: `${datumLabelValue(entry, datum.props.id, measurement, environment)}; ${summary}`,
			...datumDescription(entry, datum.props.id),
			...datumDescriptionId(entry, datum.props.id),
			seriesId: entry.props.id,
			marks
		};
	});
}

function presentRows(
	type: ChartType,
	series: readonly ChartSeriesRegistration[],
	measurement: IntlMeasurementPresentation | undefined,
	environment: IntlEnvironment | undefined
): PresentedRow[] {
	return series.flatMap((entry) =>
		[...entry.data.values()]
			.filter((datum) => datum.props.defined !== false)
			.map((datum) => ({
				id: `${entry.props.id}:${datum.props.id}`,
				series:
					entry.label?.presentation?.value ?? entry.textLabel ?? entry.props.name ?? entry.props.id,
				category: formatChartCoordinate(datum.props.x, environment),
				value:
					type === 'range'
						? rangeSummary(datum.props, undefined, measurement, environment)
						: formatChartValue(datum.props.value, measurement, environment),
				...datumDescription(entry, datum.props.id)
			}))
	);
}

function rangeSummary(
	datum: ChartDatumRegistration['props'],
	marks: PresentedRange['marks'] | undefined,
	measurement: IntlMeasurementPresentation | undefined,
	environment: IntlEnvironment | undefined
): string {
	const minimum = formatChartValue(datum.minimum ?? datum.value, measurement, environment);
	const maximum = formatChartValue(datum.maximum ?? datum.value, measurement, environment);
	const primary = formatChartValue(datum.value, measurement, environment);
	const presentedMarks =
		marks ??
		Object.entries(datum.marks ?? {}).map(([name, value]) => ({
			name,
			value: formatChartValue(value, measurement, environment)
		}));
	return [
		`${minimum}–${maximum}`,
		primary,
		...presentedMarks.map((mark) => `${mark.name}: ${mark.value}`)
	].join('; ');
}

function datumLabelValue(
	entry: ChartSeriesRegistration,
	datumId: string,
	measurement: IntlMeasurementPresentation | undefined,
	environment: IntlEnvironment | undefined
): string {
	const datum = entry.data.get(datumId)!;
	return `${datum.label?.presentation?.value ?? datum.props.label ?? formatChartCoordinate(datum.props.x, environment)}: ${formatChartValue(datum.props.value, measurement, environment)}`;
}

function datumDescription(
	entry: ChartSeriesRegistration,
	datumId: string
): { readonly description?: string } {
	const datum = entry.data.get(datumId)!;
	const description = datum.description?.presentation?.value ?? datum.props.description;
	return description === undefined ? {} : { description };
}

function datumDescriptionId(
	entry: ChartSeriesRegistration,
	datumId: string
): { readonly descriptionId?: string } {
	const datum = entry.data.get(datumId)!;
	return datum.description
		? { descriptionId: `${entry.chartId}-datum-${safeId(datumId)}-description` }
		: {};
}

function projectValue(measurement: IntlMeasurementPresentation | undefined, value: number): number {
	return measurement ? convertIntlMeasurementValue(measurement, value) : value;
}

function safeId(value: string): string {
	return value.replace(/[^A-Za-z0-9_-]+/gu, '-');
}

function areaPath(points: readonly PositionedDatum[], baseline: number): string {
	const segments: PositionedDatum[][] = [];
	for (const point of points) {
		if (point.move || !segments.length) segments.push([]);
		segments.at(-1)!.push(point);
	}
	return segments
		.map((segment) => {
			const path = linePath(segment);
			return `${path}L${segment.at(-1)!.x},${baseline}L${segment[0]!.x},${baseline}Z`;
		})
		.join('');
}
