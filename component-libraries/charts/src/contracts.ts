import type { Child } from '@exactjs/core';
import type { IntlMeasurementPresentationRequest } from '@exactjs/intl';

/** Chart families supported by the native Cartesian renderer. */
export type ChartType = 'line' | 'area' | 'bar' | 'horizontal-bar' | 'stacked-bar' | 'range';

/** Values accepted as one Cartesian coordinate. */
export type ChartCoordinate = number | string | Date;

/** Common chart dimensions expressed in SVG user units. */
export interface ChartDimensions {
	readonly width?: number;
	readonly height?: number;
	readonly padding?: number;
}

/** Props for the chart-owned semantic figure and plot. */
export interface ChartProps extends ChartDimensions {
	readonly id?: string;
	readonly type: ChartType;
	readonly className?: string;
	readonly title?: string;
	readonly description?: string;
	/** Fades tooltip visibility through theme motion tokens; reduced-motion themes remain immediate. */
	readonly motion?: boolean;
	/** Compact already-localized axis declarations for data-first callers. */
	readonly axes?: readonly ChartAxisInput[];
	/** Compact already-localized series normalized into the same chart-local model as children. */
	readonly series?: readonly ChartSeriesInput[];
	readonly children?: Child | readonly Child[];
}

/** Public axis scale families. */
export type ChartScale = 'linear' | 'category' | 'time';

/** Props registering one chart-local axis. */
export interface AxisProps {
	readonly id: string;
	readonly position: 'top' | 'right' | 'bottom' | 'left';
	readonly scale?: ChartScale;
	readonly domain?: readonly [number, number];
	readonly tickCount?: number;
	readonly measurement?: Omit<IntlMeasurementPresentationRequest, 'values'>;
	readonly children?: Child | readonly Child[];
}

/** Serializable compact axis input equivalent to one declarative Axis registration. */
export type ChartAxisInput = Omit<AxisProps, 'children'> & { readonly label?: string };

/** Props registering one stable data series. */
export interface SeriesProps {
	readonly id: string;
	readonly name?: string;
	readonly xAxis?: string;
	readonly yAxis?: string;
	readonly color?: string;
	readonly children?: Child | readonly Child[];
}

/** Serializable compact series input equivalent to Series and Data registrations. */
export type ChartSeriesInput = Omit<SeriesProps, 'children'> & {
	readonly label?: string;
	readonly data: readonly ChartDataInput[];
};

/** Props registering one stable datum. */
export interface DataProps {
	readonly id: string;
	/** Already-localized compact label used when no scalar intl projection is active. */
	readonly label?: string;
	readonly x: ChartCoordinate;
	readonly value: number;
	/** Creates an explicit line/area gap while retaining datum identity and table semantics. */
	readonly defined?: boolean;
	readonly minimum?: number;
	readonly maximum?: number;
	readonly marks?: Readonly<Record<string, number>>;
	readonly description?: string;
	readonly children?: Child | readonly Child[];
}

/** Serializable compact datum input equivalent to one Data registration. */
export type ChartDataInput = Omit<DataProps, 'children'>;

/** Props for chart-owned authored content regions. */
export interface ChartContentProps {
	readonly children?: Child | readonly Child[];
}

/** Props controlling the visual legend region. */
export interface LegendProps {
	readonly position?: 'top' | 'right' | 'bottom' | 'left';
	readonly label?: string;
	/** Adds keyboard-operable visibility controls while retaining the data table. */
	readonly interactive?: boolean;
}
