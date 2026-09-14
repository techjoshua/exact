# String and streaming API benchmark refresh, September 9, 2026

Fresh production builds render application-owned document components on Node and Bun. eXact uses its public hydratable document API, including root-document normalization and document hydration. String and streaming API lanes use the same authored document component on both runtimes. React uses renderToString or renderToReadableStream as selected; eXact uses its public hydratable string or progressive HTML API. TanStack Start uses its supported string or streaming handler. Nuxt and SvelteKit appear only in the string lane. The public Performance page uses this complete browser, heap, Node, and Bun capture. Dates in the artifacts are UTC; the run began on September 9 local time.

## Measurement conditions

All five comparison applications were rebuilt. The shared 35 string-mode browser contracts and 21 streaming-mode contracts passed separately on Node 26.8.1 and native Bun 1.4.2. Timed suites ran sequentially, with no additional build, test, or benchmark suite launched alongside them. Driver and server processes still share one Windows workstation, an AMD Ryzen 7 8745HS with 16 logical processors. Ordinary desktop processes were left running; their background activity was not measured.

- Browser: 50 balanced rounds per framework, fresh cache-disabled contexts, production-page HTTP replay, and one discarded warmup round.
- Heap composition: ten samples per framework after one warmup, captured separately from browser interaction timings.
- Server diagnostics: 500 sequential samples and 500 sixteen-request bursts per framework and runtime, 100 warmups, and five retained-heap checkpoints. Short-window diagnostic RPS is not a public capacity estimate.
- Sustained Node and Bun capacity: two independent load drivers, two fresh reversed process populations, ten-second warmups, fifteen-second concurrency stages, and twenty-second normal-loading and scheduled-demand stages.
- Startup profiling: 30 rounds at each of 1x, 4x, and 6x Chromium CPU emulation. These separately instrumented results do not replace ordinary browser timings.

The earlier capture mixed rendering APIs across runtimes and used a fragment harness. It is not a controlled baseline for either new API lane. eXact now materializes the complete hydratable document before Node output, and its client adopts the document root. Dependencies also changed since the previous capture. These are new measurements, not a paired isolation experiment for a single optimization. Previous captures are retained in the evidence archive. Source, dependency, process, and host state can affect historical differences even when runtime versions and workload plans match.

The new capture records source revision 5a3682ab+worktree; the previous public browser report records 5a3682ab+worktree. Artifact hashes identify the measured dirty-worktree outputs more precisely than the commit alone.

## Relative performance against React

Ratios divide eXact valid RPS by React valid RPS within the same runtime and rendering API. Above 1 means higher eXact throughput. Separate framework blocks still experience host variation. Historical captures used different shell ownership and API selections, so they are not used to estimate an optimization effect here.

| Runtime | API    | Concurrency | eXact / React |
| ------- | ------ | ----------: | ------------: |
| node    | string |          16 |         0.586 |
| node    | string |          32 |         0.576 |
| node    | string |          64 |         0.575 |
| node    | string |         128 |         0.602 |
| bun     | string |          16 |         0.723 |
| bun     | string |          32 |         0.729 |
| bun     | string |          64 |         0.747 |
| bun     | string |         128 |         0.753 |
| node    | stream |          16 |         1.115 |
| node    | stream |          32 |         1.109 |
| node    | stream |          64 |         1.101 |
| node    | stream |         128 |         1.102 |
| bun     | stream |          16 |         0.663 |
| bun     | stream |          32 |         0.646 |
| bun     | stream |          64 |         0.677 |
| bun     | stream |         128 |         0.676 |

## Browser results

Browser pages were captured through the string lane for all five participants. Arithmetic means across 50 samples. Full percentiles are retained in the public chart data.

| Metric                   | Unit |  eXact |  React | SvelteKit |   Nuxt | TanStack Start |
| ------------------------ | ---- | -----: | -----: | --------: | -----: | -------------: |
| Navigation completion    | ms   | 39.598 | 36.104 |    29.916 | 39.284 |         48.820 |
| First contentful paint   | ms   | 47.360 | 45.040 |    39.600 | 43.200 |         41.440 |
| Optimistic feedback      | ms   |  1.714 |  1.498 |     1.332 |  1.072 |          1.580 |
| Authoritative settlement | ms   | 13.992 | 13.696 |    13.778 | 14.272 |         13.892 |
| Warm browser used heap   | MB   |  2.574 |  2.303 |     2.078 |  2.334 |          2.762 |

Historical eXact means from the previously published browser capture:

| Metric                        | Previous | Current | Change |
| ----------------------------- | -------: | ------: | -----: |
| Navigation completion (ms)    |   28.488 |  39.598 | 39.00% |
| First contentful paint (ms)   |   42.320 |  47.360 | 11.91% |
| Optimistic feedback (ms)      |    1.586 |   1.714 |  8.07% |
| Authoritative settlement (ms) |   13.994 |  13.992 | -0.01% |
| Warm browser used heap (MB)   |    2.497 |   2.574 |  3.11% |

## Node v26.8.1 sustained capacity, string API

1067 request errors in scheduled arrivals; zero in concurrency captures. Response identities and accounting validated; RPS counts valid responses only.

| Total concurrency | eXact valid RPS | React valid RPS |
| ----------------- | --------------: | --------------: |
| 16                |            5598 |            9551 |
| 32                |            5493 |            9532 |
| 64                |            5439 |            9460 |
| 128               |            5383 |            8948 |

The table uses preloaded data. Normal data-loading throughput at concurrency 32: eXact 2348 valid RPS; React 2714 valid RPS.

| Framework | Offered RPS | Valid RPS | Capacity misses | Request errors |
| --------- | ----------: | --------: | --------------: | -------------: |
| eXact     |        8000 |      5498 |          30.72% |            845 |
| eXact     |       10000 |      5536 |          44.41% |              0 |
| React     |        8000 |      7997 |           0.00% |              8 |
| React     |       10000 |      8148 |          18.20% |            214 |

Historical preloaded capacity comparison:

| Framework | Concurrency | Previous valid RPS | Current valid RPS |  Change |
| --------- | ----------: | -----------------: | ----------------: | ------: |
| eXact     |          16 |              10905 |              5598 | -48.67% |
| eXact     |          32 |              10735 |              5493 | -48.83% |
| eXact     |          64 |              10820 |              5439 | -49.73% |
| eXact     |         128 |               9571 |              5383 | -43.76% |
| React     |          16 |              11113 |              9551 | -14.05% |
| React     |          32 |              10524 |              9532 |  -9.43% |
| React     |          64 |              10235 |              9460 |  -7.57% |
| React     |         128 |               9777 |              8948 |  -8.47% |

## Bun 1.4.2 sustained capacity, string API

Zero request errors in these captures; response identities and accounting validated.

| Total concurrency | eXact valid RPS | React valid RPS |
| ----------------- | --------------: | --------------: |
| 16                |            6420 |            8881 |
| 32                |            6358 |            8721 |
| 64                |            6272 |            8400 |
| 128               |            6202 |            8233 |

The table uses preloaded data. Normal data-loading throughput at concurrency 32: eXact 4186 valid RPS; React 4281 valid RPS.

| Framework | Offered RPS | Valid RPS | Capacity misses | Request errors |
| --------- | ----------: | --------: | --------------: | -------------: |
| eXact     |        8000 |      6304 |          20.89% |              0 |
| eXact     |       10000 |      6301 |          36.74% |              0 |
| React     |        8000 |      7698 |           3.45% |              0 |
| React     |       10000 |      7620 |          23.54% |              0 |

Historical preloaded capacity comparison:

| Framework | Concurrency | Previous valid RPS | Current valid RPS |  Change |
| --------- | ----------: | -----------------: | ----------------: | ------: |
| eXact     |          16 |              10017 |              6420 | -35.91% |
| eXact     |          32 |              10192 |              6358 | -37.62% |
| eXact     |          64 |               9762 |              6272 | -35.75% |
| eXact     |         128 |               9723 |              6202 | -36.21% |
| React     |          16 |               6454 |              8881 |  37.62% |
| React     |          32 |               6415 |              8721 |  35.96% |
| React     |          64 |               6200 |              8400 |  35.49% |
| React     |         128 |               6061 |              8233 |  35.82% |

## Server response diagnostics, string API

Arithmetic mean complete-response latency, in milliseconds. Node and Bun are separate populations and transports. Node data loading includes the runtime HTTP-client behavior described in the [current-runtime investigation](current-runtimes-2026-09-07.md). These numbers are not isolated renderer timings.

| Framework      | Node sequential | Node burst | Bun sequential | Bun burst |
| -------------- | --------------: | ---------: | -------------: | --------: |
| Exact          |          14.708 |     11.172 |          0.704 |     4.673 |
| React          |          14.422 |      9.644 |          0.664 |     4.587 |
| SvelteKit      |          14.799 |     12.015 |          0.833 |     5.214 |
| Nuxt           |          14.674 |     14.887 |          1.303 |     7.726 |
| TanStack Start |          14.934 |     12.736 |          1.141 |     6.977 |

## Instrumented startup

Time to the shared semantic-ready marker, in milliseconds. Each cell shows p50 / p95 across 30 cold-context samples. Tracing adds overhead; CPU emulation is not physical mobile hardware. These values must not replace the ordinary browser navigation measurements above.

| CPU emulation |           eXact |           React |       SvelteKit |            Nuxt |  TanStack Start |
| ------------- | --------------: | --------------: | --------------: | --------------: | --------------: |
| 1x            |   66.20 / 74.40 |   61.90 / 75.10 |   59.80 / 63.80 |   66.60 / 74.40 | 100.20 / 104.40 |
| 4x            | 241.40 / 250.20 | 242.70 / 279.40 | 251.90 / 282.00 | 248.60 / 252.50 | 312.60 / 372.50 |
| 6x            | 394.10 / 468.40 | 388.50 / 452.00 | 406.20 / 517.40 | 405.40 / 536.10 | 547.20 / 646.50 |

## Collection transaction cost

`npm run benchmark:collections` exercises the corrected transaction path. Each cell is median milliseconds per delete/restore operation, from ten samples of 100 operations after three warmups. Collection setup and order assertions are outside timing; no observers are installed. Rollback includes throwing and catching the intentional abort. Committed iterations reinsert key 0 at the tail; rollback restores it at the head, so these columns exercise distinct paths.

| Collection | Entries | Ordinary delete/reinsert | Transaction commit | Transaction rollback |
| ---------- | ------: | -----------------------: | -----------------: | -------------------: |
| Map        |    1000 |                   0.0014 |             0.0037 |               0.0518 |
| Map        |   10000 |                   0.0011 |             0.0777 |               0.9334 |
| Set        |    1000 |                   0.0012 |             0.0085 |               0.0331 |
| Set        |   10000 |                   0.0010 |             0.0670 |               0.6365 |

Transactional deletion now captures ordering anchors in linear time. Rollback must restore ordering while retaining unrelated newer values. The ordinary path does not pay this traversal cost. Applications deleting repeatedly from large collections inside transactions should account for it; these measurements do not establish a historical percentage regression or representative application latency.

## Framework regression benchmarks

| Reactive scenario                              | Median ms |  p95 ms |
| ---------------------------------------------- | --------: | ------: |
| unkeyed identical 10k refresh                  |    87.556 | 125.442 |
| keyed identical 10k refresh                    |    55.325 |  60.084 |
| keyed one-item change                          |    99.488 | 180.026 |
| keyed one-percent change                       |   100.573 | 188.283 |
| keyed 10k rotation                             |   133.155 | 237.895 |
| keyed add-delete                               |   130.490 | 249.988 |
| local mutation then matching fetch             |    93.556 |  95.984 |
| 100 local mutations then matching fetch        |    95.735 | 309.568 |
| keyed protocol roundtrip                       |    76.846 |  82.282 |
| subtree disposal with unrelated paused backlog |     0.642 |   1.556 |
| scoped computed chain settlement               |    55.260 |  60.114 |
| equal computed diamond settlement              |     0.008 |   0.018 |

The compiled 1,000-row keyed rotation measured 5.670 ms median and 6.011 ms p95 across five isolated processes. Its DOM identity assertions and existing 2,000 ms p95 guard passed.

The compiler-owned framework benchmark rebuilt its fixtures and ran Node and Chromium scenarios. Full scenario metrics, samples, environment, build timings, and artifact evidence are retained in the archive.

## Reproduction and evidence

The [supporting evidence bundle](render-modes-2026-09-09-evidence.zip) retains execution logs, runners, verification records, and browser screenshots. The [evidence archive](render-modes-2026-09-09.json) contains chart summaries, the prior public reports, environment records, raw-capture paths and SHA-256 hashes, and exact measurement/publication runners. Raw capture JSON remains in `docs/performance-baselines/render-modes-2026-09-09-*.json`. The public app reads the seven updated report files under `apps/docs/src/data`.

The runners reuse the repository process owners and close their servers and drivers. Rebuild and run both runtime correctness suites before using `--correctness-passed`; it records admission, rather than performing checks itself. Collection diagnostics can be repeated with `npm run benchmark:collections -- --output=<file.json>`.

This refresh measures selected framework workloads. It does not prove that every application is faster or that lifecycle/security fixes have zero overhead. Historical movements must be read alongside control-framework results and the transaction-specific measurements.

## Compiled client scenarios

These Chromium diagnostics cover the native eXact fixtures, with five samples per scenario. Values below the browser timer resolution may appear as zero. These are separate fixtures from the five-framework application comparison above.

| Scenario                    | Metric        | Median ms |  p95 ms |
| --------------------------- | ------------- | --------: | ------: |
| client.static-mount         | mountMs       |     3.400 |   3.500 |
| client.dynamic-mount        | mountMs       |     2.700 |   2.900 |
| client.hydration            | hydrationMs   |     0.100 |   0.200 |
| client.first-interaction    | interactionMs |     0.000 |   0.100 |
| client.scalar-update        | updateMs      |     0.000 |   0.100 |
| client.branch-update        | updateMs      |     0.100 |   0.100 |
| client.keyed-list-update    | updateMs      |     3.500 |   3.600 |
| client.keyed-list-mutations | unchangedMs   |     0.200 |   0.300 |
| client.keyed-list-mutations | oneChangedMs  |     2.800 |   3.000 |
| client.keyed-list-mutations | sparseMs      |     3.600 |   3.800 |
| client.keyed-list-mutations | rotationMs    |     2.700 |   9.600 |
| client.keyed-list-mutations | appendMs      |     2.500 |   2.800 |
| client.keyed-list-mutations | prependMs     |     2.500 |   2.700 |
| client.keyed-list-mutations | truncateMs    |     2.200 |   2.700 |
| client.keyed-list-mutations | spliceMs      |     2.600 |   8.400 |
| client.keyed-list-mutations | replacementMs |   103.300 | 106.100 |
| client.scheduler-workloads  | burstMs       |     5.500 |   5.600 |
| client.dom-commit-burst     | commitMs      |     0.100 |   0.100 |
| client.enhancement-reroute  | updateMs      |     0.000 |   0.100 |
| client.activity-cycle       | cycleMs       |     0.000 |   0.100 |
| client.suspense-cycle       | settleMs      |     0.100 |   0.100 |
| client.mixed-tree-lifecycle | mountMs       |     2.100 |   2.700 |
| client.mixed-tree-lifecycle | teardownMs    |     0.200 |   0.300 |
| component.population        | createMs      |     4.400 |   9.700 |
| component.population        | disposeMs     |     0.300 |   0.400 |
| component.api-state         | accessMs      |     3.900 |   4.000 |

## Complete document checks

Fresh normal and preloaded responses contained the application component tree, hydration data, document metadata, and closing HTML tags on both runtimes. Both APIs passed application-element and hydration checks for every participant supported in that lane. Sizes below exclude browser asset tags, as in the SSR capacity workload.

| Runtime | Framework | Rendering API | Complete document bytes |
| ------- | --------- | ------------- | ----------------------: |
| node    | exact     | string        |                    3966 |
| node    | react     | string        |                    3457 |
| bun     | exact     | string        |                    3966 |
| bun     | react     | string        |                    3457 |
| node    | exact     | stream        |                    4353 |
| node    | react     | stream        |                    3457 |
| bun     | exact     | stream        |                    4353 |
| bun     | react     | stream        |                    3457 |

## Scheduled-load errors

Each error row is one load driver. Request errors below are retained separately from scheduled capacity misses. Connection errors describe the observed client failure, without establishing its operating-system or server-side cause.

| Runtime/API | Framework | Population | Stage                | Error code   | Count |
| ----------- | --------- | ---------: | -------------------- | ------------ | ----: |
| node/string | exact     |          1 | total-arrivals-8000  | ECONNREFUSED |   245 |
| node/string | exact     |          1 | total-arrivals-8000  | ECONNREFUSED |   253 |
| node/string | react     |          1 | total-arrivals-8000  | ECONNRESET   |     3 |
| node/string | react     |          1 | total-arrivals-10000 | ECONNREFUSED |    95 |
| node/string | react     |          1 | total-arrivals-8000  | ECONNRESET   |     5 |
| node/string | react     |          1 | total-arrivals-10000 | ECONNREFUSED |   119 |
| node/string | exact     |          2 | total-arrivals-8000  | ECONNREFUSED |   222 |
| node/string | exact     |          2 | total-arrivals-8000  | ECONNREFUSED |   125 |
| node/stream | exact     |          1 | total-arrivals-8000  | ECONNREFUSED |   484 |
| node/stream | exact     |          1 | total-arrivals-8000  | ECONNREFUSED |   544 |
| node/stream | react     |          1 | total-arrivals-8000  | ECONNREFUSED |   784 |
| node/stream | react     |          1 | total-arrivals-8000  | ECONNREFUSED |   473 |
| node/stream | react     |          2 | total-arrivals-8000  | ECONNREFUSED |   437 |
| node/stream | react     |          2 | total-arrivals-8000  | ECONNREFUSED |   695 |
| node/stream | exact     |          2 | total-arrivals-8000  | ECONNREFUSED |   411 |
| node/stream | exact     |          2 | total-arrivals-8000  | ECONNREFUSED |   466 |

## Streaming API results

These measurements use streaming APIs for the same complete documents. eXact currently buffers an authored full document internally until hydration is ready. React and TanStack Start use their streaming renderer implementations. This lane does not claim that every implementation delivers early head/body bytes.

### Node v26.8.1 sustained capacity, streaming API

4294 request errors in scheduled arrivals; zero in concurrency captures. Response identities and accounting validated; RPS counts valid responses only.

| Total concurrency | eXact valid RPS | React valid RPS |
| ----------------- | --------------: | --------------: |
| 16                |            4454 |            3993 |
| 32                |            4360 |            3932 |
| 64                |            4350 |            3949 |
| 128               |            4318 |            3920 |

Normal data-loading throughput at concurrency 32: eXact 2053 valid RPS; React 1990 valid RPS.

| Framework | Offered RPS | Valid RPS | Capacity misses | Request errors |
| --------- | ----------: | --------: | --------------: | -------------: |
| eXact     |        8000 |      4373 |          44.43% |           1905 |
| eXact     |       10000 |      4421 |          55.52% |              0 |
| React     |        8000 |      3938 |          49.71% |           2389 |
| React     |       10000 |      3902 |          60.73% |              0 |

### Bun 1.4.2 sustained capacity, streaming API

Zero request errors in these captures; response identities and accounting validated.

| Total concurrency | eXact valid RPS | React valid RPS |
| ----------------- | --------------: | --------------: |
| 16                |            4183 |            6310 |
| 32                |            4039 |            6254 |
| 64                |            4080 |            6026 |
| 128               |            3998 |            5914 |

Normal data-loading throughput at concurrency 32: eXact 3110 valid RPS; React 4244 valid RPS.

| Framework | Offered RPS | Valid RPS | Capacity misses | Request errors |
| --------- | ----------: | --------: | --------------: | -------------: |
| eXact     |        8000 |      4084 |          48.64% |              0 |
| eXact     |       10000 |      4121 |          58.54% |              0 |
| React     |        8000 |      6126 |          23.11% |              0 |
| React     |       10000 |      6090 |          38.84% |              0 |

### Streaming API response diagnostics

Complete-response latency, in milliseconds. SvelteKit and Nuxt have no result for this lane.

| Framework      | Node sequential | Node burst | Bun sequential | Bun burst |
| -------------- | --------------: | ---------: | -------------: | --------: |
| Exact          |          14.646 |     11.087 |          0.812 |     5.289 |
| React          |          14.853 |     11.966 |          0.671 |     4.695 |
| TanStack Start |          15.418 |     12.341 |          1.121 |     8.326 |

## Additional repository benchmarks

These diagnostics exercise different fixtures and are not substitutes for the paired eXact/React capacity measurements above. Their complete structured results are retained as separate raw captures.

| Server fixture runtime | Transport        | Valid RPS | Latency p50 ms | Latency p95 ms |
| ---------------------- | ---------------- | --------: | -------------: | -------------: |
| node                   | node-http        |      1769 |          15.79 |          30.59 |
| bun                    | node-http-compat |      3977 |           7.75 |          10.89 |
| bun                    | bun-serve        |      3946 |           7.99 |          10.61 |

Compiler generated-output validation:

| Mode     | Median ms | p95 ms |
| -------- | --------: | -----: |
| semantic |     27.40 |  29.37 |
| syntax   |      3.00 |   4.84 |

The performance-foundation transport and build-host scenarios each ran in five isolated processes. DevTools preview, event, merge, and hardened-build assertions passed. React 18 and React 19 reference rendering each completed five samples; these are reference-library diagnostics, not native eXact comparisons.

| React reference | Renders per sample | Median ms | p95 ms |
| --------------- | -----------------: | --------: | -----: |
| 18.3            |                200 |     50.72 |  53.16 |
| 19.2            |                200 |    180.61 | 182.93 |

Compatibility adapter discovery found 1 adapter(s) and 1 substitutions in 164.21 ms. The single-process transform diagnostic measured 648900 irrelevant modules/s and 2131 relevant modules/s.

## Publication validation

Documentation typechecking, the ten documentation-app tests, and the standalone docs build passed. Desktop and mobile browser checks matched all seventeen distribution tables, both rendering modes' capacity tables on each runtime, and all five heap rows to the published JSON. There were no page errors or horizontal overflow. Source architecture, JSDoc checks, and changed-file formatting and whitespace checks passed. No benchmark-owned server, driver, browser, or compiler process remains; pre-existing processes were preserved.

## Incomplete attempts

Completed measurement populations were retained. The following failed diagnostic attempts were restarted with the same artifacts and workload settings. The renderer-only diagnostic had omitted the document options supplied by real HTTP requests, which caused an undefined clientTags value to fail hydration serialization. Forwarding the same options repaired the diagnostic without changing the timed HTTP paths or compiled application artifacts. Their logs and execution timestamps remain in the supporting evidence.

| Stage | Exit code | Log              |
| ----- | --------: | ---------------- |
| ssr   |         1 | ssr-attempt1.log |
| ssr   |         1 | ssr-attempt2.log |
