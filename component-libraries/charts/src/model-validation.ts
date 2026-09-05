import { deriveDataColors, type ResolvedTheme, type ThemeSurfaceBundle } from '@exactjs/theme';
import type { DataProps } from './contracts.js';
import type { ChartCoordinator } from './contexts.js';
import type { ChartSeriesRegistration } from './model.js';

const fallbackColors = Object.freeze(['#2563eb', '#dc2626', '#059669', '#7c3aed']);

/** Stable non-color and color identity assigned to one authored series. */
export interface ChartSeriesStyle {
	readonly color: string;
	readonly pattern: number;
}

/** Validates the complete registered model before geometry is derived. */
export function validateChartModel(
	chart: ChartCoordinator,
	series: readonly ChartSeriesRegistration[]
): void {
	for (const axis of chart.model.axes.values()) {
		if (axis.props.domain && !axis.props.domain.every(Number.isFinite))
			throw new TypeError(`Chart axis ${axis.props.id} domain must be finite`);
		if (axis.props.domain && axis.props.domain[0] >= axis.props.domain[1])
			throw new RangeError(`Chart axis ${axis.props.id} domain must increase`);
	}
	for (const entry of series) {
		for (const axisId of [entry.props.xAxis, entry.props.yAxis])
			if (axisId && !chart.model.axes.has(axisId))
				throw new Error(`Chart series ${entry.props.id} references missing axis ${axisId}`);
		for (const datum of entry.data.values()) validateDatum(entry.props.id, datum.props);
	}
}

/** Resolves theme colors and pattern indexes before visibility filtering can change order. */
export function resolveChartSeriesStyles(
	series: readonly ChartSeriesRegistration[],
	theme: ResolvedTheme | undefined,
	surface: ThemeSurfaceBundle | undefined
): ReadonlyMap<string, ChartSeriesStyle> {
	const colors = theme
		? deriveDataColors(theme, {
				kind: 'categorical',
				count: Math.max(1, series.length),
				...(surface === undefined ? {} : { surface })
			}).strokes
		: fallbackColors;
	return new Map(
		series.map((entry, index) => [
			entry.props.id,
			{
				color: entry.props.color ?? colors[index % colors.length]!,
				pattern: index % 4
			}
		])
	);
}

function validateDatum(seriesId: string, props: DataProps): void {
	const values = [props.value, props.minimum, props.maximum].filter(
		(value): value is number => value !== undefined
	);
	if (!values.every(Number.isFinite))
		throw new TypeError(`Chart datum ${props.id} values must be finite`);
	if (props.marks && !Object.values(props.marks).every(Number.isFinite))
		throw new TypeError(`Chart datum ${props.id} marks must be finite`);
	if (props.minimum !== undefined && props.maximum !== undefined && props.minimum > props.maximum)
		throw new RangeError(`Chart datum ${seriesId}:${props.id} minimum cannot exceed its maximum`);
}
