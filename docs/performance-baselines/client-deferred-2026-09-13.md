# Deferred root preparation client benchmarks, September 13, 2026

The hydration-only navigation entry now accepts a synchronous root factory. The comparison app
reads published root props and creates its root inside that factory. Early interaction still
activates synchronously; factory failure rejects once and releases pending triggers. The compiler
retains the narrow compiled hydration entry for proven component-root factories. Static imports
still evaluate normally, and the existing scheduling policy does not guarantee activation after FCP.

## Result

This capture does not establish a first-contentful-paint improvement. The fresh old-bundle control
already measured 41.33 ms mean FCP for eXact, versus 41.87 ms immediately after the change and
41.60 ms in the full suite. SvelteKit moved from 39.87 to 41.87 ms across the same controls.
The preceding published eXact FCP was 43.87 ms; comparing only with that older result would
overstate the evidence for an improvement. Optimistic feedback is effectively unchanged.

## Fresh before/after controls

Thirty fresh contexts per framework per population, after warmup, with alternating framework
order. Both populations use the shared baseline timing implementation, common replay delivery,
disabled HTTP cache, and no CPU profiler. The old artifact was measured before rebuilding.
Versions run sequentially, so this is not a randomized version-order causal experiment.

| Population | Framework | FCP mean ms | Navigation mean ms | Optimistic mean ms |
| ---------- | --------- | ----------: | -----------------: | -----------------: |
| before     | exact     |      41.333 |             28.637 |              1.607 |
| before     | sveltekit |      39.867 |             29.890 |              1.357 |
| after      | exact     |      41.867 |             28.130 |              1.553 |
| after      | sveltekit |      41.867 |             30.210 |              1.353 |

## Full client results

The full suite includes all five frameworks, 30 browser timing samples per framework, ten startup
samples at each of 1x, 4x, and 6x CPU throttling, and five retained-heap snapshots per framework.
The shared 35-test browser correctness suite passed both before timing and after its rebuild.

| Metric                        | Framework      |   Mean |    p95 |    p99 | Previous published mean |
| ----------------------------- | -------------- | -----: | -----: | -----: | ----------------------: |
| Navigation completion (ms)    | Exact          | 27.653 | 30.100 | 30.400 |                  29.890 |
| Navigation completion (ms)    | React          | 36.043 | 38.000 | 40.100 |                  36.337 |
| Navigation completion (ms)    | SvelteKit      | 29.463 | 31.300 | 31.400 |                  29.923 |
| Navigation completion (ms)    | Nuxt           | 39.100 | 40.400 | 40.600 |                  39.580 |
| Navigation completion (ms)    | TanStack Start | 48.567 | 52.200 | 53.500 |                  48.747 |
| First contentful paint (ms)   | Exact          | 41.600 | 48.000 | 52.000 |                  43.867 |
| First contentful paint (ms)   | React          | 48.000 | 52.000 | 56.000 |                  47.867 |
| First contentful paint (ms)   | SvelteKit      | 39.867 | 44.000 | 44.000 |                  38.800 |
| First contentful paint (ms)   | Nuxt           | 42.800 | 48.000 | 48.000 |                  43.600 |
| First contentful paint (ms)   | TanStack Start | 41.467 | 48.000 | 48.000 |                  42.533 |
| Optimistic feedback (ms)      | Exact          |  1.610 |  1.900 |  2.000 |                   1.623 |
| Optimistic feedback (ms)      | React          |  1.433 |  1.600 |  1.600 |                   1.510 |
| Optimistic feedback (ms)      | SvelteKit      |  1.333 |  1.600 |  1.800 |                   1.323 |
| Optimistic feedback (ms)      | Nuxt           |  1.070 |  1.200 |  1.500 |                   1.030 |
| Optimistic feedback (ms)      | TanStack Start |  1.550 |  1.700 |  1.800 |                   1.553 |
| Authoritative settlement (ms) | Exact          | 13.833 | 15.100 | 15.200 |                  13.910 |
| Authoritative settlement (ms) | React          | 13.473 | 15.000 | 15.300 |                  13.357 |
| Authoritative settlement (ms) | SvelteKit      | 13.663 | 14.700 | 15.100 |                  13.963 |
| Authoritative settlement (ms) | Nuxt           | 13.990 | 15.200 | 15.500 |                  14.177 |
| Authoritative settlement (ms) | TanStack Start | 13.730 | 14.800 | 15.100 |                  14.087 |
| Warm browser used heap (MB)   | Exact          |  2.501 |  2.501 |  2.501 |                   2.500 |
| Warm browser used heap (MB)   | React          |  2.303 |  2.303 |  2.303 |                   2.303 |
| Warm browser used heap (MB)   | SvelteKit      |  2.078 |  2.078 |  2.078 |                   2.078 |
| Warm browser used heap (MB)   | Nuxt           |  2.334 |  2.334 |  2.334 |                   2.334 |
| Warm browser used heap (MB)   | TanStack Start |  2.762 |  2.822 |  2.822 |                   2.760 |

## Startup and heap

| Throttle | eXact ready mean ms | eXact scripting mean ms | Total blocking mean ms |
| -------- | ------------------: | ----------------------: | ---------------------: |
| 1x       |              63.160 |                  15.899 |                  0.000 |
| 4x       |             248.860 |                  73.140 |                 44.000 |
| 6x       |             400.350 |                 125.309 |                129.200 |

At 1x, preceding published eXact readiness and scripting were 67.18 and 16.89 ms. This
capture records 63.16 and 15.90 ms. Those diagnostics were captured at different times on this
shared PC, so the differences are not isolated estimates of the factory change.

| Framework      | Retained heap MB |
| -------------- | ---------------: |
| eXact          |            2.225 |
| React          |            1.988 |
| SvelteKit      |            1.579 |
| Nuxt           |            1.887 |
| TanStack Start |            2.696 |

## Validation and evidence

Native compiler tests and 20 hydration tests passed, including deferred execution, early interaction,
retained DOM identity, exactly-once activation, and failure cleanup. Harness tests, build-script tests,
compiled ABI checks, platform boundaries, changed-file lint, docs tests, and docs typecheck/build passed.
Desktop and mobile checks compare chart tables with source values. The heap chart intentionally
scrolls horizontally on narrow screens; access to the rightmost content was verified.

Client charts use this capture. SSR charts and their source identities are unchanged. The working
tree remains uncommitted, and the [structured report](client-deferred-2026-09-13.json) records source
and artifact hashes. The [evidence archive](client-deferred-2026-09-13-evidence.zip) preserves runners,
raw captures, logs, screenshots, source diff, and measured source files.

The implementation provides deferred preparation, but these results do not justify claiming an
FCP optimization. No reactive bookkeeping or event scheduling behavior was changed.
