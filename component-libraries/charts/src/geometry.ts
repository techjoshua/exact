import type { ChartCoordinate, ChartType } from './contracts.js';
import { convertIntlMeasurementValue, type IntlMeasurementPresentation } from '@exactjs/intl';
import type { ChartLayout } from './layout.js';
import { chartTypeUsesZeroBaseline } from './layout.js';
import type { ChartSeriesRegistration } from './model.js';
import { scaleCategory, scaleLinear } from './scales.js';

/** Resolved Cartesian datum used only by the focused SVG geometry writer. */
export interface PositionedDatum {
	readonly id: string;
	readonly x: number;
	readonly y: number;
	readonly value: number;
	readonly label: string;
	readonly move: boolean;
}

/** Shared domains and categories for one chart render. */
export interface ChartGeometryDomain {
	readonly xKind: 'continuous' | 'category';
	readonly x: readonly [number, number];
	readonly y: readonly [number, number];
	readonly categories: readonly string[];
}

/** Resolves data domains without formatting values into identity or geometry keys. @exact pure */
export function resolveGeometryDomain(
	type: ChartType,
	series: readonly ChartSeriesRegistration[],
	presentation?: IntlMeasurementPresentation
): ChartGeometryDomain {
	const data = series.flatMap((entry) => [...entry.data.values()].map((datum) => datum.props));
	const continuous = data.every((datum) => typeof datum.x === 'number' || datum.x instanceof Date);
	const xValues = continuous ? data.map((datum) => coordinateNumber(datum.x)) : [];
	const categories = continuous ? [] : [...new Set(data.map((datum) => coordinateLabel(datum.x)))];
	let values = data.flatMap((datum) =>
		datum.defined === false
			? []
			: [
					projectValue(presentation, datum.value),
					...(datum.minimum === undefined ? [] : [projectValue(presentation, datum.minimum)]),
					...(datum.maximum === undefined ? [] : [projectValue(presentation, datum.maximum)])
				]
	);
	if (type === 'stacked-bar') values = stackedExtents(series, presentation);
	if (chartTypeUsesZeroBaseline(type)) values.push(0);
	return Object.freeze({
		xKind: continuous ? 'continuous' : 'category',
		x: extent(xValues, [0, Math.max(1, categories.length - 1)]),
		y: paddedExtent(values),
		categories: Object.freeze(categories)
	});
}

function stackedExtents(
	series: readonly ChartSeriesRegistration[],
	presentation: IntlMeasurementPresentation | undefined
): number[] {
	const positive = new Map<string, number>();
	const negative = new Map<string, number>();
	for (const entry of series) {
		for (const datum of entry.data.values()) {
			if (datum.props.defined === false) continue;
			const category = coordinateLabel(datum.props.x);
			const value = projectValue(presentation, datum.props.value);
			const totals = value >= 0 ? positive : negative;
			totals.set(category, (totals.get(category) ?? 0) + value);
		}
	}
	return [0, ...positive.values(), ...negative.values()];
}

/** Positions one series through the chart's resolved domain and layout. */
export function positionSeries(
	series: ChartSeriesRegistration,
	domain: ChartGeometryDomain,
	layout: ChartLayout,
	presentation?: IntlMeasurementPresentation
): readonly PositionedDatum[] {
	let move = true;
	const points: PositionedDatum[] = [];
	for (const { props } of series.data.values()) {
		if (props.defined === false) {
			move = true;
			continue;
		}
		points.push({
			id: props.id,
			x:
				domain.xKind === 'continuous'
					? scaleLinear(
							{ domain: domain.x, range: [layout.left, layout.right] },
							coordinateNumber(props.x)
						)
					: scaleCategory(domain.categories, coordinateLabel(props.x), [layout.left, layout.right]),
			y: scaleLinear(
				{ domain: domain.y, range: [layout.bottom, layout.top] },
				projectValue(presentation, props.value)
			),
			value: projectValue(presentation, props.value),
			label: coordinateLabel(props.x),
			move
		});
		move = false;
	}
	return Object.freeze(points);
}

/** Emits one finite SVG line path without parsing or retaining rendered nodes. */
export function linePath(points: readonly PositionedDatum[]): string {
	return points
		.map(
			(point, index) =>
				`${index === 0 || point.move ? 'M' : 'L'}${round(point.x)},${round(point.y)}`
		)
		.join('');
}

function coordinateNumber(value: ChartCoordinate): number {
	const numeric = value instanceof Date ? value.getTime() : Number(value);
	if (!Number.isFinite(numeric)) throw new TypeError('Continuous chart coordinates must be finite');
	return numeric;
}

function coordinateLabel(value: ChartCoordinate): string {
	return value instanceof Date ? value.toISOString() : String(value);
}

function extent(
	values: readonly number[],
	fallback: readonly [number, number]
): readonly [number, number] {
	if (!values.length) return fallback;
	const low = Math.min(...values);
	const high = Math.max(...values);
	return low === high ? [low - 1, high + 1] : [low, high];
}

function paddedExtent(values: readonly number[]): readonly [number, number] {
	const [low, high] = extent(values, [0, 1]);
	const padding = Math.max((high - low) * 0.05, Number.EPSILON);
	return [low - padding, high + padding];
}

function round(value: number): number {
	return Number(value.toFixed(3));
}

/** @exact pure */
function projectValue(
	presentation: IntlMeasurementPresentation | undefined,
	value: number
): number {
	return presentation ? convertIntlMeasurementValue(presentation, value) : value;
}
