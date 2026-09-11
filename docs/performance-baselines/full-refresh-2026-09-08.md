# Full performance refresh, September 8, 2026

This capture predates the move to application-owned document components on Node and Bun.
It does not measure the new eXact document-root rendering and hydration path.

Fresh production builds include the retained [SSR hot-path improvements](ssr-hotpath-experiments-2026-09-08.md): markerless scalar text, native hydration byte counting, native-capable long-text accounting, and complete-response byte publication. The public Performance page now uses these browser, heap, Node, and native Bun captures. Dates in the artifacts are UTC; the run began on September 8 local time.

## Measurement conditions

All five comparison applications were rebuilt. The shared 35 browser contracts passed on Node 26.8.1 and separately on native Bun 1.4.2. Timed suites ran sequentially, with no additional build, test, or benchmark suite launched alongside them. Driver and server processes still share one Windows workstation, an AMD Ryzen 7 8745HS with 16 logical processors. Ordinary desktop processes were left running; their background activity was not measured.

- Browser: 50 balanced rounds per framework, fresh cache-disabled contexts, production-page HTTP replay, and one discarded warmup round.
- Heap composition: ten samples per framework after one warmup, captured separately from browser interaction timings.
- Server diagnostics: 500 sequential samples and 500 sixteen-request bursts per framework and runtime, 100 warmups, and five retained-heap checkpoints. Short-window diagnostic RPS is not a public capacity estimate.
- Sustained Node and Bun capacity: two independent load drivers, two fresh reversed process populations, ten-second warmups, fifteen-second concurrency stages, and twenty-second normal-loading and scheduled-demand stages.
- Startup profiling: 30 rounds at each of 1x, 4x, and 6x Chromium CPU emulation. These separately instrumented results do not replace ordinary browser timings.

These are new measurements, not a paired isolation experiment for a single optimization. Previous captures are retained in the evidence archive. Source, dependency, process, and host state can affect historical differences even when runtime versions and workload plans match.

The new capture records source revision 5a3682ab+worktree; the previous public browser report records 5a3682ab+worktree. Artifact hashes identify the measured dirty-worktree outputs more precisely than the commit alone.

## Relative performance against React

Throughput ratios divide eXact valid RPS by React valid RPS from the same capture. Above 1 means higher eXact throughput. These controls reduce historical host variation but do not eliminate differences between sequential blocks or establish causation from the optimization patch.

| Runtime | Concurrency | Previous eXact/React | Current eXact/React | Ratio change |
| ------- | ----------: | -------------------: | ------------------: | -----------: |
| node    |          16 |                0.978 |               0.981 |        0.36% |
| node    |          32 |                1.050 |               1.020 |       -2.90% |
| node    |          64 |                0.978 |               1.057 |        8.04% |
| node    |         128 |                0.992 |               0.979 |       -1.35% |
| bun     |          16 |                1.532 |               1.552 |        1.31% |
| bun     |          32 |                1.497 |               1.589 |        6.11% |
| bun     |          64 |                1.544 |               1.574 |        1.98% |
| bun     |         128 |                1.461 |               1.604 |        9.79% |

Browser ratios below divide eXact means by React means. Lower than 1 means lower eXact time or heap for that metric.

| Browser metric           | Previous eXact/React | Current eXact/React |
| ------------------------ | -------------------: | ------------------: |
| Navigation completion    |                0.805 |               0.802 |
| First contentful paint   |                0.939 |               0.957 |
| Optimistic feedback      |                1.011 |               1.079 |
| Authoritative settlement |                1.013 |               1.021 |
| Warm browser used heap   |                1.082 |               1.084 |

Population ratios expose variation between the two sequential framework orders:

| Runtime | Concurrency | eXact-first population | React-first population |
| ------- | ----------: | ---------------------: | ---------------------: |
| node    |          16 |                  0.973 |                  0.990 |
| node    |          32 |                  0.947 |                  1.098 |
| node    |          64 |                  0.993 |                  1.126 |
| node    |         128 |                  0.975 |                  0.983 |
| bun     |          16 |                  1.552 |                  1.552 |
| bun     |          32 |                  1.602 |                  1.575 |
| bun     |          64 |                  1.583 |                  1.565 |
| bun     |         128 |                  1.594 |                  1.614 |

## Browser results

Arithmetic means across 50 samples. Full percentiles are retained in the public chart data.

| Metric                   | Unit |  eXact |  React | SvelteKit |   Nuxt | TanStack Start |
| ------------------------ | ---- | -----: | -----: | --------: | -----: | -------------: |
| Navigation completion    | ms   | 28.488 | 35.518 |    29.258 | 39.318 |         47.730 |
| First contentful paint   | ms   | 42.320 | 44.240 |    39.760 | 42.960 |         41.520 |
| Optimistic feedback      | ms   |  1.586 |  1.470 |     1.340 |  1.104 |          1.554 |
| Authoritative settlement | ms   | 13.994 | 13.708 |    13.884 | 14.172 |         14.324 |
| Warm browser used heap   | MB   |  2.497 |  2.303 |     2.078 |  2.334 |          2.763 |

Historical eXact means from the previously published browser capture:

| Metric                        | Previous | Current | Change |
| ----------------------------- | -------: | ------: | -----: |
| Navigation completion (ms)    |   28.768 |  28.488 | -0.97% |
| First contentful paint (ms)   |   41.840 |  42.320 |  1.15% |
| Optimistic feedback (ms)      |    1.534 |   1.586 |  3.39% |
| Authoritative settlement (ms) |   13.864 |  13.994 |  0.94% |
| Warm browser used heap (MB)   |    2.492 |   2.497 |  0.19% |

## Node v26.8.1 sustained capacity

Zero request errors in these captures; response identities and accounting validated.

| Total concurrency | eXact valid RPS | React valid RPS |
| ----------------- | --------------: | --------------: |
| 16                |           10905 |           11113 |
| 32                |           10735 |           10524 |
| 64                |           10820 |           10235 |
| 128               |            9571 |            9777 |

The table uses preloaded data. Normal data-loading throughput at concurrency 32: eXact 2832 valid RPS; React 2792 valid RPS.

| Framework | Offered RPS | Valid RPS | Capacity misses | Request errors |
| --------- | ----------: | --------: | --------------: | -------------: |
| eXact     |        8000 |      7997 |           0.00% |              0 |
| eXact     |       10000 |      9033 |           9.40% |              0 |
| React     |        8000 |      7998 |           0.00% |              0 |
| React     |       10000 |      9075 |           8.99% |              0 |

Historical preloaded capacity comparison:

| Framework | Concurrency | Previous valid RPS | Current valid RPS | Change |
| --------- | ----------: | -----------------: | ----------------: | -----: |
| eXact     |          16 |              10506 |             10905 |  3.80% |
| eXact     |          32 |              10256 |             10735 |  4.67% |
| eXact     |          64 |               9772 |             10820 | 10.73% |
| eXact     |         128 |               9408 |              9571 |  1.73% |
| React     |          16 |              10744 |             11113 |  3.43% |
| React     |          32 |               9763 |             10524 |  7.79% |
| React     |          64 |               9987 |             10235 |  2.49% |
| React     |         128 |               9481 |              9777 |  3.12% |

## Bun 1.4.2 sustained capacity

Zero request errors in these captures; response identities and accounting validated.

| Total concurrency | eXact valid RPS | React valid RPS |
| ----------------- | --------------: | --------------: |
| 16                |           10017 |            6454 |
| 32                |           10192 |            6415 |
| 64                |            9762 |            6200 |
| 128               |            9723 |            6061 |

The table uses preloaded data. Normal data-loading throughput at concurrency 32: eXact 4370 valid RPS; React 4273 valid RPS.

| Framework | Offered RPS | Valid RPS | Capacity misses | Request errors |
| --------- | ----------: | --------: | --------------: | -------------: |
| eXact     |        8000 |      7998 |           0.00% |              0 |
| eXact     |       10000 |      8621 |          13.53% |              0 |
| React     |        8000 |      6311 |          20.79% |              0 |
| React     |       10000 |      6311 |          36.64% |              0 |

Historical preloaded capacity comparison:

| Framework | Concurrency | Previous valid RPS | Current valid RPS | Change |
| --------- | ----------: | -----------------: | ----------------: | -----: |
| eXact     |          16 |               9715 |             10017 |  3.11% |
| eXact     |          32 |               9396 |             10192 |  8.48% |
| eXact     |          64 |               9327 |              9762 |  4.66% |
| eXact     |         128 |               8792 |              9723 | 10.58% |
| React     |          16 |               6341 |              6454 |  1.77% |
| React     |          32 |               6275 |              6415 |  2.23% |
| React     |          64 |               6041 |              6200 |  2.63% |
| React     |         128 |               6018 |              6061 |  0.72% |

## Server response diagnostics

Arithmetic mean complete-response latency, in milliseconds. Node and Bun are separate populations and transports. Node data loading includes the runtime HTTP-client behavior described in the [current-runtime investigation](current-runtimes-2026-09-07.md). These numbers are not isolated renderer timings.

| Framework      | Node sequential | Node burst | Bun sequential | Bun burst |
| -------------- | --------------: | ---------: | -------------: | --------: |
| Exact          |          14.536 |      9.602 |          0.668 |     4.464 |
| React          |          14.772 |      9.764 |          0.686 |     4.507 |
| SvelteKit      |          14.802 |     10.269 |          0.845 |     5.088 |
| Nuxt           |          14.614 |     13.596 |          1.359 |     7.385 |
| TanStack Start |          15.312 |     13.282 |          1.320 |     8.533 |

## Instrumented startup

Time to the shared semantic-ready marker, in milliseconds. Each cell shows p50 / p95 across 30 cold-context samples. Tracing adds overhead; CPU emulation is not physical mobile hardware. These values must not replace the ordinary browser navigation measurements above.

| CPU emulation |           eXact |           React |       SvelteKit |            Nuxt |  TanStack Start |
| ------------- | --------------: | --------------: | --------------: | --------------: | --------------: |
| 1x            |   62.50 / 67.60 |   63.50 / 73.70 |   60.10 / 64.60 |   65.40 / 72.20 |  72.00 / 102.50 |
| 4x            | 244.90 / 264.30 | 244.20 / 253.60 | 256.10 / 266.80 | 250.60 / 257.20 | 315.30 / 370.00 |
| 6x            | 391.70 / 449.60 | 392.60 / 399.50 | 412.00 / 427.80 | 404.90 / 440.30 | 548.80 / 565.30 |

## Collection transaction cost

`npm run benchmark:collections` exercises the corrected transaction path. Each cell is median milliseconds per delete/restore operation, from ten samples of 100 operations after three warmups. Collection setup and order assertions are outside timing; no observers are installed. Rollback includes throwing and catching the intentional abort. Committed iterations reinsert key 0 at the tail; rollback restores it at the head, so these columns exercise distinct paths.

| Collection | Entries | Ordinary delete/reinsert | Transaction commit | Transaction rollback |
| ---------- | ------: | -----------------------: | -----------------: | -------------------: |
| Map        |    1000 |                   0.0014 |             0.0037 |               0.0640 |
| Map        |   10000 |                   0.0011 |             0.0768 |               0.9403 |
| Set        |    1000 |                   0.0012 |             0.0086 |               0.0338 |
| Set        |   10000 |                   0.0010 |             0.0692 |               0.6401 |

Transactional deletion now captures ordering anchors in linear time. Rollback must restore ordering while retaining unrelated newer values. The ordinary path does not pay this traversal cost. Applications deleting repeatedly from large collections inside transactions should account for it; these measurements do not establish a historical percentage regression or representative application latency.

## Framework regression benchmarks

| Reactive scenario                              | Median ms |  p95 ms |
| ---------------------------------------------- | --------: | ------: |
| unkeyed identical 10k refresh                  |    86.705 | 173.982 |
| keyed identical 10k refresh                    |    54.035 |  66.782 |
| keyed one-item change                          |    93.871 |  99.272 |
| keyed one-percent change                       |    96.879 | 195.262 |
| keyed 10k rotation                             |   125.204 | 243.206 |
| keyed add-delete                               |   128.109 | 262.198 |
| local mutation then matching fetch             |    92.049 |  94.873 |
| 100 local mutations then matching fetch        |    92.094 | 201.916 |
| keyed protocol roundtrip                       |    75.232 |  81.306 |
| subtree disposal with unrelated paused backlog |     0.689 |   2.699 |
| scoped computed chain settlement               |    54.501 |  62.493 |
| equal computed diamond settlement              |     0.010 |   0.015 |

The compiled 1,000-row keyed rotation measured 5.849 ms median and 6.036 ms p95 across five isolated processes. Its DOM identity assertions and existing 2,000 ms p95 guard passed.

The compiler-owned framework benchmark rebuilt its fixtures and ran Node and Chromium scenarios. Full scenario metrics, samples, environment, build timings, and artifact evidence are retained in the archive.

## Reproduction and evidence

The [evidence archive](full-refresh-2026-09-08.json) contains chart summaries, the prior public reports, environment records, raw-capture paths and SHA-256 hashes, and exact measurement/publication runners. The [supporting evidence ZIP](full-refresh-2026-09-08-evidence.zip) retains execution logs, workload plans, artifact verification, runners, and desktop/mobile screenshots. Raw capture JSON remains in `docs/performance-baselines/full-refresh-2026-09-08-*.json`. The public app reads the four updated report files under `apps/docs/src/data`.

The runners reuse the repository process owners and close their servers and drivers. Rebuild and run both runtime correctness suites before using `--correctness-passed`; it records admission, rather than performing checks itself. Collection diagnostics can be repeated with `npm run benchmark:collections -- --output=<file.json>`.

This refresh measures selected framework workloads. It does not prove that every application is faster or that lifecycle/security fixes have zero overhead. Historical movements must be read alongside control-framework results and the transaction-specific measurements.

## Additional repository benchmarks

These diagnostics exercise different fixtures and are not substitutes for the paired eXact/React capacity measurements above. Their complete structured results are retained as separate raw captures.

| Server fixture runtime | Transport        | Valid RPS | Latency p50 ms | Latency p95 ms |
| ---------------------- | ---------------- | --------: | -------------: | -------------: |
| node                   | node-http        |      1755 |          15.70 |          30.63 |
| bun                    | node-http-compat |      3911 |           7.89 |          11.06 |
| bun                    | bun-serve        |      3961 |           7.99 |          10.66 |

Compiler generated-output validation:

| Mode     | Median ms | p95 ms |
| -------- | --------: | -----: |
| semantic |     26.42 |  28.18 |
| syntax   |      3.00 |   4.63 |

The performance-foundation transport and build-host scenarios each ran in five isolated processes. DevTools preview, event, merge, and hardened-build assertions passed. React 18 and React 19 reference rendering each completed five samples; these are reference-library diagnostics, not native eXact comparisons.

| React reference | Renders per sample | Median ms | p95 ms |
| --------------- | -----------------: | --------: | -----: |
| 18.3            |                200 |     50.33 |  50.61 |
| 19.2            |                200 |    179.67 | 184.21 |

Compatibility adapter discovery found one adapter and one substitution in 166.41 ms. The single-process transform diagnostic measured 654018 irrelevant modules/s and 2172 relevant modules/s.

## Publication validation

Documentation typechecking, the ten documentation-app tests, and the standalone docs build passed. Desktop and mobile browser checks matched all eleven distribution tables, both runtimes' capacity tables, and all five heap rows to the published JSON. There were no page errors or horizontal overflow. Source architecture, JSDoc checks, and changed-file formatting and whitespace checks passed. No benchmark-owned server, driver, browser, or compiler process remains; pre-existing processes were preserved.
