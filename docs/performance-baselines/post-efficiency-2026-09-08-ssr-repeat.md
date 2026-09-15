# SSR follow-up, September 8, 2026

The remaining SSR benchmarks completed successfully after the separate Node arrival-rate repeat. All fixed-concurrency, normal-loading, and scheduled-arrival captures have zero request errors, including warmups. The five-framework Node and Bun diagnostic capture is complete and publishable. Original captures remain available; this follow-up was run once without changing the workloads to obtain a preferred result.

## Conditions and validation

Node 26.8.1 and Bun 1.4.2 used the previous workload settings. Capacity captures use two independent Node load drivers, two reversed process populations, ten-second warmups, fifteen-second preloaded stages, and twenty-second normal-loading and arrival stages. The Node arrival repeat began at 16:00 UTC; the remaining suites ran sequentially from 16:35 UTC. The diagnostic capture uses 500 sequential requests, 500 bursts of sixteen requests, 100 warmups, five startup samples, and five retained-memory batches per framework and runtime.

Recorded artifact identities match the original captures for all seven sources. Capacity response identities, request accounting, and artifact stability passed validation. Diagnostics retained stable responses for all five frameworks on both runtimes. No rebuild or source change was introduced for this repeat. The previous correctness run applies to those unchanged artifacts; correctness was not independently rerun.

The load drivers and servers share the same Windows workstation. Pre-existing development and desktop processes were left running, and background workload was not measured. These are repeat measurements, not a controlled explanation of historical differences.

## Preloaded sustained capacity

Valid RPS aggregates valid responses over the union of simultaneous driver stage spans, including drain, across both populations. Ratios divide eXact throughput by React throughput.

| Runtime | Concurrency | eXact valid RPS | React valid RPS | eXact/React |
| ------- | ----------: | --------------: | --------------: | ----------: |
| node    |          16 |           11151 |           11221 |       0.994 |
| node    |          32 |           10380 |           10895 |       0.953 |
| node    |          64 |           10172 |           10951 |       0.929 |
| node    |         128 |            9719 |           10373 |       0.937 |
| bun     |          16 |            9695 |            6422 |       1.510 |
| bun     |          32 |            9616 |            6336 |       1.518 |
| bun     |          64 |            9371 |            6170 |       1.519 |
| bun     |         128 |            9228 |            6037 |       1.529 |

In this repeat, Node eXact throughput is 0.6?7.1% below React across the preloaded concurrency points. Bun eXact throughput is 51?53% above React. Node ratios changed from the original capture despite matching artifacts; the captures do not isolate the cause.

## Normal loading at concurrency 32

| Runtime | eXact valid RPS | React valid RPS |
| ------- | --------------: | --------------: |
| node    |            2838 |            2878 |
| bun     |            4350 |            4300 |

## Scheduled arrivals

Request errors are zero throughout. Capacity misses are offered requests that the drivers did not start because their in-flight limit was reached. Deadline misses are also retained in the summary and raw evidence. Zero request errors does not mean all offered demand was served.

| Runtime | Framework | Offered RPS | Valid RPS | Capacity misses |
| ------- | --------- | ----------: | --------: | --------------: |
| node    | eXact     |        8000 |      7996 |           0.00% |
| node    | eXact     |       10000 |      9785 |           1.89% |
| node    | React     |        8000 |      7997 |           0.00% |
| node    | React     |       10000 |      9946 |           0.49% |
| bun     | eXact     |        8000 |      7977 |           0.13% |
| bun     | eXact     |       10000 |      8203 |          17.72% |
| bun     | React     |        8000 |      6223 |          21.90% |
| bun     | React     |       10000 |      6187 |          37.87% |

## Latency, startup, and memory diagnostics

The table includes all five frameworks. Burst latency is per-request completion time within sixteen-request bursts. Heap values are mean post-GC heap across the initial and five subsequent checkpoints, in decimal MB. The short retained-heap slope is diagnostic and does not establish or rule out a leak. Short-window diagnostic throughput is not substituted for sustained capacity.

| Runtime | Framework      | Sequential mean ms | Burst request mean ms | Startup mean ms | Post-GC heap MB | Heap slope B/request |
| ------- | -------------- | -----------------: | --------------------: | --------------: | --------------: | -------------------: |
| node    | sveltekit      |             15.173 |                 7.738 |          231.94 |          15.452 |              2656.73 |
| node    | react          |             14.559 |                 8.385 |          248.97 |          14.233 |              1993.92 |
| node    | exact          |             14.608 |                 7.720 |          224.41 |          13.833 |              1836.66 |
| node    | tanstack-start |             15.125 |                 9.592 |          231.92 |          18.183 |              3636.14 |
| node    | nuxt           |             14.636 |                12.114 |          225.00 |          18.959 |              2194.11 |
| bun     | nuxt           |              1.304 |                 7.380 |           71.53 |          11.122 |              2563.50 |
| bun     | sveltekit      |              0.836 |                 4.556 |           77.93 |           5.461 |              1293.48 |
| bun     | react          |              0.683 |                 4.346 |           71.87 |           4.175 |               981.57 |
| bun     | exact          |              0.648 |                 4.330 |           67.59 |           3.933 |              1240.51 |
| bun     | tanstack-start |              1.276 |                 5.925 |           66.96 |           8.710 |              2999.59 |

All benchmark-owned processes exited after the run; the pre-existing development processes remained running.

## Evidence

The public Performance charts still refer to the original full refresh. This report records the SSR follow-up separately, including the earlier Node arrival repeat.

[Summary, execution record, and source hashes](post-efficiency-2026-09-08-ssr-repeat-summary.json)

- [node-multi](post-efficiency-2026-09-08-node-multi-repeat.json)
- [node-normal](post-efficiency-2026-09-08-node-normal-repeat.json)
- [node-arrivals](post-efficiency-2026-09-08-node-arrivals-repeat.json)
- [bun-multi](post-efficiency-2026-09-08-bun-multi-repeat.json)
- [bun-normal](post-efficiency-2026-09-08-bun-normal-repeat.json)
- [bun-arrivals](post-efficiency-2026-09-08-bun-arrivals-repeat.json)
- [ssr](post-efficiency-2026-09-08-ssr-repeat.json)
