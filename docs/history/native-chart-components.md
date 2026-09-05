# Native chart components

## Status

**Implemented and accepted.** This document records the architecture of the accessible,
theme-aware native eXact chart library and the performance-reporting page that exercises it.
Current usage is documented in [`../charts.md`](../charts.md); delivery was governed by the accompanying
[implementation plan](native-chart-components-implementation-plan.md).

The internationalization work in this proposal is a prerequisite owned by `@exactjs/intl`. The
chart package must not implement a second translation, locale, formatting, or unit-conversion
system.

## Decision

Add `@exactjs/charts` as an ordinary compiler-built component library under
`component-libraries/charts`. Charts coordinate their declarative children through chart-local
contexts while retaining normal component ownership. Native component operations remain opaque;
the chart does not inspect child render output or introduce a chart VNode, generic render tape, or
runtime component classifier.

The first release supports line, area, vertical bar, horizontal bar, stacked bar, and range charts.
It uses SVG for data geometry and ordinary semantic HTML for titles, descriptions, legends,
tooltips, controls, and the accessible data view. Canvas may be investigated later for genuinely
large data sets, but is not part of the first contract.

Internationalized authoring continues to use the existing enhancement syntax on direct intrinsic
or `_` boundaries:

```tsx
<SeriesLabel>
	<_ intl:message>Outside temperature</_>
</SeriesLabel>
```

`@exactjs/intl` exposes resolved scalar and dynamic measurement presentation through public,
bounded capabilities derived from the same compiler-prepared activation. `@exactjs/charts` only
consumes those capabilities. Authored source remains the unavailable-enhancement and missing-catalog
fallback.

## Goals

- Provide a native eXact chart API that reads like ordinary TSX.
- Preserve component-local compilation, opaque child operations, durable ownership, and precise
  updates.
- Support pointer, touch, keyboard, screen-reader, reduced-motion, zoom, and high-contrast use.
- Integrate with eXact themes without imposing a fixed visual system.
- Use existing intl enhancements for authored and package-owned text.
- Reuse `@exactjs/intl` for locale policy, formatting, semantic units, conversion, and direction.
- Render deterministically during SSR and adopt without replacing correctly rendered chart DOM.
- Keep basic charts small and permit focused import subpaths to remove unused chart families.
- Publish the accepted framework-performance evidence through an accessible docs application page.

## Non-goals

- A general visualization grammar or application-wide graphics interpreter.
- A VNode representation for chart marks or labels.
- React-style repeated component execution or hook APIs.
- Chart-owned translation catalogs, locale parsing, CLDR tables, unit conversions, bidi formatting,
  or native formatter caches.
- Runtime parsing of authored message text or units.
- Arbitrary user-authored HTML inside SVG text.
- A canvas-first renderer, WebGL renderer, map library, diagram editor, or spreadsheet engine.
- Silent aggregation, sampling, normalization, or unit conversion that changes the meaning of data.
- Making the public performance page the correctness oracle for benchmark collection.

## Authoring model

The compact form remains suitable for already-localized labels and ordinary dense data:

```tsx
<Chart type="line" categories={categories} xAxis={xAxis} yAxis={yAxis} series={series} />
```

The compositional form is primary when labels, descriptions, localization, interaction, or
per-datum semantics matter:

```tsx
<Chart type="line" height={360}>
	<ChartTitle>
		<_ intl:message>Outdoor conditions</_>
	</ChartTitle>

	<ChartDescription>
		<_ intl:message>Temperature recorded during the last 24 hours.</_>
	</ChartDescription>

	<Axis id="time" position="bottom" scale="time">
		<AxisLabel>
			<_ intl:message>Time</_>
		</AxisLabel>
	</Axis>

	<Axis
		id="temperature"
		position="left"
		scale="linear"
		measurement={{
			quantity: 'temperature',
			usage: 'weather',
			sourceUnit: 'celsius',
			convertTo: 'auto',
			unitDisplay: 'short',
			maximumFractionDigits: 1
		}}
	>
		<AxisLabel>
			<_ intl:message>Temperature</_>
		</AxisLabel>
	</Axis>

	<Legend position="top" />

	<Series id="outside" xAxis="time" yAxis="temperature">
		<SeriesLabel>
			<_ intl:message>Outside temperature</_>
		</SeriesLabel>

		{this.map(
			() => props.readings,
			(reading) => reading.id,
			(reading) => (
				<Data id={reading.id} x={reading.time} value={reading.temperature}>
					<DataLabel>
						<_ intl:message>Reading at {reading.time}</_>
					</DataLabel>
					{reading.directSunlight && (
						<DataDescription>
							<_ intl:message>Measured in direct sunlight.</_>
						</DataDescription>
					)}
				</Data>
			)
		)}
	</Series>
</Chart>
```

Strings accepted by compact props are already-localized values or intentional literals. The chart
package does not send arbitrary prop strings through translation lookup.

## Composition and ownership

`Chart`, `Axis`, `Series`, and `Data` create stable, non-reactive service contexts. Their mutable
contents are instance-owned registrations and compiler-observed state rather than global registries.

```text
Chart
├─ ChartTitle and ChartDescription register semantic regions
├─ Axis registers scale and presentation policy
│  └─ AxisLabel registers its owned label range
├─ Legend registers one requested presentation surface
├─ Series registers stable identity and axis ownership
│  ├─ SeriesLabel registers its owned label range
│  └─ Data registers a keyed value and optional descriptive ranges
└─ internal plot operation reads the finalized chart-local model
```

The proof implementation must establish that registrations are complete before the plot consumes
them in client mount, SSR, hydration, replacement, keyed movement, and recovery. If ordinary context
construction order cannot provide that guarantee, implementation stops for a focused compiler or
component-composition decision; it must not add a global collector or interpret receipts.

Registrations have explicit disposal. Replacing an axis, series, datum, label, or chart releases its
registration and all interaction state associated with that owner. Keyed rows preserve datum and
focus identity. Activity retention preserves parked registrations without publishing stale layout.

## Internationalization ownership

### Hard boundary

`@exactjs/charts` must contain no implementation of:

- message extraction or lookup;
- catalog loading or fallback selection;
- locale parsing or likely-region selection;
- plural, list, date, duration, display-name, currency, or unit formatting;
- CLDR preference data;
- measurement-system inference;
- unit conversion formulas;
- precision policy, localized unit placement, or bidi string construction; or
- `Intl.*` formatter pooling.

Those responsibilities remain in `@exactjs/intl` and the cache-backed core intl facade. Charts may
depend only on documented public intl contracts. It may declare semantic requests and render the
result, just as it declares a theme role and renders resolved theme tokens.

### Existing enhancement syntax remains authoritative

The proposal does not add a `msg` tag, chart catalog, translation callback, runtime parser, or
component-prop translation convention. The direct-boundary rule remains intact:

```tsx
// Valid: caller-owned direct message boundary.
<AxisLabel>
	<_ intl:message>Temperature</_>
</AxisLabel>
```

```tsx
// Invalid: intl cannot claim an opaque component's content.
<AxisLabel intl:message>Temperature</AxisLabel>
```

Package-owned chart chrome uses the same enhancement syntax within chart package source. This
includes empty-state text, data-view controls, table headings, keyboard instructions, and tooltip
descriptions.

### Public scalar projection supplied by intl

The same prepared scalar activation may publish a bounded, read-only presentation value to an
optional consumer. The public contract and its context or registration mechanism belong to
`@exactjs/intl`; charts must not define an intl-specific context or inspect a prepared activation.

The semantic projection includes at least:

- the currently resolved scalar string;
- the compiler-prepared source fallback;
- the effective locale and direction; and
- reactive invalidation when locale, catalog, preference, or scalar bindings change.

Only compiler-proven scalar messages can publish this value. A message containing movable element
or opaque component structure remains render-only. The intl analyzer must provide a source
diagnostic when a scalar consumer requires a structurally incompatible message.

This projection lets a chart repeat a translated label in a visible tooltip, data-table header, or
SVG description without reading DOM text, flattening children, or invoking one child operation more
than once.

### Source fallback

Fallback remains a required property of the existing enhancement path:

- With an active translation, rendered content and the scalar projection use that translation.
- With an active intl capability but no applicable catalog message, both use the prepared source
  plan.
- With the optional enhancement unavailable, the authored JSX renders unchanged.
- A chart's canonical visible label and accessible relationship must remain meaningful even when no
  scalar projection is published. Secondary surfaces reference the canonical label rather than
  becoming empty.
- Activating scalar exposure must not change message identity, translator structure, catalog
  validation, or the unavailable-enhancement path.

### Dynamic values and semantic units

Runtime-generated ticks cannot be created by parsing or synthesizing intl JSX at runtime. Intl must
therefore expose a public presentation operation backed by its existing implementation. The chart
passes an intl-owned request type containing the quantity, usage, explicit source unit, destination
policy, precision policy, and relevant domain values. Intl returns a bounded immutable plan or
projection used through shared functions, without per-tick bound functions.

The intl operation owns destination selection, conversion, formatting, precision, unit display,
and direction. It must use the same implementation and produce the same results as `intl:unit`.
Charts own only tick generation, scale geometry, and placement.

The source unit is always explicit for chart data. Locale never determines what an unlabelled number
means. A user or application preference overrides CLDR selection; an explicit destination overrides
both. Conversion occurs before geometry when an affine or reciprocal transformation changes the
display scale. Compound destinations require a documented scalar-axis policy while remaining valid
for descriptive surfaces.

Benchmark charts keep benchmark-defined units such as milliseconds, bytes, megabytes, and requests
per second. They localize formatting and prose but do not automatically change comparison units.

## Chart model

Each chart owns a normalized model containing stable axes, series, data identities, presentation
requests, and interaction state. It does not store rendered nodes. Immutable input arrays may be
referenced while owned by the caller; normalized mutable indexes are chart-instance-owned and
released with the chart.

Values remain numeric or temporal until the final presentation boundary. Formatted strings never
become domain keys or scale inputs. Invalid, missing, infinite, and non-numeric values have explicit
policies rather than accidental coercion.

The model supports:

- categorical, numeric, and temporal axes;
- explicit and inferred domains;
- linear and time scales initially;
- grouped and stacked series;
- positive, negative, and zero baselines;
- gaps in line and area data;
- range extents plus named marks such as mean and percentiles; and
- stable datum identity independent of display order.

Logarithmic, symlog, polar, pie, and geographic projections are deferred until independently
specified and tested.

## Layout and rendering

The layout pipeline is deterministic:

```text
container constraints
→ resolve localized presentation
→ measure or estimate text
→ reserve title, legend, and axis regions
→ choose tick density
→ calculate plot rectangle and scales
→ emit geometry and interaction targets
```

SSR uses deterministic font-independent estimates and explicit dimensions or an aspect ratio. The
client may refine layout after actual measurement without replacing semantic regions or losing
focus. Resize work is coalesced through one chart-owned observer and scheduled update.

Localized text can expand. Layout first wraps or reflows legends, then reserves label space, then
reduces tick density. Truncation requires an explicit policy and never removes the complete tooltip,
accessible name, or table value.

SVG paths and mark attributes are produced by focused chart-family modules. Shared scale, tick,
layout, and geometry helpers remain pure. Rendering code does not concatenate arbitrary SVG markup
or assign unsafe HTML.

## Interaction

Every interactive datum is reachable without a pointer. The initial behavior includes:

- hover and focus inspection;
- touch activation without requiring hover emulation;
- arrow-key navigation in visual order;
- Home and End movement to an axis extent;
- Escape dismissal of a persistent tooltip;
- optional series visibility controls;
- retained focus across non-structural data updates; and
- deterministic fallback when a focused datum is removed.

Tooltips are chart-owned DOM regions, not browser `title` attributes. They are hoverable,
dismissible, focus-associated, viewport constrained, and stable while the pointer crosses from a
mark to the popup. Tooltip positioning reads geometry already owned by the chart rather than
rescanning the DOM.

Motion is optional and respects reduced-motion policy. Animation never delays the semantic or
accessible value update and does not become authoritative chart state.

## Accessibility

The chart's semantic root is a `figure` with a real caption and description. The SVG has an
appropriate accessible name and description. A structured HTML data view supplies the detailed
equivalent for complex charts.

The initial contract requires:

- visible or screen-reader-accessible title and description;
- a programmatically associated legend;
- distinguishable series without color alone through strokes, markers, or patterns;
- keyboard-operable data inspection;
- localized complete tooltip content;
- a table or equivalent structured data view using the same presented values;
- high-contrast and forced-colors behavior;
- reduced-motion behavior;
- logical ordering and positioning for RTL content;
- no inaccessible information available only on hover; and
- sufficient target sizes or proximate keyboard alternatives.

The data view may be visually collapsed by default but must be discoverable and operable. A visible
toggle is preferred for complex charts. ARIA references use hydration-stable IDs. The accessibility
package may add focused language diagnostics, but the base chart output remains semantically valid
without that optional enhancement.

## Theming

Charts consume public theme context and derived data colors. They do not create a parallel theme
provider. Default styles use semantic CSS custom properties so an application can override chart
presentation without replacing behavior.

The resolved theme supplies background, foreground, grid, axis, focus, tooltip, and series tokens.
Series derive colors, contrasting foregrounds, strokes, and patterns from the established theme
data-color derivation. Theme changes update presentation without reconstructing the chart model.

User options may override presentation tokens but cannot remove required focus indication or make
hidden semantic content the only accessible representation.

## SSR and hydration

Server output includes the semantic figure, labels, legend, SVG geometry when dimensions are
deterministic, and accessible data representation. Request values and resolved localized strings
remain request-owned. Module-level artifacts may retain only immutable component and formatting
plans.

Hydration claims existing regions and event targets. It must preserve form controls, focus,
disclosure state, and correctly rendered paths. A locale or measurement preference mismatch follows
the existing intl and hydration recovery contracts; charts do not invent a separate reconciliation
or serialized locale protocol.

Charts without client interaction should be eligible for server-only output. Interactive charts
hydrate only the behavior selected by their capabilities. Lazy docs routes must not add the chart
runtime to unrelated documentation pages.

## Package surface and code reachability

The package provides a convenient root export and focused subpaths for applications that need strict
reachability control. The exact split is selected after the proof profile, but likely ownership is:

- shared contracts and chart shell;
- Cartesian scales and axes;
- line and area geometry;
- bar and stacked geometry;
- range and distribution geometry;
- interactions and tooltips;
- accessible data view; and
- default theme styles.

Importing one focused chart family must not retain every geometry implementation. Package metadata
must identify compiled components, trusted component-library artifacts, styles, and any optional
enhancement requirements without shipping descriptive inventories at runtime.

The package begins with a concise `README.md` and application-authoring `AGENTS.md`, both included in
published files. The reusable eXact skill is updated so the package is discoverable.

## Performance documentation page

The docs application adds a lazy `/performance` route backed by compact accepted benchmark data, not
raw trace files. The page presents the frameworks in the repository's required order and adds any
accepted fifth participant consistently.

It includes only decision-useful charts and tables:

- browser responsiveness, evaluation, navigation, optimistic feedback, and retained heap;
- executed bytes and invoked-function population where they explain startup behavior;
- SSR latency and concurrent requests per second across meaningful lanes;
- render-only time and allocation where they diagnose server capacity;
- response payload size; and
- the current framework population, while raw and control-normalized historical Exact comparisons
  remain available only in internal engineering evidence.

Distribution charts show the suite-produced percentiles and arithmetic mean without expanding every
percentile into a separate table row. Comments explain whether higher or lower is preferable, the
spread, measurement environment, normalization eligibility, contradictory movement, and practical
user or operator impact. Artificial diagnostic lanes are labelled as such and are not presented as
overall framework rankings.

The page consumes immutable admitted benchmark summaries generated by the performance tooling. It
does not rerun benchmarks, derive normalization in the browser, or substitute chart output for the
complete stored metrics report.

## Security and robustness

- Labels and values render through ordinary safe text paths.
- Rich tooltip HTML requires an existing explicit unsafe-HTML boundary and is not part of the base
  API.
- URL-valued data does not become navigation without an authored link or callback.
- Large data sets have bounded marks, labels, and interaction targets with explicit rejection or
  caller-selected reduction policy.
- Non-finite dimensions, values, domains, and animation durations fail deterministically.
- Formatter callbacks remain authored executable functions and are never serialized as data.
- SSR does not retain request values, locale state, chart models, captures, or generated output.

## Acceptance summary

The proposal is complete only when:

1. Intl exposes the required scalar and dynamic presentation facilities without changing existing
   extraction, translation, or fallback semantics.
2. The composition proof passes client, SSR, hydration, replacement, keyed movement, and cleanup.
3. Every chart family has semantic, visual, interaction, accessibility, localization, theme, and
   server coverage proportional to its risk.
4. Focused imports demonstrate useful tree shaking and the base chart does not retain unrelated
   chart families or optional capability inventories.
5. The docs performance route presents admitted data accurately and remains lazy from unrelated
   routes.
6. Focused profiles show no avoidable per-datum closures, formatter construction, descriptor arrays,
   DOM rescans, or retained instance/request values.
7. Relevant engineering docs, package docs, public docs, route metadata, navigation, search terms,
   and reusable guidance agree with the delivered behavior.
