import { Chart, Legend, type ChartTableOptions, type ChartSeriesInput } from '@exactjs/charts';
import type { Component } from '@exactjs/core';
import type {
	DistributionChart,
	ValueChart,
	ResponseCompositionChart
} from '../data/performance-report-types.js';
import {
	performanceMetricTitle,
	performanceMetricDescription
} from './performance-metric-labels.js';

/** Groups distribution charts with their shared measurement explanation. */
export function MetricSection(
	this: Component<{}>,
	props: {
		readonly title: string;
		readonly id?: string;
		readonly description?: string;
		readonly charts: readonly DistributionChart[];
	}
) {
	return () => (
		<section id={props.id} tabindex="-1">
			<h2>{props.title}</h2>
			{props.description ? <p>{props.description}</p> : null}
			<div className="performance-chart-grid">
				{props.charts.map((figure, index) => (
					<Distribution figure={figure} index={index} />
				))}
			</div>
		</section>
	);
}

/** Groups scalar measurements with their units and workload description. */
export function ValueSection(
	this: Component<{}>,
	props: {
		readonly title: string;
		readonly id?: string;
		readonly description?: string;
		readonly charts: readonly ValueChart[];
	}
) {
	return () => (
		<section id={props.id} tabindex="-1">
			<h2>{props.title}</h2>
			{props.description ? <p>{props.description}</p> : null}
			<div className="performance-chart-grid">
				{props.charts.map((figure, index) => (
					<Values figure={figure} index={index} />
				))}
			</div>
		</section>
	);
}

function Distribution(
	this: Component<{}>,
	props: { readonly figure: DistributionChart; readonly index: number }
) {
	const id = chartId(props.figure.title, props.index);
	return () => (
		<div theme:surface="raised" className="performance-chart-card">
			<Chart
				type="range"
				id={id}
				title={performanceMetricTitle(props.figure.title)}
				description={performanceMetricDescription(props.figure.title, props.figure.comment)}
				axes={[
					{ id: 'framework', position: 'left', scale: 'category' },
					{ id: 'value', position: 'bottom', scale: 'linear', label: props.figure.unit }
				]}
				series={distributionSeries(props.figure)}
				table={distributionTable(props.figure)}
			>
				<Legend />
			</Chart>
		</div>
	);
}

function Values(
	this: Component<{}>,
	props: { readonly figure: ValueChart; readonly index: number }
) {
	return () => (
		<div theme:surface="raised" className="performance-chart-card">
			<Chart
				type="bar"
				id={chartId(props.figure.title, props.index)}
				title={performanceMetricTitle(props.figure.title)}
				description={performanceMetricDescription(props.figure.title, props.figure.comment)}
				axes={[
					{ id: 'framework', position: 'bottom', scale: 'category' },
					{ id: 'value', position: 'left', scale: 'linear', label: props.figure.unit }
				]}
				table={{
					layout: 'values',
					rowHeading: 'Framework',
					caption: `${performanceMetricTitle(props.figure.title)} (${props.figure.unit})`,
					columns: [{ label: props.figure.unit, field: 'value' }],
					numberFormat: { maximumFractionDigits: 2 }
				}}
				series={[
					{
						id: 'value',
						label: props.figure.title,
						xAxis: 'framework',
						yAxis: 'value',
						data: props.figure.values.map((item) => ({
							id: chartId(item.name, 0),
							label: item.name,
							x: item.name,
							value: item.value
						}))
					}
				]}
			/>
		</div>
	);
}

/** Names statistics explicitly so the chart never guesses what a range endpoint represents. @exact pure */
function distributionTable(figure: DistributionChart): ChartTableOptions {
	const aggregate = figure.series[0]?.aggregate !== undefined;
	return {
		layout: 'values',
		rowLabel: 'series',
		rowHeading: 'Framework',
		caption: `${performanceMetricTitle(figure.title)} (${figure.unit})`,
		summary: 'View values and percentiles',
		numberFormat: { maximumFractionDigits: figure.precision },
		columns: [
			...(aggregate ? [{ label: 'Aggregate', field: 'value' as const }] : []),
			{
				label: aggregate ? 'Window mean' : 'Mean',
				field: aggregate ? { statistic: 'mean' } : 'value'
			},
			{ label: 'P50', field: 'minimum' },
			{ label: 'P75', field: { mark: 'P75' } },
			{ label: 'P95', field: { mark: 'P95' } },
			{ label: 'P99', field: 'maximum' }
		]
	};
}

/** Compares the bytes contributed by each part of a rendered response. */
export function ResponseComposition(
	this: Component<{}>,
	props: { readonly figure: ResponseCompositionChart; readonly runtimeId: string }
) {
	const figure = props.figure;
	return () => (
		<section>
			<Chart
				type="stacked-bar"
				id={`performance-response-composition-${props.runtimeId}`}
				title={figure.title}
				description={figure.comment}
				axes={[
					{ id: 'part', position: 'bottom', scale: 'category' },
					{ id: 'bytes', position: 'left', scale: 'linear', label: figure.unit }
				]}
				table={{
					layout: 'series',
					rowHeading: 'Framework',
					caption: `${figure.title} (${figure.unit})`,
					numberFormat: { maximumFractionDigits: 0 },
					total: { label: 'Total' }
				}}
				series={figure.series.map((series) => ({
					id: chartId(series.name, 0),
					label: series.name,
					xAxis: 'part',
					yAxis: 'bytes',
					data: figure.categories.map((category, index) => ({
						id: chartId(category, index),
						label: category,
						x: category,
						value: series.values[index] ?? 0,
						defined: series.values[index] !== undefined
					}))
				}))}
			>
				<Legend />
			</Chart>
		</section>
	);
}

/** Converts one admitted distribution to compact chart inputs without changing its statistics. @exact pure */
function distributionSeries(figure: DistributionChart): readonly ChartSeriesInput[] {
	return figure.series.map((series) => ({
		id: chartId(series.name, 0),
		label: series.name,
		xAxis: 'framework',
		yAxis: 'value',
		data: [
			{
				id: 'distribution',
				label: series.name,
				x: series.name,
				value: series.aggregate ?? series.stats.mean,
				minimum: series.stats.p50,
				maximum: series.stats.p99,
				marks: { P75: series.stats.p75, P95: series.stats.p95 },
				statistics: { mean: series.stats.mean }
			}
		]
	}));
}

/** Produces a stable authored DOM token from one report label. @exact pure */
function chartId(value: string, index: number): string {
	return `${value.toLowerCase().replace(/[^a-z0-9]+/gu, '-')}-${index}`;
}
