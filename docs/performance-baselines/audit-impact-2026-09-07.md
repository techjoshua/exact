# Audit-fix performance isolation, September 7, 2026

This follow-up tests whether the [framework audit](../adversarial-framework-audit-2026-09-07.md) caused the relative Node SSR change in the [benchmark refresh](post-audit-2026-09-07.md). It isolates the eight audit-modified source modules while retaining the compiler, ABI baseline, dependency installation, workload, and measurement runtime.

## Structural and execution evidence

The before/after Node SSR renderer bundles are byte-identical: SHA-256 `16f1fc40ead96c59ced3de831ac435de49a1cdb12d0e9932a324f2eab8328153`. This is also the bundle used in the published refresh. Six audited modules were loaded during bundling but contributed no retained code.

A separate precise-coverage diagnostic discarded twenty warmup responses, reset counts, and rendered 200 preloaded HTTP responses. The renderer ran 200 times. None of the audit-modified runtime functions ran during those requests. Six existing audited runtime modules and the new registry-entry helper were loaded outside the bundle, but only their module initialization appeared before the counter reset. Coverage instrumentation was absent from the timed experiment.

React's built participant entry was unchanged between the older and refreshed published captures: SHA-256 `7126bb9c6339b5ad52cb7044b69124667c3724174d1e2064431e83d03d7aab63`. This identifies the participant bundle, not every external React DOM dependency or host condition.

## Controlled timing

Node 26.8.1, two independent load drivers, preloaded data, ten-second warmup, and fifteen seconds each at total concurrency 16 and 32. Four fresh populations used the orders before/after/React, React/after/before, after/before/React, and React/before/after. Every variant occupied the same average position in the sequence. Identical startup loader hooks supplied either the pre-audit or current runtime modules; no source files were reverted. The after-transpilation was checked against the built runtime before admission.

All completed responses matched their expected identity, demand accounting reconciled, and there were zero request errors. Aggregate RPS uses valid responses divided by the union of the two drivers' stage spans, including drain.

| Concurrency | eXact before | eXact after | After change | React control |
| ----------- | -----------: | ----------: | -----------: | ------------: |
| 16          |        10831 |       10352 |       -4.42% |         11239 |
| 32          |        10368 |       10300 |       -0.66% |         10788 |

Individual before/after pairs:

| Population | Concurrency | Before valid RPS | After valid RPS | After change |
| ---------- | ----------: | ---------------: | --------------: | -----------: |
| 1          |          16 |            11020 |           10462 |       -5.06% |
| 2          |          16 |            10907 |           10661 |       -2.25% |
| 3          |          16 |            10488 |           10221 |       -2.54% |
| 4          |          16 |            10908 |           10063 |       -7.75% |
| 1          |          32 |            10662 |           10000 |       -6.21% |
| 2          |          32 |            10304 |           10432 |        1.24% |
| 3          |          32 |            10481 |           10071 |       -3.91% |
| 4          |          32 |            10027 |           10699 |        6.70% |

These short, workstation-local populations cannot establish that every sub-percent difference is real or exclude indirect code-layout effects. Background desktop processes and the pre-existing development server remained running. The comparison tests this SSR fixture, not all framework features.

## Relative performance against React

The eXact/React throughput ratio is the relevant comparison when workstation load varies. A ratio
above 1 means higher eXact throughput. Same-session controls reduce host variation, though sequential
blocks can still encounter different background load and the two frameworks need not respond to it equally.

| Node SSR comparison           | Concurrency 16 | Concurrency 32 |
| ----------------------------- | -------------: | -------------: |
| Earlier public capture        |          1.106 |          1.130 |
| Refreshed public capture      |          0.918 |          1.000 |
| Controlled pre-audit / React  |          0.964 |          0.961 |
| Controlled post-audit / React |          0.921 |          0.955 |

The historical relative shift remains unexplained. The controlled audit comparison narrows the
question but does not account for the entire earlier lead disappearing. The later same-entry-path
confirmation contains no React control and cannot independently establish a relative regression.

Inspection against the current-runtime refresh commit `e689a2c3` found unchanged locked versions and
integrity values for the comparison's React 19.2.0, React DOM 19.2.0, and React Router 7.18.2 packages.
React's Node renderer entry hash is also unchanged. The Node load driver and React Node renderer source
have no changes against that commit. Worker changes add native Bun paths; the Node request handler is
unchanged. The archived orchestration scripts retain the same Node transport, stages, ordering, and
driver count; the refresh adds an untimed response-identity probe before warmup and artifact checks.
No React-specific Node optimization was identified. Historical installed dependency bytes were not
fully archived, so lockfile equality is supporting evidence rather than proof of an identical executable environment.

## Same-entry-path confirmation

A second experiment used the same renderer file path and bytes for both variants, removing the separate bundle paths from the first experiment. Four fresh before/after pairs alternated order, with two drivers, ten-second warmups, and twenty-second measurements at total concurrency 16. Only the audit runtime source overrides differed. All eight blocks passed response identity, demand accounting, completion, and zero-error checks.

Aggregate throughput was 10502 valid RPS before and 10214 after, a -2.74% change.

| Population | Before valid RPS | After valid RPS | After change |
| ---------- | ---------------: | --------------: | -----------: |
| 1          |            10901 |            9975 |       -8.49% |
| 2          |            10182 |           10194 |        0.12% |
| 3          |            10148 |           10351 |        2.00% |
| 4          |            10776 |           10336 |       -4.08% |

The initial c16 aggregate fell 4.42%; the stricter confirmation fell 2.74%, with individual pairs going both directions. A small slowdown remains an unresolved candidate. These workstation measurements do not establish its cause or justify calling the audit performance-neutral. The identical renderer and separate execution coverage argue against direct costs from the patched functions on this request path, but do not rule out indirect module effects or host variability.

Pre-audit eXact also trailed the React control in the first experiment. Consequently, the audit has not been shown to explain the much larger historical shift in relative React performance. The [confirmation raw capture](audit-impact-2026-09-07-common-raw.json) and compact archive retain the second experiment without replacing public chart populations.

## Costs the audit does introduce

Transactional Map/Set deletion now captures insertion-order anchors in linear time. The previous refresh measured a 10,000-entry Map delete/restore at about 0.081 ms for a committed transaction and 0.919 ms for rollback, compared with 0.001 ms for ordinary delete/reinsert. Rollback includes exception handling and does more work to preserve ordering. Validation also counts Map-key bytes and enforces collection budgets earlier. These changes can cost time in applications that exercise those paths; they did not execute on this SSR request path.

## Generated target correction

The investigation found that a prior TypeScript-only incremental core build had left generated client/server task helper copies missing the final rejected-await pause fix. Running the package target compiler refreshed them before isolation. The corrected SSR renderer bundle remained byte-identical; the rebuilt browser entry grew by 72 bytes. The prior browser measurements remain evidence of their recorded artifacts, rather than measurements of that final task-helper correction. Future runtime benchmark preparation must include the target-generation step, not only TypeScript compilation.

Direct checks against both regenerated task-helper targets confirmed that rejected task continuations wait for their owner to resume. `npm run check:compiled-abi` also passed against the unchanged frozen 0.5.0 artifacts, covering client tasks, reactive updates, keyed identity, SSR, hydration, and disposal.

The [compact evidence](audit-impact-2026-09-07.json) includes source diffs, bundle inventories, coverage, per-population timings, and exact runners. The [raw timing capture](audit-impact-2026-09-07-raw.json) retains both drivers and worker telemetry for every population. These diagnostic runs do not replace the public performance charts.
