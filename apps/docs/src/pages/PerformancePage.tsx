import { Chart, Legend, type ChartSeriesInput } from '@exactjs/charts';
import type { Component } from '@exactjs/core';
import reportJson from '../data/performance-report.json' with { type: 'json' };
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

interface DistributionStatistics {
	readonly mean: number;
	readonly p50: number;
	readonly p75: number;
	readonly p95: number;
	readonly p99: number;
}

interface DistributionChart {
	readonly title: string;
	readonly unit: string;
	readonly precision: number;
	readonly comment: string;
	readonly series: readonly {
		readonly name: string;
		readonly stats: DistributionStatistics;
	}[];
}

interface ValueChart {
	readonly title: string;
	readonly unit: string;
	readonly precision: number;
	readonly comment: string;
	readonly values: readonly {
		readonly name: string;
		readonly value: number;
	}[];
}

const report = reportJson as unknown as {
	readonly metadata: {
		readonly commit: string;
		readonly createdAt: string;
		readonly browserSamples: number;
		readonly startupSamples: number;
		readonly ssrSamples: number;
	};
	readonly summary: readonly {
		readonly label: string;
		readonly value: string;
		readonly context: string;
	}[];
	readonly browserCharts: readonly DistributionChart[];
	readonly clientFootprint: readonly ValueChart[];
	readonly server: {
		readonly ordinary: DistributionChart;
		readonly sequential: DistributionChart;
		readonly saturationCharts: readonly DistributionChart[];
		readonly equalPayloadCharts: readonly DistributionChart[];
		readonly renderOnly: DistributionChart;
		readonly retention: DistributionChart;
		readonly bars: readonly ValueChart[];
		readonly responseComposition: {
			readonly title: string;
			readonly unit: string;
			readonly categories: readonly string[];
			readonly series: readonly { readonly name: string; readonly values: readonly number[] }[];
			readonly comment: string;
		};
	};
	readonly diagnostics: {
		readonly bun: DistributionChart;
		readonly preloaded: DistributionChart;
		readonly excluded: readonly string[];
	};
};

/** Presents the latest admitted performance evidence without rerunning or renormalizing it. */
export function PerformancePage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Accepted performance evidence"
			title="Browser experience and server capacity"
			description="Decision-useful current results from the balanced framework comparison, including arithmetic means and distribution percentiles."
			previous={{ path: '/framework-comparison', label: 'Read the benchmark methodology' }}
			next={{ path: '/components/charts', label: 'Explore the chart components' }}
		>
			<section className="performance-summary" aria-label="Current Exact highlights">
				{report.summary.map((item) => (
					<div theme:surface="raised" className="performance-summary__item" key={item.label}>
						<span>{item.label}</span>
						<strong>{item.value}</strong>
						<small>{item.context}</small>
					</div>
				))}
			</section>

			<Callout title="How to read these charts">
				<p>
					The horizontal range spans P50 through P99. Its primary marker is the arithmetic mean; P75
					and P95 are retained as named marks. The table below every chart gives the exact current
					values without expanding each percentile into a separate metric row. Historical and
					control-normalized comparisons remain part of the internal engineering evidence rather
					than this public framework comparison.
				</p>
			</Callout>

			<MetricSection title="Browser experience" charts={report.browserCharts} />
			<ValueSection title="Client footprint diagnostics" charts={report.clientFootprint} />
			<MetricSection
				title="Node SSR capacity"
				charts={[
					report.server.ordinary,
					...report.server.saturationCharts,
					...report.server.equalPayloadCharts
				]}
			/>
			<MetricSection
				title="Server latency and memory diagnostics"
				charts={[report.server.sequential, report.server.renderOnly, report.server.retention]}
			/>
			<ValueSection title="Server payload and allocation" charts={report.server.bars} />
			<ResponseComposition />

			<section>
				<h2>Diagnostic lanes</h2>
				<p>
					Preloaded rendering removes normal task and data-readiness work, while Bun participants
					use different HTTP paths. They help attribute costs but are not overall framework
					rankings.
				</p>
				<Distribution figure={report.diagnostics.preloaded} index={100} />
				<Distribution figure={report.diagnostics.bun} index={101} />
				<ul>
					{report.diagnostics.excluded.map((reason) => (
						<li key={reason}>{reason}</li>
					))}
				</ul>
			</section>

			<p className="performance-evidence-note">
				Evidence commit <code>{report.metadata.commit}</code>, captured{' '}
				<time dateTime={report.metadata.createdAt}>{report.metadata.createdAt}</time>. Browser,
				startup, and SSR populations contain {report.metadata.browserSamples},{' '}
				{report.metadata.startupSamples}, and {report.metadata.ssrSamples} balanced samples.
			</p>
		</Article>
	);
}

function MetricSection(
	this: Component<{}>,
	props: { readonly title: string; readonly charts: readonly DistributionChart[] }
) {
	return () => (
		<section>
			<h2>{props.title}</h2>
			<div className="performance-chart-grid">
				{props.charts.map((figure, index) => (
					<Distribution figure={figure} index={index} />
				))}
			</div>
		</section>
	);
}

function ValueSection(
	this: Component<{}>,
	props: { readonly title: string; readonly charts: readonly ValueChart[] }
) {
	return () => (
		<section>
			<h2>{props.title}</h2>
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
				title={props.figure.title}
				description={props.figure.comment}
				axes={[
					{ id: 'framework', position: 'left', scale: 'category' },
					{ id: 'value', position: 'bottom', scale: 'linear', label: props.figure.unit }
				]}
				series={distributionSeries(props.figure)}
			>
				<Legend />
			</Chart>
			<DistributionTable figure={props.figure} />
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
				title={props.figure.title}
				description={props.figure.comment}
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
				<thead>
					<tr>
						<th>Framework</th>
						<th>Mean</th>
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

function ResponseComposition(this: Component<{}>) {
	const figure = report.server.responseComposition;
	return () => (
		<section>
			<Chart
				type="stacked-bar"
				id="performance-response-composition"
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
				value: series.stats.mean,
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
