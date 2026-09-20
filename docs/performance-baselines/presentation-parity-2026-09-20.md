# Framework comparison with verified presentation parity, September 20, 2026

This full capture measures the repository implementation through workspace-resolved compiler, runtime, and adapter packages. Source revision: `7d368e51da5b1af66463dc425b822990fd469dd1` plus the recorded worktree patch. Package release target: 0.6.0; component and render-program ABI: 2.

The [September 18 WSL capture](wsl-framework-2026-09-18.md) loaded published 0.5.1 packages instead of the branch. Its numbers remain evidence for that installed setup, but its branch attribution is withdrawn. The dependency ranges and release-manifest inventory are corrected. Build and measurement guards now reject shadowing registry copies, and SSR environment records retain actual resolved paths and versions.

Environment: linux 6.18.40.1-microsoft-standard-WSL2; AMD Ryzen 7 8745HS w/ Radeon 780M Graphics; 16 logical CPUs; 12.6 GiB RAM; Node v26.9.0; Bun 1.4.2.

All five controlled participants are included in browser and string SSR measurements. Streaming covers eXact, React, and TanStack Start. The separate native track covers eXact and React. Browser timing uses 30 samples; startup uses ten samples at each of 1x/4x/6x CPU throttling; heap uses five samples. SSR diagnostics use 500 sequential requests, 500 16-request waves, and one 1,000 ms c32 diagnostic window. Native measurements retain seven samples. Sustained comparisons use all twelve original Windows plans with two independent drivers and reversed framework order.

The participants now import one shared stylesheet. Desktop and mobile presentation gates compare server HTML and settled interactions before timing. Earlier five-framework paint comparisons included different visual workloads and must not be interpreted as isolated framework overhead. See the [presentation and paint investigation](presentation-parity-investigation-2026-09-20.md) for same-asset Windows/WSL controls, compiler corrections, and Bun concurrency experiments.

## Sustained throughput and eXact/React ratios

At total concurrency 32, RPS counts valid completed responses and divides by the union of simultaneous driver spans, summed over both populations and including drain. A ratio above 1 favors eXact. The ratio change treats React as the environment control, as requested; it is not a direct percentage change in eXact RPS.

Reference: [Workspace before hot-spot fixes](wsl-workspace-2026-09-19.md).

| Runtime/API | Loading   | eXact RPS | React RPS | eXact/React | Reference ratio | Ratio change |
| ----------- | --------- | --------: | --------: | ----------: | --------------: | -----------: |
| node/string | preloaded |    11,823 |    10,820 |      1.093× |          1.120× |        -2.4% |
| node/string | normal    |     2,791 |     2,695 |      1.035× |          1.270× |       -18.5% |
| node/stream | preloaded |    10,176 |     5,197 |      1.958× |          2.952× |       -33.7% |
| node/stream | normal    |     2,819 |     2,169 |      1.300× |          1.568× |       -17.1% |
| bun/string  | preloaded |     9,441 |     9,186 |      1.028× |          1.086× |        -5.3% |
| bun/string  | normal    |     4,137 |     4,128 |      1.002× |          0.994× |        +0.8% |
| bun/stream  | preloaded |     7,119 |     7,592 |      0.938× |          0.973× |        -3.7% |
| bun/stream  | normal    |     3,954 |     4,051 |      0.976× |          0.974× |        +0.2% |

## Comparison with the immediately preceding publication

The September 19 recovery capture is separate from the earlier workspace reference above. Negative ratio changes are retained. Server entries and runtime adapters in these repeated lanes are identical; these differences are observations across captures, not changes introduced by the shared CSS or guarded DOM corrections.

| Runtime/API | Loading   | Previous eXact/React | Current eXact/React | Ratio change |
| ----------- | --------- | -------------------: | ------------------: | -----------: |
| node/string | preloaded |               1.285× |              1.093× |       -14.9% |
| node/string | normal    |               1.282× |              1.035× |       -19.3% |
| node/stream | preloaded |               2.759× |              1.958× |       -29.0% |
| node/stream | normal    |               1.408× |              1.300× |        -7.7% |
| bun/string  | preloaded |               1.137× |              1.028× |        -9.6% |
| bun/string  | normal    |               1.035× |              1.002× |        -3.2% |
| bun/stream  | preloaded |               0.982× |              0.938× |        -4.5% |
| bun/stream  | normal    |               0.976× |              0.976× |        +0.0% |

## Browser experience

Each cell is mean / p50 / p95 / p99. Latency and memory: lower is better.

| Metric                   | Unit |                             Exact |                             React |                         SvelteKit |                              Nuxt |                    TanStack Start |
| ------------------------ | ---- | --------------------------------: | --------------------------------: | --------------------------------: | --------------------------------: | --------------------------------: |
| Navigation completion    | ms   | 26.127 / 24.300 / 35.000 / 42.700 | 39.520 / 37.100 / 46.500 / 55.700 | 25.473 / 24.500 / 30.100 / 38.400 | 39.670 / 38.100 / 56.000 / 61.600 | 55.573 / 52.800 / 68.400 / 81.300 |
| First contentful paint   | ms   | 51.467 / 48.000 / 68.000 / 68.000 | 54.800 / 52.000 / 76.000 / 76.000 | 55.733 / 52.000 / 76.000 / 88.000 | 53.333 / 48.000 / 68.000 / 76.000 | 51.733 / 48.000 / 60.000 / 72.000 |
| Optimistic feedback      | ms   |     1.817 / 1.700 / 2.500 / 2.800 |     1.880 / 1.700 / 3.200 / 3.300 |     1.647 / 1.600 / 2.400 / 2.500 |     1.430 / 1.300 / 2.000 / 2.700 |     1.753 / 1.700 / 2.200 / 3.400 |
| Authoritative settlement | ms   | 12.997 / 13.100 / 13.800 / 14.100 | 12.660 / 12.700 / 13.500 / 13.900 | 13.010 / 13.200 / 13.700 / 13.800 | 13.033 / 13.200 / 14.200 / 14.800 | 13.177 / 13.100 / 14.700 / 17.200 |
| Warm browser used heap   | MB   |     2.518 / 2.519 / 2.519 / 2.519 |     2.301 / 2.302 / 2.302 / 2.302 |     2.074 / 2.074 / 2.074 / 2.074 |     2.325 / 2.327 / 2.327 / 2.327 |     2.758 / 2.757 / 2.764 / 2.765 |

## SSR completion tails

Completion of a 16-request wave, including data loading. Cells are mean / p95 / p99 milliseconds.

| Runtime/API |                Exact |                React |             SvelteKit |                  Nuxt |        TanStack Start |
| ----------- | -------------------: | -------------------: | --------------------: | --------------------: | --------------------: |
| node/string | 7.54 / 10.41 / 18.36 |  6.79 / 9.23 / 12.67 | 10.49 / 14.16 / 23.44 | 14.17 / 19.26 / 33.52 | 11.89 / 16.05 / 25.70 |
| bun/string  |  5.00 / 6.54 / 10.78 |  5.08 / 6.88 / 13.97 |   5.67 / 7.85 / 14.45 |  8.93 / 12.64 / 19.73 |  7.70 / 11.55 / 14.27 |
| node/stream | 8.04 / 10.92 / 14.41 | 8.60 / 11.82 / 16.28 |           unavailable |           unavailable | 13.16 / 18.41 / 32.31 |
| bun/stream  |  5.26 / 7.52 / 11.74 |  5.20 / 7.27 / 14.25 |           unavailable |           unavailable |  9.28 / 13.54 / 18.51 |

## Scheduled offered load

Errors, drain time, and missed arrivals remain part of the reported results.

| Runtime/API | Framework | Offered RPS | Valid RPS, populations | Request errors | Missed arrivals |
| ----------- | --------- | ----------: | ---------------------: | -------------: | --------------: |
| node/string | exact     |       8,000 |          7,999 / 7,984 |              0 |               9 |
| node/string | exact     |      10,000 |          9,735 / 9,859 |              0 |            7834 |
| node/string | react     |       8,000 |          7,999 / 7,994 |              0 |               7 |
| node/string | react     |      10,000 |          9,677 / 9,590 |              0 |           14195 |
| node/stream | exact     |       8,000 |          7,963 / 7,949 |              0 |            1747 |
| node/stream | exact     |      10,000 |          8,640 / 8,696 |              0 |           52600 |
| node/stream | react     |       8,000 |          4,722 / 4,726 |            416 |          129296 |
| node/stream | react     |      10,000 |          4,941 / 4,837 |              0 |          203488 |
| bun/string  | exact     |       8,000 |          7,998 / 7,987 |              0 |             104 |
| bun/string  | exact     |      10,000 |          9,003 / 8,409 |              0 |           50976 |
| bun/string  | react     |       8,000 |          7,997 / 7,993 |              0 |             168 |
| bun/string  | react     |      10,000 |          9,034 / 8,925 |              0 |           39984 |
| bun/stream  | exact     |       8,000 |          6,525 / 6,736 |              0 |           53927 |
| bun/stream  | exact     |      10,000 |          6,696 / 6,685 |              0 |          131417 |
| bun/stream  | react     |       8,000 |          7,180 / 7,041 |              0 |           34677 |
| bun/stream  | react     |      10,000 |          7,083 / 7,008 |              0 |          117240 |

Total request errors across capacity stages, including warmup: 416. Invalid responses: 0.

## Correctness and evidence

Both runtimes passed 39 string and 25 streaming browser contracts before timing. The native track passed all 12 contracts. Native timing, startup CPU profiles, allocation captures, heap composition, raw response samples, and per-driver results remain separate evidence.

The [structured capture](presentation-parity-2026-09-20.json) links all raw captures and records hashes, source state, exact runners, execution journal, and prior chart values. The [evidence archive](presentation-parity-2026-09-20-evidence.zip) retains the source patch, added implementation files, logs, load plans, and documentation verification. Native samples are in [the native capture](presentation-parity-2026-09-20-native.json).
