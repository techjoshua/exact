# Framework comparison on verified native Linux loopback, September 20, 2026

> Retained as a result summary. Raw capture paths mentioned below are historical identifiers;
> bulk samples and private experiment bundles are not distributed. See [benchmark retention](benchmark-retention.md).

This full capture measures the repository implementation through workspace-resolved compiler, runtime, and adapter packages. Source revision: `9f139b31f9b41f4836e5ed6ac3722fc67e6b3f5f` with the recorded source state. Package release target: 0.6.0; component and render-program ABI: 2.

This capture repeats the full suite after identifying the mirrored WSL IPv4 localhost route as a cause of the relative throughput shift. The entire build, correctness, and measurement job runs in one private Linux network namespace with native `lo` routing. Host networking and LAN access remain unchanged. See the [controlled routing investigation](ssr-loopback-investigation-2026-09-20.md) for unchanged-artifact controls, reversed order, IPv6 verification, and rejected rendering candidates.

Environment: linux 6.18.40.1-microsoft-standard-WSL2; AMD Ryzen 7 8745HS w/ Radeon 780M Graphics; 16 logical CPUs; 12.6 GiB RAM; Node v26.9.0; Bun 1.4.2.

All five controlled participants are included in browser and string SSR measurements. Streaming covers eXact, React, and TanStack Start. The separate native track covers eXact and React. Browser timing uses 30 samples; startup uses ten samples at each of 1x/4x/6x CPU throttling; heap uses five samples. SSR diagnostics use 500 sequential requests, 500 16-request waves, and one 1,000 ms c32 diagnostic window. Native measurements retain seven samples. Sustained comparisons use all twelve original Windows plans with two independent drivers and reversed framework order.

The participants retain one shared stylesheet. This run retains task callback discovery, encoded list hydration, and the Bun streaming response contract fixes. No renderer or adapter optimization was added for this capture. Desktop and mobile presentation gates compare server HTML and settled interactions before timing. Earlier five-framework paint comparisons included different visual workloads and must not be interpreted as isolated framework overhead. See the [presentation and paint investigation](presentation-parity-investigation-2026-09-20.md) for same-asset Windows/WSL controls, compiler corrections, and Bun concurrency experiments.

## Sustained throughput and eXact/React ratios

At total concurrency 32, RPS counts valid completed responses and divides by the union of simultaneous driver spans, summed over both populations and including drain. A ratio above 1 favors eXact. The ratio change is the requested relative-performance measure; it is not a direct percentage change in eXact RPS. The route experiment demonstrates that the same network change can affect the frameworks differently, so cross-route ratios alone do not identify a renderer regression.

Reference: [Previous mirrored-loopback capture](correctness-followup-2026-09-20.md).

| Runtime/API | Loading   | eXact RPS | React RPS | eXact/React | Reference ratio | Ratio change |
| ----------- | --------- | --------: | --------: | ----------: | --------------: | -----------: |
| node/string | preloaded |    15,627 |    11,936 |      1.309× |          1.118× |       +17.1% |
| node/string | normal    |     3,902 |     3,053 |      1.278× |          1.079× |       +18.4% |
| node/stream | preloaded |    12,606 |     4,380 |      2.878× |          1.997× |       +44.2% |
| node/stream | normal    |     3,580 |     2,307 |      1.552× |          1.294× |       +19.9% |
| bun/string  | preloaded |    13,005 |    10,940 |      1.189× |          1.063× |       +11.8% |
| bun/string  | normal    |     4,592 |     4,525 |      1.015× |          0.997× |        +1.8% |
| bun/stream  | preloaded |     7,355 |     7,522 |      0.978× |          0.924× |        +5.9% |
| bun/stream  | normal    |     4,407 |     4,469 |      0.986× |          0.945× |        +4.3% |

## Original reference and recovery checks

The original reference is the [corrected September 19 workspace capture](wsl-workspace-2026-09-19.md). The [route and artifact investigation](ssr-loopback-investigation-2026-09-20.md) explains the network correction and records the remaining differences without attributing all timing movement to framework code.

| Runtime/API | Loading   | Current ratio | Original ratio | Ratio change |
| ----------- | --------- | ------------: | -------------: | -----------: |
| node/string | preloaded |        1.309× |         1.120× |       +16.9% |
| node/string | normal    |        1.278× |         1.270× |        +0.6% |
| node/stream | preloaded |        2.878× |         2.952× |        -2.5% |
| node/stream | normal    |        1.552× |         1.568× |        -1.0% |
| bun/string  | preloaded |        1.189× |         1.086× |        +9.5% |
| bun/string  | normal    |        1.015× |         0.994× |        +2.0% |
| bun/stream  | preloaded |        0.978× |         0.973× |        +0.4% |
| bun/stream  | normal    |        0.986× |         0.974× |        +1.2% |

All eight comparisons improve on the preceding mirrored-loopback capture. Six exceed the original reference. Node streaming remains 2.5% below the original preloaded ratio and 1.0% below with normal loading. No runtime or renderer source change is credited for the network recovery. Further artifact controls and a rejected streaming-specific lookup candidate remain separate evidence.

Bun string throughput falls about 8% from c64 to c128 in both populations. There are no request errors or invalid responses in that sweep; the previously observed large collapse does not recur.

### Renderer-only diagnostic

These 1,000-render sequential diagnostics exclude request sockets and service fetching. They use a different execution history from saturated HTTP and cannot be added to HTTP cost components.

| Capture                         | eXact mean, µs | React mean, µs | eXact/React time |
| ------------------------------- | -------------: | -------------: | ---------------: |
| wsl-workspace-2026-09-19        |          203.6 |          109.1 |           1.866× |
| wsl-recovery-final-2026-09-19   |          233.0 |          177.4 |           1.313× |
| correctness-followup-2026-09-20 |          178.2 |           99.3 |           1.795× |
| native-loopback-2026-09-20      |          160.6 |          116.9 |           1.374× |

The current renderer-only ratio moves back toward the September 19 recovery result. The routing controls establish the end-to-end network effect; they do not establish that routing directly changes a socket-free render operation.

## Browser experience

Each cell is mean / p50 / p95 / p99. Latency and memory: lower is better.

| Metric                   | Unit |                             Exact |                             React |                         SvelteKit |                              Nuxt |                    TanStack Start |
| ------------------------ | ---- | --------------------------------: | --------------------------------: | --------------------------------: | --------------------------------: | --------------------------------: |
| Navigation completion    | ms   | 26.183 / 23.200 / 39.800 / 40.100 | 37.793 / 37.200 / 42.900 / 44.800 | 24.053 / 23.000 / 28.700 / 42.200 | 38.303 / 36.800 / 46.800 / 48.100 | 53.963 / 52.800 / 61.200 / 69.400 |
| First contentful paint   | ms   | 51.467 / 48.000 / 72.000 / 76.000 | 49.600 / 48.000 / 64.000 / 72.000 | 52.133 / 48.000 / 60.000 / 72.000 | 53.067 / 48.000 / 68.000 / 72.000 | 48.933 / 48.000 / 60.000 / 64.000 |
| Optimistic feedback      | ms   |     2.120 / 1.700 / 4.000 / 4.200 |     1.760 / 1.600 / 2.300 / 3.400 |     1.603 / 1.500 / 2.400 / 2.600 |     1.327 / 1.200 / 1.900 / 2.000 |     1.757 / 1.700 / 2.300 / 3.000 |
| Authoritative settlement | ms   | 12.707 / 12.800 / 13.800 / 16.300 | 12.647 / 12.700 / 14.200 / 14.500 | 12.683 / 12.800 / 13.500 / 13.600 | 13.303 / 13.300 / 14.400 / 14.800 | 13.060 / 13.000 / 14.100 / 14.200 |
| Warm browser used heap   | MB   |     2.521 / 2.524 / 2.524 / 2.524 |     2.300 / 2.302 / 2.302 / 2.302 |     2.073 / 2.074 / 2.074 / 2.074 |     2.327 / 2.327 / 2.327 / 2.327 |     2.761 / 2.757 / 2.821 / 2.821 |

## SSR completion tails

Completion of a 16-request wave, including data loading. Cells are mean / p95 / p99 milliseconds.

| Runtime/API |                Exact |                React |            SvelteKit |                  Nuxt |        TanStack Start |
| ----------- | -------------------: | -------------------: | -------------------: | --------------------: | --------------------: |
| node/string |  6.81 / 9.86 / 20.39 |  5.74 / 8.81 / 11.25 | 9.75 / 14.31 / 17.25 | 13.11 / 19.19 / 22.26 | 11.50 / 16.90 / 27.90 |
| bun/string  |  5.11 / 6.80 / 11.47 |   5.10 / 6.96 / 8.92 |   5.36 / 7.51 / 9.61 |  7.50 / 11.30 / 16.37 |   6.47 / 9.93 / 17.55 |
| node/stream | 6.90 / 10.12 / 16.08 | 7.76 / 11.08 / 18.37 |          unavailable |           unavailable | 11.82 / 17.17 / 22.97 |
| bun/stream  |  5.13 / 7.24 / 15.15 |  5.06 / 6.80 / 14.85 |          unavailable |           unavailable |  7.68 / 12.39 / 14.48 |

## Scheduled offered load

Errors, drain time, and missed arrivals remain part of the reported results.

| Runtime/API | Framework | Offered RPS | Valid RPS, populations | Request errors | Missed arrivals |
| ----------- | --------- | ----------: | ---------------------: | -------------: | --------------: |
| node/string | exact     |       8,000 |          7,926 / 7,906 |              0 |            2905 |
| node/string | exact     |      10,000 |          9,831 / 9,789 |              0 |            7588 |
| node/string | react     |       8,000 |          8,000 / 7,999 |              0 |              11 |
| node/string | react     |      10,000 |          9,532 / 9,604 |              0 |           16339 |
| node/stream | exact     |       8,000 |          7,960 / 7,965 |              0 |            1448 |
| node/stream | exact     |      10,000 |          9,787 / 9,797 |              0 |            7931 |
| node/stream | react     |       8,000 |          4,424 / 4,390 |            640 |          141808 |
| node/stream | react     |      10,000 |          4,567 / 4,341 |            252 |          220632 |
| bun/string  | exact     |       8,000 |          7,999 / 7,999 |              0 |               7 |
| bun/string  | exact     |      10,000 |          9,814 / 9,973 |              0 |            4157 |
| bun/string  | react     |       8,000 |          7,999 / 7,997 |              0 |               7 |
| bun/string  | react     |      10,000 |          9,447 / 9,407 |              0 |           21853 |
| bun/stream  | exact     |       8,000 |          6,732 / 6,588 |              0 |           52602 |
| bun/stream  | exact     |      10,000 |          6,688 / 6,594 |              0 |          133315 |
| bun/stream  | react     |       8,000 |          7,178 / 7,150 |              0 |           32359 |
| bun/stream  | react     |      10,000 |          7,233 / 7,204 |              0 |          110234 |

Total request errors across capacity stages, including warmup: 892. Invalid responses: 0.

## Correctness and evidence

Both runtimes passed 39 string and 25 streaming browser contracts before timing. The native track passed all 12 contracts. Native timing, startup CPU profiles, allocation captures, heap composition, raw response samples, and per-driver results remain separate evidence.

The [structured results](native-loopback-2026-09-20.json) retains measured comparisons and capture metadata.
Bulk raw captures and build archives are not retained; see the [retention policy](benchmark-retention.md).
