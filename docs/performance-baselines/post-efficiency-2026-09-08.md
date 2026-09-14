# Post-efficiency performance refresh, September 8, 2026

The [remaining SSR tests were subsequently repeated](post-efficiency-2026-09-08-ssr-repeat.md),
covering Node and Bun capacity, normal loading, Bun arrivals, and five-framework
latency, startup, and memory diagnostics. That follow-up retains its own evidence.

A [subsequent Node arrival-rate repeat](post-efficiency-2026-09-08-node-arrivals-repeat.md)
completed with zero request errors in both framework orders using the same recorded
artifacts and workload settings. The original results below remain unchanged.

Fresh production builds and measurements follow the [full audit efficiency review](audit-efficiency-2026-09-08.md). The public Performance page now uses these browser, heap, Node, and native Bun captures. Dates in the artifacts are UTC; the run began on September 8 local time.

## Measurement conditions

All five comparison applications were rebuilt. The shared 35 browser contracts passed on Node 26.8.1 and separately on native Bun 1.4.2. Timed suites ran sequentially, with no additional build, test, or benchmark suite launched alongside them. Driver and server processes still share one Windows workstation, an AMD Ryzen 7 8745HS with 16 logical processors. A pre-existing development server and ordinary desktop processes were left running; their background activity was not measured.

- Browser: 50 balanced rounds per framework, fresh cache-disabled contexts, production-page HTTP replay, and one discarded warmup round.
- Heap composition: ten samples per framework after one warmup, captured separately from browser interaction timings.
- Server diagnostics: 500 sequential samples and 500 sixteen-request bursts per framework and runtime, 100 warmups, and five retained-heap checkpoints. Short-window diagnostic RPS is not a public capacity estimate.
- Sustained Node and Bun capacity: two independent load drivers, two fresh reversed process populations, ten-second warmups, fifteen-second concurrency stages, and twenty-second normal-loading and scheduled-demand stages.
- Startup profiling: 30 rounds at each of 1x, 4x, and 6x Chromium CPU emulation. These separately instrumented results do not replace ordinary browser timings.

These are new measurements, not a paired isolation experiment for the audit patch. Previous captures are retained in the evidence archive. Source, dependency, process, and host state can affect historical differences even when runtime versions and workload plans match.

The new capture records source revision 5a3682ab+worktree; the previous public browser report records 5a3682ab+worktree. Artifact hashes identify the measured dirty-worktree outputs more precisely than the commit alone.

The full repository build, including package client/server target generation, passed before rebuilding
the comparison applications. This capture includes the final task-helper changes that were missing
from the original September 7 browser capture. Frozen ABI checks passed before timing.

Node preloaded throughput is within roughly 5% of React in aggregate, with eXact/React ratios higher
than the prior capture at all four concurrency points. Individual population ratios cross parity at
several points, so this does not isolate an optimization gain. Bun retains a 46–54% preloaded throughput
advantage. Browser feedback and settlement means are close to React; eXact navigation remains lower,
although its navigation ratio moved slightly toward React compared with the previous capture.

Both eXact and React SSR entry bundles have the same hashes as the September 7 capture on Node and
Bun. Framework runtime modules loaded outside those entries have changed, so matching entry hashes
do not establish an identical executable environment. The raw captures retain these artifact identities.

## Relative performance against React

Throughput ratios divide eXact valid RPS by React valid RPS from the same capture. Above 1 means higher eXact throughput. These controls reduce historical host variation but do not eliminate differences between sequential blocks or establish causation from the optimization patch.

| Runtime | Concurrency | Previous eXact/React | Current eXact/React | Ratio change |
| ------- | ----------: | -------------------: | ------------------: | -----------: |
| node    |          16 |                0.918 |               0.978 |        6.52% |
| node    |          32 |                1.000 |               1.050 |        5.04% |
| node    |          64 |                0.967 |               0.978 |        1.14% |
| node    |         128 |                0.937 |               0.992 |        5.93% |
| bun     |          16 |                1.514 |               1.532 |        1.16% |
| bun     |          32 |                1.484 |               1.497 |        0.93% |
| bun     |          64 |                1.520 |               1.544 |        1.56% |
| bun     |         128 |                1.514 |               1.461 |       -3.51% |

Browser ratios below divide eXact means by React means. Lower than 1 means lower eXact time or heap for that metric.

| Browser metric           | Previous eXact/React | Current eXact/React |
| ------------------------ | -------------------: | ------------------: |
| Navigation completion    |                0.785 |               0.805 |
| First contentful paint   |                0.909 |               0.939 |
| Optimistic feedback      |                1.046 |               1.011 |
| Authoritative settlement |                1.029 |               1.013 |
| Warm browser used heap   |                1.081 |               1.082 |

Population ratios expose variation between the two sequential framework orders:

| Runtime | Concurrency | eXact-first population | React-first population |
| ------- | ----------: | ---------------------: | ---------------------: |
| node    |          16 |                  0.928 |                  1.033 |
| node    |          32 |                  1.108 |                  0.995 |
| node    |          64 |                  0.987 |                  0.970 |
| node    |         128 |                  1.027 |                  0.958 |
| bun     |          16 |                  1.558 |                  1.507 |
| bun     |          32 |                  1.516 |                  1.479 |
| bun     |          64 |                  1.571 |                  1.518 |
| bun     |         128 |                  1.431 |                  1.492 |

## Browser results

Arithmetic means across 50 samples. Full percentiles are retained in the public chart data.

| Metric                   | Unit |  eXact |  React | SvelteKit |   Nuxt | TanStack Start |
| ------------------------ | ---- | -----: | -----: | --------: | -----: | -------------: |
| Navigation completion    | ms   | 28.768 | 35.754 |    29.666 | 39.400 |         48.058 |
| First contentful paint   | ms   | 41.840 | 44.560 |    39.680 | 43.280 |         41.440 |
| Optimistic feedback      | ms   |  1.534 |  1.518 |     1.356 |  1.054 |          1.542 |
| Authoritative settlement | ms   | 13.864 | 13.682 |    13.860 | 14.186 |         13.898 |
| Warm browser used heap   | MB   |  2.492 |  2.303 |     2.078 |  2.334 |          2.759 |

Historical eXact means from the previously published browser capture:

| Metric                        | Previous | Current | Change |
| ----------------------------- | -------: | ------: | -----: |
| Navigation completion (ms)    |   28.868 |  28.768 | -0.35% |
| First contentful paint (ms)   |   41.360 |  41.840 |  1.16% |
| Optimistic feedback (ms)      |    1.580 |   1.534 | -2.91% |
| Authoritative settlement (ms) |   14.016 |  13.864 | -1.08% |
| Warm browser used heap (MB)   |    2.488 |   2.492 |  0.14% |

## Node v26.8.1 sustained capacity

168 request errors in scheduled arrivals; zero in concurrency captures. Response identities and accounting validated; RPS counts valid responses only.

The scheduled errors were 13 eXact `ECONNRESET` failures at 10k demand and 155 React `ECONNREFUSED`
failures at 8k demand, all in the first population. Their causes were not isolated in this refresh.

| Total concurrency | eXact valid RPS | React valid RPS |
| ----------------- | --------------: | --------------: |
| 16                |           10506 |           10744 |
| 32                |           10256 |            9763 |
| 64                |            9772 |            9987 |
| 128               |            9408 |            9481 |

The table uses preloaded data. Normal data-loading throughput at concurrency 32: eXact 2755 valid RPS; React 2792 valid RPS.

| Framework | Offered RPS | Valid RPS | Capacity misses | Request errors |
| --------- | ----------: | --------: | --------------: | -------------: |
| eXact     |        8000 |      7998 |           0.00% |              0 |
| eXact     |       10000 |      8731 |          12.44% |             13 |
| React     |        8000 |      7987 |           0.03% |            155 |
| React     |       10000 |      8893 |          10.80% |              0 |

Historical preloaded capacity comparison:

| Framework | Concurrency | Previous valid RPS | Current valid RPS |  Change |
| --------- | ----------: | -----------------: | ----------------: | ------: |
| eXact     |          16 |              10567 |             10506 |  -0.58% |
| eXact     |          32 |              10754 |             10256 |  -4.63% |
| eXact     |          64 |              10525 |              9772 |  -7.15% |
| eXact     |         128 |               9913 |              9408 |  -5.09% |
| React     |          16 |              11511 |             10744 |  -6.66% |
| React     |          32 |              10754 |              9763 |  -9.21% |
| React     |          64 |              10879 |              9987 |  -8.20% |
| React     |         128 |              10582 |              9481 | -10.40% |

## Bun 1.4.2 sustained capacity

Zero request errors in these captures; response identities and accounting validated.

| Total concurrency | eXact valid RPS | React valid RPS |
| ----------------- | --------------: | --------------: |
| 16                |            9715 |            6341 |
| 32                |            9396 |            6275 |
| 64                |            9327 |            6041 |
| 128               |            8792 |            6018 |

The table uses preloaded data. Normal data-loading throughput at concurrency 32: eXact 4362 valid RPS; React 4252 valid RPS.

| Framework | Offered RPS | Valid RPS | Capacity misses | Request errors |
| --------- | ----------: | --------: | --------------: | -------------: |
| eXact     |        8000 |      7964 |           0.41% |              0 |
| eXact     |       10000 |      8165 |          18.09% |              0 |
| React     |        8000 |      6254 |          21.51% |              0 |
| React     |       10000 |      6253 |          37.22% |              0 |

Historical preloaded capacity comparison:

| Framework | Concurrency | Previous valid RPS | Current valid RPS | Change |
| --------- | ----------: | -----------------: | ----------------: | -----: |
| eXact     |          16 |               9721 |              9715 | -0.06% |
| eXact     |          32 |               9431 |              9396 | -0.38% |
| eXact     |          64 |               9384 |              9327 | -0.62% |
| eXact     |         128 |               9183 |              8792 | -4.25% |
| React     |          16 |               6419 |              6341 | -1.21% |
| React     |          32 |               6357 |              6275 | -1.30% |
| React     |          64 |               6174 |              6041 | -2.14% |
| React     |         128 |               6065 |              6018 | -0.77% |

## Server response diagnostics

Arithmetic mean complete-response latency, in milliseconds. Node and Bun are separate populations and transports. Node data loading includes the runtime HTTP-client behavior described in the [current-runtime investigation](current-runtimes-2026-09-07.md). These numbers are not isolated renderer timings.

| Framework      | Node sequential | Node burst | Bun sequential | Bun burst |
| -------------- | --------------: | ---------: | -------------: | --------: |
| Exact          |          14.431 |      9.702 |          0.671 |     4.526 |
| React          |          14.532 |      9.227 |          0.700 |     4.590 |
| SvelteKit      |          14.911 |     10.076 |          0.873 |     5.171 |
| Nuxt           |          14.797 |     15.152 |          1.360 |     7.496 |
| TanStack Start |          15.253 |     13.637 |          1.316 |     8.432 |

## Instrumented startup

Time to the shared semantic-ready marker, in milliseconds. Each cell shows p50 / p95 across 30 cold-context samples. Tracing adds overhead; CPU emulation is not physical mobile hardware. These values must not replace the ordinary browser navigation measurements above.

| CPU emulation |           eXact |           React |       SvelteKit |            Nuxt |  TanStack Start |
| ------------- | --------------: | --------------: | --------------: | --------------: | --------------: |
| 1x            |   61.80 / 64.70 |   62.00 / 74.00 |   60.80 / 66.10 |   66.60 / 74.20 |  72.00 / 114.10 |
| 4x            | 240.70 / 253.00 | 244.70 / 258.70 | 252.10 / 275.40 | 250.70 / 268.10 | 317.80 / 460.00 |
| 6x            | 386.80 / 440.90 | 389.70 / 433.30 | 409.70 / 518.50 | 403.60 / 500.90 | 546.30 / 584.20 |

## Collection transaction cost

`npm run benchmark:collections` exercises the corrected transaction path. Each cell is median milliseconds per delete/restore operation, from ten samples of 100 operations after three warmups. Collection setup and order assertions are outside timing; no observers are installed. Rollback includes throwing and catching the intentional abort. Committed iterations reinsert key 0 at the tail; rollback restores it at the head, so these columns exercise distinct paths.

| Collection | Entries | Ordinary delete/reinsert | Transaction commit | Transaction rollback |
| ---------- | ------: | -----------------------: | -----------------: | -------------------: |
| Map        |    1000 |                   0.0014 |             0.0035 |               0.0521 |
| Map        |   10000 |                   0.0011 |             0.0786 |               0.9454 |
| Set        |    1000 |                   0.0012 |             0.0084 |               0.0335 |
| Set        |   10000 |                   0.0010 |             0.0710 |               0.6517 |

Transactional deletion now captures ordering anchors in linear time. Rollback must restore ordering while retaining unrelated newer values. The ordinary path does not pay this traversal cost. Applications deleting repeatedly from large collections inside transactions should account for it; these measurements do not establish a historical percentage regression or representative application latency.

## Framework regression benchmarks

| Reactive scenario                              | Median ms |  p95 ms |
| ---------------------------------------------- | --------: | ------: |
| unkeyed identical 10k refresh                  |    90.664 | 135.975 |
| keyed identical 10k refresh                    |    55.413 |  75.747 |
| keyed one-item change                          |   102.389 | 210.317 |
| keyed one-percent change                       |   101.813 | 251.602 |
| keyed 10k rotation                             |   132.579 | 292.157 |
| keyed add-delete                               |   132.519 | 305.880 |
| local mutation then matching fetch             |    96.348 | 105.119 |
| 100 local mutations then matching fetch        |    99.202 | 113.054 |
| keyed protocol roundtrip                       |    77.050 |  83.892 |
| subtree disposal with unrelated paused backlog |     0.589 |   0.709 |
| scoped computed chain settlement               |    55.985 |  59.947 |
| equal computed diamond settlement              |     0.011 |   0.017 |

The compiled 1,000-row keyed rotation measured 5.623 ms median and 5.899 ms p95 across five isolated processes. Its DOM identity assertions and existing 2,000 ms p95 guard passed.

The compiler-owned framework benchmark rebuilt its fixtures and ran Node and Chromium scenarios. Full scenario metrics, samples, environment, build timings, and artifact evidence are retained in the archive.

## Reproduction and evidence

The [evidence archive](post-efficiency-2026-09-08.json) contains chart summaries, the prior public reports, environment records, raw-capture paths and SHA-256 hashes, and exact measurement/publication runners. Raw capture JSON remains in `docs/performance-baselines/post-efficiency-2026-09-08-*.json`. The public app reads the four updated report files under `apps/docs/src/data`.

The runners reuse the repository process owners and close their servers and drivers. Rebuild and run both runtime correctness suites before using `--correctness-passed`; it records admission, rather than performing checks itself. Collection diagnostics can be repeated with `npm run benchmark:collections -- --output=<file.json>`.

This refresh measures selected framework workloads. It does not prove that every application is faster or that lifecycle/security fixes have zero overhead. Historical movements must be read alongside control-framework results and the transaction-specific measurements.

## Publication validation

Documentation typechecking, the ten documentation-app tests, and the standalone docs build passed. Desktop and mobile browser checks matched all eleven distribution tables, both runtimes' capacity tables, and all five heap rows to the published JSON. There were no page errors or horizontal overflow. A freshly owned Vite development server also passed navigation and theme-interaction checks. Source architecture, JSDoc, changed data/document formatting, and diff whitespace checks passed. No benchmark-owned server, driver, browser, or compiler process remains; the pre-existing development server was preserved.
