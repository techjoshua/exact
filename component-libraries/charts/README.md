# @exactjs/charts

Accessible native charts for eXact applications. The package composes ordinary components and
compiler-owned DOM operations without a virtual chart tree.

## Usage

```tsx
import { Chart, Data, Series } from '@exactjs/charts';

<Chart
	type="line"
	id="requests-chart"
	title="Concurrent SSR capacity"
	description="Requests completed per second by framework. Higher is better."
	motion
>
	<Series id="requests" name="Requests per second">
		<Data id="exact" x="eXact" value={6200} />
		<Data id="react" x="React" value={6000} />
	</Series>
</Chart>;
```

Load `@exactjs/charts/styles.css` from the application stylesheet or client entry alongside the
application's other global styles. Every chart must provide a title and description through props
or immediate `ChartTitle` and `ChartDescription` children, which the chart places directly under
its figure before axis and series declarations. Choose props or children for each label.

Authored translations use the standard `@exactjs/intl` enhancements. Semantic measurements use
intl-owned presentation and conversion policy; charts do not implement locale or unit behavior.

The root surface includes semantic title and description components, axes and labels, series and
labels, keyed data and descriptions, and `Legend`. Supported types are `line`, `area`, `bar`,
`horizontal-bar`, `stacked-bar`, and `range`. Every chart includes a chart-owned tooltip and a
discoverable structured data view; `Legend interactive` adds keyboard-operable series visibility
controls. Set `motion` to fade tooltip visibility through theme motion tokens; reduced-motion
themes remain immediate. Import `@exactjs/charts/scales` when only the pure scale helpers are needed.

When readers need to compare values across rows and columns, the `table` option generates that
layout from the same chart data:

```tsx
table={{
	layout: 'categories',
	rowHeading: 'Framework',
	caption: 'Memory by category (MB)',
	precision: 3,
	total: { label: 'Total' }
}}
```

`categories` uses one column per series. `series` transposes the matrix. `values` exposes named
columns for values, range endpoints, marks, and supplementary statistics. Tables support labels,
ordering, numeric formatting, missing values, and inline or expandable presentation. Totals are
opt-in for additive, compatible values. Incomplete rows retain a missing total. The table stays
available when a legend control hides a plotted series.

For custom content beyond these layouts, `dataView={<YourTable />}` replaces the generated table.
Without either option, the standard data disclosure remains available.

See the [framework reference](https://github.com/techjoshua/exact/blob/main/docs/charts.md) for compact inputs, localization, accessibility,
theming, SSR, and behavior details.

[Documentation](https://techjoshua.github.io/exact/#/components/charts) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/component-libraries/charts)
