# Post-audit performance refresh, September 7, 2026

This historical capture is superseded in the public charts by the
[September 8 post-efficiency refresh](post-efficiency-2026-09-08.md).

Fresh production builds and measurements follow the [framework adversarial audit](../adversarial-framework-audit-2026-09-07.md). These browser, heap, Node, and native Bun captures supplied the public Performance page at that time. Dates in the artifacts are UTC; the run began on September 7 local time.

## Measurement conditions

The [audit isolation follow-up](audit-impact-2026-09-07.md) found that generated client/server task
helpers were missing the final rejected-await pause fix during this capture. Regenerating those targets
and rebuilding the eXact participant left the SSR renderer byte-identical and increased the browser
entry by 72 bytes. Browser results below describe the recorded artifact, not that final helper correction.
The original measurements and public chart data are preserved; the follow-up separately tests SSR audit impact.

All five comparison applications were rebuilt. The shared 35 browser contracts passed on Node 26.8.1 and separately on native Bun 1.4.2. Timed suites ran sequentially, with no additional build, test, or benchmark suite launched alongside them. Driver and server processes still share one Windows workstation, an AMD Ryzen 7 8745HS with 16 logical processors. A pre-existing development server and ordinary desktop processes were left running; their background activity was not measured.

- Browser: 50 balanced rounds per framework, fresh cache-disabled contexts, production-page HTTP replay, and one discarded warmup round.
- Heap composition: ten samples per framework after one warmup, captured separately from browser interaction timings.
- Server diagnostics: 500 sequential samples and 500 sixteen-request bursts per framework and runtime, 100 warmups, and five retained-heap checkpoints. Short-window diagnostic RPS is not a public capacity estimate.
- Sustained Node and Bun capacity: two independent load drivers, two fresh reversed process populations, ten-second warmups, fifteen-second concurrency stages, and twenty-second normal-loading and scheduled-demand stages.
- Startup profiling: 30 rounds at each of 1x, 4x, and 6x Chromium CPU emulation. These separately instrumented results do not replace ordinary browser timings.

These are new measurements, not a paired isolation experiment for the audit patch. Previous captures are retained in the evidence archive. Source, dependency, process, and host state can affect historical differences even when runtime versions and workload plans match.

The new capture records source revision 5a3682ab+worktree; the previous public browser report records ece37924+worktree. Artifact hashes identify the measured dirty-worktree outputs more precisely than the commit alone.

The browser capture has lower navigation and feedback times, a 0.694 ms increase in mean authoritative settlement, and effectively unchanged retained heap. Node throughput increased for both frameworks, with a larger historical increase for React, so it does not establish an audit-related speedup. Bun preloaded eXact throughput ranges from 1.44% lower to 4.87% higher across concurrency points. The clearest explicit cost is large-collection transaction rollback, measured separately below.

## Browser results

Arithmetic means across 50 samples. Full percentiles are retained in the public chart data.

| Metric                   | Unit |  eXact |  React | SvelteKit |   Nuxt | TanStack Start |
| ------------------------ | ---- | -----: | -----: | --------: | -----: | -------------: |
| Navigation completion    | ms   | 28.868 | 36.770 |    29.738 | 39.424 |         48.564 |
| First contentful paint   | ms   | 41.360 | 45.520 |    40.480 | 43.280 |         42.000 |
| Optimistic feedback      | ms   |  1.580 |  1.510 |     1.340 |  1.114 |          1.548 |
| Authoritative settlement | ms   | 14.016 | 13.616 |    13.846 | 14.122 |         13.908 |
| Warm browser used heap   | MB   |  2.488 |  2.303 |     2.078 |  2.334 |          2.762 |

Historical eXact means from the previously published browser capture:

| Metric                        | Previous | Current |  Change |
| ----------------------------- | -------: | ------: | ------: |
| Navigation completion (ms)    |   31.886 |  28.868 |  -9.46% |
| First contentful paint (ms)   |   47.120 |  41.360 | -12.22% |
| Optimistic feedback (ms)      |    2.016 |   1.580 | -21.63% |
| Authoritative settlement (ms) |   13.322 |  14.016 |   5.21% |
| Warm browser used heap (MB)   |    2.488 |   2.488 |   0.02% |

## Node v26.8.1 sustained capacity

Zero request errors in these captures; response identities and accounting validated.

| Total concurrency | eXact valid RPS | React valid RPS |
| ----------------- | --------------: | --------------: |
| 16                |           10567 |           11511 |
| 32                |           10754 |           10754 |
| 64                |           10525 |           10879 |
| 128               |            9913 |           10582 |

The table uses preloaded data. Normal data-loading throughput at concurrency 32: eXact 2799 valid RPS; React 2804 valid RPS.

| Framework | Offered RPS | Valid RPS | Capacity misses | Request errors |
| --------- | ----------: | --------: | --------------: | -------------: |
| eXact     |        8000 |      7994 |           0.06% |              0 |
| eXact     |       10000 |      8771 |          12.03% |              0 |
| React     |        8000 |      7996 |           0.00% |              0 |
| React     |       10000 |      8860 |          11.13% |              0 |

Historical preloaded capacity comparison:

| Framework | Concurrency | Previous valid RPS | Current valid RPS | Change |
| --------- | ----------: | -----------------: | ----------------: | -----: |
| eXact     |          16 |               7112 |             10567 | 48.58% |
| eXact     |          32 |               7005 |             10754 | 53.52% |
| eXact     |          64 |               6603 |             10525 | 59.38% |
| eXact     |         128 |               6456 |              9913 | 53.54% |
| React     |          16 |               6428 |             11511 | 79.07% |
| React     |          32 |               6199 |             10754 | 73.47% |
| React     |          64 |               5964 |             10879 | 82.43% |
| React     |         128 |               6241 |             10582 | 69.56% |

## Bun 1.4.2 sustained capacity

Zero request errors in these captures; response identities and accounting validated.

| Total concurrency | eXact valid RPS | React valid RPS |
| ----------------- | --------------: | --------------: |
| 16                |            9721 |            6419 |
| 32                |            9431 |            6357 |
| 64                |            9384 |            6174 |
| 128               |            9183 |            6065 |

The table uses preloaded data. Normal data-loading throughput at concurrency 32: eXact 4308 valid RPS; React 4245 valid RPS.

| Framework | Offered RPS | Valid RPS | Capacity misses | Request errors |
| --------- | ----------: | --------: | --------------: | -------------: |
| eXact     |        8000 |      7992 |           0.06% |              0 |
| eXact     |       10000 |      8358 |          16.14% |              0 |
| React     |        8000 |      6176 |          22.49% |              0 |
| React     |       10000 |      6144 |          38.32% |              0 |

Historical preloaded capacity comparison:

| Framework | Concurrency | Previous valid RPS | Current valid RPS | Change |
| --------- | ----------: | -----------------: | ----------------: | -----: |
| eXact     |          16 |               9863 |              9721 | -1.44% |
| eXact     |          32 |               9359 |              9431 |  0.77% |
| eXact     |          64 |               9352 |              9384 |  0.35% |
| eXact     |         128 |               8757 |              9183 |  4.87% |
| React     |          16 |               6278 |              6419 |  2.25% |
| React     |          32 |               6228 |              6357 |  2.08% |
| React     |          64 |               6061 |              6174 |  1.85% |
| React     |         128 |               6037 |              6065 |  0.46% |

## Server response diagnostics

Arithmetic mean complete-response latency, in milliseconds. Node and Bun are separate populations and transports. Node data loading includes the runtime HTTP-client behavior described in the [current-runtime investigation](current-runtimes-2026-09-07.md). These numbers are not isolated renderer timings.

| Framework      | Node sequential | Node burst | Bun sequential | Bun burst |
| -------------- | --------------: | ---------: | -------------: | --------: |
| Exact          |          14.715 |      9.404 |          0.680 |     4.918 |
| React          |          14.759 |      9.842 |          0.704 |     4.916 |
| SvelteKit      |          14.977 |     10.981 |          0.869 |     5.425 |
| Nuxt           |          14.641 |     13.847 |          1.378 |     7.696 |
| TanStack Start |          15.280 |     13.588 |          1.313 |     8.843 |

## Instrumented startup

Time to the shared semantic-ready marker, in milliseconds. Each cell shows p50 / p95 across 30 cold-context samples. Tracing adds overhead; CPU emulation is not physical mobile hardware. These values must not replace the ordinary browser navigation measurements above.

| CPU emulation |           eXact |           React |       SvelteKit |            Nuxt |  TanStack Start |
| ------------- | --------------: | --------------: | --------------: | --------------: | --------------: |
| 1x            |   63.60 / 70.30 |   70.60 / 76.90 |   60.20 / 64.20 |   66.40 / 78.20 |  99.80 / 105.50 |
| 4x            | 243.10 / 268.10 | 248.30 / 285.40 | 256.20 / 273.20 | 252.20 / 302.00 | 317.30 / 379.70 |
| 6x            | 393.60 / 412.00 | 396.80 / 530.40 | 412.20 / 464.00 | 407.40 / 427.00 | 551.40 / 596.00 |

## Collection transaction cost

`npm run benchmark:collections` exercises the corrected transaction path. Each cell is median milliseconds per delete/restore operation, from ten samples of 100 operations after three warmups. Collection setup and order assertions are outside timing; no observers are installed. Rollback includes throwing and catching the intentional abort.

| Collection | Entries | Ordinary delete/reinsert | Transaction commit | Transaction rollback |
| ---------- | ------: | -----------------------: | -----------------: | -------------------: |
| Map        |    1000 |                   0.0014 |             0.0036 |               0.0510 |
| Map        |   10000 |                   0.0010 |             0.0806 |               0.9194 |
| Set        |    1000 |                   0.0012 |             0.0079 |               0.0334 |
| Set        |   10000 |                   0.0010 |             0.0694 |               0.6419 |

Transactional deletion now captures ordering anchors in linear time. Rollback must restore ordering while retaining unrelated newer values. The ordinary path does not pay this traversal cost. Applications deleting repeatedly from large collections inside transactions should account for it; these measurements do not establish a historical percentage regression or representative application latency.

## Framework regression benchmarks

| Reactive scenario                              | Median ms |  p95 ms |
| ---------------------------------------------- | --------: | ------: |
| unkeyed identical 10k refresh                  |    82.586 | 166.447 |
| keyed identical 10k refresh                    |    54.172 |  59.529 |
| keyed one-item change                          |    97.982 | 100.903 |
| keyed one-percent change                       |    96.448 | 203.034 |
| keyed 10k rotation                             |   125.544 | 134.883 |
| keyed add-delete                               |   127.698 | 137.517 |
| local mutation then matching fetch             |    92.583 | 208.035 |
| 100 local mutations then matching fetch        |    93.289 | 204.017 |
| keyed protocol roundtrip                       |    74.212 | 234.006 |
| subtree disposal with unrelated paused backlog |     0.535 |   2.105 |
| scoped computed chain settlement               |    53.427 |  59.349 |
| equal computed diamond settlement              |     0.009 |   0.018 |

The compiled 1,000-row keyed rotation measured 5.694 ms median and 7.047 ms p95 across five isolated processes. Its DOM identity assertions and existing 2,000 ms p95 guard passed.

The compiler-owned framework benchmark rebuilt its fixtures and ran Node and Chromium scenarios. Full scenario metrics, samples, environment, build timings, and artifact evidence are retained in the archive.

## Reproduction and evidence

The [evidence archive](post-audit-2026-09-07.json) contains chart summaries, the prior public reports, environment records, raw-capture paths and SHA-256 hashes, and exact measurement/publication runners. Raw capture JSON remains in `docs/performance-baselines/post-audit-2026-09-07-*.json`. The public app reads the four updated report files under `apps/docs/src/data`.

The runners reuse the repository process owners and close their servers and drivers. Rebuild and run both runtime correctness suites before using `--correctness-passed`; it records admission, rather than performing checks itself. Collection diagnostics can be repeated with `npm run benchmark:collections -- --output=<file.json>`.

This refresh measures selected framework workloads. It does not prove that every application is faster or that lifecycle/security fixes have zero overhead. Historical movements must be read alongside control-framework results and the transaction-specific measurements.

## Publication validation

Documentation typechecking, the ten documentation-app tests, and the standalone docs build passed. Desktop and mobile browser checks matched all eleven distribution tables, both runtimes' capacity tables, and all five heap rows to the published JSON. There were no page errors or horizontal overflow. Changed-script lint, source architecture, JSDoc checks, and diff whitespace checks passed. No benchmark-owned server, driver, browser, or compiler process remains; the pre-existing development server was preserved.
