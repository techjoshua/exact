# Native chart components implementation plan

## Status and governing decision

**Completed.** This plan delivered the architecture selected by
[Native chart components](native-chart-components.md). The package, intl projections, accepted-data
publisher, and lazy documentation routes are implemented and covered by focused client, server,
compiler, intl, geometry, interaction, and build-script tests.

Two implementation refinements replaced provisional mechanisms in the phase text. Responsive
charts use deterministic SVG user-space geometry and CSS view-box scaling, so they require no
resize observer or post-hydration geometry replacement. Chart-family selection remains a bounded
component-local presentation operation because `type` may be reactive at runtime; pure scale
helpers retain a focused `@exactjs/charts/scales` entry point. These choices reduce client
allocation without weakening the public family contract.

The first dependency is public intl presentation functionality. No chart implementation may work
around a missing intl capability with chart-owned message, locale, unit, conversion, precision, or
bidi code.

## Phase 0: freeze evidence and prove component composition

Before creating the public package:

1. Record the current docs bundle and route-level code reachability.
2. Create a private fixture proving `Chart → Axis → Series → Data` context registration order.
3. Exercise scalar values, keyed replacement, conditional labels, Activity parking, and disposal.
4. Prove the internal plot operation observes a complete model in client mount and SSR.
5. Prove hydration adopts the same registrations without duplicate setup or output replacement.
6. Profile allocations and generated functions for a representative 4-series, 100-point chart.
7. Write the affected and counter-metrics before selecting the final registration representation.

Gate: one component-local registration design works in client, SSR, hydration, replacement,
recovery, and cleanup without a global collector, receipt inspection, generic renderer, per-datum
bound function, or request value retained by module data.

## Phase 1: extend `@exactjs/intl`

Implement the prerequisite in intl before chart localization work.

### Scalar presentation

- Define a bounded public scalar-presentation contract owned by intl.
- Let an existing compiler-prepared scalar activation publish that projection to an optional public
  consumer while rendering normally.
- Preserve the source pattern and current translated value without exposing mutable catalogs or
  internal prepared activation authority.
- Make locale, catalog, binding, and preference changes invalidate the projection through existing
  reactive ownership.
- Reject structural message publication as a scalar through analyzer diagnostics and runtime
  validation at the trust boundary.
- Avoid adding a reader closure per message when an indexed or shared operation can represent the
  same dependency.

### Dynamic presentation

- Refactor the existing semantic-unit selection, conversion, precision, and formatting pipeline into
  a public bounded operation.
- Reuse it from the existing `intl:unit` renderer so enhancement and programmatic projections cannot
  drift.
- Expose intl-owned request and result types for numbers, dates, durations, and semantic
  measurements needed by charts.
- Prefer immutable plans plus shared operations over bound formatter methods.
- Keep CLDR data, locale parsing, native formatter caches, and conversion definitions private.
- Preserve application/user preference precedence and Unicode locale overrides.

### Compatibility and fallback tests

- Assert existing descriptor, message, and execution-contract identities remain unchanged unless an
  intentional protocol revision is documented.
- Test active translation, missing translation, source-locale fallback, unavailable enhancement,
  dynamic binding, live locale change, and RTL output.
- Compare dynamic measurement results with equivalent `intl:unit` output for every supported
  dimension, including offset and reciprocal conversions.
- Test SSR/hydration agreement and request isolation.
- Verify an application that does not select the new capability retains the established fallback and
  tree-shaking behavior.

Gate: charts can obtain every localized scalar and runtime-generated presented value through public
intl facilities, while the existing JSX analyzer and authored-source fallback remain authoritative.

## Phase 2: create the chart package and normalized model

- Add `component-libraries/charts` with `@exactjs/charts` package metadata, README, local AGENTS guide,
  build configuration, licensing, and focused exports.
- Define stable public contracts for `Chart`, `Axis`, `Series`, `Data`, labels, descriptions, legend,
  tooltip policy, scales, and measurements.
- Use intl-owned request types directly where semantic presentation is requested.
- Implement chart-, axis-, series-, and datum-local context ownership and disposal.
- Normalize compact array input and compositional registrations into one instance-owned model.
- Preserve caller array ownership and stable keyed datum identity.
- Validate duplicate IDs, missing axes, incompatible series, invalid domains, and non-finite values.
- Add component inspection summaries without retaining complete data sets in production inspection.

Gate: the model is renderer-neutral, deterministic, inspectable, bounded, and leak-free under
replacement, Activity, and repeated mount/dispose cycles.

## Phase 3: scales, layout, and base semantic output

- Implement pure linear, categorical, and temporal scale modules.
- Implement deterministic tick selection and collision reduction.
- Resolve intl presentation before measuring labels and calculating final geometry.
- Add deterministic SSR estimates and client measurement refinement.
- Add one chart-owned resize observer with coalesced updates and transactional cleanup.
- Render `figure`, caption, description, SVG plot region, legend host, tooltip host, and data-view host.
- Reserve stable IDs across SSR and hydration.
- Integrate logical layout and direction without duplicating intl bidi string behavior.

Gate: representative long translations, RTL layout, resized containers, hidden containers, and font
changes settle without loops, clipped required content, identity replacement, or hydration drift.

## Phase 4: chart-family geometry

Deliver focused modules in dependency order:

1. Vertical and horizontal bars, including negative values and zero baselines.
2. Grouped and stacked bars with stable segment identity.
3. Lines with gaps, markers, and monotone-independent linear paths.
4. Areas built on accepted line geometry and explicit baselines.
5. Range charts with named marks for mean and benchmark percentiles.

Each family receives semantic tests, geometry invariants, malformed-input tests, SSR output tests,
hydration tests, keyed update tests, and visual fixtures. Generated-output snapshots are not the
correctness oracle.

Gate: focused imports retain only shared foundations and their selected family, and representative
updates touch only affected geometry and presentation work.

## Phase 5: interaction and tooltips

- Add pointer, focus, and touch inspection against chart-owned geometry indexes.
- Implement keyboard traversal, Home, End, Escape, and focus recovery.
- Implement hoverable, dismissible, persistent tooltips using ordinary DOM.
- Reuse intl scalar projections for repeated label text and intl dynamic presentation for values.
- Use the canonical rendered label through ID relationships when the optional scalar projection is
  unavailable.
- Add optional series visibility and data-view controls with ordinary intl-enhanced package text.
- Respect reduced motion and preserve semantic updates independently of animation.

Gate: interaction passes pointer, touch, keyboard-only, zoomed-page, reduced-motion, forced-colors,
replacement, and cleanup tests without document-wide listeners or DOM rescans.

## Phase 6: accessibility acceptance

- Validate figure naming and description relationships.
- Provide a structured data view that uses the same localized projections as the visual chart.
- Add non-color series distinctions and high-contrast tokens.
- Test screen-reader-oriented structure and accessible names in English, French, German, Arabic, and
  Japanese fixtures.
- Test long labels, bidi values, missing data, hidden series, dense data, and tooltip persistence.
- Add focused `@exactjs/accessibility` diagnostics only where static chart authoring facts justify
  them; do not make optional diagnostics necessary for correct output.

Gate: automated checks and documented manual keyboard/screen-reader review find no information or
operation available exclusively through pointer hover, color, animation, or visual position.

## Phase 7: theme integration

- Consume existing theme and surface contexts.
- Derive series colors, foregrounds, strokes, and patterns through the public theme derivation API.
- Define semantic chart CSS properties and a small default stylesheet.
- Test light, dark, high-contrast, forced-colors, nested surface, and live theme changes.
- Keep application overrides bounded to presentation and preserve required focus visibility.

Gate: theme changes do not rebuild the chart model, lose focus, alter data semantics, or introduce a
chart-specific provider.

## Phase 8: SSR, hydration, and capability reachability

- Render deterministic semantic and SVG output through native compiled server artifacts.
- Keep layout frames, presented values, captures, and generated output request-owned.
- Adopt server output without replacing valid paths, labels, controls, or data-view state.
- Exercise locale and unit-preference changes before and after hydration through existing intl
  recovery behavior.
- Verify static charts can remain server-only and interactive capabilities hydrate only when used.
- Audit lazy imports, independently compiled packages, and microfrontend ownership.

Gate: server isolation, cancellation, rollback, hydration recovery, lazy package loading, and
capability closure pass focused tests with no request/component values in module caches.

## Phase 9: performance-report data pipeline and docs page

- Define a compact versioned accepted-metrics summary produced by repository performance tooling.
- Preserve immutable raw evidence and environment metadata outside the browser artifact.
- Include arithmetic mean, suite percentiles, raw historical Exact, eligible normalized Exact-before,
  and normalization eligibility explanations.
- Add a lazy `/performance` docs route that imports the chart package only for that route.
- Present browser experience, retained heap, meaningful SSR capacity, allocation diagnostics, and
  payload size with complete accompanying tables.
- Keep artificial lanes visibly diagnostic and explain whether higher or lower is preferable.
- Add written interpretation of spread, contradictory movement, practical impact, and limitations.
- Do not normalize deterministic bytes or function counters in the page or generation pipeline.

Gate: the page accurately renders one admitted report, works under direct navigation and hydration,
remains absent from unrelated route chunks, and agrees numerically with the stored complete report.

## Phase 10: documentation and release acceptance

- Publish package API orientation and examples in `component-libraries/charts/README.md`.
- Add concise package-local author guidance and update the reusable eXact skill.
- Add current engineering references for the delivered chart and intl contracts.
- Add public docs navigation, metadata, search terms, accessibility guidance, theming guidance,
  localization examples, and limitations.
- Preserve the hand-written story page unless delivered behavior makes it incorrect.
- Move the completed proposal records to `docs/history` after current references become authoritative.

Run focused type, package, compiler, DOM, SSR, hydration, accessibility, intl, theme, build-script,
and docs tests throughout implementation. Before acceptance, run repository formatting,
maintainability, oversized-module, source-architecture, platform-boundary, release, and relevant
performance checks in their documented order.

Gate: all required checks pass from their intended clean-build ordering, the public docs describe
only delivered behavior, and performance counter-metrics show no unexplained regression.

## Performance gates

Before expanding beyond the proof fixture, record:

- client raw, decoded, and executed bytes;
- parsed, compiled, and invoked functions;
- startup allocation and retained heap;
- chart mount, hydration, update, resize, hover, and keyboard latency;
- DOM node and listener counts;
- SSR render time, response bytes, and transient allocation; and
- unrelated docs-route chunk reachability.

Use interleaved before/current sampling on a quiet machine for timing claims. Do not reject or erase
diagnostic runs solely because an environment guard marks them unpublishable; retain and label their
evidence. Accepted claims require enough samples to explain surprising movement and must distinguish
deterministic counters from noisy timing measurements.

No target is a hard bundle-size ceiling. Size is a counter-metric weighed against interaction,
accessibility, maintainability, and user-perceived responsiveness. Client bytes receive greater
scrutiny than server-only bytes.

## Estimated delivery

After Phase 0 confirms the composition model:

- Intl prerequisite: 1–2 weeks.
- Chart model, layout, and initial families: 3–4 weeks.
- Interaction, accessibility, theme, SSR, and hydration: 2–3 weeks.
- Performance data pipeline, docs page, documentation, and acceptance: 1–2 weeks.

The combined estimate is approximately 7–11 engineering weeks. A failed Phase 0 or an intl protocol
revision changes that estimate and requires an explicit plan update before chart implementation
continues.
