# Final WSL performance recovery verification, September 19, 2026

> Retained as a result summary. Raw capture paths mentioned below are historical identifiers;
> bulk samples and private experiment bundles are not distributed. See [benchmark retention](benchmark-retention.md).

Presentation qualification: this historical capture predates the shared-stylesheet gate.
SvelteKit and Nuxt rendered different styling, so the five-framework paint comparison included
different visual workloads. See the [corrected capture and investigation](presentation-parity-investigation-2026-09-20.md).
Raw historical measurements are retained.

Six of eight sustained c32 ratios exceed the pre-optimization reference. Node streaming remains
6.5% below reference preloaded and 10.2% below with normal loading. Full recovery was not achieved.
The [focused investigation](ssr-recovery-investigation-2026-09-19.md) records the original-artifact
controls, profiles, rejected candidates, and remaining uncertainty. No additional runtime change
from that investigation was retained.

This full capture measures the repository implementation through workspace-resolved compiler, runtime, and adapter packages. Source revision: `34b4f8b1b1f58ad436a5f8e9bd06f3dcec92a42d` plus the recorded worktree patch. Package release target: 0.6.0; component and render-program ABI: 2.

The [September 18 WSL capture](wsl-framework-2026-09-18.md) loaded published 0.5.1 packages instead of the branch. Its numbers remain evidence for that installed setup, but its branch attribution is withdrawn. The dependency ranges and release-manifest inventory are corrected. Build and measurement guards now reject shadowing registry copies, and SSR environment records retain actual resolved paths and versions.

Environment: linux 6.18.40.1-microsoft-standard-WSL2; AMD Ryzen 7 8745HS w/ Radeon 780M Graphics; 16 logical CPUs; 12.6 GiB RAM; Node v26.9.0; Bun 1.4.2.

All five controlled participants are included in browser and string SSR measurements. Streaming covers eXact, React, and TanStack Start. The separate native track covers eXact and React. Browser timing uses 30 samples; startup uses ten samples at each of 1x/4x/6x CPU throttling; heap uses five samples. SSR diagnostics use 500 sequential requests, 500 16-request waves, and one 1,000 ms c32 diagnostic window. Native measurements retain seven samples. Sustained comparisons use all twelve original Windows plans with two independent drivers and reversed framework order.

## Sustained throughput and eXact/React ratios

At total concurrency 32, RPS counts valid completed responses and divides by the union of simultaneous driver spans, summed over both populations and including drain. A ratio above 1 favors eXact. The ratio change treats React as the environment control, as requested; it is not a direct percentage change in eXact RPS.

Reference: [Workspace before hot-spot fixes](wsl-workspace-2026-09-19.md).

| Runtime/API | Loading   | eXact RPS | React RPS | eXact/React | Reference ratio | Ratio change |
| ----------- | --------- | --------: | --------: | ----------: | --------------: | -----------: |
| node/string | preloaded |    13,475 |    10,489 |      1.285× |          1.120× |       +14.7% |
| node/string | normal    |     3,438 |     2,681 |      1.282× |          1.270× |        +1.0% |
| node/stream | preloaded |    10,945 |     3,967 |      2.759× |          2.952× |        -6.5% |
| node/stream | normal    |     2,866 |     2,035 |      1.408× |          1.568× |       -10.2% |
| bun/string  | preloaded |    11,039 |     9,710 |      1.137× |          1.086× |        +4.7% |
| bun/string  | normal    |     4,085 |     3,946 |      1.035× |          0.994× |        +4.1% |
| bun/stream  | preloaded |     6,994 |     7,121 |      0.982× |          0.973× |        +0.9% |
| bun/stream  | normal    |     3,989 |     4,089 |      0.976× |          0.974× |        +0.1% |

## Browser experience

Each cell is mean / p95 / p99. Latency and memory: lower is better.

| Metric                   | Unit |                    Exact |                    React |                SvelteKit |                     Nuxt |           TanStack Start |
| ------------------------ | ---- | -----------------------: | -----------------------: | -----------------------: | -----------------------: | -----------------------: |
| Navigation completion    | ms   | 29.180 / 32.200 / 33.000 | 41.987 / 46.600 / 46.700 | 28.750 / 30.200 / 32.300 | 41.727 / 45.300 / 48.700 | 64.330 / 68.600 / 68.800 |
| First contentful paint   | ms   | 57.467 / 60.000 / 64.000 | 62.667 / 76.000 / 76.000 | 45.733 / 56.000 / 56.000 | 51.333 / 60.000 / 64.000 | 58.133 / 64.000 / 64.000 |
| Optimistic feedback      | ms   |    2.053 / 2.800 / 2.900 |    2.237 / 3.500 / 4.300 |    1.890 / 2.800 / 3.400 |    1.553 / 2.100 / 2.500 |    2.113 / 3.600 / 3.700 |
| Authoritative settlement | ms   | 10.570 / 13.100 / 13.200 | 11.053 / 12.800 / 13.000 | 10.627 / 12.400 / 12.500 | 10.890 / 12.600 / 12.800 | 11.367 / 13.300 / 13.400 |
| Warm browser used heap   | MB   |    2.512 / 2.517 / 2.517 |    2.296 / 2.302 / 2.302 |    2.071 / 2.077 / 2.077 |    2.330 / 2.333 / 2.333 |    2.759 / 2.809 / 2.821 |

## SSR completion tails

Completion of a 16-request wave, including data loading. Cells are mean / p95 / p99 milliseconds.

| Runtime/API |                Exact |                React |             SvelteKit |                  Nuxt |        TanStack Start |
| ----------- | -------------------: | -------------------: | --------------------: | --------------------: | --------------------: |
| node/string | 7.81 / 10.58 / 12.08 |  6.95 / 9.95 / 12.06 | 11.17 / 15.21 / 16.19 | 15.71 / 20.57 / 23.59 | 13.52 / 17.52 / 19.16 |
| bun/string  |   5.53 / 7.44 / 8.43 |   5.45 / 7.05 / 8.51 |    5.87 / 8.17 / 9.86 |  8.31 / 12.79 / 14.35 |  7.35 / 11.82 / 13.09 |
| node/stream |  6.90 / 9.63 / 11.38 | 8.62 / 11.15 / 12.30 |           unavailable |           unavailable | 13.69 / 16.93 / 18.59 |
| bun/stream  |   5.33 / 7.29 / 8.47 |   5.46 / 7.12 / 8.03 |           unavailable |           unavailable |  8.61 / 13.34 / 15.14 |

## Scheduled offered load

Errors, drain time, and missed arrivals remain part of the reported results.

| Runtime/API | Framework | Offered RPS | Valid RPS, populations | Request errors | Missed arrivals |
| ----------- | --------- | ----------: | ---------------------: | -------------: | --------------: |
| node/string | exact     |       8,000 |          7,994 / 7,999 |              0 |             121 |
| node/string | exact     |      10,000 |          9,905 / 9,863 |              0 |            4624 |
| node/string | react     |       8,000 |          8,000 / 7,979 |              0 |             242 |
| node/string | react     |      10,000 |          9,256 / 8,892 |             42 |           35853 |
| node/stream | exact     |       8,000 |          7,878 / 7,999 |              0 |            2420 |
| node/stream | exact     |      10,000 |          9,183 / 9,251 |              0 |           30541 |
| node/stream | react     |       8,000 |          3,871 / 3,586 |            902 |          168914 |
| node/stream | react     |      10,000 |          4,019 / 3,581 |            902 |          246317 |
| bun/string  | exact     |       8,000 |          7,998 / 7,996 |              0 |              28 |
| bun/string  | exact     |      10,000 |          9,965 / 9,089 |              0 |           18866 |
| bun/string  | react     |       8,000 |          7,999 / 7,998 |              0 |              25 |
| bun/string  | react     |      10,000 |          8,907 / 8,835 |              0 |           44062 |
| bun/stream  | exact     |       8,000 |          6,282 / 6,316 |              0 |           67091 |
| bun/stream  | exact     |      10,000 |          6,258 / 6,297 |              0 |          147918 |
| bun/stream  | react     |       8,000 |          6,838 / 6,831 |              0 |           45652 |
| bun/stream  | react     |      10,000 |          6,853 / 7,004 |              0 |          121758 |

Total request errors across capacity stages, including warmup: 1846. Invalid responses: 0.

## Correctness and evidence

Both runtimes passed 35 string and 21 streaming browser contracts before timing. The native track passed all eight contracts. Native timing, startup CPU profiles, allocation captures, heap composition, raw response samples, and per-driver results remain separate evidence.

The [structured results](wsl-recovery-final-2026-09-19.json) retains measured comparisons and capture metadata.
Bulk raw captures and build archives are not retained; see the [retention policy](benchmark-retention.md).
