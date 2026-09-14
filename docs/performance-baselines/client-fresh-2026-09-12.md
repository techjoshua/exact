# Fresh client benchmarks, September 12, 2026

This capture refreshes browser timing, startup CPU diagnostics, and retained heap composition
for eXact, React, SvelteKit, Nuxt, and TanStack Start. The preceding
[client capture](client-full-2026-09-11.md) remains historical evidence; the
[fresh SSR capture](ssr-fresh-2026-09-12.md) retains its own results and metadata.

The harness rebuilt client artifacts and ran the shared 35-test browser correctness suite before
measurement and again after the browser build. Browser timing uses 30 fresh contexts per framework
after a discarded warmup round. Startup profiling uses ten samples per framework at each of
1x, 4x, and 6x CPU throttling. Heap composition uses five snapshots per framework after warmup.

Measurements run sequentially on the shared Windows PC, with balanced framework order. Browser
delivery uses the common replay transport, serving each framework's captured production document
and assets after stopping its SSR server. Application interactions still use the controlled service.
HTTP cache is disabled. These are warm-browser-process, fresh-context results, not cold process
startup or production network measurements. Heap snapshots describe post-GC retained composition,
not allocation rate or proof of a leak.

The measured working tree is uncommitted, based on `4470d8d008114469555421cbac4eaf957efd6f46`.
Artifact hashes match across browser timing, startup profiling, and heap capture. Older measurements
were taken at different times on this shared machine; differences are not isolated causal estimates.

## Browser results

| Metric                        | Framework      |   Mean |    p95 |    p99 | Previous mean |
| ----------------------------- | -------------- | -----: | -----: | -----: | ------------: |
| Navigation completion (ms)    | Exact          | 29.747 | 33.000 | 37.200 |        29.090 |
| Navigation completion (ms)    | React          | 36.323 | 38.800 | 40.300 |        35.940 |
| Navigation completion (ms)    | SvelteKit      | 30.887 | 33.900 | 34.600 |        29.463 |
| Navigation completion (ms)    | Nuxt           | 40.243 | 43.300 | 44.100 |        39.453 |
| Navigation completion (ms)    | TanStack Start | 49.400 | 53.100 | 57.300 |        48.373 |
| First contentful paint (ms)   | Exact          | 42.667 | 48.000 | 48.000 |        42.267 |
| First contentful paint (ms)   | React          | 46.533 | 52.000 | 56.000 |        45.200 |
| First contentful paint (ms)   | SvelteKit      | 41.600 | 44.000 | 48.000 |        39.333 |
| First contentful paint (ms)   | Nuxt           | 42.133 | 52.000 | 52.000 |        43.333 |
| First contentful paint (ms)   | TanStack Start | 41.733 | 48.000 | 48.000 |        41.467 |
| Optimistic feedback (ms)      | Exact          |  1.530 |  1.700 |  2.200 |         1.610 |
| Optimistic feedback (ms)      | React          |  1.527 |  2.000 |  2.000 |         1.547 |
| Optimistic feedback (ms)      | SvelteKit      |  1.323 |  1.700 |  2.000 |         1.340 |
| Optimistic feedback (ms)      | Nuxt           |  1.080 |  1.400 |  1.500 |         1.083 |
| Optimistic feedback (ms)      | TanStack Start |  1.550 |  1.900 |  2.100 |         1.540 |
| Authoritative settlement (ms) | Exact          | 14.180 | 15.400 | 16.700 |        13.823 |
| Authoritative settlement (ms) | React          | 13.583 | 15.300 | 15.300 |        13.583 |
| Authoritative settlement (ms) | SvelteKit      | 13.860 | 15.400 | 15.400 |        13.717 |
| Authoritative settlement (ms) | Nuxt           | 14.120 | 15.000 | 15.300 |        14.293 |
| Authoritative settlement (ms) | TanStack Start | 13.987 | 15.300 | 15.500 |        13.790 |
| Warm browser used heap (MB)   | Exact          |  2.494 |  2.494 |  2.494 |         2.494 |
| Warm browser used heap (MB)   | React          |  2.303 |  2.303 |  2.303 |         2.303 |
| Warm browser used heap (MB)   | SvelteKit      |  2.078 |  2.078 |  2.078 |         2.078 |
| Warm browser used heap (MB)   | Nuxt           |  2.334 |  2.334 |  2.334 |         2.334 |
| Warm browser used heap (MB)   | TanStack Start |  2.758 |  2.758 |  2.758 |         2.768 |

## Startup CPU diagnostics

These diagnostic profiles remain in the raw evidence and this report. The public browser charts
retain their existing metric selection. Tracing and CPU throttling distinguish these samples
from the ordinary browser timing lane.

| CPU throttle | Framework      | Ready mean ms | Script mean ms | Compile mean ms | Total blocking mean ms |
| ------------ | -------------- | ------------: | -------------: | --------------: | ---------------------: |
| 1x           | exact          |        63.170 |         15.773 |           0.000 |                  0.000 |
| 1x           | react          |        66.580 |         17.918 |           0.000 |                  0.000 |
| 1x           | sveltekit      |        61.410 |          3.905 |           0.112 |                  0.000 |
| 1x           | nuxt           |        67.790 |          6.160 |           0.070 |                  0.000 |
| 1x           | tanstack-start |        98.730 |         26.888 |           0.227 |                  0.000 |
| 4x           | exact          |       246.110 |         72.939 |           0.000 |                 40.400 |
| 4x           | react          |       245.930 |         80.086 |           0.000 |                 64.000 |
| 4x           | sveltekit      |       268.100 |         18.651 |           0.366 |                 45.800 |
| 4x           | nuxt           |       251.840 |         25.726 |           0.277 |                 76.400 |
| 4x           | tanstack-start |       333.850 |        130.926 |           0.846 |                 40.100 |
| 6x           | exact          |       393.110 |        121.599 |           0.000 |                116.900 |
| 6x           | react          |       404.470 |        133.932 |           0.000 |                118.500 |
| 6x           | sveltekit      |       415.800 |         29.410 |           0.686 |                100.600 |
| 6x           | nuxt           |       419.510 |         44.106 |           0.435 |                140.400 |
| 6x           | tanstack-start |       548.960 |        215.866 |           1.457 |                129.700 |

## Retained heap composition

| Framework      | Total MB |
| -------------- | -------: |
| eXact          |    2.211 |
| React          |    1.988 |
| SvelteKit      |    1.579 |
| Nuxt           |    1.886 |
| TanStack Start |    2.709 |

Heap composition follows a separate standardized scenario and may differ from the browser
timing lane's warm used-heap metric. Both remain separately labeled in the documentation.

## Evidence and validation

The [structured report](client-fresh-2026-09-12.json) links complete raw captures and artifact hashes.
The [evidence archive](client-fresh-2026-09-12-evidence.zip) retains runners, logs, diagnostics,
source state, prior chart data, and chart verification screenshots. The SSR chart payloads and
server section were verified unchanged when publishing this client refresh.

Fresh validation passed: 90 harness tests, 112 build-script tests, 10 docs tests, docs typecheck
and build, and desktop/mobile chart checks. The two live correctness runs each passed all 35 tests.
Browser checks compare rendered tables with source values and check page errors and horizontal overflow.
