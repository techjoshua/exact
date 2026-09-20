# Corrected WSL workspace baseline, September 19, 2026

Presentation qualification: this historical capture predates the shared-stylesheet gate.
SvelteKit and Nuxt rendered different styling, so the five-framework paint comparison included
different visual workloads. See the [corrected capture and investigation](presentation-parity-investigation-2026-09-20.md).
Raw historical measurements are retained.

This is the pre-optimization reference. The [recovery verification](wsl-recovery-final-2026-09-19.md) is the current baseline.

This full capture measures the repository implementation through workspace-resolved compiler, runtime, and adapter packages. Source revision: `9e6268b377b207f618df291ca6b30d7c2644bdff` plus the recorded worktree patch. Package release target: 0.6.0; component and render-program ABI: 2.

The [September 18 WSL capture](wsl-framework-2026-09-18.md) loaded published 0.5.1 packages instead of the branch. Its numbers remain evidence for that installed setup, but its branch attribution is withdrawn. The dependency ranges and release-manifest inventory are corrected. Build and measurement guards now reject shadowing registry copies, and SSR environment records retain actual resolved paths and versions.

Environment: linux 6.18.40.1-microsoft-standard-WSL2; AMD Ryzen 7 8745HS w/ Radeon 780M Graphics; 16 logical CPUs; 12.6 GiB RAM; Node v26.9.0; Bun 1.4.2.

All five controlled participants are included in browser and string SSR measurements. Streaming covers eXact, React, and TanStack Start. The separate native track covers eXact and React. Browser timing uses 30 samples; startup uses ten samples at each of 1x/4x/6x CPU throttling; heap uses five samples. SSR diagnostics use 500 sequential requests, 500 16-request waves, and one 1,000 ms c32 diagnostic window. Native measurements retain seven samples. Sustained comparisons use all twelve original Windows plans with two independent drivers and reversed framework order.

## Sustained throughput and eXact/React ratios

At total concurrency 32, RPS counts valid completed responses and divides by the union of simultaneous driver spans, summed over both populations and including drain. A ratio above 1 favors eXact. The ratio change treats React as the environment control, as requested; it is not a direct percentage change in eXact RPS.

Reference: [Published 0.5.1 installation on WSL](wsl-framework-2026-09-18.md).

| Runtime/API | Loading   | eXact RPS | React RPS | eXact/React | Reference ratio | Ratio change |
| ----------- | --------- | --------: | --------: | ----------: | --------------: | -----------: |
| node/string | preloaded |    12,448 |    11,112 |      1.120× |          1.239× |        -9.6% |
| node/string | normal    |     3,457 |     2,722 |      1.270× |          1.220× |        +4.1% |
| node/stream | preloaded |    11,179 |     3,787 |      2.952× |          2.896× |        +1.9% |
| node/stream | normal    |     3,524 |     2,248 |      1.568× |          1.530× |        +2.4% |
| bun/string  | preloaded |    11,198 |    10,315 |      1.086× |          1.233× |       -12.0% |
| bun/string  | normal    |     4,163 |     4,186 |      0.994× |          0.966× |        +3.0% |
| bun/stream  | preloaded |     7,403 |     7,605 |      0.973× |          1.033× |        -5.8% |
| bun/stream  | normal    |     4,318 |     4,433 |      0.974× |          0.973× |        +0.1% |

## Browser experience

Each cell is mean / p95 / p99. Latency and memory: lower is better.

| Metric                   | Unit |                    Exact |                    React |                SvelteKit |                     Nuxt |           TanStack Start |
| ------------------------ | ---- | -----------------------: | -----------------------: | -----------------------: | -----------------------: | -----------------------: |
| Navigation completion    | ms   | 26.393 / 30.500 / 30.800 | 37.257 / 43.000 / 43.500 | 25.740 / 27.700 / 27.700 | 37.307 / 41.400 / 42.900 | 55.197 / 61.300 / 64.400 |
| First contentful paint   | ms   | 53.867 / 60.000 / 68.000 | 53.467 / 68.000 / 72.000 | 41.067 / 48.000 / 52.000 | 42.933 / 52.000 / 56.000 | 50.400 / 56.000 / 60.000 |
| Optimistic feedback      | ms   |    1.880 / 2.700 / 3.000 |    1.767 / 2.400 / 3.000 |    1.700 / 2.300 / 2.400 |    1.373 / 1.900 / 1.900 |    1.867 / 3.400 / 3.500 |
| Authoritative settlement | ms   | 12.953 / 14.200 / 14.500 | 12.347 / 13.300 / 13.800 | 12.617 / 13.900 / 14.300 | 12.883 / 14.000 / 14.200 | 12.823 / 13.800 / 14.200 |
| Warm browser used heap   | MB   |    2.515 / 2.517 / 2.517 |    2.300 / 2.302 / 2.302 |    2.076 / 2.077 / 2.077 |    2.332 / 2.333 / 2.333 |    2.756 / 2.764 / 2.764 |

## SSR completion tails

Completion of a 16-request wave, including data loading. Cells are mean / p95 / p99 milliseconds.

| Runtime/API |                Exact |                React |            SvelteKit |                  Nuxt |        TanStack Start |
| ----------- | -------------------: | -------------------: | -------------------: | --------------------: | --------------------: |
| node/string |  6.65 / 9.51 / 15.85 |  5.92 / 8.82 / 13.61 | 9.64 / 13.91 / 19.77 | 12.96 / 19.31 / 24.74 | 11.25 / 16.58 / 24.07 |
| bun/string  |  5.05 / 6.58 / 14.87 |  5.06 / 6.61 / 11.97 |  5.46 / 7.99 / 14.81 |  7.51 / 10.88 / 16.64 |  6.66 / 10.45 / 12.86 |
| node/stream | 7.10 / 10.52 / 16.60 | 8.03 / 11.75 / 19.40 |          unavailable |           unavailable | 12.35 / 18.41 / 25.80 |
| bun/stream  |  5.03 / 7.04 / 10.65 |  5.13 / 6.58 / 11.09 |          unavailable |           unavailable |  7.94 / 12.65 / 20.12 |

## Scheduled offered load

Errors, drain time, and missed arrivals remain part of the reported results.

| Runtime/API | Framework | Offered RPS | Valid RPS, populations | Request errors | Missed arrivals |
| ----------- | --------- | ----------: | ---------------------: | -------------: | --------------: |
| node/string | exact     |       8,000 |          7,993 / 7,999 |              0 |             146 |
| node/string | exact     |      10,000 |          9,889 / 9,834 |              0 |            5526 |
| node/string | react     |       8,000 |          7,799 / 7,910 |              0 |            4982 |
| node/string | react     |      10,000 |          8,615 / 8,374 |              0 |           59031 |
| node/stream | exact     |       8,000 |          7,938 / 7,929 |              0 |            2650 |
| node/stream | exact     |      10,000 |          9,765 / 9,776 |              0 |            9080 |
| node/stream | react     |       8,000 |          4,382 / 4,358 |            810 |          143132 |
| node/stream | react     |      10,000 |          4,463 / 4,359 |            586 |          222077 |
| bun/string  | exact     |       8,000 |          7,999 / 8,000 |              0 |               9 |
| bun/string  | exact     |      10,000 |          9,924 / 9,948 |              0 |            2533 |
| bun/string  | react     |       8,000 |          7,997 / 7,998 |              0 |              11 |
| bun/string  | react     |      10,000 |          9,142 / 8,984 |              0 |           36406 |
| bun/stream  | exact     |       8,000 |          6,683 / 6,650 |              0 |           52577 |
| bun/stream  | exact     |      10,000 |          6,653 / 6,601 |              0 |          133903 |
| bun/stream  | react     |       8,000 |          7,075 / 7,010 |              0 |           36979 |
| bun/stream  | react     |      10,000 |          7,242 / 7,167 |              0 |          110775 |

Total request errors across capacity stages, including warmup: 1396. Invalid responses: 0.

## Correctness and evidence

Both runtimes passed 35 string and 21 streaming browser contracts before timing. The native track passed all eight contracts. Native timing, startup CPU profiles, allocation captures, heap composition, raw response samples, and per-driver results remain separate evidence.

The [structured capture](wsl-workspace-2026-09-19.json) links all raw captures and records hashes, source state, exact runners, execution journal, and prior chart values. The [evidence archive](wsl-workspace-2026-09-19-evidence.zip) retains the source patch, added implementation files, logs, load plans, and documentation verification. Native samples are in [the native capture](wsl-workspace-2026-09-19-native.json).
