# Intermediate two-change WSL experiment, September 19, 2026

This intermediate full capture includes both hydration-slot provenance and a prepared-program allocation experiment. The latter was rejected after focused streaming HTTP controls showed that the combined bundle underperformed either change alone. The [final capture](wsl-optimized-final-2026-09-19.md) retains only the hydration-slot fix. These measurements are preserved as experimental evidence.

This full capture measures the repository implementation through workspace-resolved compiler, runtime, and adapter packages. Source revision: `9e6268b377b207f618df291ca6b30d7c2644bdff` plus the recorded worktree patch. Package release target: 0.6.0; component and render-program ABI: 2.

The [September 18 WSL capture](wsl-framework-2026-09-18.md) loaded published 0.5.1 packages instead of the branch. Its numbers remain evidence for that installed setup, but its branch attribution is withdrawn. The dependency ranges and release-manifest inventory are corrected. Build and measurement guards now reject shadowing registry copies, and SSR environment records retain actual resolved paths and versions.

Environment: linux 6.18.40.1-microsoft-standard-WSL2; AMD Ryzen 7 8745HS w/ Radeon 780M Graphics; 16 logical CPUs; 12.6 GiB RAM; Node v26.9.0; Bun 1.4.2.

All five controlled participants are included in browser and string SSR measurements. Streaming covers eXact, React, and TanStack Start. The separate native track covers eXact and React. Browser timing uses 30 samples; startup uses ten samples at each of 1x/4x/6x CPU throttling; heap uses five samples. SSR diagnostics use 500 sequential requests, 500 16-request waves, and one 1,000 ms c32 diagnostic window. Native measurements retain seven samples. Sustained comparisons use all twelve original Windows plans with two independent drivers and reversed framework order.

## Sustained throughput and eXact/React ratios

At total concurrency 32, RPS counts valid completed responses and divides by the union of simultaneous driver spans, summed over both populations and including drain. A ratio above 1 favors eXact. The ratio change treats React as the environment control, as requested; it is not a direct percentage change in eXact RPS.

Reference: [Workspace before hot-spot fixes](wsl-workspace-2026-09-19.md).

| Runtime/API | Loading   | eXact RPS | React RPS | eXact/React | Reference ratio | Ratio change |
| ----------- | --------- | --------: | --------: | ----------: | --------------: | -----------: |
| node/string | preloaded |    15,196 |    12,262 |      1.239× |          1.120× |       +10.6% |
| node/string | normal    |     3,776 |     2,971 |      1.271× |          1.270× |        +0.1% |
| node/stream | preloaded |    11,793 |     4,444 |      2.654× |          2.952× |       -10.1% |
| node/stream | normal    |     3,523 |     2,243 |      1.571× |          1.568× |        +0.2% |
| bun/string  | preloaded |    12,649 |    11,263 |      1.123× |          1.086× |        +3.5% |
| bun/string  | normal    |     4,636 |     4,477 |      1.035× |          0.994× |        +4.1% |
| bun/stream  | preloaded |     7,377 |     7,591 |      0.972× |          0.973× |        -0.2% |
| bun/stream  | normal    |     4,286 |     4,464 |      0.960× |          0.974× |        -1.4% |

## Browser experience

Each cell is mean / p95 / p99. Latency and memory: lower is better.

| Metric                   | Unit |                    Exact |                    React |                SvelteKit |                     Nuxt |           TanStack Start |
| ------------------------ | ---- | -----------------------: | -----------------------: | -----------------------: | -----------------------: | -----------------------: |
| Navigation completion    | ms   | 25.060 / 32.800 / 42.600 | 38.713 / 51.300 / 59.800 | 25.607 / 31.300 / 32.200 | 38.797 / 56.600 / 58.900 | 53.853 / 61.600 / 64.600 |
| First contentful paint   | ms   | 50.800 / 64.000 / 76.000 | 52.667 / 68.000 / 76.000 | 39.733 / 48.000 / 48.000 | 40.800 / 60.000 / 64.000 | 50.000 / 60.000 / 64.000 |
| Optimistic feedback      | ms   |    1.793 / 2.400 / 2.600 |    1.827 / 3.000 / 3.100 |    1.517 / 1.800 / 1.900 |    1.460 / 2.700 / 2.800 |    2.063 / 3.600 / 4.600 |
| Authoritative settlement | ms   | 12.883 / 13.900 / 13.900 | 12.437 / 13.500 / 13.500 | 12.860 / 13.600 / 13.700 | 13.027 / 13.900 / 14.200 | 12.853 / 14.500 / 14.600 |
| Warm browser used heap   | MB   |    2.516 / 2.517 / 2.517 |    2.300 / 2.302 / 2.302 |    2.077 / 2.077 / 2.077 |    2.332 / 2.333 / 2.333 |    2.761 / 2.821 / 2.821 |

## SSR completion tails

Completion of a 16-request wave, including data loading. Cells are mean / p95 / p99 milliseconds.

| Runtime/API |                Exact |                React |            SvelteKit |                  Nuxt |        TanStack Start |
| ----------- | -------------------: | -------------------: | -------------------: | --------------------: | --------------------: |
| node/string |  6.60 / 9.77 / 16.37 |  6.00 / 8.90 / 14.06 | 9.98 / 14.62 / 24.63 | 13.49 / 19.42 / 26.43 | 11.62 / 16.96 / 22.37 |
| bun/string  |  5.12 / 7.00 / 12.99 |  5.11 / 6.71 / 11.11 |   5.50 / 7.29 / 9.76 |  7.57 / 12.08 / 16.29 |  6.82 / 10.91 / 14.90 |
| node/stream | 7.20 / 10.62 / 18.13 | 8.09 / 11.88 / 20.22 |          unavailable |           unavailable | 12.60 / 18.59 / 24.22 |
| bun/stream  |  5.06 / 6.85 / 11.89 |  5.13 / 6.81 / 16.55 |          unavailable |           unavailable |  8.09 / 13.06 / 18.54 |

## Scheduled offered load

Errors, drain time, and missed arrivals remain part of the reported results.

| Runtime/API | Framework | Offered RPS | Valid RPS, populations | Request errors | Missed arrivals |
| ----------- | --------- | ----------: | ---------------------: | -------------: | --------------: |
| node/string | exact     |       8,000 |          7,929 / 7,886 |              0 |            3050 |
| node/string | exact     |      10,000 |          9,843 / 9,748 |              0 |            8134 |
| node/string | react     |       8,000 |          7,996 / 8,000 |              0 |              75 |
| node/string | react     |      10,000 |          9,465 / 9,281 |              0 |           23824 |
| node/stream | exact     |       8,000 |          7,957 / 7,946 |              0 |            1879 |
| node/stream | exact     |      10,000 |          9,795 / 9,787 |              0 |            8358 |
| node/stream | react     |       8,000 |          4,349 / 4,287 |            834 |          145130 |
| node/stream | react     |      10,000 |          4,411 / 4,356 |            602 |          223043 |
| bun/string  | exact     |       8,000 |          7,999 / 7,999 |              0 |              11 |
| bun/string  | exact     |      10,000 |          9,118 / 9,998 |              0 |           17440 |
| bun/string  | react     |       8,000 |          7,999 / 7,999 |              0 |              11 |
| bun/string  | react     |      10,000 |          9,462 / 9,466 |              0 |           20262 |
| bun/stream  | exact     |       8,000 |          6,606 / 6,611 |              0 |           54640 |
| bun/stream  | exact     |      10,000 |          6,613 / 6,622 |              0 |          134140 |
| bun/stream  | react     |       8,000 |          7,086 / 7,009 |              0 |           36934 |
| bun/stream  | react     |      10,000 |          7,255 / 7,139 |              0 |          111044 |

Total request errors across capacity stages, including warmup: 1436. Invalid responses: 0.

## Correctness and evidence

Both runtimes passed 35 string and 21 streaming browser contracts before timing. The native track passed all eight contracts. Native timing, startup CPU profiles, allocation captures, heap composition, raw response samples, and per-driver results remain separate evidence.

The [structured capture](wsl-optimized-2026-09-19.json) links all raw captures and records hashes, source state, exact runners, execution journal, and prior chart values. The [evidence archive](wsl-optimized-2026-09-19-evidence.zip) retains the source patch, added implementation files, logs, load plans, and the focused hot-spot controls. Native samples are in [the native capture](wsl-optimized-2026-09-19-native.json).
