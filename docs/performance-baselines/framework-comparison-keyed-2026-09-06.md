# Framework comparison after keyed-boundary optimization, 2026-09-06

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

This is a fresh five-framework capture of the working tree, including the retained keyed element
boundary and the preceding SSR optimizations. It replaces the public browser, heap-composition,
and Node SSR chart data. It is not an interleaved old/new isolation of a single implementation
change; the [marker experiment](hydration-marker-study-2026-09-06.md) provides that separate evidence.

## Evidence and method

- Complete percentile ledger (local generated table: `framework-comparison-keyed-2026-09-06-metrics.md`).
- Chart data, previous published capture, environment, and artifact identities (local capture: `framework-comparison-keyed-2026-09-06.json`).
- Raw heap-composition samples (local capture: `framework-comparison-keyed-2026-09-06-heap.json`).
- Raw browser, startup, and SSR files and execution logs: `.tmp/keyed-full-comparison`.
  The report metadata records the raw files' SHA-256 hashes.

All five participants were rebuilt and passed the 35 shared browser correctness tests. Browser
measurement used 50 balanced interleaved rounds. Startup used 50 fresh, cache-disabled contexts per
framework at each of native, 4x, and 6x CPU rates. SSR used 50 samples/windows in the standard lanes,
including 500 ms sustained-capacity windows at concurrency 1, 4, 8, 16, 32, and 64. Node and Bun are
recorded separately. Heap composition used five interleaved rounds after a discarded warmup.

Collectors ran sequentially, without agent-owned tests, builds, or other profilers alongside timed
measurements. The browser collector's build measurements precede its browser timing. Shared
workstation activity remains a source of variation; interleaving distributes its effects but does
not make historical captures into controlled before/after experiments.

The SSR throughput method remains `deferred-validation-aggregate-v2`: total completed requests
divided by total elapsed window time including final drain, with response validation outside the
timed loop. A finite 16-request burst reports completion latency separately. Heap snapshot category
self-bytes are distinct from the browser's warm post-GC JavaScript heap measurement.

## Selected browser results

The browser capture's selected means are:

| Metric                         |    eXact |    React | SvelteKit |     Nuxt | TanStack Start |
| ------------------------------ | -------: | -------: | --------: | -------: | -------------: |
| Navigation completion          | 29.81 ms | 38.76 ms |  32.13 ms | 42.87 ms |       51.48 ms |
| Optimistic feedback            |  1.58 ms |  1.50 ms |   1.29 ms |  1.09 ms |        1.51 ms |
| Warm post-GC JS heap           | 2.483 MB | 2.303 MB |  2.078 MB | 2.334 MB |       2.763 MB |
| Native-CPU startup script work | 15.87 ms | 17.81 ms |   3.97 ms |  6.12 ms |       26.87 ms |
| Native-CPU semantic readiness  | 64.18 ms | 68.82 ms |  63.83 ms | 71.18 ms |       87.26 ms |

eXact retains six fewer DOM nodes on this three-row fixture. Its total warm JS heap is essentially
unchanged from the preceding full browser capture: removing a few comment nodes does not imply
an equal reduction in V8 code, metadata, or other retained objects. Native startup script work is
also close to the previous 16.04 ms mean; this capture does not establish a startup optimization.

## Selected Node SSR results

| Metric                           |     eXact |     React | SvelteKit |      Nuxt | TanStack Start |
| -------------------------------- | --------: | --------: | --------: | --------: | -------------: |
| Sustained c32 aggregate          | 2,361 RPS | 2,472 RPS | 1,623 RPS | 1,167 RPS |      1,247 RPS |
| Sequential response mean         |   1.45 ms |   1.32 ms |   1.81 ms |   2.27 ms |        2.24 ms |
| 16-request burst completion mean |  10.39 ms |   7.72 ms |  11.44 ms |  15.32 ms |       14.16 ms |
| Complete response bytes          |     3,611 |     3,384 |     4,062 |     4,462 |          5,193 |

React leads eXact's c32 aggregate throughput by 4.7% in this capture (equivalently, eXact is 4.5%
below React). The retained marker change reduces eXact's response by 99 bytes on this small fixture,
but does not establish a throughput lead over React. The larger row-heavy marker experiments are
different workloads and must not be substituted for this full-comparison result.

## Baseline reconciliation and controlled marker audit

A subsequent [matched-artifact React gap audit](exact-react-gap-audit-2026-09-06.md) directly tests the
earlier near-parity capture. It confirms modest aggregate old/new gains but finds substantial
process-population variation in the React gap. The 4.7% lead above describes this full capture,
not an established regression or a consistently reproduced advantage.

Against the previous published capture using the same throughput harness, eXact moves from
2,316 to 2,361 RPS (+1.9%), while React moves from 2,475 to 2,472 RPS (essentially flat).
This is not a regression against that baseline, although historical captures cannot isolate a change.
The previously reported 7.7% normal-request and 12.2% preloaded gains were for 96 rows; the public
comparison has three rows. The original small-fixture experiment also varied substantially between
process populations, so its aggregate alone was insufficient evidence of a reliable gain.

A subsequent audit loaded the frozen pre-marker renderer and the current renderer into the same
production Node worker. Four fresh process populations each ran 50 balanced, interleaved rounds
over four URL aliases: two aliases per implementation provide identical-code controls. Alias mappings
rotated and import order alternated between populations. Every alias received 500 ms normal-request
windows at concurrency 32, after priming each implementation. Every response was validated; normalized
HTML matched between implementations, and identical-code aliases produced identical hashes.

| Process population | Before aggregate RPS | After aggregate RPS | Change |
| ------------------ | -------------------: | ------------------: | -----: |
| 1                  |             2,475.53 |            2,496.73 | +0.86% |
| 2                  |             2,479.62 |            2,515.07 | +1.43% |
| 3                  |             2,475.60 |            2,500.71 | +1.01% |
| 4                  |             2,471.12 |            2,488.24 | +0.69% |
| Combined           |             2,475.47 |            2,500.18 | +1.00% |

Each implementation received 400 timed windows and more than 500,000 verified responses. The largest
identical-code alias disagreement within a population was 0.39%. All four old/new populations were
positive, supporting a modest small-page improvement. The archived JSON includes the raw audit.
This co-resident-renderer diagnostic isolates the marker change; its absolute rates must not be
compared with React's rates from the separate five-framework capture. It does not establish a
universal gain or a lead over React.

## Heap composition

The unprofiled snapshot categories total 2.194 MB for eXact and 1.993 MB for React. V8 code/metadata
and internals/shapes account for approximately 87.5% of that gap. Excluding both V8 categories,
eXact retains about 25 KB more snapshot self-bytes in this fixture. Those remaining categories
include native nodes and strings as well as ordinary objects; they are not a direct measurement
of application state alone.

Against the preceding heap snapshot, eXact's total self-bytes increase by 2,038 bytes, while its
code/metadata category increases by 2,188 bytes. The other categories collectively decrease
slightly. This is consistent with the small extra client code and six fewer retained DOM nodes;
it is not evidence that comment removal increased application-owned object retention.

## Validation

- All 35 shared framework browser correctness tests passed after rebuilding the participants.
- Eight report publication, throughput-accounting, and heap-category tests passed.
- Documentation type checking and the standalone production build passed.
- Desktop and mobile rendered pages matched all nine distribution tables, five heap rows, and
  summary values against the published JSON, without page errors. The desktop heap chart was also
  visually inspected. Browser, startup, and heap captures used matching client artifact hashes.
- No task-owned benchmark worker or collector processes remained after completion.

## Measurement limits

eXact's optional startup source-module attribution could not find the emitted browser source map.
Timed startup, semantic-response checks, and the CPU/allocation captures completed; source-module
attribution is unavailable. CPU throttling is desktop Chromium emulation, not physical mobile
hardware. Bun's native transport and Node-compatibility transports remain separate diagnostic
evidence rather than a public cross-framework ranking.

The former [browser/heap capture](framework-comparison-lazy-root-2026-09-06.md) and
[SSR throughput capture](ssr-throughput-v2-2026-09-06.md) remain preserved for historical context.
