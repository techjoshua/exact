# Sustained SSR throughput measurement — 2026-09-06

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

This capture changes the measurement harness, not the framework runtime. Sustained c32 aggregate RPS
replaces finite c16 wave RPS as the public capacity headline. The finite population remains available
as 16-request burst completion time. Main capacity windows target 500 ms; attribution windows retain
their separately recorded 100 ms target.

The [keyed-boundary full comparison](framework-comparison-keyed-2026-09-06.md) now supplies the public
chart values using this same measurement contract. This original baseline remains preserved below.

## Measurement contract

- Each closed-loop worker replaces a completed request until the target deadline, then drains its
  outstanding request. Both completed request counts and actual elapsed times include that final drain.
- Aggregate throughput is `sum(completed requests) / sum(actual elapsed seconds)`. Arithmetic mean,
  P50, P75, P95, and P99 describe individual window rates and remain separate statistics.
- Response hashing and semantic validation happen after each interval's timer stops. Every response
  is still checked. Bodies remain buffered in the client until validation; their allocation, buffering,
  and possible GC effects during load remain part of this local benchmark's limitations.
- This is local closed-loop capacity with client, controlled service, and servers sharing the machine.
  It does not estimate latency under fixed external arrivals or remove shared-machine contention.
- Raw evidence identifies `deferred-validation-aggregate-v2`. Earlier rates included validation work
  in the replacement loop and are not directly comparable. Do not label the changed rates a runtime
  optimization or normalize v1 into v2.

## Window-duration study

Four fresh Node worker populations each ran five balanced rounds across all five frameworks, both
c16 and c32, and 100, 250, 500, and 1000 ms windows. Framework, duration, and concurrency order were
balanced; every ordered window is retained. Each framework received a discarded two-second c32 prime
in each fresh population. All responses passed stable-content validation.

Aggregate c32 RPS across all four populations:

| Framework      |  100 ms |  250 ms |  500 ms | 1000 ms |
| -------------- | ------: | ------: | ------: | ------: |
| eXact          | 2,181.0 | 2,361.1 | 2,353.7 | 2,356.8 |
| React          | 2,252.9 | 2,381.6 | 2,349.7 | 2,379.3 |
| SvelteKit      | 1,493.2 | 1,521.9 | 1,471.3 | 1,474.1 |
| Nuxt           | 1,054.9 | 1,091.1 | 1,091.3 | 1,085.7 |
| TanStack Start | 1,180.0 | 1,200.2 | 1,140.8 | 1,180.5 |

The 100 ms aggregate is about 7.5% lower than the 1000 ms aggregate for eXact and 5.3% lower for
React. The 500 and 1000 ms eXact results differ by 0.13%; React differs by 1.24%. Longer intervals
do not remove all shared-machine variation: TanStack Start differs by 3.37% between those durations.
500 ms reduces the relative contribution of ramp and final drain while preserving reasonably close
framework interleaving. This is a duration choice supported by this workload, not a claim of a universal
noise-free window size.

For eXact at c32, mean elapsed time beyond the target was 9.28 ms with 100 ms windows and 8.58 ms
with 500 ms windows. The deadline overrun and final drain therefore occupied about 9.3% versus 1.7%
of the target duration. Those elapsed times remain included in both the archived windows and aggregate RPS.

Fresh-population variation remains visible at c32 with 500 ms windows (five windows per population):

| Population | eXact aggregate RPS | React aggregate RPS | React relative to eXact |
| ---------- | ------------------: | ------------------: | ----------------------: |
| 1          |             2,220.9 |             2,424.5 |                  +9.17% |
| 2          |             2,391.4 |             2,391.4 |                  +0.00% |
| 3          |             2,366.7 |             2,223.2 |                  -6.06% |
| 4          |             2,435.9 |             2,360.5 |                  -3.09% |

The complete 50-window Node capture measured eXact at 2,316.2 aggregate RPS and React at 2,475.2,
a 6.86% React lead within that capture. The fresh-population results do not support treating that
margin as invariant. No population is discarded or substituted with the most favorable result.

Reproduce the study with existing production builds:

```sh
node framework-comparison/src/measure-ssr-window-sensitivity.mjs
```

## Publication

The completed Node comparison reports:

| Framework      | c32 aggregate RPS | Mean 16-request burst (ms) | Mean sequential response (ms) |
| -------------- | ----------------: | -------------------------: | ----------------------------: |
| eXact          |           2,316.2 |                      10.45 |                          1.32 |
| React          |           2,475.2 |                       7.95 |                          1.22 |
| SvelteKit      |           1,617.1 |                      11.31 |                          1.60 |
| Nuxt           |           1,142.5 |                      15.61 |                          2.16 |
| TanStack Start |           1,227.1 |                      14.60 |                          2.08 |

Archived evidence (local capture: `ssr-throughput-v2-2026-09-06.json`) retains window accounting, burst samples,
request summaries, all duration-study populations, artifact identities, and the full raw source hash.
The complete metric ledger (local generated table: `ssr-throughput-v2-2026-09-06-metrics.md`) includes Node and Bun diagnostics.

The complete comparison uses 50 balanced capacity windows per concurrency level (1, 4, 8, 16, 32, 64)
in Node and Bun, plus the existing sequential, finite burst, startup, retention, and attribution lanes.
Bun remains diagnostic: eXact uses native Fetch hosting while other participants use Node HTTP
compatibility, so those rates do not represent identical transport boundaries.
Browser and heap evidence retain their earlier independent capture and provenance. The public report
refresh helper recomputes aggregate rates and window statistics from raw counts and elapsed times,
rejecting inconsistent accounting. It preserves the browser charts when replacing server results.
The compact public report uses schema version 2 with explicit `sustained` and `burst` charts;
the publisher continues to accept historical schema version 1 artifacts.

All Node and Bun production artifact hashes match the preceding full capture; the duration study
used the same Node artifacts. Validation passed: 35 shared browser acceptance checks, 70 comparison
and report tests, 89 build-script tests, JSDoc checks, docs type checking and production build.
Desktop and mobile browser verification matched all nine distribution tables against published data
and reported no page errors. All benchmark workers were closed after collection.

```sh
npm run measure:ssr -w @exactjs/framework-comparison-suite
node scripts/component-local-target-abi/refresh-docs-ssr-report.mjs previous-report.json raw-ssr.json compact-report.json
node scripts/component-local-target-abi/publish-docs-performance-report.mjs compact-report.json
```
