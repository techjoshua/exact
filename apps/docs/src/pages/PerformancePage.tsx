import streamReport from '../data/ssr-stream-report.json' with { type: 'json' };
import { Chart, Legend, type ChartSeriesInput } from '@exactjs/charts';
import type { Component } from '@exactjs/core';
import reportJson from '../data/performance-report.json' with { type: 'json' };
import { Article } from './Article.jsx';
import {
	performanceMetricTitle,
	performanceMetricDescription
} from './performance-metric-labels.js';
import { HeapComposition } from './HeapComposition.jsx';
import { SsrCapacity } from './SsrCapacity.jsx';

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
			eyebrow="Framework comparison"
			title="Browser experience and server capacity"
			description="Compare page loading, interaction response, memory use, and server throughput for the same application."
			previous={{ path: '/framework-comparison', label: 'Framework comparison' }}
			next={{ path: '/examples/logo-lab', label: 'Logo lab' }}
		>
			<section>
				<h2>What the applications do</h2>
				<p>
					Each framework implements the same incident dashboard. A visitor loads the page, claims an
					incident, and sees the server confirm the change. The applications share data and styling,
					and must pass the same behavior checks before measurement.
				</p>
				<p>
					The charts answer four questions: how soon content appears, how quickly clicks receive
					feedback, how much memory the application retains, and how many pages the server can
					deliver. Results describe this workload on the recorded machine. Start with the group
					closest to your application’s needs.
				</p>
				<ul>
					<li>Page loading and interactions</li>
					<li>Server throughput under load</li>
					<li>Server response time and memory</li>
					<li>Response size</li>
				</ul>
			</section>
			<section>
				<h2>How eXact reduces work and waiting</h2>
				<p>
					In the browser, compiler-tracked dependencies direct state updates to the expressions and
					DOM regions that need them. During server-side rendering (SSR), ready tasks start as soon
					as their inputs are available and the request has a free concurrency slot. Supported
					compiled components can prepare reachable child tasks before earlier work settles,
					allowing independent data requests to overlap while HTML stays ordered.
				</p>
				<p>
					The Node adapter also coordinates rendering with network I/O. It observes event-loop delay
					and completed-response throughput, trials bounded batches of rendering starts, and adjusts
					whether to yield between batches. This aims to keep requests and responses moving while
					the server renders. It cannot shorten a slow database query or remove a genuine dependency
					between tasks.
				</p>
				<p>
					These charts measure complete applications with their normal framework behavior. They do
					not isolate the contribution of each optimization. The
					<a href="https://github.com/techjoshua/exact/blob/main/docs/performance.md#how-exact-reduces-work-and-waiting">
						performance reference
					</a>
					explains scheduling limits and related approaches in other frameworks.
				</p>
			</section>
			<section>
				<h2>Read the chart marks</h2>
				<p>
					The mean is the average of all samples. P50 is the median: half the samples are at or
					below it. P95 means 95% are at or below that value; P99 shows the slowest end of the
					measured distribution. Range charts span P50 to P99 and mark P75, P95, and the mean. Open
					a chart’s table for exact values.
				</p>
				<p>
					Lower times, memory use, and response sizes are generally preferable for the same work.
					Higher requests per second mean greater throughput. Read throughput together with latency,
					errors, and requests that could not be sent: a busy server can finish more work while
					making each visitor wait longer.
				</p>
			</section>

			<MetricSection
				title="Browser experience"
				description="These tests load a fresh page with its cache disabled, then claim an incident. Saved production HTML and assets are served by the same local server for every framework, so page-load timings exclude generating HTML on the server. Interactions call the same application service. The browser process stays running between samples."
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
				<a href="#/runtimes">runtime compatibility notes</a> for platform-specific client and server
				behavior.
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
			<details>
				<summary>Capture details</summary>
				<p className="performance-evidence-note">
					Bun server evidence captured{' '}
					<time dateTime={report.server.bun.createdAt}>{report.server.bun.createdAt}</time>, with{' '}
					{report.server.bun.sequentialSamples} sequential requests,{' '}
					{report.server.bun.burstSamples} bursts, and {report.server.bun.retentionCheckpoints}{' '}
					retained-heap checkpoints per framework.
				</p>
			</details>
			<MetricSection
				title={
					'Server response time and memory: Node ' +
					streamReport.metadata.ssrDiagnosticsEnvironment.runtimes.node +
					', streaming API'
				}
				description="Complete-response diagnostics using the streaming APIs of eXact, React, and TanStack Start, including complete document and hydration-data delivery. Nuxt and SvelteKit are unavailable for this lane."
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

			<details>
				<summary>Capture details</summary>
				<p className="performance-evidence-note">
					Browser evidence commit <code>{report.metadata.commit}</code>. SSR capture hash
					<code>{report.metadata.ssrSourceSha256.slice(0, 12)}</code>, based on commit
					<code>{report.metadata.ssrCommit.slice(0, 8)}</code>. Browser evidence captured
					<time dateTime={report.metadata.browserCreatedAt}>
						{report.metadata.browserCreatedAt}
					</time>
					; Node response-time, payload, and server-memory evidence captured{' '}
					<time dateTime={report.metadata.ssrCreatedAt}>{report.metadata.ssrCreatedAt}</time>.
					Browser charts contain {report.metadata.browserSamples} samples per framework. Server
					latency charts contain {report.metadata.ssrSequentialSamples} sequential requests and
					{report.metadata.ssrBurstSamples} bursts per framework. Server memory uses
					{report.metadata.ssrRetentionCheckpoints} retained-heap checkpoints per framework.
					Capacity charts state their durations. Incomplete telemetry rejects publication; request
					errors and missed arrivals remain visible. Unavailable GC telemetry does not mean zero
					collections.
				</p>
			</details>
			<section>
				<h2>How the comparison was run</h2>
				<p>
					Measurements used Linux Chromium under WSL 2 and native loopback networking. The same
					stylesheet and desktop and mobile appearance checks keep the visual work comparable. Node
					and Bun, and buffered and streaming response APIs, have separate results. Streaming
					measurements time complete responses; they do not measure when the first useful chunk
					appears.
				</p>
				<p>
					The streaming comparison includes eXact, React, and TanStack Start. The current Nuxt and
					SvelteKit applications do not expose an equivalent streaming document API. See the{' '}
					<a href="#/framework-comparison">methodology</a> for sample ordering, measurement limits,
					and reproduction commands.
				</p>
			</section>
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
				title={performanceMetricTitle(props.figure.title)}
				description={performanceMetricDescription(props.figure.title, props.figure.comment)}
				axes={[
					{ id: 'framework', position: 'left', scale: 'category' },
					{ id: 'value', position: 'bottom', scale: 'linear', label: props.figure.unit }
				]}
				series={distributionSeries(props.figure)}
			>
				<Legend />
			</Chart>
			<details>
				<summary>View values and percentiles</summary>
				<DistributionTable figure={props.figure} />
			</details>
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
