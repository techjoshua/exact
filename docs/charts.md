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
