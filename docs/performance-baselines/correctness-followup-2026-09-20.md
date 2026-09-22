# Framework comparison after task and hydration correctness fixes, September 20, 2026

> Retained as a result summary. Raw capture paths mentioned below are historical identifiers;
> bulk samples and private experiment bundles are not distributed. See [benchmark retention](benchmark-retention.md).

This full capture measures the repository implementation through workspace-resolved compiler, runtime, and adapter packages. Source revision: `2937d65158b2b77c186acfda5332c25d3fac5a09` with the recorded source state. Package release target: 0.6.0; component and render-program ABI: 2.

The [September 18 WSL capture](wsl-framework-2026-09-18.md) loaded published 0.5.1 packages instead of the branch. Its numbers remain evidence for that installed setup, but its branch attribution is withdrawn. The dependency ranges and release-manifest inventory are corrected. Build and measurement guards now reject shadowing registry copies, and SSR environment records retain actual resolved paths and versions.

Environment: linux 6.18.40.1-microsoft-standard-WSL2; AMD Ryzen 7 8745HS w/ Radeon 780M Graphics; 16 logical CPUs; 12.6 GiB RAM; Node v26.9.0; Bun 1.4.2.

All five controlled participants are included in browser and string SSR measurements. Streaming covers eXact, React, and TanStack Start. The separate native track covers eXact and React. Browser timing uses 30 samples; startup uses ten samples at each of 1x/4x/6x CPU throttling; heap uses five samples. SSR diagnostics use 500 sequential requests, 500 16-request waves, and one 1,000 ms c32 diagnostic window. Native measurements retain seven samples. Sustained comparisons use all twelve original Windows plans with two independent drivers and reversed framework order.

The participants retain one shared stylesheet. This run includes task callback discovery, encoded list hydration, and the Bun streaming response contract fixes. Desktop and mobile presentation gates compare server HTML and settled interactions before timing. Earlier five-framework paint comparisons included different visual workloads and must not be interpreted as isolated framework overhead. See the [presentation and paint investigation](presentation-parity-investigation-2026-09-20.md) for same-asset Windows/WSL controls, compiler corrections, and Bun concurrency experiments.

## Sustained throughput and eXact/React ratios

At total concurrency 32, RPS counts valid completed responses and divides by the union of simultaneous driver spans, summed over both populations and including drain. A ratio above 1 favors eXact. The ratio change treats React as the environment control, as requested; it is not a direct percentage change in eXact RPS.

Reference: [Previous presentation-parity capture](presentation-parity-2026-09-20.md).

| Runtime/API | Loading   | eXact RPS | React RPS | eXact/React | Reference ratio | Ratio change |
| ----------- | --------- | --------: | --------: | ----------: | --------------: | -----------: |
| node/string | preloaded |    12,009 |    10,740 |      1.118× |          1.093× |        +2.3% |
| node/string | normal    |     2,954 |     2,737 |      1.079× |          1.035× |        +4.2% |
| node/stream | preloaded |    10,167 |     5,092 |      1.997× |          1.958× |        +2.0% |
| node/stream | normal    |     2,797 |     2,161 |      1.294× |          1.300× |        -0.5% |
| bun/string  | preloaded |     9,999 |     9,407 |      1.063× |          1.028× |        +3.4% |
| bun/string  | normal    |     4,158 |     4,169 |      0.997× |          1.002× |        -0.5% |
| bun/stream  | preloaded |     6,999 |     7,578 |      0.924× |          0.938× |        -1.5% |
| bun/stream  | normal    |     3,866 |     4,091 |      0.945× |          0.976× |        -3.2% |

## Browser experience

Each cell is mean / p50 / p95 / p99. Latency and memory: lower is better.

| Metric                   | Unit |                             Exact |                             React |                         SvelteKit |                              Nuxt |                    TanStack Start |
| ------------------------ | ---- | --------------------------------: | --------------------------------: | --------------------------------: | --------------------------------: | --------------------------------: |
| Navigation completion    | ms   | 25.650 / 23.900 / 34.500 / 43.400 | 38.590 / 37.100 / 48.500 / 53.800 | 25.217 / 23.900 / 39.300 / 41.700 | 38.940 / 36.900 / 58.800 / 61.400 | 56.757 / 54.300 / 68.900 / 71.500 |
| First contentful paint   | ms   | 50.533 / 48.000 / 68.000 / 76.000 | 50.533 / 48.000 / 68.000 / 68.000 | 51.867 / 48.000 / 72.000 / 76.000 | 52.933 / 48.000 / 72.000 / 72.000 | 52.000 / 48.000 / 64.000 / 68.000 |
| Optimistic feedback      | ms   |     1.910 / 1.700 / 2.800 / 2.900 |     1.790 / 1.600 / 3.000 / 3.700 |     1.687 / 1.600 / 2.400 / 2.500 |     1.367 / 1.200 / 2.000 / 3.400 |     1.773 / 1.600 / 2.600 / 3.500 |
| Authoritative settlement | ms   | 13.230 / 13.400 / 14.300 / 17.500 | 12.827 / 12.900 / 13.800 / 14.500 | 12.930 / 12.900 / 14.200 / 16.600 | 13.447 / 13.300 / 15.500 / 18.700 | 13.283 / 13.400 / 14.200 / 14.600 |
| Warm browser used heap   | MB   |     2.523 / 2.524 / 2.524 / 2.524 |     2.301 / 2.302 / 2.302 / 2.302 |     2.073 / 2.074 / 2.074 / 2.074 |     2.327 / 2.327 / 2.327 / 2.327 |     2.758 / 2.757 / 2.764 / 2.766 |

## SSR completion tails

Completion of a 16-request wave, including data loading. Cells are mean / p95 / p99 milliseconds.

| Runtime/API |                Exact |                React |             SvelteKit |                  Nuxt |        TanStack Start |
| ----------- | -------------------: | -------------------: | --------------------: | --------------------: | --------------------: |
| node/string |  7.60 / 9.84 / 19.38 |  6.71 / 9.23 / 12.18 | 10.46 / 14.43 / 21.33 | 14.26 / 19.63 / 32.93 | 12.04 / 16.12 / 22.65 |
| bun/string  |  5.25 / 6.95 / 15.69 |   5.08 / 6.84 / 8.22 |   5.83 / 8.15 / 14.98 |  9.44 / 14.49 / 21.50 |  7.80 / 11.74 / 14.39 |
| node/stream | 8.39 / 11.67 / 19.09 | 8.70 / 11.99 / 18.15 |           unavailable |           unavailable | 13.18 / 17.56 / 28.48 |
| bun/stream  |  5.27 / 7.42 / 11.93 |  5.19 / 7.10 / 10.95 |           unavailable |           unavailable |  9.36 / 14.18 / 21.12 |

## Scheduled offered load

Errors, drain time, and missed arrivals remain part of the reported results.

| Runtime/API | Framework | Offered RPS | Valid RPS, populations | Request errors | Missed arrivals |
| ----------- | --------- | ----------: | ---------------------: | -------------: | --------------: |
| node/string | exact     |       8,000 |          7,993 / 7,999 |              0 |              67 |
| node/string | exact     |      10,000 |          9,927 / 9,929 |              0 |            2870 |
| node/string | react     |       8,000 |          7,996 / 7,992 |              0 |             104 |
| node/string | react     |      10,000 |          9,466 / 9,660 |              0 |           16595 |
| node/stream | exact     |       8,000 |          7,957 / 7,954 |              0 |            1764 |
| node/stream | exact     |      10,000 |          8,646 / 8,755 |              0 |           51212 |
| node/stream | react     |       8,000 |          4,717 / 4,751 |            545 |          128796 |
| node/stream | react     |      10,000 |          4,867 / 4,783 |            195 |          205855 |
| bun/string  | exact     |       8,000 |          7,991 / 7,993 |              0 |              89 |
| bun/string  | exact     |      10,000 |          8,991 / 8,950 |              0 |           40381 |
| bun/string  | react     |       8,000 |          7,999 / 7,999 |              0 |              11 |
| bun/string  | react     |      10,000 |          8,794 / 8,937 |              0 |           44500 |
| bun/stream  | exact     |       8,000 |          6,574 / 6,518 |              0 |           57248 |
| bun/stream  | exact     |      10,000 |          6,561 / 6,581 |              0 |          135850 |
| bun/stream  | react     |       8,000 |          6,927 / 6,950 |              0 |           41444 |
| bun/stream  | react     |      10,000 |          6,869 / 6,926 |              0 |          123202 |

Total request errors across capacity stages, including warmup: 740. Invalid responses: 0.

## Correctness and evidence

Both runtimes passed 39 string and 25 streaming browser contracts before timing. The native track passed all 12 contracts. Native timing, startup CPU profiles, allocation captures, heap composition, raw response samples, and per-driver results remain separate evidence.

The [structured results](correctness-followup-2026-09-20.json) retains measured comparisons and capture metadata.
Bulk raw captures and build archives are not retained; see the [retention policy](benchmark-retention.md).

## Interpretation and older reference

Results after the latest correctness fixes do not show a uniform throughput change. Against the preceding capture, four c32 eXact/React ratios improve and four decline. These ratios are the requested control-normalized performance measure; they do not independently establish which code or host behavior caused a change. No optimization was made during this measurement run.

Node eXact and React server entry artifacts, the server package, and the Node adapter are byte-identical to the preceding capture. On Bun, the eXact server entry changed to supply the required empty response body; React, the server package, and the Bun adapter remain identical. Therefore Node differences cannot be attributed to changed measured server code. The small Bun streaming declines require a controlled paired experiment before attributing them to the body field.

The older [September 19 recovery capture](wsl-recovery-final-2026-09-19.md) remains the performance reference below. These gaps remain unresolved; this publication does not claim full recovery.

| Runtime/API | Loading   | September 19 ratio | Current ratio change |
| ----------- | --------- | -----------------: | -------------------: |
| node/string | preloaded |             1.285× |               -13.0% |
| node/string | normal    |             1.282× |               -15.8% |
| node/stream | preloaded |             2.759× |               -27.6% |
| node/stream | normal    |             1.408× |                -8.1% |
| bun/string  | preloaded |             1.137× |                -6.5% |
| bun/string  | normal    |             1.035× |                -3.7% |
| bun/stream  | preloaded |             0.982× |                -6.0% |
| bun/stream  | normal    |             0.976× |                -3.1% |

Bun preloaded string throughput is 10,095 RPS at c64 and 9,743 RPS at c128, a 3.5% decline. This run does not reproduce the earlier sharp concurrency-128 drop, but does not establish its underlying cause.

eXact FCP is 50.53 ms mean / 48 ms p50, versus 51.47 / 48 ms in the preceding capture. All five controlled frameworks have 48 ms p50 in this run with the shared presentation workload. Earlier styling-mismatched captures remain unsuitable for isolating framework paint overhead.

All 740 request errors in the sustained matrix occurred in React Node streaming scheduled-load stages: 545 at 8,000 offered RPS and 195 at 10,000. All other capacity stages had zero request errors; invalid responses were zero. Missed arrivals are retained separately.

An earlier observation of five pixels of horizontal overflow on the Tasks documentation page at a 390-pixel viewport remains outside this benchmark work.
