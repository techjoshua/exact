import type { IntlEnvironment, IntlMeasurementPresentation } from '@exactjs/intl';
import type { ChartDatumRegistration, ChartSeriesRegistration } from './model.js';
import type { PresentedRange } from './presentation-contracts.js';
import { formatChartCoordinate, formatChartValue } from './axis-presentation.js';

/** Formats range endpoints and marks for both accessible plot labels and legacy table rows. */
export function rangeSummary(
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
	].join(' | ');
}

/** Combines the resolved datum label with its formatted numeric value. */
export function datumLabelValue(
	entry: ChartSeriesRegistration,
	datumId: string,
	measurement: IntlMeasurementPresentation | undefined,
	environment: IntlEnvironment | undefined
): string {
	const datum = entry.data.get(datumId)!;
	return `${datum.label?.presentation?.value ?? datum.props.label ?? formatChartCoordinate(datum.props.x, environment)}: ${formatChartValue(datum.props.value, measurement, environment)}`;
}

/** Reads an optional localized description without synthesizing missing content. */
export function datumDescription(
	entry: ChartSeriesRegistration,
	datumId: string
): { readonly description?: string } {
	const datum = entry.data.get(datumId)!;
	const description = datum.description?.presentation?.value ?? datum.props.description;
	return description === undefined ? {} : { description };
}

/** Links a mark only to an authored description owned by its datum. */
export function datumDescriptionId(
	entry: ChartSeriesRegistration,
	datumId: string
): { readonly descriptionId?: string } {
	const datum = entry.data.get(datumId)!;
	return datum.description
		? { descriptionId: `${entry.chartId}-datum-${safeId(datumId)}-description` }
		: {};
}

function safeId(value: string): string {
	return value.replace(/[^A-Za-z0-9_-]+/gu, '-');
}
