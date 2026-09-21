# Framework comparison after progressive-output buffering improvements, September 21, 2026

This full capture measures workspace-resolved 0.6.0 packages at revision `1663f74b37fe440c86da9082c934ba07938874b1`, with component and render-program ABI 2. On Bun, progressive document output groups pending fragments and uses conservative UTF-8 bounds to avoid counting every small span. Exact output limits and flush thresholds remain enforced. Node retains its original per-span sink. The Node and Bun admission controllers, native response ownership, and cancellation contracts are unchanged. See the [focused streaming investigation](bun-stream-counting-investigation-2026-09-21.md) and the [rejected scheduler experiments](bun-loop-interval-investigation-2026-09-21.md).

Environment: linux 6.18.40.1-microsoft-standard-WSL2; AMD Ryzen 7 8745HS w/ Radeon 780M Graphics; 16 logical CPUs; 12.6 GiB RAM; Node v26.9.0; Bun 1.4.2. All stages share one private Linux network namespace with verified native loopback. Host networking is unchanged.

All five controlled participants are included in browser and string SSR measurements. Streaming covers eXact, React, and TanStack Start. The separate native track covers eXact and React. Browser timing uses 30 samples; startup uses ten samples at each of 1x/4x/6x CPU throttling; heap uses five samples. SSR diagnostics use 500 sequential requests, 500 16-request waves, and one 1,000 ms c32 diagnostic window. Native measurements retain seven samples. The participants retain shared presentation and all prior task, hydration, and response correctness fixes.

## Sustained throughput and eXact/React ratios

The concurrency protocols are unchanged from the [preceding full capture](bun-admission-final-2026-09-20.md): two independent drivers, reversed framework order, 10 seconds of c16 warmup, 15 seconds at each preloaded concurrency (16/32/64/128), and 20 seconds at normal-loading c32. Aggregate RPS includes drain. Ratio changes below use c32; a ratio above 1 favors eXact.

| Runtime/API | Loading   | eXact RPS | React RPS | eXact/React | Previous ratio | Ratio change |
| ----------- | --------- | --------: | --------: | ----------: | -------------: | -----------: |
| node/string | preloaded |    12,910 |    10,532 |      1.226× |         1.340× |        -8.5% |
| node/string | normal    |     3,413 |     2,821 |      1.210× |         1.272× |        -4.9% |
| node/stream | preloaded |    10,297 |     3,846 |      2.678× |         2.825× |        -5.2% |
| node/stream | normal    |     3,290 |     1,967 |      1.673× |         1.546× |        +8.2% |
| bun/string  | preloaded |    11,069 |     9,750 |      1.135× |         1.159× |        -2.1% |
| bun/string  | normal    |     4,151 |     3,998 |      1.038× |         1.025× |        +1.3% |
| bun/stream  | preloaded |     7,034 |     6,990 |      1.006× |         1.000× |        +0.6% |
| bun/stream  | normal    |     3,872 |     3,969 |      0.975× |         0.940× |        +3.8% |

### Preloaded concurrency sweep

| Runtime/API | Concurrency | eXact RPS | React RPS | eXact/React | Previous ratio | Ratio change |
| ----------- | ----------: | --------: | --------: | ----------: | -------------: | -----------: |
| node/string |          16 |    11,002 |     9,538 |      1.154× |         1.221× |        -5.6% |
| node/string |          32 |    12,910 |    10,532 |      1.226× |         1.340× |        -8.5% |
| node/string |          64 |    14,384 |    11,112 |      1.295× |         1.347× |        -3.9% |
| node/string |         128 |    14,160 |    10,777 |      1.314× |         1.208× |        +8.8% |
| node/stream |          16 |     9,027 |     3,799 |      2.376× |         2.500× |        -5.0% |
| node/stream |          32 |    10,297 |     3,846 |      2.678× |         2.825× |        -5.2% |
| node/stream |          64 |    12,016 |     3,779 |      3.179× |         3.136× |        +1.4% |
| node/stream |         128 |    11,913 |     3,753 |      3.175× |         2.950× |        +7.6% |
| bun/string  |          16 |     9,975 |     8,940 |      1.116× |         1.117× |        -0.1% |
| bun/string  |          32 |    11,069 |     9,750 |      1.135× |         1.159× |        -2.1% |
| bun/string  |          64 |    11,473 |    10,353 |      1.108× |         1.115× |        -0.6% |
| bun/string  |         128 |    10,311 |    10,412 |      0.990× |         1.024× |        -3.3% |
| bun/stream  |          16 |     6,528 |     6,889 |      0.948× |         0.985× |        -3.8% |
| bun/stream  |          32 |     7,034 |     6,990 |      1.006× |         1.000× |        +0.6% |
| bun/stream  |          64 |     6,711 |     7,060 |      0.951× |         0.996× |        -4.6% |
| bun/stream  |         128 |     6,442 |     6,767 |      0.952× |         0.927× |        +2.7% |

The focused investigation compares rendering-buffer variants with unchanged admission controllers and also retains rejected scheduler experiments. Full-run ratios are retained here, including unfavorable changes; the artifact comparison in the structured capture identifies which framework artifacts changed. Concurrency and scheduled-demand results answer different capacity questions.

## Original reference

Historical Windows/WSL comparisons include environment and correctness changes. Ratios remain the requested relative-performance measure, but do not isolate code changes. The [routing investigation](ssr-loopback-investigation-2026-09-20.md) demonstrates that unchanged framework artifacts can respond differently to the same network change.

| Runtime/API | Loading   | Current ratio | September 19 ratio | Ratio change |
| ----------- | --------- | ------------: | -----------------: | -----------: |
| node/string | preloaded |        1.226× |             1.120× |        +9.4% |
| node/string | normal    |        1.210× |             1.270× |        -4.7% |
| node/stream | preloaded |        2.678× |             2.952× |        -9.3% |
| node/stream | normal    |        1.673× |             1.568× |        +6.7% |
| bun/string  | preloaded |        1.135× |             1.086× |        +4.6% |
| bun/string  | normal    |        1.038× |             0.994× |        +4.4% |
| bun/stream  | preloaded |        1.006× |             0.973× |        +3.4% |
| bun/stream  | normal    |        0.975× |             0.974× |        +0.1% |

These historical ratios retain the requested comparison with the original reference. Correctness and network conditions differ across older captures, so the table does not isolate those changes from the buffering change.

## Scheduled offered load

Each framework/rate case owns fresh worker, service, and driver processes. Two drivers offer one total target rate, with 30 seconds of target-rate warmup followed by 60 seconds of measurement. The second population reverses framework and rate order. Each runtime/API capture contains eight cases. This protocol matches the immediately preceding full capture. Older sequential 20-second rate stages remain separate historical evidence.

Valid RPS includes drain. Missed arrivals have no response-latency observation; response p99 ranges span four individual driver/population percentiles, not a pooled percentile or confidence interval. Warmup failures are retained separately.

| Runtime/API | Framework | Offered RPS | Valid RPS | Misses | Request errors | Response p99 range, ms |
| ----------- | --------- | ----------: | --------: | -----: | -------------: | ---------------------: |
| node/string | exact     |       8,000 |     7,996 |  0.04% |              0 |            25.70–41.98 |
| node/string | exact     |      10,000 |     9,924 |  0.76% |              0 |            56.74–60.58 |
| node/string | react     |       8,000 |     7,959 |  0.39% |              0 |            91.78–94.27 |
| node/string | react     |      10,000 |     8,979 | 10.10% |              0 |          106.82–108.80 |
| node/stream | exact     |       8,000 |     7,946 |  0.67% |              0 |            71.23–73.02 |
| node/stream | exact     |      10,000 |     9,851 |  1.48% |              0 |            78.40–87.30 |
| node/stream | react     |       8,000 |     3,935 | 50.43% |           2310 |          102.08–161.79 |
| node/stream | react     |      10,000 |     3,766 | 62.04% |           2694 |          104.96–149.38 |
| bun/string  | exact     |       8,000 |     8,000 |  0.00% |              0 |              6.09–6.16 |
| bun/string  | exact     |      10,000 |     9,961 |  0.39% |              0 |            52.83–55.81 |
| bun/string  | react     |       8,000 |     7,998 |  0.00% |              0 |            23.54–29.31 |
| bun/string  | react     |      10,000 |     8,920 | 10.70% |              0 |          109.18–109.38 |
| bun/stream  | exact     |       8,000 |     6,500 | 18.63% |              0 |          147.58–149.63 |
| bun/stream  | exact     |      10,000 |     6,592 | 33.97% |              0 |          101.70–151.81 |
| bun/stream  | react     |       8,000 |     6,611 | 17.24% |              0 |          107.84–150.66 |
| bun/stream  | react     |      10,000 |     6,961 | 30.30% |              0 |           90.82–144.00 |

### Scheduled-demand ratios

Both valid-RPS values and the eXact/React ratio are compared with the preceding full capture. When both frameworks satisfy the offered rate, the ratio is demand-capped and does not estimate spare capacity.

| Runtime/API | Offered RPS | eXact valid RPS, previous → current | React valid RPS, previous → current | Ratio change |
| ----------- | ----------: | ----------------------------------: | ----------------------------------: | -----------: |
| node/string |       8,000 |                       8,000 → 7,996 |                       7,997 → 7,959 |        +0.4% |
| node/string |      10,000 |                       9,979 → 9,924 |                       9,485 → 8,979 |        +5.1% |
| node/stream |       8,000 |                       7,967 → 7,946 |                       4,392 → 3,935 |       +11.3% |
| node/stream |      10,000 |                       9,866 → 9,851 |                       4,367 → 3,766 |       +15.8% |
| bun/string  |       8,000 |                       8,000 → 8,000 |                       7,998 → 7,998 |        -0.0% |
| bun/string  |      10,000 |                       9,998 → 9,961 |                       9,250 → 8,920 |        +3.3% |
| bun/stream  |       8,000 |                       6,655 → 6,500 |                       6,990 → 6,611 |        +3.3% |
| bun/stream  |      10,000 |                       6,681 → 6,592 |                       7,107 → 6,961 |        +0.7% |

### Observed request errors

These failures remain in the captures and validation notes. They are not counted as valid responses.

| Runtime/API/framework/phase/code        | Count |
| --------------------------------------- | ----: |
| node/string/react/warmup/LOAD_TIMEOUT   |   132 |
| node/stream/react/warmup/LOAD_TIMEOUT   |  2682 |
| node/stream/react/measured/LOAD_TIMEOUT |  5004 |

Across Bun streaming arrival cases, process-wide CPU time per valid eXact response was 197.2 µs in the preceding capture and 186.1 µs in this capture. These counters include warmup and helper threads. Lower aggregate CPU cost does not by itself establish a shorter main-thread path or better HTTP scheduling; the throughput and latency measurements above remain separate outcomes.

Total request errors across capacity stages, including warmup: 7818. Invalid responses: 0.

## Browser experience

Each cell is mean / p50 / p95 / p99. Latency and memory: lower is better.

| Metric                   | Unit |                             Exact |                             React |                         SvelteKit |                              Nuxt |                    TanStack Start |
| ------------------------ | ---- | --------------------------------: | --------------------------------: | --------------------------------: | --------------------------------: | --------------------------------: |
| Navigation completion    | ms   | 28.870 / 28.900 / 30.700 / 30.900 | 40.913 / 40.400 / 45.200 / 45.400 | 26.063 / 25.300 / 32.700 / 36.100 | 40.837 / 38.900 / 46.400 / 53.100 | 63.143 / 63.200 / 68.800 / 69.500 |
| First contentful paint   | ms   | 58.400 / 60.000 / 60.000 / 64.000 | 66.533 / 68.000 / 76.000 / 84.000 | 58.933 / 56.000 / 68.000 / 76.000 | 62.000 / 64.000 / 68.000 / 68.000 | 58.533 / 60.000 / 64.000 / 64.000 |
| Optimistic feedback      | ms   |     2.163 / 1.900 / 3.100 / 3.100 |     2.093 / 1.800 / 3.400 / 3.500 |     1.920 / 1.700 / 2.500 / 2.500 |     1.570 / 1.400 / 2.300 / 2.600 |     2.040 / 1.800 / 3.000 / 3.300 |
| Authoritative settlement | ms   | 10.120 / 10.200 / 11.800 / 11.800 | 10.447 / 10.400 / 12.000 / 12.200 |  10.110 / 9.900 / 12.000 / 12.400 | 10.153 / 10.100 / 12.800 / 13.000 | 11.130 / 11.100 / 13.400 / 15.600 |
| Warm browser used heap   | MB   |     2.519 / 2.524 / 2.524 / 2.524 |     2.297 / 2.302 / 2.302 / 2.302 |     2.070 / 2.074 / 2.074 / 2.074 |     2.323 / 2.327 / 2.327 / 2.327 |     2.760 / 2.757 / 2.810 / 2.810 |

Browser artifact hashes unchanged from the preceding capture: exact-controlled, react-controlled, tanstack-start-controlled. The structured capture retains previous and current browser statistics; unchanged artifacts do not guarantee identical timing across runs.

## SSR completion tails

Completion of a 16-request wave, including data loading. Cells are mean / p95 / p99 milliseconds.

| Runtime/API |               Exact |                React |             SvelteKit |                  Nuxt |        TanStack Start |
| ----------- | ------------------: | -------------------: | --------------------: | --------------------: | --------------------: |
| node/string | 6.99 / 9.52 / 11.51 |  6.48 / 8.97 / 10.81 | 10.42 / 13.53 / 15.52 | 14.34 / 18.79 / 20.88 | 12.12 / 15.02 / 16.51 |
| bun/string  |  5.63 / 7.42 / 8.63 |   5.52 / 6.95 / 7.98 |    5.96 / 8.04 / 8.92 |  8.19 / 12.64 / 14.13 |  7.21 / 11.37 / 12.61 |
| node/stream | 6.87 / 9.79 / 11.36 | 8.72 / 11.37 / 13.92 |           unavailable |           unavailable | 13.47 / 17.40 / 21.36 |
| bun/stream  |  5.64 / 7.50 / 9.88 |   5.63 / 7.40 / 8.11 |           unavailable |           unavailable |  8.68 / 13.21 / 14.75 |

## Correctness and evidence

Both runtimes passed 39 string and 25 streaming browser contracts before timing. The native track passed all 12 contracts. Startup CPU profiles, allocation captures, heap composition, raw response samples, and per-driver results remain separate evidence.

The [structured capture](bun-stream-counting-final-2026-09-21.json) links raw captures and records hashes, source state, runners, execution journal, and prior chart values. The [evidence archive](bun-stream-counting-final-2026-09-21-evidence.zip) retains source state, logs, plans, and documentation verification. Native samples are in [the native capture](bun-stream-counting-final-2026-09-21-native.json).
