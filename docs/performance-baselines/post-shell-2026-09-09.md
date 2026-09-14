# SSR and client optimization results, September 9, 2026

Fresh production builds render application-owned document components on Node and Bun. eXact uses its public hydratable document API, including root-document normalization and document hydration. String and streaming API lanes use the same authored document component on both runtimes. React uses renderToString or renderToReadableStream as selected; eXact uses its public hydratable string or progressive HTML API. TanStack Start uses its supported string or streaming handler. Nuxt and SvelteKit appear only in the string lane. The public Performance page uses this complete browser, heap, Node, and Bun capture. Dates in the artifacts are UTC; the run began on September 9 local time.

## Measurement conditions

All five comparison applications were rebuilt. The shared 35 string-mode browser contracts and 21 streaming-mode contracts passed separately on Node 26.8.1 and native Bun 1.4.2. Timed suites ran sequentially, with no additional build, test, or benchmark suite launched alongside them. Driver and server processes still share one Windows workstation, an AMD Ryzen 7 8745HS with 16 logical processors. Ordinary desktop processes were left running; their background activity was not measured.

- Browser: 50 balanced rounds per framework, fresh cache-disabled contexts, production-page HTTP replay, and one discarded warmup round.
- Heap composition: ten samples per framework after one warmup, captured separately from browser interaction timings.
- Server diagnostics: 500 sequential samples and 500 sixteen-request bursts per framework and runtime, 100 warmups, and five retained-heap checkpoints. Short-window diagnostic RPS is not a public capacity estimate.
- Sustained Node and Bun capacity: two independent load drivers, two fresh reversed process populations, ten-second warmups, fifteen-second concurrency stages, and twenty-second normal-loading and scheduled-demand stages.
- Startup profiling: 30 rounds at each of 1x, 4x, and 6x Chromium CPU emulation. These separately instrumented results do not replace ordinary browser timings.

This run follows the frozen [full-document baseline](render-modes-2026-09-09.md). Both captures use matching rendering APIs and application-owned shells. The [optimization investigation](post-shell-optimization-2026-09-09.md) records focused alternating-build experiments, rejected variants, and the document hydration scheduling tradeoff. The full rerun measures the final combined implementation; host variation and separate populations mean its historical changes are not isolated causal estimates.

The new capture records source revision 5a3682ab+worktree; the previous public browser report records 5a3682ab+worktree. Artifact hashes identify the measured dirty-worktree outputs more precisely than the commit alone.

## Relative performance against React

Ratios divide eXact valid RPS by React valid RPS within the same runtime and rendering API. Above 1 means higher eXact throughput. The frozen baseline uses the same full-document APIs and workload plans. Historical changes still include host variation; the focused alternating-build investigation provides stronger evidence of optimization effects.

| Runtime | API    | Concurrency | Baseline eXact RPS | Current eXact RPS | Current React RPS | eXact / React |
| ------- | ------ | ----------: | -----------------: | ----------------: | ----------------: | ------------: |
| node    | string |          16 |               5598 |              6896 |              9455 |         0.729 |
| node    | string |          32 |               5493 |              6823 |              9523 |         0.716 |
| node    | string |          64 |               5439 |              6664 |              9681 |         0.688 |
| node    | string |         128 |               5383 |              6486 |              9216 |         0.704 |
| bun     | string |          16 |               6420 |              8389 |              8913 |         0.941 |
| bun     | string |          32 |               6358 |              8364 |              8792 |         0.951 |
| bun     | string |          64 |               6272 |              8093 |              8537 |         0.948 |
| bun     | string |         128 |               6202 |              7952 |              8289 |         0.959 |
| node    | stream |          16 |               4454 |              5136 |              4004 |         1.283 |
| node    | stream |          32 |               4360 |              5109 |              4005 |         1.275 |
| node    | stream |          64 |               4350 |              5017 |              3986 |         1.259 |
| node    | stream |         128 |               4318 |              4977 |              3968 |         1.254 |
| bun     | stream |          16 |               4183 |              4879 |              6325 |         0.771 |
| bun     | stream |          32 |               4039 |              4799 |              6257 |         0.767 |
| bun     | stream |          64 |               4080 |              4703 |              6125 |         0.768 |
| bun     | stream |         128 |               3998 |              4640 |              5935 |         0.782 |

## Browser results

Browser pages were captured through the string lane for all five participants. Arithmetic means across 50 samples. Full percentiles are retained in the public chart data.

| Metric                   | Unit |  eXact |  React | SvelteKit |   Nuxt | TanStack Start |
| ------------------------ | ---- | -----: | -----: | --------: | -----: | -------------: |
| Navigation completion    | ms   | 28.372 | 35.876 |    29.774 | 39.186 |         47.700 |
| First contentful paint   | ms   | 42.400 | 46.640 |    39.280 | 43.840 |         41.120 |
| Optimistic feedback      | ms   |  1.734 |  1.480 |     1.350 |  1.070 |          1.558 |
| Authoritative settlement | ms   | 14.004 | 13.694 |    13.890 | 14.086 |         13.910 |
| Warm browser used heap   | MB   |  2.578 |  2.303 |     2.078 |  2.334 |          2.764 |

Historical eXact means from the previously published browser capture:

| Metric                        | Previous | Current |  Change |
| ----------------------------- | -------: | ------: | ------: |
| Navigation completion (ms)    |   39.598 |  28.372 | -28.35% |
| First contentful paint (ms)   |   47.360 |  42.400 | -10.47% |
| Optimistic feedback (ms)      |    1.714 |   1.734 |   1.17% |
| Authoritative settlement (ms) |   13.992 |  14.004 |   0.09% |
| Warm browser used heap (MB)   |    2.574 |   2.578 |   0.13% |

## Node v26.8.1 sustained capacity, string API

196 request errors in scheduled arrivals; zero in concurrency captures. Response identities and accounting validated; RPS counts valid responses only.

| Total concurrency | eXact valid RPS | React valid RPS |
| ----------------- | --------------: | --------------: |
| 16                |            6896 |            9455 |
| 32                |            6823 |            9523 |
| 64                |            6664 |            9681 |
| 128               |            6486 |            9216 |

The table uses preloaded data. Normal data-loading throughput at concurrency 32: eXact 2509 valid RPS; React 2753 valid RPS.

| Framework | Offered RPS | Valid RPS | Capacity misses | Request errors |
| --------- | ----------: | --------: | --------------: | -------------: |
| eXact     |        8000 |      6639 |          16.62% |            196 |
| eXact     |       10000 |      6629 |          33.46% |              0 |
| React     |        8000 |      7999 |           0.00% |              0 |
| React     |       10000 |      8152 |          18.22% |              0 |

Historical preloaded capacity comparison:

| Framework | Concurrency | Previous valid RPS | Current valid RPS | Change |
| --------- | ----------: | -----------------: | ----------------: | -----: |
| eXact     |          16 |               5598 |              6896 | 23.18% |
| eXact     |          32 |               5493 |              6823 | 24.21% |
| eXact     |          64 |               5439 |              6664 | 22.51% |
| eXact     |         128 |               5383 |              6486 | 20.48% |
| React     |          16 |               9551 |              9455 | -1.00% |
| React     |          32 |               9532 |              9523 | -0.09% |
| React     |          64 |               9460 |              9681 |  2.34% |
| React     |         128 |               8948 |              9216 |  2.99% |

## Bun 1.4.2 sustained capacity, string API

Zero request errors in these captures; response identities and accounting validated.

| Total concurrency | eXact valid RPS | React valid RPS |
| ----------------- | --------------: | --------------: |
| 16                |            8389 |            8913 |
| 32                |            8364 |            8792 |
| 64                |            8093 |            8537 |
| 128               |            7952 |            8289 |

The table uses preloaded data. Normal data-loading throughput at concurrency 32: eXact 4346 valid RPS; React 4361 valid RPS.

| Framework | Offered RPS | Valid RPS | Capacity misses | Request errors |
| --------- | ----------: | --------: | --------------: | -------------: |
| eXact     |        8000 |      7352 |           7.81% |              0 |
| eXact     |       10000 |      7334 |          26.39% |              0 |
| React     |        8000 |      7560 |           5.18% |              0 |
| React     |       10000 |      7508 |          24.66% |              0 |

Historical preloaded capacity comparison:

| Framework | Concurrency | Previous valid RPS | Current valid RPS | Change |
| --------- | ----------: | -----------------: | ----------------: | -----: |
| eXact     |          16 |               6420 |              8389 | 30.66% |
| eXact     |          32 |               6358 |              8364 | 31.55% |
| eXact     |          64 |               6272 |              8093 | 29.03% |
| eXact     |         128 |               6202 |              7952 | 28.22% |
| React     |          16 |               8881 |              8913 |  0.36% |
| React     |          32 |               8721 |              8792 |  0.81% |
| React     |          64 |               8400 |              8537 |  1.62% |
| React     |         128 |               8233 |              8289 |  0.69% |

## Server response diagnostics, string API

Arithmetic mean complete-response latency, in milliseconds. Node and Bun are separate populations and transports. Node data loading includes the runtime HTTP-client behavior described in the [current-runtime investigation](current-runtimes-2026-09-07.md). These numbers are not isolated renderer timings.

| Framework      | Node sequential | Node burst | Bun sequential | Bun burst |
| -------------- | --------------: | ---------: | -------------: | --------: |
| Exact          |          14.667 |     10.052 |          0.687 |     4.511 |
| React          |          14.455 |      9.664 |          0.644 |     4.492 |
| SvelteKit      |          14.925 |     10.622 |          0.838 |     5.173 |
| Nuxt           |          14.461 |     15.110 |          1.285 |     7.405 |
| TanStack Start |          15.124 |     14.147 |          1.136 |     6.611 |

## Instrumented startup

Time to the shared semantic-ready marker, in milliseconds. Each cell shows p50 / p95 across 30 cold-context samples. Tracing adds overhead; CPU emulation is not physical mobile hardware. These values must not replace the ordinary browser navigation measurements above.

| CPU emulation |           eXact |           React |       SvelteKit |            Nuxt |  TanStack Start |
| ------------- | --------------: | --------------: | --------------: | --------------: | --------------: |
| 1x            |   63.40 / 68.30 |   61.60 / 73.90 |   60.20 / 63.10 |   64.40 / 74.20 |  74.20 / 104.20 |
| 4x            | 253.90 / 282.70 | 254.40 / 299.10 | 261.10 / 301.40 | 262.40 / 300.40 | 335.20 / 407.10 |
| 6x            | 397.30 / 410.90 | 386.20 / 407.40 | 404.10 / 416.00 | 400.70 / 490.30 | 543.70 / 559.90 |

## Collection transaction cost

`npm run benchmark:collections` exercises the corrected transaction path. Each cell is median milliseconds per delete/restore operation, from ten samples of 100 operations after three warmups. Collection setup and order assertions are outside timing; no observers are installed. Rollback includes throwing and catching the intentional abort. Committed iterations reinsert key 0 at the tail; rollback restores it at the head, so these columns exercise distinct paths.

| Collection | Entries | Ordinary delete/reinsert | Transaction commit | Transaction rollback |
| ---------- | ------: | -----------------------: | -----------------: | -------------------: |
| Map        |    1000 |                   0.0015 |             0.0036 |               0.0532 |
| Map        |   10000 |                   0.0010 |             0.0775 |               0.9201 |
| Set        |    1000 |                   0.0012 |             0.0083 |               0.0335 |
| Set        |   10000 |                   0.0010 |             0.0746 |               0.6435 |

Transactional deletion now captures ordering anchors in linear time. Rollback must restore ordering while retaining unrelated newer values. The ordinary path does not pay this traversal cost. Applications deleting repeatedly from large collections inside transactions should account for it; these measurements do not establish a historical percentage regression or representative application latency.

## Framework regression benchmarks

| Reactive scenario                              | Median ms |  p95 ms |
| ---------------------------------------------- | --------: | ------: |
| unkeyed identical 10k refresh                  |    84.441 | 170.614 |
| keyed identical 10k refresh                    |    51.331 |  76.906 |
| keyed one-item change                          |   100.510 | 212.726 |
| keyed one-percent change                       |   107.460 | 180.884 |
| keyed 10k rotation                             |   130.709 | 145.131 |
| keyed add-delete                               |   132.180 | 262.650 |
| local mutation then matching fetch             |    98.029 | 245.714 |
| 100 local mutations then matching fetch        |    97.649 | 248.307 |
| keyed protocol roundtrip                       |    73.368 |  77.038 |
| subtree disposal with unrelated paused backlog |     0.603 |   0.721 |
| scoped computed chain settlement               |    54.886 |  73.213 |
| equal computed diamond settlement              |     0.012 |   0.021 |

The compiled 1,000-row keyed rotation measured 5.612 ms median and 5.814 ms p95 across five isolated processes. Its DOM identity assertions and existing 2,000 ms p95 guard passed.

The compiler-owned framework benchmark rebuilt its fixtures and ran Node and Chromium scenarios. Full scenario metrics, samples, environment, build timings, and artifact evidence are retained in the archive.

## Reproduction and evidence

The [supporting evidence bundle](post-shell-2026-09-09-evidence.zip) retains execution logs, runners, verification records, and browser screenshots. The [evidence archive](post-shell-2026-09-09.json) contains chart summaries, the prior public reports, environment records, raw-capture paths and SHA-256 hashes, and exact measurement/publication runners. Raw capture JSON remains in `docs/performance-baselines/post-shell-2026-09-09-*.json`. The public app reads the seven updated report files under `apps/docs/src/data`.

The runners reuse the repository process owners and close their servers and drivers. Rebuild and run both runtime correctness suites before using `--correctness-passed`; it records admission, rather than performing checks itself. Collection diagnostics can be repeated with `npm run benchmark:collections -- --output=<file.json>`.

This refresh measures selected framework workloads. It does not prove that every application is faster or that lifecycle/security fixes have zero overhead. Historical movements must be read alongside control-framework results and the transaction-specific measurements.

## Compiled client scenarios

These Chromium diagnostics cover the native eXact fixtures, with five samples per scenario. Values below the browser timer resolution may appear as zero. These are separate fixtures from the five-framework application comparison above.

| Scenario                    | Metric        | Median ms |  p95 ms |
| --------------------------- | ------------- | --------: | ------: |
| client.static-mount         | mountMs       |     3.600 |   3.900 |
| client.dynamic-mount        | mountMs       |     2.800 |   2.800 |
| client.hydration            | hydrationMs   |     0.100 |   0.200 |
| client.first-interaction    | interactionMs |     0.000 |   0.100 |
| client.scalar-update        | updateMs      |     0.000 |   0.100 |
| client.branch-update        | updateMs      |     0.000 |   0.100 |
| client.keyed-list-update    | updateMs      |     3.400 |   4.400 |
| client.keyed-list-mutations | unchangedMs   |     0.300 |   0.300 |
| client.keyed-list-mutations | oneChangedMs  |     3.100 |   3.300 |
| client.keyed-list-mutations | sparseMs      |     3.800 |   4.000 |
| client.keyed-list-mutations | rotationMs    |     3.200 |   9.900 |
| client.keyed-list-mutations | appendMs      |     2.600 |   2.900 |
| client.keyed-list-mutations | prependMs     |     2.600 |   2.800 |
| client.keyed-list-mutations | truncateMs    |     2.200 |   2.500 |
| client.keyed-list-mutations | spliceMs      |     2.800 |   2.800 |
| client.keyed-list-mutations | replacementMs |   100.600 | 103.500 |
| client.scheduler-workloads  | burstMs       |     5.600 |   5.700 |
| client.dom-commit-burst     | commitMs      |     0.000 |   0.100 |
| client.enhancement-reroute  | updateMs      |     0.100 |   0.100 |
| client.activity-cycle       | cycleMs       |     0.000 |   0.100 |
| client.suspense-cycle       | settleMs      |     0.100 |   0.200 |
| client.mixed-tree-lifecycle | mountMs       |     2.000 |   2.100 |
| client.mixed-tree-lifecycle | teardownMs    |     0.200 |   0.300 |
| component.population        | createMs      |     3.700 |   4.400 |
| component.population        | disposeMs     |     0.300 |   0.300 |
| component.api-state         | accessMs      |     4.000 |   4.000 |

## Complete document checks

Fresh normal and preloaded responses contained the application component tree, hydration data, document metadata, and closing HTML tags on both runtimes. Both APIs passed application-element and hydration checks for every participant supported in that lane. Sizes below exclude browser asset tags, as in the SSR capacity workload.

| Runtime | Framework | Rendering API | Complete document bytes |
| ------- | --------- | ------------- | ----------------------: |
| node    | exact     | string        |                    3966 |
| node    | react     | string        |                    3457 |
| bun     | exact     | string        |                    3966 |
| bun     | react     | string        |                    3457 |
| node    | exact     | stream        |                    3966 |
| node    | react     | stream        |                    3457 |
| bun     | exact     | stream        |                    3966 |
| bun     | react     | stream        |                    3457 |

## Scheduled-load errors

Each error row is one load driver. Request errors below are retained separately from scheduled capacity misses. Connection errors describe the observed client failure, without establishing its operating-system or server-side cause.

| Runtime/API | Framework | Population | Stage               | Error code   | Count |
| ----------- | --------- | ---------: | ------------------- | ------------ | ----: |
| node/string | exact     |          1 | total-arrivals-8000 | ECONNREFUSED |    77 |
| node/string | exact     |          1 | total-arrivals-8000 | ECONNREFUSED |   119 |
| node/stream | exact     |          1 | total-arrivals-8000 | ECONNREFUSED |   244 |
| node/stream | exact     |          1 | total-arrivals-8000 | ECONNREFUSED |   223 |
| node/stream | react     |          1 | total-arrivals-8000 | ECONNREFUSED |   579 |
| node/stream | react     |          1 | total-arrivals-8000 | ECONNREFUSED |   493 |
| node/stream | react     |          2 | total-arrivals-8000 | ECONNREFUSED |   560 |
| node/stream | react     |          2 | total-arrivals-8000 | ECONNREFUSED |   477 |
| node/stream | exact     |          2 | total-arrivals-8000 | ECONNREFUSED |   199 |
| node/stream | exact     |          2 | total-arrivals-8000 | ECONNREFUSED |   193 |

## Streaming API results

These measurements use streaming APIs for the same complete documents. eXact currently buffers an authored full document internally until hydration is ready. React and TanStack Start use their streaming renderer implementations. This lane does not claim that every implementation delivers early head/body bytes.

### Node v26.8.1 sustained capacity, streaming API

2968 request errors in scheduled arrivals; zero in concurrency captures. Response identities and accounting validated; RPS counts valid responses only.

| Total concurrency | eXact valid RPS | React valid RPS |
| ----------------- | --------------: | --------------: |
| 16                |            5136 |            4004 |
| 32                |            5109 |            4005 |
| 64                |            5017 |            3986 |
| 128               |            4977 |            3968 |

Normal data-loading throughput at concurrency 32: eXact 2218 valid RPS; React 1990 valid RPS.

| Framework | Offered RPS | Valid RPS | Capacity misses | Request errors |
| --------- | ----------: | --------: | --------------: | -------------: |
| eXact     |        8000 |      5119 |          35.45% |            859 |
| eXact     |       10000 |      5157 |          48.18% |              0 |
| React     |        8000 |      3866 |          50.71% |           2109 |
| React     |       10000 |      3929 |          60.47% |              0 |

### Bun 1.4.2 sustained capacity, streaming API

Zero request errors in these captures; response identities and accounting validated.

| Total concurrency | eXact valid RPS | React valid RPS |
| ----------------- | --------------: | --------------: |
| 16                |            4879 |            6325 |
| 32                |            4799 |            6257 |
| 64                |            4703 |            6125 |
| 128               |            4640 |            5935 |

Normal data-loading throughput at concurrency 32: eXact 3712 valid RPS; React 4319 valid RPS.

| Framework | Offered RPS | Valid RPS | Capacity misses | Request errors |
| --------- | ----------: | --------: | --------------: | -------------: |
| eXact     |        8000 |      4909 |          38.34% |              0 |
| eXact     |       10000 |      4909 |          50.66% |              0 |
| React     |        8000 |      6107 |          23.35% |              0 |
| React     |       10000 |      6091 |          38.85% |              0 |

### Streaming API response diagnostics

Complete-response latency, in milliseconds. SvelteKit and Nuxt have no result for this lane.

| Framework      | Node sequential | Node burst | Bun sequential | Bun burst |
| -------------- | --------------: | ---------: | -------------: | --------: |
| Exact          |          14.751 |     11.199 |          0.747 |     4.876 |
| React          |          14.693 |     11.636 |          0.631 |     4.466 |
| TanStack Start |          15.425 |     12.404 |          1.095 |     8.238 |

## Additional repository benchmarks

These diagnostics exercise different fixtures and are not substitutes for the paired eXact/React capacity measurements above. Their complete structured results are retained as separate raw captures.

| Server fixture runtime | Transport        | Valid RPS | Latency p50 ms | Latency p95 ms |
| ---------------------- | ---------------- | --------: | -------------: | -------------: |
| node                   | node-http        |      1818 |          15.25 |          29.94 |
| bun                    | node-http-compat |      3978 |           7.74 |          10.80 |
| bun                    | bun-serve        |      4048 |           7.72 |          10.40 |

Compiler generated-output validation:

| Mode     | Median ms | p95 ms |
| -------- | --------: | -----: |
| semantic |     28.04 |  31.93 |
| syntax   |      3.34 |   4.57 |

The performance-foundation transport and build-host scenarios each ran in five isolated processes. DevTools preview, event, merge, and hardened-build assertions passed. React 18 and React 19 reference rendering each completed five samples; these are reference-library diagnostics, not native eXact comparisons.

| React reference | Renders per sample | Median ms | p95 ms |
| --------------- | -----------------: | --------: | -----: |
| 18.3            |                200 |     50.87 |  51.22 |
| 19.2            |                200 |    178.14 | 184.86 |

Compatibility adapter discovery found 1 adapter(s) and 1 substitutions in 163.33 ms. The single-process transform diagnostic measured 661371 irrelevant modules/s and 2189 relevant modules/s.

## Publication validation

Documentation typechecking, the ten documentation-app tests, and the standalone docs build passed. Desktop and mobile browser checks matched all seventeen distribution tables, both rendering modes' capacity tables on each runtime, and all five heap rows to the published JSON. There were no page errors or horizontal overflow. Source architecture, JSDoc checks, and changed-file formatting and whitespace checks passed. No benchmark-owned server, driver, browser, or compiler process remains; pre-existing processes were preserved.

Evidence bundle SHA-256: `ba4b96ce58d70f9c771bbf419e6f8a4d5f9ea3235bcce578d9a5736d8f5a50a1`.
