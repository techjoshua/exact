# Runtime object shape experiments, 2026-09-06

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

The [shape audit](runtime-object-shape-audit-2026-09-06.md) led to three frozen-artifact
experiments. Keep the small mounted-record initialization change; discard both render-program
initialization variants. Fewer maps alone did not predict lower total heap or faster execution.
The measurement data (local capture: `runtime-object-shape-experiments-2026-09-06.json`) contains artifact SHA-256
hashes, ordered samples, and summaries.

A [deeper followup](lazy-root-observation-2026-09-06.md) found a larger opportunity in eagerly
allocated root-lifecycle facades and retained lazy observation instead.

## Changes and ownership

The accepted change belongs to the DOM runtime. Native component mounting and markerless receipt
adoption initialize `end: undefined` immediately after `dom`, matching marked hydration's property
order. This removes one observed layout without creating a boundary node, array, or map. It changes
no public API, compiler ABI, component state, or lifecycle behavior. The internal record now owns
the `end` property before its boundary is assigned. No compiler change is needed.

The first rejected variant initialized optional bound render-program fields with a conditional
object spread at each construction site, leaving static programs minimal and collections lazy.
The second used a shared initializer before adoption/binding to avoid temporary spread objects.
Both reduced the observed render-program maps from seven to three, but increased total heap.
All render-program experiment changes were restored.

## Method

The baseline is the current working-tree eXact build frozen before these experiments, including the
previously retained scope optimization. It is not the user's older pre-optimization capture.
Each candidate changed only its stated runtime initialization. Chromium 149.0.7827.55 loaded frozen
JavaScript through the same URL, with fresh contexts and disabled cache. The runner rotated and
reversed variant order across rounds, restored served bytes, and closed its browser and server.
No builds or tests ran concurrently with timing measurements.

- Post-claim diagnostics: one discarded warmup round, then five interleaved rounds. Wait for live
  readiness, claim the incident as Alex Chen (version 2), allow rendering, collect garbage, read heap
  counters, then capture a snapshot. Delivered script hashes were checked. A separate five-round
  followup compared baseline, mounted, and the refined initializer.
- Startup: three discarded warmup rounds, then 40 interleaved rounds at 6x CPU throttling for
  baseline, first render-program variant, and mounted variant. The collector checked semantic
  response identity and decoded script size. The refined variant was not startup-timed.
- Updates: one discarded warmup round, then 20 interleaved rounds for all four variants. Each fresh
  page warmed 20 filter transitions and measured 200 alternating critical/all transitions, checking
  row counts after every transition. Two microtasks were awaited per transition. These timings cover
  a synchronous/microtask burst, not painted latency for 200 separate user interactions. Delivered
  script hashes were checked; post-GC counters were collected after the burst.

Timing intervals use 10,000 bootstrap resamples of complete paired rounds and geometric ratios.
Interleaving reduces workstation drift but does not eliminate noise or prove the absence of effects.
Snapshot self sizes and `JSHeapUsedSize` are separate measurements and must not be added together.

## Results

Post-claim means; byte deltas are relative to the contemporaneous baseline:

| Variant                        | Raw JS delta | Mounted maps | Program maps | Shape bytes delta | Code-node bytes delta | JS heap delta |
| ------------------------------ | -----------: | -----------: | -----------: | ----------------: | --------------------: | ------------: |
| Baseline                       |            0 |            6 |            7 |                 0 |                     0 |             0 |
| Program spread                 |         +357 |            6 |            3 |              -200 |                  +356 |          +208 |
| Mounted order                  |          +22 |            5 |            7 |              -444 |                   -48 |          -468 |
| Program initializer (followup) |         +211 |            6 |            3 |              -336 |                  +788 |          +604 |

Baseline post-claim JS heap was 1,643,584 bytes. Mounted order consistently measured 1,643,116 bytes
across both captures. Its recognized mounted-object self size grew 24 bytes while shape metadata
fell 444 bytes. Total snapshot self size fell about 490 bytes in the first capture; native snapshot
variation changes that total in the followup. This is a small metadata saving, not a broad reduction
in application allocations.

| Startup script work | Median ms |  p95 ms | Paired ratio, 95% interval |
| ------------------- | --------: | ------: | -------------------------- |
| Baseline            |   125.288 | 176.157 | 1                          |
| Program spread      |   125.277 | 165.238 | 0.974 [0.921, 1.032]       |
| Mounted order       |   125.636 | 162.398 | 0.959 [0.898, 1.028]       |

Evaluation-time intervals also crossed one. No startup speedup or regression was established;
lower observed tails should not be presented as a demonstrated improvement.

| 200 filter transitions | Median ms | p95 ms | Paired ratio, 95% interval | Post-GC heap delta |
| ---------------------- | --------: | -----: | -------------------------- | -----------------: |
| Baseline               |      33.5 |   49.1 | 1                          |                  0 |
| Program spread         |      33.9 |   37.5 | 0.979 [0.903, 1.046]       |             +546 B |
| Mounted order          |      33.2 |   34.5 | 0.947 [0.879, 1.003]       |             +4.4 B |
| Program initializer    |      33.6 |   36.4 | 0.961 [0.903, 1.005]       |         +2,184.6 B |

The mounted variant's retention after repeated filtering is essentially neutral. Neither program
variant established a timing benefit to offset its increased heap. The accepted change is worth
keeping because it is two simple initializers with a repeatable small metadata saving, not because
it meets a large architectural experiment's percentage target. It does not solve startup cost.

## Validation

The DOM build, target projections, and comparison participant build passed. Existing DOM/hydration
tests passed (490), composition and hydration corpus tests passed (17), and the framework comparison
browser suite passed (35). Every measured claim and filter-transition assertion passed. Existing
behavior tests protect lifecycle and hydration contracts; no test fixes an incidental V8 map count.
PowerShell reported native-command errors for warning output in two redirected test commands;
the runners themselves reported all tests passing. These experimental measurements were not mixed
into the public chart. A later [full comparison](framework-comparison-lazy-root-2026-09-06.md)
supplies the current published metrics.
