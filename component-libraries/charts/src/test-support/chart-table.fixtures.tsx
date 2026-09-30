import type { Component } from '@exactjs/core';
import { Chart, Data, Legend, Series } from '../components.js';

/** Exercises reactive chart-owned cells, totals, hidden series, and datum removal. */
export function TableChartFixture(
	this: Component<{ value: number; second: boolean; reverse: boolean }>
) {
	this.state.value = 1.25;
	this.state.second = true;
	this.state.reverse = false;
	return () => (
		<div>
			<button id="table-update" onClick={() => this.state.value++}>
				Update
			</button>
			<button id="table-remove" onClick={() => (this.state.second = !this.state.second)}>
				Toggle datum
			</button>
			<button id="table-order" onClick={() => (this.state.reverse = !this.state.reverse)}>
				Order
			</button>
			<Chart
				type="stacked-bar"
				id="table-chart"
				title="Heap"
				description="Memory by category"
				table={{
					layout: 'categories',
					display: 'inline',
					caption: 'Heap MB',
					rowHeading: 'Framework',
					precision: 2,
					total: { label: 'Total' },
					seriesOrder: this.state.reverse ? ['objects', 'code'] : ['code', 'objects']
				}}
			>
				<Legend interactive />
				<Series id="code" name="Code">
					<Data id="a" x="A" value={this.state.value} />
				</Series>
				<Series id="objects" name="Objects">
					{this.state.second && <Data id="a" x="A" value={2} />}
				</Series>
			</Chart>
		</div>
	);
}

/** Creates the same reactive table root for direct mounting and paired hydration. */
export const tableChartRoot = () => <TableChartFixture />;

/** Keeps supplementary statistics reactive without changing the plotted value or range. */
export function StatisticTableFixture(this: Component<{ mean: number }>) {
	this.state.mean = 12;
	return () => (
		<div>
			<button id="statistic-update" onClick={() => this.state.mean++}>
				Update mean
			</button>
			<Chart
				type="range"
				title="Latency"
				description="A distribution"
				table={{
					layout: 'values',
					columns: [
						{ label: 'Aggregate', field: 'value' },
						{ label: 'Window mean', field: { statistic: 'mean' } },
						{ label: 'Interval', field: { statistic: 'mean' }, rangeEnd: 'maximum' }
					]
				}}
			>
				<Series id="a">
					<Data
						id="sample"
						x="A"
						value={20}
						minimum={10}
						maximum={30}
						statistics={{ mean: this.state.mean }}
					/>
				</Series>
			</Chart>
		</div>
	);
}

/** Supplies a paired root for observing a range endpoint after hydration. */
export const statisticTableRoot = () => <StatisticTableFixture />;
