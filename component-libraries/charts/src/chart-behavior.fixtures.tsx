import type { Component } from '@exactjs/core';
import {
	Axis,
	AxisLabel,
	Chart,
	ChartDescription,
	ChartTitle,
	Data,
	DataDescription,
	DataLabel,
	Legend,
	Series,
	SeriesLabel
} from '@exactjs/charts';

/** Representative compositional chart used across client and server behavior tests. */
export function ChartFixture(this: Component<{}>) {
	return () => (
		<Chart type="line" id="requests-chart" width={640} height={320}>
			<ChartTitle>Concurrent SSR capacity</ChartTitle>
			<ChartDescription>Requests completed per second at each concurrency.</ChartDescription>
			<Axis id="concurrency" position="bottom" scale="category">
				<AxisLabel>Concurrency</AxisLabel>
			</Axis>
			<Axis id="throughput" position="left" scale="linear" tickCount={4}>
				<AxisLabel>Requests per second</AxisLabel>
			</Axis>
			<Legend interactive label="Visible series" />
			<Series id="exact" name="eXact" xAxis="concurrency" yAxis="throughput">
				<SeriesLabel>eXact</SeriesLabel>
				<Data id="c1" label="Concurrency 1" x="1" value={5200}>
					<DataLabel>Concurrency 1</DataLabel>
				</Data>
				<Data id="c32" label="Concurrency 32" x="32" value={6900}>
					<DataLabel>Concurrency 32</DataLabel>
					<DataDescription>Highest sustained lane.</DataDescription>
				</Data>
			</Series>
		</Chart>
	);
}

/** Captions are placed by role while their parent-owned reactive text retains its DOM. */
export function ReactiveChartLabelsFixture(this: Component<{ title: string }>) {
	this.state.title = 'Before';
	return () => (
		<Chart id="reactive-labels" type="line">
			<Series id="values">
				<Data id="first" x="first" value={1} />
			</Series>
			<ChartDescription>Reactive label example.</ChartDescription>
			<ChartTitle>
				<button onClick={() => (this.state.title = 'After')}>{this.state.title}</button>
			</ChartTitle>
		</Chart>
	);
}

/** Compact data-first chart normalized through the same model as declarative children. */
export function CompactChartFixture(this: Component<{}>) {
	return () => (
		<Chart
			type="bar"
			id="compact-chart"
			axes={[
				{ id: 'category', position: 'bottom', scale: 'category', label: 'Framework' },
				{ id: 'heap', position: 'left', scale: 'linear', label: 'Retained heap' }
			]}
			series={[
				{
					id: 'current',
					label: 'Current',
					xAxis: 'category',
					yAxis: 'heap',
					data: [
						{
							id: 'exact',
							label: 'eXact',
							x: 'eXact',
							value: 2.1,
							description: 'Post-GC used heap'
						}
					]
				}
			]}
		>
			<ChartTitle>Client memory</ChartTitle>
			<Legend />
		</Chart>
	);
}

/** Opt-in tooltip motion fixture retaining the last placement during its CSS exit transition. */
export function MotionChartFixture(this: Component<{}>) {
	return () => (
		<Chart
			type="line"
			id="motion-chart"
			title="Motion chart"
			description="Tooltip motion behavior."
			motion
			series={[
				{
					id: 'current',
					data: [
						{ id: 'first', label: 'First', x: '1', value: 1 },
						{ id: 'second', label: 'Second', x: '2', value: 2 }
					]
				}
			]}
		/>
	);
}

/** A custom data table retains parent-owned reactive values inside the chart figure. */
export function CustomDataViewFixture(this: Component<{ value: number }>) {
	this.state.value = 12;
	return () => (
		<Chart
			type="bar"
			title="Measurements"
			description="Elapsed time in milliseconds."
			dataView={
				<details open>
					<summary>View values and percentiles</summary>
					<table>
						<thead>
							<tr>
								<th>Mean (ms)</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td>{this.state.value}</td>
							</tr>
						</tbody>
					</table>
					<button onClick={() => this.state.value++}>Update measurement</button>
				</details>
			}
		>
			<Series id="measurements">
				<Data id="sample" x="Sample" value={this.state.value} />
			</Series>
		</Chart>
	);
}
