import { Chart, Legend } from '@exactjs/charts';
import type { Component } from '@exactjs/core';
import report from '../data/ssr-capacity-report.json' with { type: 'json' };

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

/** Summary drawn from the same admitted preloaded capture as the capacity chart. */
export const ssrCapacityHighlight = {
	label: 'eXact fixed-concurrency SSR',
	value: `${Math.round(Math.max(...report.preloaded.filter((row) => row.name === 'eXact').map((row) => row.rps))).toLocaleString('en-US')} RPS`,
	context: 'best point in the concurrency sweep; data already loaded'
};

/** Presents sustained HTTP capacity with explicit data-loading and offered-demand conditions. */
export function SsrCapacity(this: Component<{}>) {
	return () => (
		<section>
			<h2>Node SSR capacity</h2>
			<p>
				These sustained measurements compare eXact and React using two independent load-driver
				processes and one server process per active framework. Two fresh process populations reverse
				framework order. Valid responses are counted over elapsed time, including final drain. The
				earlier short-window RPS charts have been superseded; their values are not mixed into this
				capture. Other frameworks have not yet been measured with this protocol.
			</p>
			<h3>Rendering and response handling with data preloaded</h3>
			<p>
				Decoded fixture data is reused, removing per-request fetching and JSON decoding. This is
				HTTP render/response capacity, not the throughput of an application that loads data on every
				request. Higher concurrency can add latency without increasing throughput. Both frameworks
				can be compared using the complete curve and the recorded latency ranges.
			</p>
			<div theme:surface="raised" className="performance-chart-card">
				<Chart
					type="line"
					id="performance-sustained-preloaded"
					title="Preloaded SSR throughput"
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
				>
					<Legend />
				</Chart>
				<div className="performance-table-scroll">
					<table>
						<caption>Preloaded capacity by concurrency</caption>
						<thead>
							<tr>
								<th scope="col">Framework</th>
								<th scope="col">Concurrency</th>
								<th scope="col">Valid RPS</th>
							</tr>
						</thead>
						<tbody>
							{report.preloaded.map((row) => (
								<tr key={`${row.name}-${row.concurrency}`}>
									<th scope="row">{row.name}</th>
									<td>{row.concurrency}</td>
									<td>{row.rps.toFixed(0)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
			<h3>Requests that load data normally</h3>
			<p>
				This separate lane fetches and decodes the shared service data for every request at total
				concurrency 32. It includes the data-loading cost excluded above. It does not measure native
				full-stack loaders or server actions.
			</p>
			<div className="performance-table-scroll">
				<table>
					<caption>Normal-loading sustained throughput</caption>
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
			<h3>Independently scheduled arrivals with preloaded data</h3>
			<p>
				Fixed-concurrency loops wait for completions before replacing requests. Scheduled arrivals
				continue independently and expose queueing. Capacity misses are offered requests the driver
				could not admit at its limit of 512 outstanding requests across two drivers. They are not
				failed server responses. These overloaded rates do not establish the highest rate with zero
				misses.
			</p>
			<p>
				Request errors count admitted attempts that failed transport, timed out, or returned an
				invalid response. Their percentage uses completed attempts as the denominator. Valid RPS
				excludes those errors; capacity misses count requests that were never admitted.
			</p>
			<div className="performance-table-scroll">
				<table>
					<caption>Preloaded throughput under scheduled demand</caption>
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
			<p className="performance-evidence-note">
				Preloaded capture: {report.createdAt}. Normal loading: {report.normalCreatedAt}. Scheduled
				arrivals: {report.arrivalsCreatedAt}. {report.method}. Driver and server processes share one
				workstation; these are observed capacities, not universal framework ceilings. The p99 range
				contains individual driver/population percentiles, not a pooled percentile.{' '}
				{report.validation}.
			</p>
		</section>
	);
}
