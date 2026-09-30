import {
	convertIntlMeasurementValue,
	createDefaultIntlEnvironment,
	formatIntlNumberValue,
	type IntlEnvironment,
	type IntlMeasurementPresentation
} from '@exactjs/intl';
import type { ChartCoordinate, DataProps } from './contracts.js';
import type { ChartSeriesRegistration } from './model.js';
import { formatChartCoordinate, formatChartValue } from './axis-presentation.js';
import type { ChartTableField, ChartTableOptions, PresentedChartTable } from './table-contracts.js';

/** Derives table values from registrations without mutating inputs or rounding before summation. */
export function presentChartTable(
	options: ChartTableOptions,
	registered: readonly ChartSeriesRegistration[],
	measurement: IntlMeasurementPresentation | undefined,
	environment: IntlEnvironment | undefined
): PresentedChartTable {
	if (!['categories', 'series', 'values'].includes(options.layout))
		throw new TypeError('Chart table layout must be categories, series, or values');
	if (
		options.precision !== undefined &&
		(!Number.isInteger(options.precision) || options.precision < 0 || options.precision > 20)
	)
		throw new RangeError('Chart table precision must be an integer from 0 to 20');
	if (options.precision !== undefined && options.numberFormat !== undefined)
		throw new TypeError('Chart table accepts either precision or numberFormat, not both');
	const numberEnvironment = options.numberFormat
		? (environment ?? createDefaultIntlEnvironment('en-US'))
		: environment;
	const series = orderEntries(registered, options.seriesOrder ?? [], (entry) => entry.props.id);
	const categories = new Map<string, string>();
	for (const entry of series)
		for (const datum of entry.data.values()) {
			const key = coordinateKey(datum.props.x);
			if (!categories.has(key))
				categories.set(key, formatChartCoordinate(datum.props.x, environment));
		}
	const categoryOrder = options.categories?.map((category) => coordinateKey(category.value)) ?? [];
	const orderedCategories = orderEntries([...categories], categoryOrder, (entry) => entry[0]);
	for (const category of options.categories ?? [])
		if (category.label !== undefined) categories.set(coordinateKey(category.value), category.label);
	const format = (value: number | undefined): string => {
		if (value === undefined) return options.missing ?? 'Not available';
		if (!Number.isFinite(value))
			throw new RangeError('Chart table values and totals must be finite');
		if (options.precision === undefined && options.numberFormat === undefined)
			return formatChartValue(value, measurement, environment);
		const projected = measurement ? convertIntlMeasurementValue(measurement, value) : value;
		if (!Number.isFinite(projected))
			throw new RangeError('Chart table converted values must be finite');
		return numberEnvironment
			? formatIntlNumberValue(
					numberEnvironment,
					projected,
					options.numberFormat ?? {
						minimumFractionDigits: options.precision,
						maximumFractionDigits: options.precision,
						useGrouping: false
					}
				)
			: projected.toFixed(options.precision);
	};
	const heading = (label: string) => (options.unit ? `${label} (${options.unit})` : label);
	const base = {
		...(options.caption === undefined ? {} : { caption: options.caption }),
		display: options.display ?? 'disclosure',
		summary: options.summary ?? 'View chart data',
		rowHeading: options.rowHeading ?? (options.layout === 'series' ? 'Series' : 'Category')
	} as const;
	if (options.layout === 'values') {
		if (!options.columns.length) throw new Error('Chart value tables need at least one column');
		const columns = options.columns.map((column) => ({
			id:
				column.rangeEnd === undefined
					? fieldKey(column.field)
					: JSON.stringify([fieldKey(column.field), fieldKey(column.rangeEnd)]),
			label: heading(column.label)
		}));
		if (new Set(columns.map((column) => column.id)).size !== columns.length)
			throw new Error('Chart table columns must select distinct fields');
		const rank = new Map(orderedCategories.map(([key], index) => [key, index]));
		return {
			...base,
			rowHeading: options.rowHeading ?? (options.rowLabel === 'series' ? 'Series' : 'Category'),
			columns,
			rows: series.flatMap((entry) => {
				const data = [...entry.data.values()];
				data.sort(
					(a, b) => rank.get(coordinateKey(a.props.x))! - rank.get(coordinateKey(b.props.x))!
				);
				return data.map((datum) => ({
					id: JSON.stringify([entry.props.id, datum.props.id]),
					label:
						options.rowLabel === 'series'
							? seriesLabel(entry)
							: options.rowLabel === 'series-category'
								? `${seriesLabel(entry)} / ${categories.get(coordinateKey(datum.props.x))!}`
								: categories.get(coordinateKey(datum.props.x))!,
					cells: options.columns.map((column, index) => ({
						id: columns[index]!.id,
						value: formatCell(datum.props, column.field, column.rangeEnd, format)
					}))
				}));
			})
		};
	}
	const values = new Map<string, Map<string, number | undefined>>();
	for (const entry of series) {
		const cells = new Map<string, number | undefined>();
		for (const datum of entry.data.values()) {
			const key = coordinateKey(datum.props.x);
			if (cells.has(key))
				throw new Error(
					`Chart table series ${entry.props.id} has duplicate category ${String(datum.props.x)}`
				);
			cells.set(key, datum.props.defined === false ? undefined : datum.props.value);
		}
		values.set(entry.props.id, cells);
	}
	const rowEntries =
		options.layout === 'categories'
			? orderedCategories.map(([id]) => ({ id, label: categories.get(id)! }))
			: series.map((entry) => ({ id: entry.props.id, label: seriesLabel(entry) }));
	const columns =
		options.layout === 'categories'
			? series.map((entry) => ({ id: entry.props.id, label: heading(seriesLabel(entry)) }))
			: orderedCategories.map(([id]) => ({ id, label: heading(categories.get(id)!) }));
	return {
		...base,
		columns: [
			...columns.map((column) => ({ ...column, id: JSON.stringify(['value', column.id]) })),
			...(options.total ? [{ id: 'total', label: heading(options.total.label) }] : [])
		],
		rows: rowEntries.map((row) => {
			const numbers = columns.map((column) =>
				options.layout === 'categories'
					? values.get(column.id)?.get(row.id)
					: values.get(row.id)?.get(column.id)
			);
			const total =
				options.total && numbers.length && numbers.every((value) => value !== undefined)
					? numbers.reduce<number>((sum, value) => sum + value!, 0)
					: undefined;
			return {
				...row,
				cells: [
					...numbers.map((value, index) => ({
						id: JSON.stringify(['value', columns[index]!.id]),
						value: format(value)
					})),
					...(options.total ? [{ id: 'total', value: format(total) }] : [])
				]
			};
		})
	};
}

/** Formats complete ordered ranges without inventing a value for a missing endpoint. */
function formatCell(
	datum: DataProps,
	start: ChartTableField,
	end: ChartTableField | undefined,
	format: (value: number | undefined) => string
): string {
	if (datum.defined === false) return format(undefined);
	const lower = fieldValue(datum, start);
	if (end === undefined) return format(lower);
	const upper = fieldValue(datum, end);
	if (lower === undefined || upper === undefined) return format(undefined);
	if (lower > upper) throw new RangeError('Chart table range endpoints must be ordered');
	const first = format(lower),
		last = format(upper);
	return first === last ? first : `${first}–${last}`;
}

/** Orders known identities, rejecting ambiguous configuration instead of silently dropping data. */
function orderEntries<T>(
	entries: readonly T[],
	order: readonly string[],
	key: (entry: T) => string
): T[] {
	const ranks = new Map(order.map((id, index) => [id, index]));
	if (ranks.size !== order.length)
		throw new Error('Chart table ordering contains duplicate identities');
	const known = new Set(entries.map(key));
	for (const id of order)
		if (!known.has(id)) throw new Error(`Chart table ordering references unknown identity ${id}`);
	return [...entries].sort(
		(a, b) => (ranks.get(key(a)) ?? order.length) - (ranks.get(key(b)) ?? order.length)
	);
}

/** Keeps numeric, text, and date coordinates distinct even when their display labels coincide. */
function coordinateKey(value: ChartCoordinate): string {
	if (value instanceof Date) return `date:${value.toISOString()}`;
	return JSON.stringify([typeof value, value]);
}

function seriesLabel(entry: ChartSeriesRegistration): string {
	return entry.label?.presentation?.value ?? entry.textLabel ?? entry.props.name ?? entry.props.id;
}

function fieldKey(field: ChartTableField): string {
	return typeof field === 'string'
		? field
		: 'mark' in field
			? `mark:${field.mark}`
			: `statistic:${field.statistic}`;
}

function fieldValue(datum: DataProps, field: ChartTableField): number | undefined {
	if (typeof field === 'string') return datum[field];
	const source = 'mark' in field ? datum.marks : datum.statistics;
	const key = 'mark' in field ? field.mark : field.statistic;
	return source && Object.hasOwn(source, key) ? source[key] : undefined;
}
