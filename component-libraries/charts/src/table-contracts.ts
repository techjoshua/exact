import type { ChartCoordinate } from './contracts.js';

/** Selects a plotted value, range endpoint, named mark, or supplementary statistic. */
export type ChartTableField =
	| 'value'
	| 'minimum'
	| 'maximum'
	| { readonly mark: string }
	| { readonly statistic: string };

/** One ordered numeric column. Labels are already localized by the caller. */
export interface ChartTableColumn {
	readonly label: string;
	readonly field: ChartTableField;
	/** Optional upper endpoint for a range in this cell. Both endpoints must exist and be ordered. */
	readonly rangeEnd?: ChartTableField;
}

/** Presentation shared by chart-generated tables. Values remain owned by the chart model. */
export interface ChartTablePresentationOptions {
	readonly caption?: string;
	/** Defaults to a disclosure labelled View chart data. */
	readonly display?: 'inline' | 'disclosure';
	readonly summary?: string;
	readonly rowHeading?: string;
	/** Fixed fractional digits, from 0 to 20. Omit to use the chart's value formatting. */
	readonly precision?: number;
	/** Intl number options in the active locale, or en-US without a provider. Mutually exclusive with precision. */
	readonly numberFormat?: Intl.NumberFormatOptions;
	/** Appended to numeric column headings. Does not convert values. */
	readonly unit?: string;
	/** Missing or explicitly undefined data, never a replacement for zero. Defaults to Not available. */
	readonly missing?: string;
	/** Listed series appear first. Unlisted series retain registration order. Unknown or duplicate IDs throw. */
	readonly seriesOrder?: readonly string[];
	/** Listed coordinates appear first with optional labels. Unlisted coordinates retain first-seen order. */
	readonly categories?: readonly { readonly value: ChartCoordinate; readonly label?: string }[];
}

/** Pivots values without aggregation. More than one datum per series/coordinate throws. */
export interface ChartMatrixTableOptions extends ChartTablePresentationOptions {
	readonly layout: 'categories' | 'series';
	/** Optional row sum. Callers must supply additive values in compatible units. Incomplete rows have no total. */
	readonly total?: { readonly label: string };
}

/** Shows one row per datum and explicitly named numeric columns, including range endpoints. */
export interface ChartValuesTableOptions extends ChartTablePresentationOptions {
	readonly layout: 'values';
	readonly columns: readonly ChartTableColumn[];
	/** Defaults to the datum category. Series labels suit one-datum-per-series distributions. */
	readonly rowLabel?: 'category' | 'series' | 'series-category';
}

/** Generates one accessible table from chart data. Custom dataView content takes precedence. */
export type ChartTableOptions = ChartMatrixTableOptions | ChartValuesTableOptions;

/** Internal, formatted table shared by SSR and reactive client output. */
export interface PresentedChartTable {
	readonly caption?: string;
	readonly display: 'inline' | 'disclosure';
	readonly summary: string;
	readonly rowHeading: string;
	readonly columns: readonly { readonly id: string; readonly label: string }[];
	readonly rows: readonly {
		readonly id: string;
		readonly label: string;
		readonly cells: readonly { readonly id: string; readonly value: string }[];
	}[];
}
