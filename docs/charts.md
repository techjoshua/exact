# Native chart components

`@exactjs/charts` provides accessible, localized, theme-aware Cartesian charts without introducing
a virtual chart tree. `Chart`, `Axis`, `Series`, and `Data` are ordinary compiled eXact components;
their descendants coordinate through instance-local contexts and retain normal lifecycle ownership.

Import the component surface and default styles:

```tsx
import { Axis, AxisLabel, Chart, Data, Legend, Series, SeriesLabel } from '@exactjs/charts';

<Chart
	type="line"
	id="latency"
	title="Response latency"
	description="Latency percentiles by framework. Lower is better."
	motion
>
	<Axis id="sample" position="bottom" scale="category" />
	<Axis id="duration" position="left" scale="linear">
		<AxisLabel>Milliseconds</AxisLabel>
	</Axis>
	<Legend interactive />
	<Series id="exact" xAxis="sample" yAxis="duration">
		<SeriesLabel>eXact</SeriesLabel>
		<Data id="p50" x="P50" value={33} />
		<Data id="p95" x="P95" value={38} />
	</Series>
</Chart>;
```

Load `@exactjs/charts/styles.css` from the application stylesheet or client entry alongside the
application's other global styles. Component source does not need a side-effect CSS import. Provide
every chart with a title and description through props or `ChartTitle` and `ChartDescription`
children so its figure and plot have stable accessible relationships.

Place `ChartTitle` and `ChartDescription` directly inside `Chart`. Immediate title and description
children are placed before the declaration region, with the caption directly under the figure.
Axes, series, and data retain their context registration and lifecycle. Composition does not search
inside fragments or wrapper components for captions. Choose props or child components for each label.

The package supports line, area, vertical bar, horizontal bar, stacked bar, and range charts.
`defined={false}` creates an explicit line or area gap. Range data uses `minimum`, `maximum`, and
`value` for its extent and primary marker; `marks` adds named values such as arithmetic mean and
benchmark percentiles.

Use the compositional form when content needs standard `intl:*` enhancements or per-datum semantic
descriptions. The `axes` and `series` props provide a compact form for already-localized data. Both
forms normalize into the same chart-instance-owned model and reject duplicate IDs, missing axes,
invalid domains, and non-finite values.

Every mark is keyboard focusable. Arrow keys traverse marks in visual order, Home and End move to
the bounds, Escape dismisses a pinned tooltip, and activating an interactive legend control toggles
one series. One delegated handler set serves the complete plot and one delegated handler serves the
legend. The semantic figure, associated labels, chart-owned tooltip, non-color series cues, and
structured HTML data view expose the same information without requiring pointer hover.

## Tables that match the comparison

A stacked chart is easier to compare when categories occupy rows and series occupy columns.
The `table` option generates that arrangement from the chart's own data:

```tsx
<Chart
	type="stacked-bar"
	title="Browser memory"
	description="Retained memory by framework and category, in MB."
	series={heapSeries}
	table={{
		layout: 'categories',
		rowHeading: 'Framework',
		caption: 'Retained memory (MB)',
		display: 'inline',
		precision: 3,
		total: { label: 'Total' }
	}}
/>
```

Each series supplies one memory category and each datum's `x` identifies its framework.
The chart owns the table, including accessible row and column headers, horizontal scrolling,
formatting, and reactive updates. No second data array or table component is needed.

- `layout: 'categories'` puts coordinates down the rows and series across the columns.
- `layout: 'series'` transposes that arrangement. A throughput chart can show frameworks as rows
  and concurrency levels as columns.
- `layout: 'values'` creates one row per datum with explicitly selected numeric fields.
  `rowLabel: 'series'` is useful when each series holds one distribution.

For a range chart, columns can name what the endpoints and markers mean:

```tsx
table={{
	layout: 'values',
	rowLabel: 'series',
	rowHeading: 'Framework',
	caption: 'Response time (ms)',
	summary: 'View values and percentiles',
	numberFormat: { maximumFractionDigits: 2 },
	columns: [
		{ label: 'Mean', field: 'value' },
		{ label: 'P50', field: 'minimum' },
		{ label: 'P75', field: { mark: 'P75' } },
		{ label: 'P95', field: { mark: 'P95' } },
		{ label: 'P99', field: 'maximum' }
	]
}}
```

Columns follow their declared order. A datum may also supply `statistics: { mean: 12.5 }`,
selected by `field: { statistic: 'mean' }`. Supplementary statistics do not add plot marks or
change the geometry. This keeps an aggregate plotted value distinct from a window mean.
Missing range endpoints stay missing in the table even when the visual range defaults to `value`.

### Formatting, ordering, and missing data

Tables default to an expandable “View chart data” disclosure. `display: 'inline'` keeps the table
visible. `caption`, `summary`, `rowHeading`, column labels, category labels, and `missing` accept
already-localized text. Built-in fallback labels are English. `unit` appends a unit label to
numeric column headings without performing conversion.

`precision` sets fixed fractional digits from 0 through 20. Alternatively, `numberFormat` accepts
standard Intl number options, such as maximum fractional digits and grouping. The two options
are mutually exclusive. Number formatting uses the active intl environment. Without a provider,
fixed precision uses decimal digits and explicit `numberFormat` uses en-US. Omitting both uses
the chart's existing value formatting. Axis measurement conversion still determines numeric
values before table formatting. With custom number formatting, supply the destination unit in
headings or the caption. Table formatting does not change the plotted source data.

`seriesOrder` lists series IDs to place first. `categories` lists coordinates with optional
labels, for example `[{ value: '16', label: '16 in flight' }]`. Unlisted entries follow in their
original order. Unknown or duplicate ordering entries throw rather than silently discarding data.
Coordinates retain their types, so numeric `1` and text `'1'` are different categories. Date
coordinates match by timestamp. A matrix rejects multiple data points at the same coordinate in
one series. The values layout can represent such data as separate rows.

Absent series/category pairs, absent named fields, and `defined: false` data use `missing`,
which defaults to “Not available”. Zero remains a numeric value. Tables include every registered
series even when a legend control hides it from the plot, keeping data available for comparison.

Row totals are opt-in for matrix layouts. Callers must choose additive values in compatible
source units. A total sums original values before rounding and uses the same conversion and
formatting as the cells. An incomplete row has a missing total, rather than an understated sum.
Non-finite data, statistics, and overflowing totals are rejected. For a non-additive quantity,
such as absolute temperature, a row sum would not be meaningful.

### Custom content

Without `table`, the existing Series / Category / Value / Description disclosure remains
available. For content that goes beyond these layouts, `dataView` still accepts JSX and takes
precedence over `table`. It renders once inside the figure after the plot, in SSR and client
output. `null` or `undefined` uses the generated table. Custom content remains responsible for
accessible labels, units, and values.

Line and area charts use a transparent delegated hit region to select the nearest datum along the
visible path. Tooltips are positioned inside the plot region and change sides near its edges, so
they do not enlarge the document or create page scrollbars. Set `motion` on `Chart` to fade tooltip
visibility through the active theme's duration and easing tokens. Reduced-motion themes resolve
those durations to zero. Without `motion`, tooltip visibility changes immediately.

Charts consume the active public theme and surface contexts. Applications may override the
`--exact-chart-*` custom properties in the default stylesheet, but must preserve focus indication
and non-color distinctions.

Localization remains entirely owned by `@exactjs/intl`. Put ordinary `intl:message` enhancements
inside chart label components. An axis `measurement` request delegates destination selection,
conversion, precision, number formatting, and bidi behavior to intl. Source units are always
explicit.

SSR emits deterministic SVG geometry in fixed user-space coordinates together with the semantic
data view. The SVG view box scales responsively in CSS, so charts do not allocate a resize observer
or replace server geometry after hydration. All models, localized values, registrations, and output
remain request-owned. Hydration adopts the compiled DOM and installs only the selected interaction
capability.
