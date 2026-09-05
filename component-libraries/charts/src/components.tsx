import { createRef, peek, reserveElementId, type Child, type Component } from '@exactjs/core';
import { IntlScalarPresentationContext, type IntlScalarPresentation } from '@exactjs/intl';
import type {
	AxisProps,
	ChartContentProps,
	ChartProps,
	DataProps,
	LegendProps,
	SeriesProps
} from './contracts.js';
import {
	ChartAxisContext,
	ChartContext,
	ChartDatumContext,
	ChartSeriesContext,
	type ChartCoordinator
} from './contexts.js';
import { ChartModel, type ChartAxisRegistration, type ChartDatumRegistration } from './model.js';
import { ChartPlot } from './plot.js';

const chartRoot = createRef<HTMLElement>('chart root');

/** Owns one semantic chart figure and its component-local registration model. */
export function Chart(this: Component<{}>, props: ChartProps) {
	const root = this.ref(chartRoot);
	const id = peek(() => props.id ?? reserveElementId(root));
	const model = new ChartModel();
	seedChartModel(model, id, props);
	const coordinator: ChartCoordinator = Object.freeze({
		id,
		props,
		model,
		changed: () => model.changed(),
		get revision() {
			return model.revision;
		}
	});
	this.setContext(ChartContext, coordinator);
	return () => (
		<figure
			id={id}
			ref={root}
			className={joinClasses('exact-chart', props.className)}
			aria-labelledby={`${id}-title`}
			aria-describedby={props.description || props.children ? `${id}-description` : undefined}
		>
			{props.title && (
				<figcaption id={`${id}-title`} className="exact-chart__title">
					{props.title}
				</figcaption>
			)}
			{props.description && (
				<p id={`${id}-description`} className="exact-chart__description">
					{props.description}
				</p>
			)}
			<div className="exact-chart__declarations">{props.children}</div>
			<ChartPlot />
		</figure>
	);
}

/** Renders the authored chart caption in its canonical owned range. */
export function ChartTitle(this: Component<{}>, props: ChartContentProps) {
	const chart = this.getContext(ChartContext);
	return () => (
		<figcaption id={`${chart.id}-title`} className="exact-chart__title">
			{props.children}
		</figcaption>
	);
}

/** Renders the authored chart description for visual and assistive use. */
export function ChartDescription(this: Component<{}>, props: ChartContentProps) {
	const chart = this.getContext(ChartContext);
	return () => (
		<p id={`${chart.id}-description`} className="exact-chart__description">
			{props.children}
		</p>
	);
}

/** Registers one chart-local axis and provides ownership to its label. */
export function Axis(this: Component<{}>, props: AxisProps) {
	const chart = this.getContext(ChartContext);
	const registration: ChartAxisRegistration = { props };
	chart.model.registerAxis(registration);
	this.setContext(ChartAxisContext, { chart, registration });
	this.onUnmount(({ reason }) => {
		if (shouldReleaseChartRegistration(reason)) chart.model.unregisterAxis(registration);
	});
	return () => props.children;
}

/** Publishes one authored axis label and its optional intl scalar presentation. */
export function AxisLabel(
	this: Component<{ presentation?: IntlScalarPresentation }>,
	props: ChartContentProps
) {
	const owner = this.getContext(ChartAxisContext);
	owner.registration.label = this.state;
	this.setContext(IntlScalarPresentationContext, this.state);
	return () => (
		<span
			id={`${owner.chart.id}-axis-${safeId(owner.registration.props.id)}-label`}
			className={`exact-chart__axis-label exact-chart__axis-label--${owner.registration.props.position}`}
		>
			{props.children}
		</span>
	);
}

/** Registers one stable series and provides datum ownership to its descendants. */
export function Series(this: Component<{}>, props: SeriesProps) {
	const chart = this.getContext(ChartContext);
	const registration = peek(() => ({
		chartId: chart.id,
		props,
		data: new Map<string, ChartDatumRegistration>()
	}));
	chart.model.registerSeries(registration);
	this.setContext(ChartSeriesContext, { chart, registration });
	this.onUnmount(({ reason }) => {
		if (shouldReleaseChartRegistration(reason)) chart.model.unregisterSeries(registration);
	});
	return () => props.children;
}

/** Renders the canonical series label and publishes its scalar presentation when selected. */
export function SeriesLabel(
	this: Component<{ presentation?: IntlScalarPresentation }>,
	props: ChartContentProps
) {
	const owner = this.getContext(ChartSeriesContext);
	owner.registration.label = this.state;
	this.setContext(IntlScalarPresentationContext, this.state);
	return () => (
		<span
			id={`${owner.chart.id}-series-${safeId(owner.registration.props.id)}-label`}
			className="exact-chart__assistive"
		>
			{props.children}
		</span>
	);
}

/** Registers one stable value with its nearest series owner. */
export function Data(this: Component<{}>, props: DataProps) {
	const series = this.getContext(ChartSeriesContext);
	const registration: ChartDatumRegistration = { props };
	series.chart.model.registerDatum(series.registration.props.id, registration);
	this.setContext(ChartDatumContext, { chart: series.chart, registration });
	this.onUnmount(({ reason }) => {
		if (shouldReleaseChartRegistration(reason))
			series.chart.model.unregisterDatum(series.registration.props.id, registration);
	});
	return () => props.children;
}

/** Publishes one authored datum label for tooltip and data-view reuse. */
export function DataLabel(
	this: Component<{ presentation?: IntlScalarPresentation }>,
	props: ChartContentProps
) {
	const owner = this.getContext(ChartDatumContext);
	owner.registration.label = this.state;
	this.setContext(IntlScalarPresentationContext, this.state);
	return () => (
		<span
			id={`${owner.chart.id}-datum-${safeId(owner.registration.props.id)}-label`}
			className="exact-chart__assistive"
		>
			{props.children}
		</span>
	);
}

/** Publishes one authored datum description for tooltip and assistive reuse. */
export function DataDescription(
	this: Component<{ presentation?: IntlScalarPresentation }>,
	props: ChartContentProps
) {
	const owner = this.getContext(ChartDatumContext);
	owner.registration.description = this.state;
	this.setContext(IntlScalarPresentationContext, this.state);
	return () => (
		<span
			id={`${owner.chart.id}-datum-${safeId(owner.registration.props.id)}-description`}
			className="exact-chart__assistive"
		>
			{props.children}
		</span>
	);
}

/** Requests visible series labels without owning a second label representation. */
export function Legend(this: Component<{}>, props: LegendProps) {
	const chart = this.getContext(ChartContext);
	chart.model.requestLegend(props);
	this.onUnmount(({ reason }) => {
		if (shouldReleaseChartRegistration(reason)) chart.model.releaseLegend(props);
	});
	return () => null;
}

function safeId(value: string): string {
	return value.replace(/[^A-Za-z0-9_-]+/gu, '-');
}

function joinClasses(...values: readonly (string | undefined)[]): string {
	return values.filter(Boolean).join(' ');
}

/** Populates one freshly created request or instance-owned model. @exact pure */
function seedChartModel(model: ChartModel, id: string, props: ChartProps): void {
	model.seed(id, props.axes, props.series);
}

/**
 * Keeps setup-only declarations visible to later siblings during one synchronous SSR traversal.
 * Their request-owned model becomes unreachable with the Chart frame; durable client removals
 * still release immediately through the ordinary structural lifecycle.
 */
function shouldReleaseChartRegistration(reason: string | undefined): boolean {
	return reason !== 'ssr render complete';
}

/** Public child type retained for generated declaration readability. */
export type ChartChild = Child;
