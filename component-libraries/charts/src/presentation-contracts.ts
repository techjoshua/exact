import type { IntlMeasurementPresentation } from '@exactjs/intl';
import type { ChartGeometryDomain } from './geometry.js';
import type { ChartLayout } from './layout.js';

/** One localized axis tick ready for direct SVG rendering. */
export interface PresentedTick {
	readonly id: string;
	readonly value: string;
	readonly x: number;
	readonly y: number;
}

/** One category tick ready for direct SVG rendering. */
export interface PresentedCategory {
	readonly id: string;
	readonly value: string;
	readonly x: number;
	readonly y: number;
}

/** One accessible focusable datum mark. */
export interface PresentedPoint {
	readonly id: string;
	readonly index: number;
	readonly x: number;
	readonly y: number;
	readonly label: string;
	readonly description?: string;
	readonly seriesId: string;
	readonly descriptionId?: string;
}

/** One line or area series ready for direct SVG rendering. */
export interface PresentedLine {
	readonly id: string;
	readonly labelId: string;
	readonly color: string;
	readonly path: string;
	readonly area?: string;
	readonly points: readonly PresentedPoint[];
	readonly pattern: number;
}

/** One vertical or horizontal bar ready for direct SVG rendering. */
export interface PresentedBar {
	readonly id: string;
	readonly index: number;
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	readonly color: string;
	readonly label: string;
	readonly description?: string;
	readonly seriesId: string;
	readonly pattern: number;
	readonly descriptionId?: string;
}

/** One range and marker ready for direct SVG rendering. */
export interface PresentedRange {
	readonly id: string;
	readonly index: number;
	readonly x1: number;
	readonly x2: number;
	readonly marker: number;
	readonly y: number;
	readonly color: string;
	readonly label: string;
	readonly description?: string;
	readonly seriesId: string;
	readonly marks: readonly PresentedRangeMark[];
	readonly descriptionId?: string;
}

/** One named statistic positioned inside a range datum. */
export interface PresentedRangeMark {
	readonly id: string;
	readonly x: number;
	readonly name: string;
	readonly value: string;
}

/** One semantic data-table row mirroring a visual datum. */
export interface PresentedRow {
	readonly id: string;
	readonly series: string;
	readonly category: string;
	readonly value: string;
	readonly description?: string;
}

/** Shared interaction coordinate for one focusable mark. */
export interface PresentedMark {
	readonly id: string;
	readonly index: number;
	readonly x: number;
	readonly y: number;
	readonly label: string;
	readonly description?: string;
	readonly seriesId: string;
	readonly descriptionId?: string;
}

/** One visual and semantic legend item. */
export interface PresentedLegendItem {
	readonly id: string;
	readonly label: string;
	readonly color: string;
	readonly pattern: number;
	readonly hidden: boolean;
}

/** One canonical axis label projected from authored or compact input. */
export interface PresentedAxisLabel {
	readonly id: string;
	readonly position: 'top' | 'right' | 'bottom' | 'left';
	readonly value: string;
}

/** Immutable output of one chart-owned reactive presentation computation. */
export interface ChartPresentation {
	readonly orientation: 'vertical' | 'horizontal';
	readonly layout: ChartLayout;
	readonly domain: ChartGeometryDomain;
	readonly measurement?: IntlMeasurementPresentation;
	readonly ticks: readonly PresentedTick[];
	readonly categories: readonly PresentedCategory[];
	readonly lines: readonly PresentedLine[];
	readonly bars: readonly PresentedBar[];
	readonly ranges: readonly PresentedRange[];
	readonly marks: readonly PresentedMark[];
	readonly rows: readonly PresentedRow[];
	readonly legend: readonly PresentedLegendItem[];
	readonly axisLabels: readonly PresentedAxisLabel[];
}
