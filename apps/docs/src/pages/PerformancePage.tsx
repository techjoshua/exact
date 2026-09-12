import streamReport from '../data/ssr-stream-report.json' with { type: 'json' };
import { Chart, Legend, type ChartSeriesInput } from '@exactjs/charts';
import type { Component } from '@exactjs/core';
import reportJson from '../data/performance-report.json' with { type: 'json' };
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';
import { HeapComposition } from './HeapComposition.jsx';
import { SsrCapacity, ssrCapacityHighlights } from './SsrCapacity.jsx';

import type {
	DistributionChart,
	ValueChart,
	ResponseCompositionChart,
	PerformanceReport
} from '../data/performance-report-types.js';

const report = reportJson as unknown as PerformanceReport;

/** Presents the latest admitted performance evidence without rerunning or renormalizing it. */
export function PerformancePage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Accepted performance evidence"
			title="Browser experience and server capacity"
			description="Recorded results from the balanced framework comparison, including aggregate server throughput, arithmetic means, and distribution percentiles."
			previous={{ path: '/framework-comparison', label: 'Read the benchmark methodology' }}
			next={{ path: '/components/charts', label: 'Explore the chart components' }}
		>
			<Callout title="Rendering API scope">
				<p>
					String and streaming API results use separate charts. Each framework renders its complete
					application document and hydration data. Browser measurements use string rendering. The
					streaming lane includes eXact, React, and TanStack Start; the current Nuxt and SvelteKit
					document paths do not expose an equivalent streaming API.
				</p>
				<p>
					These complete-response charts predate eXact's shared renderer, early shell delivery, and
					later SSR optimizations. New optimizations appear here after a full benchmark capture.
				</p>
			</Callout>
			<section className="performance-summary" aria-label="Current Exact highlights">
				{[
					...ssrCapacityHighlights,
					...report.summary.filter((item) => !item.label.includes('RPS'))
				].map((item) => (
					<div theme:surface="raised" className="performance-summary__item" key={item.label}>
						<span>{item.label}</span>
						<strong>{item.value}</strong>
						<small>{item.context}</small>
					</div>
				))}
			</section>

			<Callout title="How to read these charts">
				<p>
					The horizontal range spans P50 through P99, with P75 and P95 as named marks. The
					throughput charts below use separate sustained captures and report total valid responses
					divided by elapsed time, including drain. Distribution charts use the arithmetic mean as
					their primary marker. The tables give exact values without expanding each percentile into
					a separate metric row. Historical and control-normalized comparisons remain part of the
					internal engineering evidence rather than this public framework comparison.
				</p>
			</Callout>

			<MetricSection
				title="Browser experience"
				description="Captured production pages and assets are reused over HTTP, with framework servers stopped. Each interleaved sample uses a fresh cache-disabled context in a warm browser process. Navigation completion measures time until the browser's load event. The eXact app defers document hydration, so this event does not mean hydration has finished. Actions and live updates still use the shared service. Post-GC heap includes V8 code and metadata."
				charts={report.browserCharts}
			/>
			<HeapComposition />
			<SsrCapacity />
			<MetricSection
				title={`Server response time and memory: Node ${report.metadata.ssrDiagnosticsEnvironment.runtimes.node}, string API`}
				description="Burst completion time measures how long all 16 requests take to finish, without replacements. Warm sequential latency measures one complete response at a time. The bounded retention run measures absolute Node heap after garbage collection; it is distinct from the amount allocated while handling requests."
				charts={[report.server.burst, report.server.sequential, report.server.retention]}
			/>
			<p>
				Sequential results include the runtime's HTTP client behavior. See
				<a href="#/runtimes">runtime compatibility notes</a> for the Node 26.8.1 idle-socket timer
				delay reproduced on this Windows host.
			</p>
			<MetricSection
				title={`Server response time and memory: Bun ${report.server.bun.runtime}, string API`}
				description="The same five-framework workload runs on Bun. All five participants use native Bun.serve: eXact's Bun adapter, React's string renderer, SvelteKit's Bun adapter, and Nitro's Bun preset for Nuxt and TanStack Start. Heap measurements cover JavaScriptCore, so they are not directly comparable to Node's V8 heap accounting."
				charts={[
					report.server.bun.burst,
					report.server.bun.sequential,
					report.server.bun.retention
				]}
			/>
			<p className="performance-evidence-note">
				Bun server evidence captured{' '}
				<time dateTime={report.server.bun.createdAt}>{report.server.bun.createdAt}</time>, with{' '}
				{report.server.bun.sequentialSamples} sequential requests, {report.server.bun.burstSamples}{' '}
				bursts, and {report.server.bun.retentionCheckpoints} retained-heap checkpoints per
				framework.
			</p>
			<MetricSection
				title={
					'Server response time and memory: Node ' +
					streamReport.metadata.ssrDiagnosticsEnvironment.runtimes.node +
					', streaming API'
				}
				description="Complete-response diagnostics using the streaming APIs of eXact, React, and TanStack Start. Nuxt and SvelteKit are unavailable for this lane. This capture predates eXact's early shell publication."
				charts={[
					streamReport.server.burst,
					streamReport.server.sequential,
					streamReport.server.retention
				]}
			/>
			<MetricSection
				title={
					'Server response time and memory: Bun ' +
					streamReport.server.bun.runtime +
					', streaming API'
				}
				description="The same streaming-API workload on native Bun servers. These results are separate from string rendering and from the sustained capacity captures."
				charts={[
					streamReport.server.bun.burst,
					streamReport.server.bun.sequential,
					streamReport.server.bun.retention
				]}
			/>
			<ValueSection
				title="Response payload: Node, string API"
				description="Complete response sizes include application markup and framework data. The composition chart separates semantic markup, document overhead, framework markers, identity attributes, and hydration data."
				charts={report.server.bars}
			/>
			<ResponseComposition figure={report.server.responseComposition} runtimeId="node" />
			<ValueSection
				title="Response payload: Bun, string API"
				description="Complete native Bun response sizes, including application markup and framework data."
				charts={report.server.bun.bars}
			/>
			<ResponseComposition figure={report.server.bun.responseComposition} runtimeId="bun" />

			<p className="performance-evidence-note">
				Browser evidence commit <code>{report.metadata.commit}</code>. SSR evidence commit{' '}
				<code>{report.metadata.ssrCommit.slice(0, 8)}</code>. Browser evidence captured{' '}
				<time dateTime={report.metadata.browserCreatedAt}>{report.metadata.browserCreatedAt}</time>;
				Node response-time, payload, and server-memory evidence captured{' '}
				<time dateTime={report.metadata.ssrCreatedAt}>{report.metadata.ssrCreatedAt}</time>. Browser
				charts contain {report.metadata.browserSamples} samples per framework. Server latency charts
				contain {report.metadata.ssrSequentialSamples} sequential requests and
				{report.metadata.ssrBurstSamples} bursts per framework. Server memory uses
				{report.metadata.ssrRetentionCheckpoints} retained-heap checkpoints per framework. Capacity
				charts state their durations. Incomplete telemetry rejects publication; request errors and
				missed arrivals remain visible. Unavailable GC telemetry does not mean zero collections.
			</p>
		</Article>
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

function ResponseComposition(
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
