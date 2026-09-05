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
