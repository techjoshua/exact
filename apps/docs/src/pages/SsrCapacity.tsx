import nodeStreamReport from '../data/ssr-node-stream-capacity-report.json' with { type: 'json' };
import bunStreamReport from '../data/ssr-bun-stream-capacity-report.json' with { type: 'json' };
import { Chart, Legend } from '@exactjs/charts';
import type { Component } from '@exactjs/core';
import nodeReport from '../data/ssr-capacity-report.json' with { type: 'json' };
import bunReport from '../data/ssr-bun-capacity-report.json' with { type: 'json' };

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
					have no response latency, so read the p99 range alongside throughput and capacity misses.
					Warmup is excluded from the tables, with its failures retained in each validation summary.
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
	props: { readonly report: typeof nodeReport; readonly runtimeId: string }
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
				value: row.rps
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
					dataView={<CapacityTable report={report} modeLabel={modeLabel} />}
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
						</tr>
					</thead>
					<tbody>
						{report.normal.map((row) => (
							<tr key={row.name}>
								<th scope="row">{row.name}</th>
								<td>{row.rps.toFixed(0)}</td>
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
							<th scope="col">Capacity misses</th>
							<th scope="col">Request errors</th>
							<th scope="col">Response p99 range</th>
						</tr>
					</thead>
					<tbody>
						{report.arrivals.map((row) => (
							<tr key={`${row.name}-${row.rate}`}>
								<th scope="row">{row.name}</th>
								<td>{row.rate}</td>
								<td>{row.rps.toFixed(0)}</td>
								<td>{row.capacityMissPercent.toFixed(2)}%</td>
								<td>
									{row.requestErrors} ({row.requestErrorPercent.toFixed(3)}%)
								</td>
								<td>
									{row.p99Min.toFixed(1)}–{row.p99Max.toFixed(1)} ms
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
					one workstation. These are observed capacities, not universal framework ceilings. The p99
					range contains individual driver/population percentiles, not a pooled percentile or
					confidence interval. {report.validation}.
				</p>
			</details>
		</section>
	);
}

function CapacityTable(
	this: Component<{}>,
	props: { readonly report: typeof nodeReport; readonly modeLabel: string }
) {
	const levels = [...new Set(props.report.preloaded.map((row) => row.concurrency))];
	const frameworks = [...new Set(props.report.preloaded.map((row) => row.name))];
	return () => (
		<div className="performance-table-scroll">
			<table>
				<caption>
					Valid requests per second by concurrency: {props.report.runtime}, {props.modeLabel}
				</caption>
				<thead>
					<tr>
						<th scope="col">Framework</th>
						{levels.map((level) => (
							<th key={String(level)} scope="col">
								{level} in flight
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{frameworks.map((name) => (
						<tr key={name}>
							<th scope="row">{name}</th>
							{levels.map((level) => (
								<td key={String(level)}>
									{props.report.preloaded
										.find((row) => row.name === name && row.concurrency === level)
										?.rps.toFixed(0) ?? 'Not measured'}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
