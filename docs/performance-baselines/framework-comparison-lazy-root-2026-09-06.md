# Framework comparison after lazy root observation, 2026-09-06

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

A [larger focused confirmation](lazy-root-confirmation-2026-09-06.md) subsequently reproduced the
small claim-feedback slowdown. The large c16 server drop did not recur across four fresh worker
populations. The original full capture remains intact below.

The documentation performance charts initially used this complete capture of the working-tree
build at `ece37924`. It includes lazy root observation, the preceding mount/hydration field-order
change, and the previously retained scope/compiler work. It is a fresh cross-framework comparison,
not an interleaved before/after isolation of any one optimization.

The browser and heap charts are now supplied by the
[keyed-boundary full comparison](framework-comparison-keyed-2026-09-06.md). Server charts first moved to the
[v2 sustained-throughput measurement](ssr-throughput-v2-2026-09-06.md), whose changed load-client
timing and window duration establish a separate baseline. The keyed-boundary capture retains that method.

## Evidence

- Complete percentile ledger (local generated table: `framework-comparison-lazy-root-2026-09-06-metrics.md`): every measured
  framework lane, including Node and Bun separately and the engineering diagnostics.
- Published charts, heap stacks, and artifact identities (local capture: `framework-comparison-lazy-root-2026-09-06.json`).
- Raw unprofiled heap samples (local capture: `framework-comparison-lazy-root-2026-09-06-heap.json`).
- Full raw browser, startup, and SSR evidence remains under `.tmp/lazy-root-full-comparison`.
  The published report's metadata records each raw file's SHA-256 hash and path.

All five participants were rebuilt and passed the 35-test shared browser correctness suite. Browser
measurements used 50 balanced interleaved rounds; startup used 50 per framework at each of 1x, 4x,
and 6x CPU; SSR used 50 samples/windows in its timing lanes, separately on Node and Bun. The heap
composition lane used one discarded warmup and five balanced interleaved rounds with fresh
cache-disabled pages after authoritative claim and GC. No agent-owned builds or tests ran alongside
timed measurements. All five client artifact hashes matched across browser, startup, and heap lanes.

The optional startup source-module attribution could not find eXact's emitted source map. Timed
startup, semantic-response checks, and CPU/allocation captures completed; source-module attribution
is unavailable and is not used by the public charts.

## Selected results

| Metric (mean)                  |     eXact |     React | SvelteKit |
| ------------------------------ | --------: | --------: | --------: |
| Navigation completion          |  30.45 ms |  39.62 ms |  31.95 ms |
| Optimistic feedback            |   1.61 ms |   1.47 ms |   1.32 ms |
| Warm post-GC used heap         |  2.481 MB |  2.303 MB |  2.078 MB |
| Native-CPU startup script work |  16.04 ms |  18.11 ms |   4.13 ms |
| Node saturation, c32           | 2,308 RPS | 2,455 RPS | 1,645 RPS |

The full charts also include Nuxt and TanStack Start and show distribution percentiles alongside
means. In this run eXact has the lowest mean navigation time, but React leads the measured c32 Node
throughput. The old page text claiming eXact led that server lane was removed. Descriptive page text
now explains measurements without duplicating dated numeric claims outside the report data.

The unprofiled eXact heap snapshot contains 709,228 code/metadata bytes, 166,580 internal/shape bytes,
and 2,192,310 total self-bytes. These categories are an additive partition of snapshot self size,
not of the separate 2.481 MB warm `JSHeapUsedSize` measurement. The prior heap capture is preserved;
the docs now display the new capture's timestamp and artifact provenance.

Historical movements in the full ledger remain descriptive cross-run comparisons, with raw values
and normalization eligibility retained. Attribution of lazy root observation rests on its
[focused paired experiments](lazy-root-observation-2026-09-06.md), not on assuming workstation
conditions were identical to the preceding published capture.

## Publication checks

The documentation type check and standalone build passed, along with six publisher/category tests,
formatting, lint, and diff checks. Browser verification compared all eight rendered distribution
tables, five heap-category rows, and summary highlights to their JSON sources at desktop and mobile
sizes. Both passed without page errors. The desktop heap chart was also visually inspected.
Screenshots and verification output remain with the raw capture directory. All measurement and
preview owners completed and closed their servers and browsers.
