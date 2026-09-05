import { createContext } from '@exactjs/core';
import type { ChartProps } from './contracts.js';
import type {
	ChartAxisRegistration,
	ChartDatumRegistration,
	ChartModel,
	ChartSeriesRegistration
} from './model.js';

/** Chart-local ownership shared by declarative registration components. */
export interface ChartCoordinator {
	readonly id: string;
	readonly props: ChartProps;
	readonly model: ChartModel;
	changed(): void;
	readonly revision: number;
}

/** Nearest axis registration receiving its authored label. */
export interface ChartAxisOwner {
	readonly chart: ChartCoordinator;
	readonly registration: ChartAxisRegistration;
}

/** Nearest series registration receiving data and its authored label. */
export interface ChartSeriesOwner {
	readonly chart: ChartCoordinator;
	readonly registration: ChartSeriesRegistration;
}

/** Nearest datum registration receiving authored label and description ranges. */
export interface ChartDatumOwner {
	readonly chart: ChartCoordinator;
	readonly registration: ChartDatumRegistration;
}

/** Shares one chart's instance-owned coordinator with declarative descendants. */
export const ChartContext = createContext<ChartCoordinator>('@exactjs/charts.chart/1', {
	global: true,
	reactive: false,
	keep: 'shared'
});

/** Shares the nearest axis registration with its authored label. */
export const ChartAxisContext = createContext<ChartAxisOwner>('@exactjs/charts.axis/1', {
	global: true,
	reactive: false,
	keep: 'shared'
});

/** Shares the nearest series registration with datum and label descendants. */
export const ChartSeriesContext = createContext<ChartSeriesOwner>('@exactjs/charts.series/1', {
	global: true,
	reactive: false,
	keep: 'shared'
});

/** Shares the nearest datum registration with its label and description descendants. */
export const ChartDatumContext = createContext<ChartDatumOwner>('@exactjs/charts.datum/1', {
	global: true,
	reactive: false,
	keep: 'shared'
});
