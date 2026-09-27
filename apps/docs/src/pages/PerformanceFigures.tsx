import { Chart, Legend, type ChartSeriesInput } from '@exactjs/charts';
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
				dataView={
					<details>
						<summary>View values and percentiles</summary>
						<DistributionTable figure={props.figure} />
					</details>
				}
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

function DistributionTable(this: Component<{}>, props: { readonly figure: DistributionChart }) {
	return () => (
		<div className="performance-table-scroll">
			<table>
				<caption>
					{performanceMetricTitle(props.figure.title)} ({props.figure.unit})
				</caption>
				<thead>
					<tr>
						<th>Framework</th>
						{props.figure.series[0]?.aggregate !== undefined ? <th>Aggregate</th> : null}
						<th>{props.figure.series[0]?.aggregate !== undefined ? 'Window mean' : 'Mean'}</th>
						<th>P50</th>
						<th>P75</th>
						<th>P95</th>
						<th>P99</th>
					</tr>
				</thead>
				<tbody>
					{props.figure.series.map((series) => (
						<tr key={series.name}>
							<th>{series.name}</th>
							{series.aggregate !== undefined ? (
								<td>{formatMetric(series.aggregate, props.figure.precision)}</td>
							) : null}
							{(['mean', 'p50', 'p75', 'p95', 'p99'] as const).map((key) => (
								<td key={key}>{formatMetric(series.stats[key], props.figure.precision)}</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
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
				series={figure.series.map((series) => ({
					id: chartId(series.name, 0),
					label: series.name,
					xAxis: 'part',
					yAxis: 'bytes',
					data: figure.categories.map((category, index) => ({
						id: chartId(category, index),
						label: category,
						x: category,
						value: series.values[index] ?? 0
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
				marks: { P75: series.stats.p75, P95: series.stats.p95 }
			}
		]
	}));
}

/** Produces a stable authored DOM token from one report label. @exact pure */
function chartId(value: string, index: number): string {
	return `${value.toLowerCase().replace(/[^a-z0-9]+/gu, '-')}-${index}`;
}

/** Formats admitted display values without changing the report's fixed units. @exact pure */
function formatMetric(value: number, precision: number): string {
	return new Intl.NumberFormat('en-US', { maximumFractionDigits: precision }).format(value);
}
