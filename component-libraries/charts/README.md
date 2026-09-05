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
>
	<Series id="requests" name="Requests per second">
		<Data id="exact" x="eXact" value={6200} />
		<Data id="react" x="React" value={6000} />
	</Series>
</Chart>;
```

Load `@exactjs/charts/styles.css` from the application stylesheet or client entry alongside the
application's other global styles. Every chart must provide a title and description through props
or `ChartTitle` and `ChartDescription` children.

Authored translations use the standard `@exactjs/intl` enhancements. Semantic measurements use
intl-owned presentation and conversion policy; charts do not implement locale or unit behavior.

The root surface includes semantic title and description components, axes and labels, series and
labels, keyed data and descriptions, and `Legend`. Supported types are `line`, `area`, `bar`,
`horizontal-bar`, `stacked-bar`, and `range`. Every chart includes a chart-owned tooltip and a
discoverable structured data view; `Legend interactive` adds keyboard-operable series visibility
controls. Import `@exactjs/charts/scales` when only the pure scale helpers are needed.

See the [framework reference](../../docs/charts.md) for compact inputs, localization, accessibility,
theming, SSR, and behavior details.
