import { Axis, AxisLabel, Chart, Data, Legend, Series, SeriesLabel } from '@exactjs/charts';
import type { Component } from '@exactjs/core';
import { Article } from './Article.jsx';
import { CodeBlock } from '../CodeBlock.jsx';

const chartSource = `import {
  Axis, AxisLabel, Chart, Data, Legend, Series, SeriesLabel
} from '@exactjs/charts';
import { _ } from '@exactjs/jsx';

<Chart
  type="line"
  id="latency"
  title="Response latency"
  description="Latency percentiles by framework. Lower is better."
>
  <Axis id="sample" position="bottom" scale="category" />
  <Axis id="latency" position="left" scale="linear">
    <AxisLabel><_ intl:message>Milliseconds</_></AxisLabel>
  </Axis>
  <Legend interactive />
  <Series id="exact" xAxis="sample" yAxis="latency">
    <SeriesLabel><_ intl:message>eXact</_></SeriesLabel>
    <Data id="p50" x="P50" value={33} />
    <Data id="p95" x="P95" value={38} />
  </Series>
</Chart>`;

/** Introduces the native chart package and its accessible compositional contract. */
export function ChartsPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Component library / @exactjs/charts"
			title="Charts that remain ordinary components"
			description="Compose accessible SVG charts from durable eXact components, standard intl enhancements, and the active theme."
			next={{ path: '/framework-comparison', label: 'Read the benchmark methodology' }}
		>
			<section>
				<h2>Compose meaning before geometry</h2>
				<p>
					A chart owns its axes, series, data, semantic table, tooltip, and interaction state. Child
					components coordinate through chart-local contexts; native component operations remain
					opaque and no virtual chart tree is created.
				</p>
				<CodeBlock source={chartSource} language="tsx" title="LatencyChart.tsx" />
				<p>
					Load <code>@exactjs/charts/styles.css</code> from the application stylesheet or client
					entry with the application's other global styles.
				</p>
			</section>

			<section>
				<h2>Keyboard and assistive access are built in</h2>
				<p>
					Marks respond to pointer, touch, focus, arrow keys, Home, End, and Escape through one
					chart-owned delegated interaction surface. The structured data view exposes the same
					presented values, while patterns and line styles preserve series distinction without
					color.
				</p>
				<Chart
					type="line"
					id="chart-guide-example"
					title="Response latency"
					description="Latency percentiles by framework. Lower is better."
					width={720}
					height={340}
				>
					<Axis id="percentile" position="bottom" scale="category">
						<AxisLabel>Percentile</AxisLabel>
					</Axis>
					<Axis id="latency" position="left" scale="linear">
						<AxisLabel>Milliseconds</AxisLabel>
					</Axis>
					<Legend interactive label="Framework series" />
					<Series id="exact" name="eXact" xAxis="percentile" yAxis="latency">
						<SeriesLabel>eXact</SeriesLabel>
						<Data id="p50" label="P50" x="P50" value={33.3} />
						<Data id="p75" label="P75" x="P75" value={34.6} />
						<Data id="p95" label="P95" x="P95" value={38.7} />
						<Data id="p99" label="P99" x="P99" value={41.3} />
					</Series>
					<Series id="react" name="React" xAxis="percentile" yAxis="latency">
						<SeriesLabel>React</SeriesLabel>
						<Data id="p50" label="P50" x="P50" value={44.1} />
						<Data id="p75" label="P75" x="P75" value={46.1} />
						<Data id="p95" label="P95" x="P95" value={48.8} />
						<Data id="p99" label="P99" x="P99" value={52.4} />
					</Series>
				</Chart>
			</section>

			<section>
				<h2>Localization stays with intl</h2>
				<p>
					Use ordinary <code>intl:message</code> boundaries inside label components. Axis
					measurement requests use <code>@exactjs/intl</code> conversion and formatting directly,
					including locale preferences and explicit application overrides. The chart package
					contains no catalog, locale, unit-conversion, formatter-cache, or translation
					implementation.
				</p>
			</section>

			<section>
				<h2>Responsive without client measurement</h2>
				<p>
					Charts use deterministic SVG user-space geometry on the server and a responsive view box
					in CSS. Resizing scales that accepted geometry directly, avoiding a chart-owned observer,
					post-hydration replacement, and a second layout model.
				</p>
			</section>
		</Article>
	);
}
