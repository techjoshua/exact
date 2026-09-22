# Framework comparison after Bun progressive-render scheduling, September 22, 2026

This full capture measures workspace-resolved 0.6.0 packages at revision `dd3d7e69b31d7fd638c1af015cce3e49e422573b`, with component and render-program ABI 2. Bun progressive rendering uses a host-shared half-millisecond work window at render entry and data resumption. An immediate callback resets that window. String rendering and initial request admission retain the existing adaptive policy. Node policies, compiled component output, backpressure, output limits, and cancellation remain unchanged. See the [runtime output-policy investigation](runtime-output-policies-2026-09-21.md), the [automatic integration guards](bun-output-policy-integration-2026-09-22.md), and [rejected backpressure/budget experiments](backpressure-budget-2026-09-22.md).

Environment: linux 6.18.40.1-microsoft-standard-WSL2; AMD Ryzen 7 8745HS w/ Radeon 780M Graphics; 16 logical CPUs; 12.6 GiB RAM; Node v26.9.0; Bun 1.4.2. All stages share one private Linux network namespace with verified native loopback. Host networking is unchanged.

All five controlled participants are included in browser and string SSR measurements. Streaming covers eXact, React, and TanStack Start. The separate native track covers eXact and React. Browser timing uses 30 samples; startup uses ten samples at each of 1x/4x/6x CPU throttling; heap uses five samples. SSR diagnostics use 500 sequential requests, 500 16-request waves, and one 1,000 ms c32 diagnostic window. Native measurements retain seven samples. The participants retain shared presentation and all prior task, hydration, and response correctness fixes.

## Sustained throughput and eXact/React ratios

The concurrency protocols are unchanged from the [preceding full capture](bun-stream-counting-final-2026-09-21.md): two independent drivers, reversed framework order, 10 seconds of c16 warmup, 15 seconds at each preloaded concurrency (16/32/64/128), and 20 seconds at normal-loading c32. Aggregate RPS includes drain. Ratio changes below use c32; a ratio above 1 favors eXact.

| Runtime/API | Loading   | eXact RPS | React RPS | eXact/React | Previous ratio | Ratio change |
| ----------- | --------- | --------: | --------: | ----------: | -------------: | -----------: |
| node/string | preloaded |    15,346 |    11,694 |      1.312× |         1.226× |        +7.1% |
| node/string | normal    |     3,733 |     3,029 |      1.232× |         1.210× |        +1.9% |
| node/stream | preloaded |    12,642 |     4,362 |      2.898× |         2.678× |        +8.2% |
| node/stream | normal    |     3,604 |     2,294 |      1.571× |         1.673× |        -6.1% |
| bun/string  | preloaded |    12,989 |    10,948 |      1.186× |         1.135× |        +4.5% |
| bun/string  | normal    |     4,663 |     4,582 |      1.018× |         1.038× |        -2.0% |
| bun/stream  | preloaded |     9,715 |     7,537 |      1.289× |         1.006× |       +28.1% |
| bun/stream  | normal    |     4,480 |     4,534 |      0.988× |         0.975× |        +1.3% |

### Preloaded concurrency sweep

| Runtime/API | Concurrency | eXact RPS | React RPS | eXact/React | Previous ratio | Ratio change |
| ----------- | ----------: | --------: | --------: | ----------: | -------------: | -----------: |
| node/string |          16 |    13,293 |    11,040 |      1.204× |         1.154× |        +4.4% |
| node/string |          32 |    15,346 |    11,694 |      1.312× |         1.226× |        +7.1% |
| node/string |          64 |    16,394 |    12,233 |      1.340× |         1.295× |        +3.5% |
| node/string |         128 |    14,844 |    12,581 |      1.180× |         1.314× |       -10.2% |
| node/stream |          16 |    10,933 |     4,413 |      2.478× |         2.376× |        +4.3% |
| node/stream |          32 |    12,642 |     4,362 |      2.898× |         2.678× |        +8.2% |
| node/stream |          64 |    13,497 |     4,451 |      3.033× |         3.179× |        -4.6% |
| node/stream |         128 |    12,266 |     4,420 |      2.775× |         3.175× |       -12.6% |
| bun/string  |          16 |    11,508 |    10,152 |      1.134× |         1.116× |        +1.6% |
| bun/string  |          32 |    12,989 |    10,948 |      1.186× |         1.135× |        +4.5% |
| bun/string  |          64 |    13,203 |    11,524 |      1.146× |         1.108× |        +3.4% |
| bun/string  |         128 |    12,282 |    11,473 |      1.071× |         0.990× |        +8.1% |
| bun/stream  |          16 |    10,723 |     7,525 |      1.425× |         0.948× |       +50.4% |
| bun/stream  |          32 |     9,715 |     7,537 |      1.289× |         1.006× |       +28.1% |
| bun/stream  |          64 |     9,346 |     7,507 |      1.245× |         0.951× |       +31.0% |
| bun/stream  |         128 |     8,062 |     7,173 |      1.124× |         0.952× |       +18.1% |

The focused investigation compares runtime output policies and retains rejected backpressure and CPU-budget experiments. Full-run ratios are retained here, including unfavorable changes; the artifact comparison in the structured capture identifies which framework artifacts changed. Concurrency and scheduled-demand results answer different capacity questions.

### Follow-up controls

The full capture retains unfavorable high-concurrency Node ratios and a higher Bun string p99 at 8,000 offered RPS. The [fresh source and latency guards](output-policy-followup-guards-2026-09-22.md) compare those paths directly after this suite. These controls remain separate evidence and do not replace the full-run values above.

## Original reference

Historical Windows/WSL comparisons include environment and correctness changes. Ratios remain the requested relative-performance measure, but do not isolate code changes. The [routing investigation](ssr-loopback-investigation-2026-09-20.md) demonstrates that unchanged framework artifacts can respond differently to the same network change.

| Runtime/API | Loading   | Current ratio | September 19 ratio | Ratio change |
| ----------- | --------- | ------------: | -----------------: | -----------: |
| node/string | preloaded |        1.312× |             1.120× |       +17.2% |
| node/string | normal    |        1.232× |             1.270× |        -3.0% |
| node/stream | preloaded |        2.898× |             2.952× |        -1.8% |
| node/stream | normal    |        1.571× |             1.568× |        +0.2% |
| bun/string  | preloaded |        1.186× |             1.086× |        +9.3% |
| bun/string  | normal    |        1.018× |             0.994× |        +2.4% |
| bun/stream  | preloaded |        1.289× |             0.973× |       +32.4% |
| bun/stream  | normal    |        0.988× |             0.974× |        +1.4% |

These historical ratios retain the requested comparison with the original reference. Correctness and network conditions differ across older captures, so the table does not isolate those changes from the progressive-render scheduling change.

## Scheduled offered load

Each framework/rate case owns fresh worker, service, and driver processes. Two drivers offer one total target rate, with 30 seconds of target-rate warmup followed by 60 seconds of measurement. The second population reverses framework and rate order. Each runtime/API capture contains eight cases. This protocol matches the immediately preceding full capture. Older sequential 20-second rate stages remain separate historical evidence.

Valid RPS includes drain. Missed arrivals have no response-latency observation; response p99 ranges span four individual driver/population percentiles, not a pooled percentile or confidence interval. Warmup failures are retained separately.

| Runtime/API | Framework | Offered RPS | Valid RPS | Misses | Request errors | Response p99 range, ms |
| ----------- | --------- | ----------: | --------: | -----: | -------------: | ---------------------: |
| node/string | exact     |       8,000 |     8,000 |  0.00% |              0 |            10.78–11.76 |
| node/string | exact     |      10,000 |     9,980 |  0.20% |              0 |            25.09–38.98 |
| node/string | react     |       8,000 |     8,000 |  0.00% |              0 |            35.33–44.35 |
| node/string | react     |      10,000 |     9,310 |  6.82% |              0 |           99.84–108.35 |
| node/stream | exact     |       8,000 |     7,969 |  0.39% |              0 |            59.74–65.92 |
| node/stream | exact     |      10,000 |     9,835 |  1.63% |              0 |            74.82–77.82 |
| node/stream | react     |       8,000 |     4,452 | 44.00% |           1866 |          105.09–168.45 |
| node/stream | react     |      10,000 |     4,368 | 56.07% |           1992 |          110.98–138.62 |
| bun/string  | exact     |       8,000 |     7,999 |  0.00% |              0 |            13.62–14.16 |
| bun/string  | exact     |      10,000 |     9,998 |  0.00% |              0 |            24.11–25.63 |
| bun/string  | react     |       8,000 |     7,998 |  0.00% |              0 |            28.05–30.18 |
| bun/string  | react     |      10,000 |     9,189 |  8.02% |              0 |          102.53–106.69 |
| bun/stream  | exact     |       8,000 |     6,987 | 12.56% |              0 |          104.38–105.41 |
| bun/stream  | exact     |      10,000 |     7,175 | 28.18% |              0 |           98.88–102.91 |
| bun/stream  | react     |       8,000 |     6,992 | 12.47% |              0 |          135.17–136.06 |
| bun/stream  | react     |      10,000 |     7,267 | 27.24% |              0 |           96.96–139.52 |

### Scheduled-demand ratios

Both valid-RPS values and the eXact/React ratio are compared with the preceding full capture. When both frameworks satisfy the offered rate, the ratio is demand-capped and does not estimate spare capacity.

| Runtime/API | Offered RPS | eXact valid RPS, previous → current | React valid RPS, previous → current | Ratio change |
| ----------- | ----------: | ----------------------------------: | ----------------------------------: | -----------: |
| node/string |       8,000 |                       7,996 → 8,000 |                       7,959 → 8,000 |        -0.5% |
| node/string |      10,000 |                       9,924 → 9,980 |                       8,979 → 9,310 |        -3.0% |
| node/stream |       8,000 |                       7,946 → 7,969 |                       3,935 → 4,452 |       -11.4% |
| node/stream |      10,000 |                       9,851 → 9,835 |                       3,766 → 4,368 |       -13.9% |
| bun/string  |       8,000 |                       8,000 → 7,999 |                       7,998 → 7,998 |        -0.0% |
| bun/string  |      10,000 |                       9,961 → 9,998 |                       8,920 → 9,189 |        -2.6% |
| bun/stream  |       8,000 |                       6,500 → 6,987 |                       6,611 → 6,992 |        +1.6% |
| bun/stream  |      10,000 |                       6,592 → 7,175 |                       6,961 → 7,267 |        +4.3% |

### Observed request errors

These failures remain in the captures and validation notes. They are not counted as valid responses.

| Runtime/API/framework/phase/code        | Count |
| --------------------------------------- | ----: |
| node/string/react/warmup/LOAD_TIMEOUT   |    68 |
| node/stream/react/warmup/LOAD_TIMEOUT   |  2496 |
| node/stream/react/measured/LOAD_TIMEOUT |  3858 |
| bun/string/react/warmup/ECONNRESET      |     4 |

Across Bun streaming arrival cases, process-wide CPU time per valid eXact response was 186.1 µs in the preceding capture and 197.0 µs in this capture. These counters include warmup and helper threads. These aggregate counters do not isolate main-thread render cost. CPU time per response increased while throughput and latency improved; the separate measurements are consistent with better work coordination, not a demonstrated reduction in rendering instructions.

Total request errors across capacity stages, including warmup: 6426. Invalid responses: 0.

## Browser experience

Each cell is mean / p50 / p95 / p99. Latency and memory: lower is better.

| Metric                   | Unit |                             Exact |                             React |                         SvelteKit |                              Nuxt |                    TanStack Start |
| ------------------------ | ---- | --------------------------------: | --------------------------------: | --------------------------------: | --------------------------------: | --------------------------------: |
| Navigation completion    | ms   | 24.387 / 23.300 / 28.800 / 31.800 | 37.737 / 36.400 / 46.700 / 58.100 | 23.650 / 22.900 / 27.900 / 29.000 | 39.850 / 36.800 / 59.100 / 60.300 | 53.487 / 51.600 / 66.900 / 72.900 |
| First contentful paint   | ms   | 50.133 / 48.000 / 64.000 / 64.000 | 50.667 / 48.000 / 68.000 / 72.000 | 50.533 / 48.000 / 60.000 / 68.000 | 55.200 / 48.000 / 76.000 / 84.000 | 48.400 / 48.000 / 64.000 / 64.000 |
| Optimistic feedback      | ms   |     1.813 / 1.800 / 2.300 / 3.000 |     1.947 / 1.600 / 4.000 / 4.100 |     1.647 / 1.500 / 2.400 / 2.600 |     1.327 / 1.200 / 1.800 / 1.800 |     1.833 / 1.700 / 3.100 / 3.800 |
| Authoritative settlement | ms   | 12.960 / 13.000 / 13.500 / 13.500 | 12.217 / 12.400 / 13.500 / 13.500 | 12.710 / 12.900 / 13.800 / 14.700 | 13.173 / 13.300 / 14.300 / 14.700 | 12.803 / 12.800 / 14.000 / 18.100 |
| Warm browser used heap   | MB   |     2.523 / 2.524 / 2.524 / 2.524 |     2.300 / 2.302 / 2.302 / 2.302 |     2.073 / 2.074 / 2.074 / 2.074 |     2.327 / 2.327 / 2.327 / 2.327 |     2.756 / 2.757 / 2.760 / 2.768 |

Browser artifact hashes unchanged from the preceding capture: exact-controlled, react-controlled, tanstack-start-controlled. The structured capture retains previous and current browser statistics; unchanged artifacts do not guarantee identical timing across runs.

## SSR completion tails

Completion of a 16-request wave, including data loading. Cells are mean / p95 / p99 milliseconds.

| Runtime/API |                Exact |                React |            SvelteKit |                  Nuxt |        TanStack Start |
| ----------- | -------------------: | -------------------: | -------------------: | --------------------: | --------------------: |
| node/string |  6.71 / 9.84 / 17.72 |  6.12 / 9.07 / 13.18 | 9.85 / 14.74 / 21.06 | 12.65 / 18.70 / 25.02 | 11.37 / 16.86 / 25.17 |
| bun/string  |  4.93 / 6.33 / 11.00 |  5.01 / 6.55 / 13.81 |  5.39 / 7.99 / 12.19 |  7.31 / 11.56 / 18.07 |  6.45 / 10.52 / 15.75 |
| node/stream | 6.94 / 10.30 / 15.80 | 7.60 / 11.05 / 15.30 |          unavailable |           unavailable | 11.93 / 17.54 / 29.57 |
| bun/stream  |  5.09 / 6.87 / 10.01 |  5.06 / 7.23 / 14.57 |          unavailable |           unavailable |  8.03 / 12.53 / 17.21 |

## Correctness and evidence

Both runtimes passed 39 string and 25 streaming browser contracts before timing. The native track passed all 12 contracts. Startup CPU profiles, allocation captures, heap composition, raw response samples, and per-driver results remain separate evidence.

The [structured capture](bun-output-policy-final-2026-09-22.json) links raw captures and records hashes, source state, runners, execution journal, and prior chart values. The [evidence archive](bun-output-policy-final-2026-09-22-evidence.zip) retains source state, logs, plans, and documentation verification. Native samples are in [the native capture](bun-output-policy-final-2026-09-22-native.json).
