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
	readonly server: {
		readonly ordinary: DistributionChart;
		readonly sequential: DistributionChart;
		readonly saturationCharts: readonly DistributionChart[];
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

			<MetricSection
				title="Browser experience"
				description="In this application, eXact combines the fastest mean navigation with 1.51 ms mean optimistic feedback. First paint is competitive across the group. Its 2.50 MB warm post-GC heap is higher than React, SvelteKit, and Nuxt, but lower than TanStack Start. A focused eXact-versus-React heap snapshot attributes 205 KB, or 79%, of its 260 KB self-byte difference to V8 code nodes associated with eXact's larger compiled-function population. eXact's dominant retained bundle script/source entry was actually about 3 KB smaller than React's; ordinary arrays, object shapes, objects, and closures accounted for the much smaller remainder."
				charts={report.browserCharts}
			/>
			<section>
				<h2>Node SSR capacity</h2>
				<p>
					The application-level lane measures complete responses at concurrency 16. Exact and React
					are effectively tied there: Exact records 2,065 mean requests per second and React records
					2,024. Across the sustained scaling curve, React leads by less than 2% at concurrency 1
					through 8; Exact reaches parity at 16 and leads the measured means by 1.2% at 32 and 2.8%
					at 64. Higher throughput is better, and differences this small should be read as practical
					parity on this machine rather than a universal ranking.
				</p>
				<div className="performance-chart-grid">
					<Distribution figure={report.server.ordinary} index={50} />
					<SaturationChart />
				</div>
			</section>
			<MetricSection
				title="Server response time and memory"
				description="React has the lowest mean warm sequential response time at 1.25 ms, followed by eXact at 1.43 ms. Under the bounded post-GC retention run, eXact has the lowest absolute Node heap at 12.67 MB—about 0.63 MB below React and substantially below the full-stack participants."
				charts={[report.server.sequential, report.server.retention]}
			/>
			<ValueSection
				title="Response payload"
				description="The eXact response is 3,710 bytes: 326 bytes larger than React, but smaller than SvelteKit, Nuxt, and TanStack Start. The composition chart shows that the remaining gap to React comes from framework markers, identity attributes, and hydration data rather than application markup."
				charts={report.server.bars}
			/>
			<ResponseComposition />

			<p className="performance-evidence-note">
				Evidence commit <code>{report.metadata.commit}</code>, captured{' '}
				<time dateTime={report.metadata.createdAt}>{report.metadata.createdAt}</time>. Browser,
				startup, and SSR populations contain {report.metadata.browserSamples},{' '}
				{report.metadata.startupSamples} per CPU rate, and {report.metadata.ssrSamples} balanced
				samples or sustained windows.
			</p>
		</Article>
	);
}

function SaturationChart(this: Component<{}>) {
	const figures = report.server.saturationCharts;
	const first = figures[0];
	const series = (first?.series ?? []).map((framework) => ({
		id: chartId(framework.name, 0),
		label: framework.name,
		xAxis: 'concurrency',
		yAxis: 'throughput',
		data: figures.flatMap((figure) => {
			const current = figure.series.find((candidate) => candidate.name === framework.name);
			if (!current) return [];
			const concurrency = figure.title.match(/(\d+)$/u)?.[1] ?? '?';
			return [
				{
					id: `c${concurrency}`,
					label: `Concurrency ${concurrency}`,
					x: concurrency,
					value: current.stats.mean,
					description: distributionDescription(framework.name, current.stats, figure.precision)
				}
			];
		})
	}));
	return () => (
		<div theme:surface="raised" className="performance-chart-card">
			<Chart
				type="line"
				id="performance-node-throughput-scaling"
				title="Sustained Node throughput by concurrency"
				description="Mean requests per second at each concurrency level. Hover or focus a point for the full distribution."
				motion
				axes={[
					{ id: 'concurrency', position: 'bottom', scale: 'category', label: 'Concurrency' },
					{ id: 'throughput', position: 'left', scale: 'linear', label: 'Requests/s' }
				]}
				series={series}
			>
				<Legend />
			</Chart>
		</div>
	);
}

function MetricSection(
	this: Component<{}>,
	props: {
		readonly title: string;
		readonly description?: string;
		readonly charts: readonly DistributionChart[];
	}
) {
	return () => (
		<section>
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

function ValueSection(
	this: Component<{}>,
	props: {
		readonly title: string;
		readonly description?: string;
		readonly charts: readonly ValueChart[];
	}
) {
	return () => (
		<section>
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

/** Formats the complete admitted distribution for pointer and keyboard inspection. @exact pure */
function distributionDescription(
	framework: string,
	stats: DistributionStatistics,
	precision: number
): string {
	return `${framework}. Mean ${formatMetric(stats.mean, precision)}; P50 ${formatMetric(stats.p50, precision)}; P75 ${formatMetric(stats.p75, precision)}; P95 ${formatMetric(stats.p95, precision)}; P99 ${formatMetric(stats.p99, precision)} requests/s.`;
}
