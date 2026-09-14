# Post-audit client benchmarks, September 13, 2026

This capture refreshes browser timing, startup CPU diagnostics, and retained heap composition
for eXact, React, SvelteKit, Nuxt, and TanStack Start. The preceding
[client capture](client-fresh-2026-09-12.md) remains historical evidence; the
[fresh SSR capture](ssr-audit-2026-09-13.md) retains its own results and metadata.

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

The measured working tree is uncommitted, based on `c1e52fd97d267d285c9dacf1ebd8aa967f95fd2f`.
Artifact hashes match across browser timing, startup profiling, and heap capture. Older measurements
were taken at different times on this shared machine; differences are not isolated causal estimates.

## Browser results

| Metric                        | Framework      |   Mean |    p95 |    p99 | Previous mean |
| ----------------------------- | -------------- | -----: | -----: | -----: | ------------: |
| Navigation completion (ms)    | Exact          | 29.890 | 31.800 | 36.100 |        29.747 |
| Navigation completion (ms)    | React          | 36.337 | 38.400 | 40.400 |        36.323 |
| Navigation completion (ms)    | SvelteKit      | 29.923 | 33.100 | 33.900 |        30.887 |
| Navigation completion (ms)    | Nuxt           | 39.580 | 42.300 | 43.500 |        40.243 |
| Navigation completion (ms)    | TanStack Start | 48.747 | 52.500 | 54.600 |        49.400 |
| First contentful paint (ms)   | Exact          | 43.867 | 52.000 | 52.000 |        42.667 |
| First contentful paint (ms)   | React          | 47.867 | 56.000 | 56.000 |        46.533 |
| First contentful paint (ms)   | SvelteKit      | 38.800 | 44.000 | 44.000 |        41.600 |
| First contentful paint (ms)   | Nuxt           | 43.600 | 48.000 | 52.000 |        42.133 |
| First contentful paint (ms)   | TanStack Start | 42.533 | 48.000 | 48.000 |        41.733 |
| Optimistic feedback (ms)      | Exact          |  1.623 |  2.000 |  2.100 |         1.530 |
| Optimistic feedback (ms)      | React          |  1.510 |  1.900 |  2.000 |         1.527 |
| Optimistic feedback (ms)      | SvelteKit      |  1.323 |  1.600 |  1.900 |         1.323 |
| Optimistic feedback (ms)      | Nuxt           |  1.030 |  1.200 |  1.200 |         1.080 |
| Optimistic feedback (ms)      | TanStack Start |  1.553 |  1.800 |  1.800 |         1.550 |
| Authoritative settlement (ms) | Exact          | 13.910 | 14.700 | 14.800 |        14.180 |
| Authoritative settlement (ms) | React          | 13.357 | 14.600 | 14.700 |        13.583 |
| Authoritative settlement (ms) | SvelteKit      | 13.963 | 14.800 | 15.700 |        13.860 |
| Authoritative settlement (ms) | Nuxt           | 14.177 | 15.600 | 15.600 |        14.120 |
| Authoritative settlement (ms) | TanStack Start | 14.087 | 15.100 | 15.800 |        13.987 |
| Warm browser used heap (MB)   | Exact          |  2.500 |  2.500 |  2.500 |         2.494 |
| Warm browser used heap (MB)   | React          |  2.303 |  2.303 |  2.303 |         2.303 |
| Warm browser used heap (MB)   | SvelteKit      |  2.078 |  2.078 |  2.078 |         2.078 |
| Warm browser used heap (MB)   | Nuxt           |  2.334 |  2.334 |  2.334 |         2.334 |
| Warm browser used heap (MB)   | TanStack Start |  2.760 |  2.758 |  2.822 |         2.758 |

## Startup CPU diagnostics

These diagnostic profiles remain in the raw evidence and this report. The public browser charts
retain their existing metric selection. Tracing and CPU throttling distinguish these samples
from the ordinary browser timing lane.

| CPU throttle | Framework      | Ready mean ms | Script mean ms | Compile mean ms | Total blocking mean ms |
| ------------ | -------------- | ------------: | -------------: | --------------: | ---------------------: |
| 1x           | exact          |        67.180 |         16.889 |           0.000 |                  0.000 |
| 1x           | react          |        68.960 |         17.960 |           0.000 |                  0.000 |
| 1x           | sveltekit      |        63.740 |          4.196 |           0.126 |                  0.000 |
| 1x           | nuxt           |        68.710 |          6.441 |           0.064 |                  0.000 |
| 1x           | tanstack-start |        91.670 |         26.853 |           0.242 |                  0.000 |
| 4x           | exact          |       249.290 |         73.383 |           0.000 |                 44.500 |
| 4x           | react          |       253.120 |         82.756 |           0.000 |                 73.700 |
| 4x           | sveltekit      |       263.770 |         18.449 |           0.382 |                 42.800 |
| 4x           | nuxt           |       253.840 |         26.111 |           0.329 |                 69.000 |
| 4x           | tanstack-start |       334.960 |        131.707 |           0.822 |                 41.600 |
| 6x           | exact          |       408.660 |        128.273 |           0.000 |                126.800 |
| 6x           | react          |       399.150 |        130.428 |           0.000 |                112.700 |
| 6x           | sveltekit      |       413.140 |         30.082 |           0.648 |                 97.400 |
| 6x           | nuxt           |       416.770 |         43.031 |           0.399 |                140.700 |
| 6x           | tanstack-start |       556.600 |        213.897 |           1.434 |                135.900 |

## Retained heap composition

| Framework      | Total MB |
| -------------- | -------: |
| eXact          |    2.224 |
| React          |    1.988 |
| SvelteKit      |    1.579 |
| Nuxt           |    1.887 |
| TanStack Start |    2.696 |

Heap composition follows a separate standardized scenario and may differ from the browser
timing lane's warm used-heap metric. Both remain separately labeled in the documentation.

## Evidence and validation

The [structured report](client-audit-2026-09-13.json) links complete raw captures and artifact hashes.
The [evidence archive](client-audit-2026-09-13-evidence.zip) retains runners, logs, diagnostics,
source state, prior chart data, and chart verification screenshots. The SSR chart payloads and
server section were verified unchanged when publishing this client refresh.

Fresh validation passed: the harness and report checks, docs tests, docs typecheck
and build, and desktop/mobile chart checks. The two live correctness runs each passed all 35 tests.
Browser checks compare rendered tables with source values and check page errors and horizontal overflow.

The [shared source and preflight archive](performance-audit-2026-09-13-evidence.zip) preserves the
measured source snapshot and benchmark-preflight fix evidence. Client and SSR measurements use the
same source snapshot. The compiler overlay supplement was recorded during the run after discovering
that the initial snapshot filter omitted patch files; that overlay was unchanged during this task.
