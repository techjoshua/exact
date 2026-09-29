import {
	Axis,
	AxisLabel,
	Chart,
	ChartDescription,
	ChartTitle,
	Data,
	Legend,
	Series
} from '@exactjs/charts';
import type { Component } from '@exactjs/core';
import { createDefaultIntlEnvironment, IntlProvider } from '@exactjs/intl';
import { _ } from '@exactjs/jsx';
/** Creates the normative published-package server chart root. */
export const serverChartRoot = () => (
	<Chart type="line" id="server-chart" width={640} height={320}>
		<ChartTitle>Concurrent SSR capacity</ChartTitle>
		<ChartDescription>Requests completed per second.</ChartDescription>
		<Axis id="concurrency" position="bottom" scale="category" />
		<Axis id="throughput" position="left" scale="linear" />
		<Legend />
		<Series id="exact" name="eXact" xAxis="concurrency" yAxis="throughput">
			<Data id="c1" label="Concurrency 1" x="1" value={5200} />
			<Data id="c32" label="Concurrency 32" x="32" value={6900} />
		</Series>
	</Chart>
);

/** Places the chart behind an ordinary independently compiled native parent boundary. */
export function ServerChartDocument(this: Component<{}>) {
	return () => <main>{serverChartRoot()}</main>;
}

/** Creates the normative nested native server root. */
export const nestedServerChartRoot = () => <ServerChartDocument />;

/** Localized chart whose projected label is consumed by a later plot sibling. */
export function LocalizedServerChart(this: Component<{}>) {
	return () => (
		<IntlProvider environment={createDefaultIntlEnvironment('de-DE')}>
			<Chart type="bar" id="localized-chart">
				<Axis id="category" position="bottom" scale="category" />
				<Axis id="value" position="left" scale="linear">
					<AxisLabel>
						<_ intl:message>Throughput</_>
					</AxisLabel>
				</Axis>
				<Series id="exact" xAxis="category" yAxis="value">
					<Data id="sample" x="eXact" value={1234.5} />
				</Series>
			</Chart>
		</IntlProvider>
	);
}

/** Creates the localized chart through its compiled native root. */
export const localizedServerChartRoot = () => <LocalizedServerChart />;

/** Custom data content is available in server output without a duplicate default table. */
export const customDataServerChartRoot = () => (
	<Chart
		type="bar"
		title="Measurements"
		description="Elapsed time in milliseconds."
		table={{ layout: 'categories', caption: 'Generated table' }}
		dataView={
			<details>
				<summary>View measurements</summary>
				<table>
					<thead>
						<tr>
							<th>Mean (ms)</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>12</td>
						</tr>
					</tbody>
				</table>
			</details>
		}
	>
		<Series id="measurements">
			<Data id="sample" x="Sample" value={12} />
		</Series>
	</Chart>
);

/** Demonstrates each generated layout through the installed server component entry point. */
export const matrixServerChartRoot = () => (
	<Chart
		type="stacked-bar"
		title="Heap"
		description="Retained memory"
		table={{
			layout: 'categories',
			display: 'inline',
			rowHeading: 'Framework',
			caption: 'Heap MB',
			precision: 3,
			total: { label: 'Total' }
		}}
		series={[
			{ id: 'code', label: 'Code', data: [{ id: 'a', x: 'A', value: 1.25 }] },
			{ id: 'objects', label: 'Objects', data: [{ id: 'a', x: 'A', value: 2 }] }
		]}
	/>
);

/** Named endpoint and supplementary statistic columns retain their distinct meanings in SSR. */
export const valuesServerChartRoot = () => (
	<Chart
		type="range"
		title="Latency"
		description="Response percentiles"
		table={{
			layout: 'values',
			summary: 'View percentiles',
			columns: [
				{ label: 'Mean', field: { statistic: 'mean' } },
				{ label: 'P50', field: 'minimum' },
				{ label: 'P99', field: 'maximum' }
			]
		}}
		series={[
			{
				id: 'a',
				data: [
					{ id: 'sample', x: 'A', value: 10, minimum: 2, maximum: 15, statistics: { mean: 8 } }
				]
			}
		]}
	/>
);
