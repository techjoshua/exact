import { Chart, Legend } from '@exactjs/charts';
import type { Component } from '@exactjs/core';
import figure from '../data/performance-heap-report.json' with { type: 'json' };

const series = figure.series.map((entry, seriesIndex) => ({
	id: `heap-category-${seriesIndex}`,
	label: entry.name,
	xAxis: 'framework',
	yAxis: 'bytes',
	data: figure.categories.map((name, index) => ({
		id: `framework-${index}`,
		label: name,
		x: name,
		value: entry.values[index] ?? 0
	}))
}));

/** Explains a separate post-GC diagnostic capture using disjoint snapshot self-byte categories. */
export function HeapComposition(this: Component<{}>) {
	return () => (
		<section>
			<h2>What the browser heap contains</h2>
			<p>
				Retained memory includes the code and metadata V8 keeps to execute an application, as well
				as its objects and browser resources. A larger total does not necessarily mean more
				component state. These stacks show where the snapshot bytes reside without attributing all
				engine-owned data to application state.
			</p>
			<div theme:surface="raised" className="performance-chart-card">
				<div className="performance-table-scroll">
					<div className="performance-heap-chart">
						<Chart
							type="stacked-bar"
							id="performance-browser-heap-composition"
							title={figure.title}
							description="Mean post-GC snapshot self-bytes by node category. Each stack includes V8 code and metadata, other retained data, and native nodes represented in the snapshot."
							axes={[
								{ id: 'framework', position: 'bottom', scale: 'category' },
								{ id: 'bytes', position: 'left', scale: 'linear', label: figure.unit }
							]}
							series={series}
						>
							<Legend />
						</Chart>
					</div>
				</div>
				<div className="performance-table-scroll">
					<table>
						<caption>Mean snapshot self-bytes in decimal MB; rounded to three decimals</caption>
						<thead>
							<tr>
								<th scope="col">Framework</th>
								{figure.series.map((entry) => (
									<th scope="col" key={entry.name}>
										{entry.name}
									</th>
								))}
								<th scope="col">Total</th>
							</tr>
						</thead>
						<tbody>
							{figure.categories.map((name, index) => (
								<tr key={name}>
									<th scope="row">{name}</th>
									{figure.series.map((entry) => (
										<td key={entry.name}>{formatHeap(entry.values[index] ?? 0)}</td>
									))}
									<td>{formatHeap(figure.totals[index] ?? 0)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
			<p>{figure.comment}</p>
			<p className="performance-evidence-note">
				Separate diagnostic capture: {figure.metadata.samplesPerFramework} balanced rounds per
				framework, one discarded warmup round, fresh cache-disabled pages, and no CPU, allocation,
				or coverage profiler. Chromium {figure.metadata.browserVersion}; captured
				<time dateTime={figure.metadata.createdAt}>{figure.metadata.createdAt}</time>.
			</p>
		</section>
	);
}

/** Formats decimal MB without changing the underlying chart values. @exact pure */
function formatHeap(value: number): string {
	return value.toFixed(3);
}
