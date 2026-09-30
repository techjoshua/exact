import nodeStreamReport from '../data/ssr-node-stream-capacity-report.json' with { type: 'json' };
import bunStreamReport from '../data/ssr-bun-stream-capacity-report.json' with { type: 'json' };
import { Chart, Legend } from '@exactjs/charts';
import type { Component } from '@exactjs/core';
import nodeReport from '../data/ssr-capacity-report.json' with { type: 'json' };
import bunReport from '../data/ssr-bun-capacity-report.json' with { type: 'json' };

/** Optional fields keep older captures explicit until the next measured publication. */
type CapacityRow = Omit<(typeof nodeReport)['preloaded'][number], 'concurrency' | 'rate'> & {
	concurrency: number | null;
	rate: number | null;
	meanMs?: number;
	p50Min?: number;
	p50Max?: number;
	p75Min?: number;
	p75Max?: number;
	p95Min?: number;
	p95Max?: number;
};
type CapacityReport = Omit<typeof nodeReport, 'preloaded' | 'normal' | 'arrivals'> & {
	preloaded: CapacityRow[];
	normal: CapacityRow[];
	arrivals: CapacityRow[];
};

/** Presents sustained HTTP capacity with explicit data-loading and offered-demand conditions. */
export function SsrCapacity(this: Component<{}>) {
	return () => (
		<>
			<section id="server-throughput" tabindex="-1">
				<h2>Server throughput under load</h2>
				<p>
					These tests repeatedly request the same page from eXact and React. Throughput counts
					valid, complete responses delivered per second (RPS). Other frameworks have not yet been
					measured with this sustained-load test. Each runtime and rendering API has its own results
					below.
				</p>
				<h3>What each test measures</h3>
				<p>
					<strong>Preloaded capacity</strong> starts with page data already in memory. As one
					request finishes, another starts. The chart shows how completed requests per second change
					with the number of requests in flight. A curve that levels off shows where more
					concurrency stops increasing throughput. Rendering and HTTP delivery are included.
				</p>
				<p>
					<strong>Normal loading</strong> also fetches and decodes the shared service data for every
					request, at concurrency 32. This includes the data-loading cost excluded above. It does
					not measure framework-specific full-stack loaders or server actions.
				</p>
				<p>
					<strong>Scheduled demand</strong> sends requests at a fixed rate even when earlier
					requests are pending. Compare offered RPS with valid RPS to see whether the server keeps
					up. A capacity miss means the driver reached 512 outstanding requests and could not send
					another. Request errors are sent attempts that failed transport, timed out, or returned
					invalid responses. Lower error and miss percentages are better.
				</p>
				<p>
					Request-error percentages use completed attempts as their denominator. Unsent requests
					have no response latency, so read latency alongside throughput and capacity misses. Mean
					latency is weighted by completed request count. P50, P75, P95, and P99 show the range
					across driver and population measurements, without averaging percentiles. Warmup is
					excluded from the tables, with its failures retained in each validation summary.
				</p>
			</section>
			<RuntimeCapacity report={nodeReport} runtimeId="node-string" />
			<RuntimeCapacity report={bunReport} runtimeId="bun-string" />
			<RuntimeCapacity report={nodeStreamReport} runtimeId="node-stream" />
			<RuntimeCapacity report={bunStreamReport} runtimeId="bun-stream" />
		</>
	);
}

function RuntimeCapacity(
	this: Component<{}>,
	props: { readonly report: CapacityReport; readonly runtimeId: string }
) {
	const report = props.report;
	const modeLabel = report.renderMode === 'stream' ? 'streaming API' : 'string API';
	const series = ['eXact', 'React'].map((name, index) => ({
		id: `ssr-capacity-${index}`,
		label: name,
		xAxis: 'concurrency',
		yAxis: 'rps',
		data: report.preloaded
			.filter((row) => row.name === name)
			.map((row) => ({
				id: `c${row.concurrency}`,
				label: `Concurrency ${row.concurrency}`,
				x: String(row.concurrency),
				value: row.rps,
				statistics: capacityStatistics(row)
			}))
	}));

	return () => (
		<section>
			<h2>
				{report.runtime} SSR capacity: {modeLabel}
			</h2>
			<p>
				Both frameworks use the {modeLabel} and render their own complete application document and
				hydration data.
			</p>
			<h3>How throughput changes with concurrent requests</h3>
			<div theme:surface="raised" className="performance-chart-card">
				<Chart
					type="line"
					id={`performance-sustained-preloaded-${props.runtimeId}`}
					title={`Preloaded SSR throughput: ${report.runtime}, ${modeLabel}`}
					description="Aggregate valid requests per second at each total concurrency, using two load drivers."
					axes={[
						{
							id: 'concurrency',
							position: 'bottom',
							scale: 'category',
							label: 'Total concurrency'
						},
						{ id: 'rps', position: 'left', scale: 'linear', label: 'Valid requests/s' }
					]}
					series={series}
					table={{
						layout: 'values',
						display: 'inline',
						rowLabel: 'series-category',
						rowHeading: 'Framework / concurrency',
						precision: 2,
						caption: `Throughput and response latency by concurrency: ${report.runtime}, ${modeLabel}`,
						missing: 'Not measured',
						columns: [
							{ label: 'Valid RPS', field: 'value' },
							{ label: 'Mean (ms)', field: { statistic: 'mean' } },
							...['p50', 'p75', 'p95', 'p99'].map((key) => ({
								label: `${key.toUpperCase()} (ms)`,
								field: { statistic: `${key}Min` },
								rangeEnd: { statistic: `${key}Max` }
							}))
						],
						categories: [...new Set(report.preloaded.map((row) => row.concurrency))].map(
							(level) => ({
								value: String(level),
								label: `${level} in flight`
							})
						)
					}}
				>
					<Legend />
				</Chart>
			</div>
			<h3>Requests that load data normally</h3>
			<div className="performance-table-scroll">
				<table>
					<caption>
						Normal-loading sustained throughput: {report.runtime}, {modeLabel}
					</caption>
					<thead>
						<tr>
							<th scope="col">Framework</th>
							<th scope="col">Valid RPS</th>
							<th scope="col">Mean (ms)</th>
							<th scope="col">P50 (ms)</th>
							<th scope="col">P75 (ms)</th>
							<th scope="col">P95 (ms)</th>
							<th scope="col">P99 (ms)</th>
						</tr>
					</thead>
					<tbody>
						{report.normal.map((row) => (
							<tr key={row.name}>
								<th scope="row">{row.name}</th>
								<td>{row.rps.toFixed(0)}</td>
								<td>{row.meanMs?.toFixed(2) ?? 'Not measured'}</td>
								<td>{latencyRange(row.p50Min, row.p50Max)}</td>
								<td>{latencyRange(row.p75Min, row.p75Max)}</td>
								<td>{latencyRange(row.p95Min, row.p95Max)}</td>
								<td>{latencyRange(row.p99Min, row.p99Max)}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<h3>Can the server keep up with arriving requests?</h3>
			<p>
				Each offered rate uses fresh worker, service, and load-driver processes, with
				{report.arrivalsIsolation.warmupMs / 1000} seconds of warmup at that rate followed by
				{report.arrivalsIsolation.measurementMs / 1000} seconds of measurement. The second
				population reverses framework and rate order.
			</p>
			<div className="performance-table-scroll">
				<table>
					<caption>
						Preloaded throughput under scheduled demand: {report.runtime}, {modeLabel}
					</caption>
					<thead>
						<tr>
							<th scope="col">Framework</th>
							<th scope="col">Offered RPS</th>
							<th scope="col">Valid RPS</th>
							<th scope="col">Mean (ms)</th>
							<th scope="col">P50 (ms)</th>
							<th scope="col">P75 (ms)</th>
							<th scope="col">P95 (ms)</th>
							<th scope="col">P99 (ms)</th>
							<th scope="col">Capacity misses</th>
							<th scope="col">Request errors</th>
						</tr>
					</thead>
					<tbody>
						{report.arrivals.map((row) => (
							<tr key={`${row.name}-${row.rate}`}>
								<th scope="row">{row.name}</th>
								<td>{row.rate}</td>
								<td>{row.rps.toFixed(0)}</td>
								<td>{row.meanMs?.toFixed(2) ?? 'Not measured'}</td>
								<td>{latencyRange(row.p50Min, row.p50Max)}</td>
								<td>{latencyRange(row.p75Min, row.p75Max)}</td>
								<td>{latencyRange(row.p95Min, row.p95Max)}</td>
								<td>{latencyRange(row.p99Min, row.p99Max)}</td>
								<td>{row.capacityMissPercent.toFixed(2)}%</td>
								<td>
									{row.requestErrors} ({row.requestErrorPercent.toFixed(3)}%)
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<details>
				<summary>Capture dates, method, and validation</summary>
				<p className="performance-evidence-note">
					Preloaded capture: {report.createdAt}. Normal loading: {report.normalCreatedAt}. Scheduled
					arrivals: {report.arrivalsCreatedAt}. {report.method}. Driver and server processes share
					one workstation. These are observed capacities, not universal framework ceilings. Each
					percentile range contains individual driver/population percentiles, not a pooled
					percentile or confidence interval. {report.validation}.
				</p>
			</details>
		</section>
	);
}

/** Formats an observed percentile range without implying a pooled percentile. @exact pure */
function latencyRange(minimum: number | undefined, maximum: number | undefined): string {
	if (minimum === undefined || maximum === undefined) return 'Not measured';
	const first = minimum.toFixed(2),
		last = maximum.toFixed(2);
	return first === last ? first : `${first}–${last}`;
}

/** Keeps unmeasured statistics absent instead of turning them into zero. @exact pure */
function capacityStatistics(row: CapacityRow): Record<string, number> {
	const statistics: Record<string, number> = {};
	if (row.meanMs !== undefined) statistics.mean = row.meanMs;
	for (const key of [
		'p50Min',
		'p50Max',
		'p75Min',
		'p75Max',
		'p95Min',
		'p95Max',
		'p99Min',
		'p99Max'
	] as const) {
		const value = row[key];
		if (value !== undefined) statistics[key] = value;
	}
	return statistics;
}
