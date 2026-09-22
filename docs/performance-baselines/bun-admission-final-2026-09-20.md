# Framework comparison after Bun admission-policy correction, September 20–21, 2026

> Retained as a result summary. Raw capture paths mentioned below are historical identifiers;
> bulk samples and private experiment bundles are not distributed. See [benchmark retention](benchmark-retention.md).

This full capture measures workspace-resolved 0.6.0 packages at revision `44721c1136c9c9632e10a588885bdeb5d5b46974`, with component and render-program ABI 2. The Bun adapter now recognizes demand-limited scheduling benefits using native request departures and event-loop thread CPU. A responsive policy remains selected while native departures keep up, lag stays low, and thread CPU shows spare capacity. Recent headroom permits two transient unhealthy windows. Busy trials may establish responsiveness with sub-five-millisecond timer lag when capacity improves against both controls, and busy deadline checks keep their original monitor-tick cadence. Native body ownership, cancellation, and idle cleanup remain intact. See the [focused Bun admission investigation](bun-admission-investigation-2026-09-20.md).

Environment: linux 6.18.40.1-microsoft-standard-WSL2; AMD Ryzen 7 8745HS w/ Radeon 780M Graphics; 16 logical CPUs; 12.6 GiB RAM; Node v26.9.0; Bun 1.4.2. All stages share one private Linux network namespace with verified native loopback. Host networking is unchanged.

All five controlled participants are included in browser and string SSR measurements. Streaming covers eXact, React, and TanStack Start. The separate native track covers eXact and React. Browser timing uses 30 samples; startup uses ten samples at each of 1x/4x/6x CPU throttling; heap uses five samples. SSR diagnostics use 500 sequential requests, 500 16-request waves, and one 1,000 ms c32 diagnostic window. Native measurements retain seven samples. The participants retain shared presentation and all prior task, hydration, and response correctness fixes.

## Sustained throughput and eXact/React ratios

The concurrency protocols are unchanged from the [preceding full capture](arrival-policy-final-2026-09-20.md): two independent drivers, reversed framework order, 10 seconds of c16 warmup, 15 seconds at each preloaded concurrency (16/32/64/128), and 20 seconds at normal-loading c32. Aggregate RPS includes drain. Ratio changes below use c32; a ratio above 1 favors eXact.

| Runtime/API | Loading   | eXact RPS | React RPS | eXact/React | Previous ratio | Ratio change |
| ----------- | --------- | --------: | --------: | ----------: | -------------: | -----------: |
| node/string | preloaded |    15,920 |    11,881 |      1.340× |         1.313× |        +2.0% |
| node/string | normal    |     3,921 |     3,081 |      1.272× |         1.273× |        -0.1% |
| node/stream | preloaded |    12,740 |     4,509 |      2.825× |         2.875× |        -1.7% |
| node/stream | normal    |     3,547 |     2,295 |      1.546× |         1.584× |        -2.4% |
| bun/string  | preloaded |    12,798 |    11,038 |      1.159× |         1.143× |        +1.4% |
| bun/string  | normal    |     4,634 |     4,522 |      1.025× |         1.024× |        +0.1% |
| bun/stream  | preloaded |     7,472 |     7,474 |      1.000× |         1.004× |        -0.4% |
| bun/stream  | normal    |     4,287 |     4,560 |      0.940× |         1.001× |        -6.1% |

The focused investigation compares old and new Bun adapters with unchanged participant artifacts. Full-run ratios are retained here, including unfavorable changes; the artifact comparison in the structured capture identifies which framework artifacts changed. Concurrency and scheduled-demand results answer different capacity questions. The normal-streaming Bun deficit prompted a longer final/original/original/final adapter comparison: absolute eXact throughput changed by +0.19% and the mean ratio by −0.49%, without errors. Reverting the adapter did not restore the older ratio. The focused report preserves those controls; this table retains the full-run −6.1% result.

## Original reference

Historical Windows/WSL comparisons include environment and correctness changes. Ratios remain the requested relative-performance measure, but do not isolate code changes. The [routing investigation](ssr-loopback-investigation-2026-09-20.md) demonstrates that unchanged framework artifacts can respond differently to the same network change.

| Runtime/API | Loading   | Current ratio | September 19 ratio | Ratio change |
| ----------- | --------- | ------------: | -----------------: | -----------: |
| node/string | preloaded |        1.340× |             1.120× |       +19.6% |
| node/string | normal    |        1.272× |             1.270× |        +0.2% |
| node/stream | preloaded |        2.825× |             2.952× |        -4.3% |
| node/stream | normal    |        1.546× |             1.568× |        -1.4% |
| bun/string  | preloaded |        1.159× |             1.086× |        +6.8% |
| bun/string  | normal    |        1.025× |             0.994× |        +3.1% |
| bun/stream  | preloaded |        1.000× |             0.973× |        +2.7% |
| bun/stream  | normal    |        0.940× |             0.974× |        -3.5% |

These historical ratios retain the requested comparison with the original reference. Correctness and network conditions differ across older captures, so the table does not isolate those changes from the new admission policy.

## Scheduled offered load

Each framework/rate case owns fresh worker, service, and driver processes. Two drivers offer one total target rate, with 30 seconds of target-rate warmup followed by 60 seconds of measurement. The second population reverses framework and rate order. Each runtime/API capture contains eight cases. This protocol matches the immediately preceding full capture. Older sequential 20-second rate stages remain separate historical evidence.

Valid RPS includes drain. Missed arrivals have no response-latency observation; response p99 ranges span four individual driver/population percentiles, not a pooled percentile or confidence interval. Warmup failures are retained separately.

| Runtime/API | Framework | Offered RPS | Valid RPS | Misses | Request errors | Response p99 range, ms |
| ----------- | --------- | ----------: | --------: | -----: | -------------: | ---------------------: |
| node/string | exact     |       8,000 |     8,000 |  0.00% |              0 |            10.38–11.29 |
| node/string | exact     |      10,000 |     9,979 |  0.20% |              0 |            25.78–36.86 |
| node/string | react     |       8,000 |     7,997 |  0.00% |              0 |            36.10–37.18 |
| node/string | react     |      10,000 |     9,485 |  5.08% |              0 |           94.59–101.06 |
| node/stream | exact     |       8,000 |     7,967 |  0.41% |              0 |            60.42–65.47 |
| node/stream | exact     |      10,000 |     9,866 |  1.34% |              0 |            72.26–77.82 |
| node/stream | react     |       8,000 |     4,392 | 44.77% |           1745 |          130.62–150.53 |
| node/stream | react     |      10,000 |     4,367 | 56.03% |           2508 |          110.46–131.97 |
| bun/string  | exact     |       8,000 |     8,000 |  0.00% |              0 |            12.32–13.56 |
| bun/string  | exact     |      10,000 |     9,998 |  0.00% |              0 |            23.42–24.42 |
| bun/string  | react     |       8,000 |     7,998 |  0.00% |              0 |            26.27–26.94 |
| bun/string  | react     |      10,000 |     9,250 |  7.40% |              0 |          102.34–104.32 |
| bun/stream  | exact     |       8,000 |     6,655 | 16.72% |              0 |          104.58–110.34 |
| bun/stream  | exact     |      10,000 |     6,681 | 33.11% |              0 |          108.29–136.32 |
| bun/stream  | react     |       8,000 |     6,990 | 12.52% |              0 |          134.14–138.62 |
| bun/stream  | react     |      10,000 |     7,107 | 28.80% |              0 |          101.18–138.75 |

Total request errors across capacity stages, including warmup: 6838. Invalid responses: 0.

## Browser experience

Each cell is mean / p50 / p95 / p99. Latency and memory: lower is better.

| Metric                   | Unit |                             Exact |                             React |                         SvelteKit |                              Nuxt |                    TanStack Start |
| ------------------------ | ---- | --------------------------------: | --------------------------------: | --------------------------------: | --------------------------------: | --------------------------------: |
| Navigation completion    | ms   | 25.137 / 22.700 / 35.900 / 37.700 | 37.423 / 35.800 / 47.600 / 54.000 | 24.120 / 23.100 / 30.300 / 37.200 | 37.047 / 36.100 / 41.700 / 55.000 | 55.727 / 53.000 / 68.100 / 75.400 |
| First contentful paint   | ms   | 49.200 / 44.000 / 64.000 / 64.000 | 51.733 / 48.000 / 64.000 / 72.000 | 50.533 / 48.000 / 60.000 / 68.000 | 51.333 / 48.000 / 68.000 / 72.000 | 51.467 / 48.000 / 64.000 / 72.000 |
| Optimistic feedback      | ms   |     1.910 / 1.700 / 2.500 / 4.000 |     1.757 / 1.700 / 2.600 / 2.700 |     1.737 / 1.500 / 2.700 / 3.400 |     1.433 / 1.300 / 2.600 / 2.600 |     1.793 / 1.700 / 3.300 / 3.700 |
| Authoritative settlement | ms   | 12.897 / 13.100 / 14.400 / 14.700 | 12.367 / 12.400 / 13.400 / 13.600 | 12.630 / 12.700 / 13.400 / 13.500 | 12.620 / 13.000 / 14.000 / 14.000 | 13.003 / 13.000 / 14.000 / 14.200 |
| Warm browser used heap   | MB   |     2.522 / 2.524 / 2.524 / 2.524 |     2.301 / 2.302 / 2.302 / 2.302 |     2.073 / 2.074 / 2.074 / 2.074 |     2.325 / 2.327 / 2.327 / 2.327 |     2.757 / 2.757 / 2.757 / 2.764 |

## SSR completion tails

Completion of a 16-request wave, including data loading. Cells are mean / p95 / p99 milliseconds.

| Runtime/API |                Exact |                React |            SvelteKit |                  Nuxt |        TanStack Start |
| ----------- | -------------------: | -------------------: | -------------------: | --------------------: | --------------------: |
| node/string |  6.71 / 9.71 / 16.98 |  5.77 / 8.52 / 11.42 | 9.76 / 14.38 / 19.92 | 13.24 / 19.73 / 24.30 | 11.47 / 17.30 / 27.59 |
| bun/string  |  4.98 / 6.54 / 11.97 |   5.08 / 6.39 / 9.14 |   5.40 / 8.18 / 9.67 |  7.56 / 10.98 / 15.97 |  6.56 / 10.41 / 15.49 |
| node/stream | 6.57 / 10.08 / 15.00 | 7.82 / 11.47 / 15.16 |          unavailable |           unavailable | 12.13 / 18.70 / 28.88 |
| bun/stream  |  4.93 / 6.95 / 11.91 |   4.93 / 6.30 / 8.91 |          unavailable |           unavailable |  7.73 / 12.60 / 17.52 |

## Correctness and evidence

Both runtimes passed 39 string and 25 streaming browser contracts before timing. The native track passed all 12 contracts. Startup CPU profiles, allocation captures, heap composition, raw response samples, and per-driver results remain separate evidence.

The [structured results](bun-admission-final-2026-09-20.json) retains measured comparisons and capture metadata.
Bulk raw captures and build archives are not retained; see the [retention policy](benchmark-retention.md).
