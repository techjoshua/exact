# WSL performance recovery verification, September 19, 2026

This complete rerun retains the hydration-slot provenance fix without additional runtime changes.
Six of eight c32 ratios exceed the original reference. Both Node streaming lanes remain below it,
which prompted further [focused investigation](ssr-recovery-investigation-2026-09-19.md).
This capture is preserved in full before those experiments. The subsequent
[final verification](wsl-recovery-final-2026-09-19.md) is the current baseline.

This full capture measures the repository implementation through workspace-resolved compiler, runtime, and adapter packages. Source revision: `34b4f8b1b1f58ad436a5f8e9bd06f3dcec92a42d` plus the recorded worktree patch. Package release target: 0.6.0; component and render-program ABI: 2.

The [September 18 WSL capture](wsl-framework-2026-09-18.md) loaded published 0.5.1 packages instead of the branch. Its numbers remain evidence for that installed setup, but its branch attribution is withdrawn. The dependency ranges and release-manifest inventory are corrected. Build and measurement guards now reject shadowing registry copies, and SSR environment records retain actual resolved paths and versions.

Environment: linux 6.18.40.1-microsoft-standard-WSL2; AMD Ryzen 7 8745HS w/ Radeon 780M Graphics; 16 logical CPUs; 12.6 GiB RAM; Node v26.9.0; Bun 1.4.2.

All five controlled participants are included in browser and string SSR measurements. Streaming covers eXact, React, and TanStack Start. The separate native track covers eXact and React. Browser timing uses 30 samples; startup uses ten samples at each of 1x/4x/6x CPU throttling; heap uses five samples. SSR diagnostics use 500 sequential requests, 500 16-request waves, and one 1,000 ms c32 diagnostic window. Native measurements retain seven samples. Sustained comparisons use all twelve original Windows plans with two independent drivers and reversed framework order.

## Sustained throughput and eXact/React ratios

At total concurrency 32, RPS counts valid completed responses and divides by the union of simultaneous driver spans, summed over both populations and including drain. A ratio above 1 favors eXact. The ratio change treats React as the environment control, as requested; it is not a direct percentage change in eXact RPS.

Reference: [Workspace before hot-spot fixes](wsl-workspace-2026-09-19.md).

| Runtime/API | Loading   | eXact RPS | React RPS | eXact/React | Reference ratio | Ratio change |
| ----------- | --------- | --------: | --------: | ----------: | --------------: | -----------: |
| node/string | preloaded |    14,096 |    10,716 |      1.315× |          1.120× |       +17.4% |
| node/string | normal    |     3,403 |     2,671 |      1.274× |          1.270× |        +0.3% |
| node/stream | preloaded |    10,835 |     3,971 |      2.729× |          2.952× |        -7.6% |
| node/stream | normal    |     3,020 |     2,012 |      1.501× |          1.568× |        -4.3% |
| bun/string  | preloaded |    10,970 |     9,670 |      1.134× |          1.086× |        +4.5% |
| bun/string  | normal    |     4,063 |     3,975 |      1.022× |          0.994× |        +2.8% |
| bun/stream  | preloaded |     6,880 |     6,845 |      1.005× |          0.973× |        +3.3% |
| bun/stream  | normal    |     3,919 |     3,946 |      0.993× |          0.974× |        +1.9% |

## Browser experience

Each cell is mean / p95 / p99. Latency and memory: lower is better.

| Metric                   | Unit |                    Exact |                    React |                SvelteKit |                     Nuxt |           TanStack Start |
| ------------------------ | ---- | -----------------------: | -----------------------: | -----------------------: | -----------------------: | -----------------------: |
| Navigation completion    | ms   | 28.403 / 31.400 / 32.300 | 41.493 / 46.600 / 46.900 | 28.453 / 30.600 / 31.200 | 41.383 / 46.200 / 47.700 | 63.670 / 67.300 / 72.600 |
| First contentful paint   | ms   | 56.667 / 60.000 / 60.000 | 62.533 / 72.000 / 72.000 | 45.600 / 52.000 / 52.000 | 51.733 / 60.000 / 60.000 | 57.733 / 64.000 / 64.000 |
| Optimistic feedback      | ms   |    2.253 / 3.500 / 4.400 |    2.213 / 3.500 / 3.900 |    1.847 / 2.500 / 4.200 |    1.497 / 2.200 / 2.800 |    2.157 / 3.000 / 5.200 |
| Authoritative settlement | ms   | 11.723 / 13.200 / 13.300 | 11.573 / 12.700 / 13.200 | 11.950 / 13.000 / 13.300 | 12.207 / 13.700 / 13.800 | 12.260 / 13.500 / 13.600 |
| Warm browser used heap   | MB   |    2.513 / 2.517 / 2.517 |    2.297 / 2.302 / 2.302 |    2.073 / 2.077 / 2.077 |    2.331 / 2.333 / 2.333 |    2.759 / 2.809 / 2.832 |

## SSR completion tails

Completion of a 16-request wave, including data loading. Cells are mean / p95 / p99 milliseconds.

| Runtime/API |                Exact |                React |             SvelteKit |                  Nuxt |        TanStack Start |
| ----------- | -------------------: | -------------------: | --------------------: | --------------------: | --------------------: |
| node/string |  7.03 / 9.35 / 10.92 |  6.47 / 8.98 / 11.32 | 10.32 / 13.71 / 15.76 | 14.47 / 18.45 / 20.93 | 11.99 / 15.26 / 17.98 |
| bun/string  |   5.65 / 7.40 / 8.28 |   5.69 / 7.28 / 8.39 |    6.01 / 8.07 / 9.48 |  8.47 / 12.72 / 14.81 |  7.32 / 11.63 / 12.96 |
| node/stream | 7.42 / 10.48 / 11.87 | 8.58 / 11.69 / 14.75 |           unavailable |           unavailable | 14.10 / 17.74 / 22.11 |
| bun/stream  |   5.57 / 7.50 / 9.10 |   5.51 / 6.92 / 7.74 |           unavailable |           unavailable |  8.71 / 13.43 / 14.66 |

## Scheduled offered load

Errors, drain time, and missed arrivals remain part of the reported results.

| Runtime/API | Framework | Offered RPS | Valid RPS, populations | Request errors | Missed arrivals |
| ----------- | --------- | ----------: | ---------------------: | -------------: | --------------: |
| node/string | exact     |       8,000 |          7,999 / 7,999 |              0 |              10 |
| node/string | exact     |      10,000 |          9,941 / 9,912 |              0 |            2930 |
| node/string | react     |       8,000 |          7,990 / 7,994 |              0 |               5 |
| node/string | react     |      10,000 |          9,249 / 9,036 |              0 |           33062 |
| node/stream | exact     |       8,000 |          7,932 / 7,923 |              0 |            2883 |
| node/stream | exact     |      10,000 |          9,790 / 9,811 |              0 |            7884 |
| node/stream | react     |       8,000 |          3,936 / 4,081 |            856 |          157614 |
| node/stream | react     |      10,000 |          3,972 / 4,049 |            742 |          238038 |
| bun/string  | exact     |       8,000 |          7,999 / 7,999 |              0 |              14 |
| bun/string  | exact     |      10,000 |          9,988 / 9,976 |              0 |             696 |
| bun/string  | react     |       8,000 |          7,986 / 7,999 |              0 |               9 |
| bun/string  | react     |      10,000 |          8,816 / 8,762 |              0 |           47260 |
| bun/stream  | exact     |       8,000 |          6,336 / 6,248 |              0 |           67222 |
| bun/stream  | exact     |      10,000 |          6,275 / 6,210 |              0 |          149194 |
| bun/stream  | react     |       8,000 |          6,849 / 6,854 |              0 |           44844 |
| bun/stream  | react     |      10,000 |          6,781 / 6,857 |              0 |          126104 |

Total request errors across capacity stages, including warmup: 1598. Invalid responses: 0.

## Correctness and evidence

Both runtimes passed 35 string and 21 streaming browser contracts before timing. The native track passed all eight contracts. Native timing, startup CPU profiles, allocation captures, heap composition, raw response samples, and per-driver results remain separate evidence.

The [structured capture](wsl-recovery-2026-09-19.json) links all raw captures and records hashes, source state, exact runners, execution journal, and prior chart values. The [evidence archive](wsl-recovery-2026-09-19-evidence.zip) retains the source patch, added implementation files, logs, load plans, and documentation verification. Native samples are in [the native capture](wsl-recovery-2026-09-19-native.json).
