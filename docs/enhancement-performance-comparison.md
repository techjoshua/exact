# Enhancement changes: before and after

The initial before/after comparison found performance regressions. The final isolated comparison
shows lower medians for every measured latency. Mounting and hydration improved in every paired
round; some SSR and update results remain variable. Runtime and compiler changes remove unnecessary
reconciliation, target scans, allocations, live-list maintenance, and structural serialization.

Broader performance acceptance remains open for bundle growth, Intl comparison, and paired browser
measurement. These results establish improvements in the tested workloads, not a universal speedup.
The subsequent [framework comparison](performance-baselines/enhancement-framework-2026-09-18.md)
refreshes the production browser and SSR charts. Its eXact client artifacts grew 11.5% gzip against
the September 14 baseline; its cross-day timing changes do not isolate this implementation.
The subsequent [capability optimization](performance-baselines/enhancement-capabilities-2026-09-18.md)
removes unused renderer dependencies and measures the resulting bundle and retained-memory savings
with paired browser captures. It does not replace the historical framework charts.

## Optimized comparison

The [Intl compiler correction](performance-baselines/intl-capability-fix-2026-09-18.md) subsequently
resolves the fixture's missing-task-capability failure. Its current diagnostic measurements do not
replace the unavailable historical Intl comparison below.

Measured September 18, 2026 at 17:11 UTC, against clean commit
`056b115478acb4a390ce750b26a4c066a2ff6a63`. Four alternating rounds use twenty client warmups,
five hundred server warmups, and twenty-one samples, with 100 receivers and ten updates per receiver.
SSR runs without a DOM in a separate process. Each browser workload measures mount/updates and
hydration in separate fresh processes. No builds or tests ran concurrently with measurement.
Results are medians of the four per-process medians. Times are milliseconds; negative changes
mean faster. Both revisions use this same protocol and unminified bundles for profiling.

| Workload                      |   Mount before / after | Ten updates before / after | SSR string before / after | Hydrate before / after |
| ----------------------------- | ---------------------: | -------------------------: | ------------------------: | ---------------------: |
| Plain fragments               |   2.434 / 2.171 (-11%) |       5.687 / 4.298 (-24%) |      0.175 / 0.150 (-14%) |   2.102 / 1.747 (-17%) |
| Enhanced intrinsic            | 14.274 / 12.408 (-13%) |       7.528 / 5.629 (-25%) |      0.901 / 0.657 (-27%) | 17.525 / 10.008 (-43%) |
| Enhanced component root       | 12.545 / 10.509 (-16%) |        1.435 / 1.408 (-2%) |      0.558 / 0.467 (-16%) | 14.645 / 11.885 (-19%) |
| Explicit host and contributor |    8.727 / 8.076 (-7%) |        5.990 / 5.458 (-9%) |      0.551 / 0.495 (-10%) |  12.905 / 6.704 (-48%) |

String and stream SSR improved in every paired round for intrinsic and explicit-host enhancements.
Stream medians improved 19%, 29%, 18%, and 13% respectively across the four workloads. All mounting
and hydration cases improved in every paired round. Plain, intrinsic, and explicit-host updates
improved in every paired round;
component-root updates were effectively unchanged, with differences in both directions.

Plain and component-root SSR had paired differences in both directions. Their string-rendering
ranges were -19% to +79% and -55% to +90%, so those median improvements are not established
consistent gains. Raw samples and ranges remain available rather than treating every percentage
as statistically certain. Earlier complete captures also show timing variation; these are bounded
workload results, not guarantees for every application or runtime tier.

All measured receiving owners and hosts survive updates. Enhanced hydration replaces zero Elements,
versus 101 in the baseline. Explicit-host HTML is back to 26,968 bytes, equal to the baseline,
while retaining correct hydration. The other HTML byte counts are also unchanged.

The combined fixture client bundle remains larger: 190,363 bytes gzip versus 164,995 (+15%).
Server gzip is 114,291 versus 111,241 (+3%). These are full, unminified fixture bundles including
Intl, not production-minified application downloads. Size growth in this capture has not been
resolved. The subsequent production framework capture measures the separate application size
increase noted above; size remains part of broader acceptance.

The current artifacts and raw rounds are under `.tmp/enhancement-comparison`. Earlier complete
captures include `.tmp/enhancement-comparison-composable-1643`,
`.tmp/enhancement-comparison-snapshot-interleaved`, and
`.tmp/enhancement-comparison-isolated-before-description`. Intl timing remains unavailable for
the failure described below. This paired fixture does not measure browser layout or paint.

Validation passed the workspace build, documentation verification, native compiler suites,
ABI/release/platform checks, lint, source architecture, and JSDoc checks. The final full package
suite passed 2,212 tests with 15 skips and no failures (372 passing files, two skipped).
Coverage includes lazy inspection without construction, creation-domain retention,
derived children, hydration identity, reactive updates, ref transitions, and disposal.

## Bun server cross-check

Bun 1.4.2 measured the same final server bundles at 17:12 UTC, with four alternating fresh-process
pairs, 500 warmups and 21 samples per workload. No other builds, tests, or benchmarks ran concurrently.

| Workload                      | SSR string before / after |
| ----------------------------- | ------------------------: |
| Plain fragments               |       0.165 / 0.156 (-6%) |
| Enhanced intrinsic            |      0.863 / 0.706 (-18%) |
| Enhanced component root       |      0.659 / 0.530 (-20%) |
| Explicit host and contributor |      0.557 / 0.469 (-16%) |

All three enhancement cases improved in every paired round for both string and stream rendering.
Plain-fragment results varied substantially (-50% to +109% for string rendering), so no consistent
plain-fragment speedup is established. An earlier capture found a consistent 9% plain-fragment
regression; removing the remaining temporary object spreads from fragment receipt creation removed
that pattern in the final capture. Raw Bun rounds and the aggregate report are under
`.tmp/enhancement-bun-round-*.json` and `.tmp/enhancement-bun-comparison.json`. The shared runner's
`--measure-server <bundle-directory> <result-file>` mode reproduces each server worker.

## Initial comparison method

- Before: clean commit `056b115478acb4a390ce750b26a4c066a2ff6a63` in an isolated worktree.
- After: the pre-optimization uncommitted implementation on `codex/document-shell-composition`,
  preserved in the initial artifact capture.
- Each checkout uses its own built compiler and runtime, with the locked dependencies.
- Identical fixture source except the required old `_target` child syntax versus new self-closing syntax.
- Four comparison rounds in alternating before/after order, with a fresh process for each side.
- Each process uses five warmups and eleven samples per workload, 100 receivers, and ten updates
  of all receivers. Results below are medians of the four per-process medians.
- Node 26.8.1, Windows x64, Ryzen 7 8745HS, JSDOM, September 18, 2026. No concurrent builds or
  tests ran during the timed comparison.

This compares the entire current change, including child/document composition. It does not isolate
which individual implementation change caused a difference. Plain receivers run in a bundle that
also includes enhancement scenarios; this is not a separate enhancement-free application bundle.

## Initial results, before optimization

All times are milliseconds. Positive changes mean slower.

| Workload                      | Mount before / after | Ten updates before / after | SSR string before / after | Hydrate before / after |
| ----------------------------- | -------------------: | -------------------------: | ------------------------: | ---------------------: |
| Plain fragments               |    2.43 / 2.56 (+6%) |          5.97 / 6.27 (+5%) |      0.438 / 0.566 (+29%) |     2.52 / 2.98 (+18%) |
| Enhanced intrinsic            |  15.59 / 14.38 (-8%) |         7.19 / 9.30 (+29%) |      1.530 / 2.033 (+33%) |    17.45 / 18.81 (+8%) |
| Enhanced component root       | 12.70 / 15.11 (+19%) |          1.48 / 1.53 (+3%) |      1.073 / 2.047 (+91%) |   14.56 / 18.66 (+28%) |
| Explicit host and contributor |   10.18 / 9.22 (-9%) |         6.70 / 9.93 (+48%) |     0.989 / 2.173 (+120%) |    12.64 / 12.76 (+1%) |

SSR string and stream rendering were slower in every round for every completed workload.
Stream medians increased 21%, 27%, 86%, and 122% respectively. First-byte latency changed similarly.
Component-enhancement mounting, plain hydration, component-enhancement hydration, and explicit-host
updates were also slower in every round. For example, component SSR regressions ranged from 68%
to 125% across paired rounds; plain SSR ranged from 27% to 34%.

Other results are less conclusive. Plain mounting/updates, intrinsic mounting/updates/hydration,
component updates, and explicit mounting/hydration had paired-round differences in both directions.
The apparently faster mounts are not established improvements. Raw samples and paired-round ranges
are retained rather than presenting every percentage as a statistically certain effect.

## Correctness and output differences

All completed workloads checked final visible text, title contributions, host counts, and retention
of receiving owners/hosts during updates. Plain hydration retained all Elements on both revisions.
The old runtime replaced 101 Elements during hydration in each enhanced/explicit workload; the new
runtime replaced none. Old component-root hydration also constructed 102 receivers versus 100 now.
Hydration timings therefore compare the actual work each revision performed, including old repair
work, rather than claiming identical adoption algorithms.

In the initial comparison, HTML byte counts were unchanged for plain, intrinsic, and component-root cases. Explicit placement
grew from 26,968 to 42,684 bytes (+58%) because its emitted boundary representation changed. That
extra output is part of the observed SSR cost, not excluded from it.

The attempted Intl workload fails on both revisions with
`Task component construction requires the compiler-selected task capability`. It produces no valid
before/after result and is excluded. This does not invalidate the separate passing Intl correctness
matrix, whose fixtures have different lifecycle/capability requirements. Automatic fragment hosts
are also excluded from this comparison because that behavior did not exist in the baseline.

The initial combined fixture client bundle grew from 764,459 to 868,953 bytes (+14% raw), or 164,995 to
189,021 bytes gzip (+15%). Server gzip grew from 111,241 to 112,978 bytes (+2%). These are complete
fixture bundles containing all scenarios, including Intl, not the download cost of every app.

## Reproduction and follow-up

Build the baseline in a separate worktree and build the current workspace, then run:

```text
node scripts/benchmark-enhancement-comparison.mjs --before=<baseline-worktree>
```

The fixture is in `scripts/performance-fixtures/enhancement-comparison`. Raw rounds, compiled
artifacts, environment, revision identities, and `comparison.json` are written under
`.tmp/enhancement-comparison`. Add `--summarize` to recompute the report from existing rounds.
Saved rounds record their protocol and settings; summarization rejects incompatible captures.
Failed workloads are never included as artificially fast samples.

The original captures are retained under `.tmp/enhancement-comparison-initial`. Intermediate short
and longer optimization runs are retained under `.tmp/enhancement-comparison-optimized-short` and
`.tmp/enhancement-comparison-optimized-long`. The short optimization run showed substantial timing
variation, so the runner increased warmups and sample counts symmetrically. The final runner uses
twenty client warmups, five hundred server warmups, and twenty-one samples on both revisions.
Each report records its measurement parameters.
The runner measures SSR in a separate process without a DOM. Earlier runs interleaved
DOM mounting, updates, SSR, and hydration in every sample, exposing server timings to client
allocation and collection pressure. The last interleaved capture is retained under
`.tmp/enhancement-comparison-final-interleaved`. Percentages from different measurement protocols
should not be treated as a controlled comparison of optimization impact.

The final protocol additionally separates each browser workload and its mount/update versus
hydration phases into fresh processes. Interleaving those phases made update results reverse after
an exclusively hydration-related change. Isolation removes that source of allocation pressure;
it does not eliminate ordinary timing variance. Only before/after values from the same protocol
should be compared. The raw phase files accompany each final round.

## Runtime optimizations

- Scalar-only child ranges avoid component-domain restoration. Structural ranges retain it so
  newly issued children keep the correct ownership.
- Stable scalar sibling positions update their existing Text nodes without key maps, LIS work,
  route invalidation, or empty reactive watchers. Focus preservation remains in place.
- Compiler-proven unconditional target placements skip redundant placement discovery. Conditional
  placements retain validation, parking, transfer, and cleanup.
- A closed intrinsic program without structural target slots selects its root directly during
  mounting, SSR, and hydration. Other output retains independent namespace discovery and reactive
  invalidation. Receiving components still need no knowledge of incoming or default enhancements.
- Unprojected closed SSR roots receive selected entries directly instead of registering and removing
  temporary lookup-table bindings. Projected output retains scoped bindings and cleanup.
- Synchronous SSR target placement stays synchronous while preserving failure and cleanup handling.
  Server execution records retain a consistent object shape.
- Single-namespace SSR avoids peer-order filtering and repeated normalization. Empty override sets
  are not allocated for ordinary target prop contributions.
- Plain synchronous SSR bypasses target-selection machinery after checking both authored and
  incoming runtime declarations. Normalized enhancement entries avoid empty optional-property
  spreads while retaining the same immutable metadata.
- Attribute-only DOM contributions do not allocate empty ref-subscription records. Adding, removing,
  reattaching, and disposing a later ref retains the existing host and releases each subscription.
- Opaque operations share immutable dispatch prototypes and weakly cached domain metadata instead
  of allocating property descriptors for each receipt. Operations retain distinct identity, frozen
  payloads, non-copyable dispatch, and independent key snapshots. Receipt records use consistent
  shapes without empty conditional spreads.
- Fixed intrinsic children retain compiled render programs with lazy structural views for explicit
  child composition. Normal rendering does not construct that view. Inspection captures the original
  domain, constructs no component instances, and preserves the original rendering operation.
  Dynamic inputs and specialized roots retain eager structural receipts. This restores compact
  explicit-host serialization while preserving hydration identity.
- Hydration snapshots siblings directly instead of creating live `childNodes` collections before
  inserting enhancement markers. This preserves the same node snapshot and markers while avoiding
  live-list maintenance after each insertion, which dominated the remaining JSDOM adoption cost.

These are internal changes. Fragment wrapping rules, source order, props, callbacks, refs, and
component lifecycle are unchanged. The compiler optimization removes the need for the extra
explicit-placement markers by preserving its compiled program. It does not remove markers from
the structural receipt path. Paired browser layout/paint and Intl before/after performance remain unmeasured.
