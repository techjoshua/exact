# Framework comparison after Node admission-policy correction, September 20, 2026

This full capture measures workspace-resolved 0.6.0 packages at revision `3c2b87728f977ed5bf2e0d98e599f544c4c3298d`, with component and render-program ABI 2. The Node adapter retains an already-beneficial scheduling policy while event-loop delay is low and utilization shows spare capacity. It no longer treats lower offered demand as evidence of lost capacity. Busy trials still require a throughput and lag win. Demand-limited trials may instead prove low lag, spare capacity, and completion of admitted work. Response correctness and idle cleanup remain intact. See the [focused admission investigation](ssr-arrival-investigation-2026-09-20.md).

Environment: linux 6.18.40.1-microsoft-standard-WSL2; AMD Ryzen 7 8745HS w/ Radeon 780M Graphics; 16 logical CPUs; 12.6 GiB RAM; Node v26.9.0; Bun 1.4.2. All stages share one private Linux network namespace with verified native loopback. Host networking is unchanged.

All five controlled participants are included in browser and string SSR measurements. Streaming covers eXact, React, and TanStack Start. The separate native track covers eXact and React. Browser timing uses 30 samples; startup uses ten samples at each of 1x/4x/6x CPU throttling; heap uses five samples. SSR diagnostics use 500 sequential requests, 500 16-request waves, and one 1,000 ms c32 diagnostic window. Native measurements retain seven samples. The participants retain shared presentation and all prior task, hydration, and response correctness fixes.

## Sustained throughput and eXact/React ratios

The concurrency protocols are unchanged from the [preceding native-loopback capture](native-loopback-2026-09-20.md): two independent drivers, reversed framework order, 10 seconds of c16 warmup, 15 seconds at each preloaded concurrency (16/32/64/128), and 20 seconds at normal-loading c32. Aggregate RPS includes drain. Ratio changes below use c32; a ratio above 1 favors eXact.

| Runtime/API | Loading | eXact RPS | React RPS | eXact/React | Previous ratio | Ratio change |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| node/string | preloaded | 15,201 | 11,576 | 1.313× | 1.309× | +0.3% |
| node/string | normal | 3,824 | 3,003 | 1.273× | 1.278× | -0.4% |
| node/stream | preloaded | 12,606 | 4,385 | 2.875× | 2.878× | -0.1% |
| node/stream | normal | 3,563 | 2,250 | 1.584× | 1.552× | +2.1% |
| bun/string | preloaded | 12,670 | 11,085 | 1.143× | 1.189× | -3.9% |
| bun/string | normal | 4,616 | 4,508 | 1.024× | 1.015× | +0.9% |
| bun/stream | preloaded | 7,487 | 7,459 | 1.004× | 0.978× | +2.7% |
| bun/stream | normal | 4,318 | 4,313 | 1.001× | 0.986× | +1.5% |

Node c32 ratio changes stay between −0.4% and +2.1% versus the preceding full capture. This correction targets admission stability; the participant entry and server artifacts are unchanged. Bun string preloaded ratio is 3.9% lower while its other ratios improve. Both Bun APIs use identical adapter, server, and participant entry hashes to the preceding capture, so these movements are not effects of the Node correction. All concurrency captures have zero request errors and invalid responses. Bun string c64-to-c128 throughput falls about 6–7% in its two populations; the earlier large collapse does not recur.

## Original reference

Historical Windows/WSL comparisons include environment and correctness changes. Ratios remain the requested relative-performance measure, but do not isolate code changes. The [routing investigation](ssr-loopback-investigation-2026-09-20.md) demonstrates that unchanged framework artifacts can respond differently to the same network change.

| Runtime/API | Loading | Current ratio | September 19 ratio | Ratio change |
| --- | --- | ---: | ---: | ---: |
| node/string | preloaded | 1.313× | 1.120× | +17.2% |
| node/string | normal | 1.273× | 1.270× | +0.3% |
| node/stream | preloaded | 2.875× | 2.952× | -2.6% |
| node/stream | normal | 1.584× | 1.568× | +1.0% |
| bun/string | preloaded | 1.143× | 1.086× | +5.3% |
| bun/string | normal | 1.024× | 0.994× | +3.0% |
| bun/stream | preloaded | 1.004× | 0.973× | +3.1% |
| bun/stream | normal | 1.001× | 0.974× | +2.8% |

Seven ratios exceed the September 19 reference. Node preloaded streaming remains 2.6% below that historical ratio, while differing by only −0.1% from the immediately preceding native-loopback capture. Its remaining historical difference is not isolated to one code change: the older captures include different correctness and network conditions. The routing investigation and retained artifact controls document those limits; this run does not claim complete historical recovery.

## Scheduled offered load

Each framework/rate case now owns fresh worker, service, and driver processes. Two drivers offer one total target rate, with 30 seconds of target-rate warmup followed by 60 seconds of measurement. The second population reverses framework and rate order. Each runtime/API capture contains eight cases. These longer isolated cases replace the former sequential 20-second rate stages and must not be read as a code-only comparison with historical arrival charts.

Valid RPS includes drain. Missed arrivals have no response-latency observation; response p99 ranges span four individual driver/population percentiles, not a pooled percentile or confidence interval. Warmup failures are retained separately.

| Runtime/API | Framework | Offered RPS | Valid RPS | Misses | Request errors | Response p99 range, ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| node/string | exact | 8,000 | 7,999 | 0.00% | 0 | 10.94–11.48 |
| node/string | exact | 10,000 | 9,990 | 0.09% | 0 | 24.78–29.42 |
| node/string | react | 8,000 | 8,000 | 0.00% | 0 | 35.71–37.54 |
| node/string | react | 10,000 | 9,421 | 5.71% | 0 | 94.85–103.55 |
| node/stream | exact | 8,000 | 7,963 | 0.43% | 0 | 55.04–63.07 |
| node/stream | exact | 10,000 | 9,871 | 1.27% | 0 | 70.85–71.23 |
| node/stream | react | 8,000 | 4,454 | 43.97% | 1864 | 109.18–153.47 |
| node/stream | react | 10,000 | 4,343 | 56.25% | 2514 | 114.11–130.11 |
| bun/string | exact | 8,000 | 7,999 | 0.00% | 0 | 31.14–39.55 |
| bun/string | exact | 10,000 | 9,983 | 0.15% | 0 | 48.61–50.24 |
| bun/string | react | 8,000 | 7,999 | 0.00% | 0 | 26.53–27.28 |
| bun/string | react | 10,000 | 9,383 | 6.08% | 0 | 99.97–103.68 |
| bun/stream | exact | 8,000 | 6,611 | 17.25% | 0 | 116.35–140.67 |
| bun/stream | exact | 10,000 | 6,677 | 33.15% | 0 | 108.16–141.31 |
| bun/stream | react | 8,000 | 7,053 | 11.72% | 0 | 132.61–138.37 |
| bun/stream | react | 10,000 | 7,190 | 28.01% | 0 | 103.10–135.42 |

Total request errors across capacity stages, including warmup: 6919. Invalid responses: 0.

## Browser experience

Each cell is mean / p50 / p95 / p99. Latency and memory: lower is better.

| Metric | Unit | Exact | React | SvelteKit | Nuxt | TanStack Start |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Navigation completion | ms | 25.117 / 23.300 / 41.200 / 41.500 | 38.700 / 36.700 / 53.400 / 60.400 | 23.927 / 22.700 / 28.500 / 41.900 | 37.177 / 36.200 / 46.300 / 46.800 | 55.453 / 51.900 / 72.200 / 79.100 |
| First contentful paint | ms | 49.733 / 48.000 / 68.000 / 68.000 | 51.867 / 48.000 / 68.000 / 72.000 | 49.867 / 48.000 / 60.000 / 72.000 | 50.133 / 48.000 / 64.000 / 76.000 | 51.600 / 48.000 / 68.000 / 76.000 |
| Optimistic feedback | ms | 1.863 / 1.800 / 3.100 / 3.200 | 1.790 / 1.700 / 3.100 / 3.400 | 1.763 / 1.600 / 2.700 / 4.100 | 1.310 / 1.300 / 1.800 / 1.800 | 1.900 / 1.700 / 3.200 / 3.400 |
| Authoritative settlement | ms | 12.900 / 13.100 / 13.800 / 16.200 | 12.557 / 12.700 / 13.400 / 13.600 | 12.650 / 12.800 / 13.800 / 15.400 | 12.770 / 12.900 / 14.000 / 14.000 | 12.953 / 13.100 / 14.000 / 14.100 |
| Warm browser used heap | MB | 2.523 / 2.524 / 2.524 / 2.524 | 2.300 / 2.302 / 2.302 / 2.302 | 2.072 / 2.074 / 2.074 / 2.074 | 2.327 / 2.327 / 2.327 / 2.327 | 2.758 / 2.757 / 2.766 / 2.830 |

## SSR completion tails

Completion of a 16-request wave, including data loading. Cells are mean / p95 / p99 milliseconds.

| Runtime/API | Exact | React | SvelteKit | Nuxt | TanStack Start |
| --- | ---: | ---: | ---: | ---: | ---: |
| node/string | 6.56 / 9.53 / 12.19 | 5.73 / 8.50 / 11.58 | 9.49 / 14.01 / 18.73 | 13.30 / 19.22 / 24.48 | 11.51 / 17.10 / 26.66 |
| bun/string | 4.97 / 6.40 / 8.86 | 4.95 / 6.59 / 7.79 | 5.39 / 7.42 / 14.67 | 7.36 / 11.17 / 19.28 | 6.54 / 10.00 / 12.57 |
| node/stream | 7.31 / 10.76 / 15.49 | 7.96 / 11.57 / 18.19 | unavailable | unavailable | 12.40 / 18.96 / 24.63 |
| bun/stream | 5.04 / 6.94 / 10.44 | 4.98 / 6.76 / 8.98 | unavailable | unavailable | 7.99 / 12.77 / 18.22 |

## Correctness and evidence

Both runtimes passed 39 string and 25 streaming browser contracts before timing. The native track passed all 12 contracts. Startup CPU profiles, allocation captures, heap composition, raw response samples, and per-driver results remain separate evidence.

The [structured capture](arrival-policy-final-2026-09-20.json) links raw captures and records hashes, source state, runners, execution journal, and prior chart values. The [evidence archive](arrival-policy-final-2026-09-20-evidence.zip) retains source state, logs, plans, and documentation verification. Native samples are in [the native capture](arrival-policy-final-2026-09-20-native.json).
