# Sustained SSR load comparison — September 6, 2026

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

The independent-process load runner puts current eXact near React on this fixture. Current eXact
improved aggregate fixed-concurrency throughput by 2.9% over the frozen old build. Its 0.9% aggregate
lead over React does not establish a consistent win: their order changed between process populations.
Under scheduled pressure, bypassing per-request data loading removed the large latency queue in both
frameworks, and restoring normal loading brought it back.

The raw archive (local capture: `sustained-ssr-load-2026-09-06.json`) includes complete time series, plans, artifact
identities, exact measured harness sources, the calibration pilot, analysis, and the follow-up
ablation. See the [runner guide](../ssr-load-testing.md) for commands and measurement contracts.
The capture began September 6 in the workstation's Pacific timezone; JSON timestamps use UTC.

## Method

Node 24.11.1 ran on Windows with an AMD Ryzen 7 8745HS. Driver, controlled data service, and framework
workers owned separate processes on the same workstation. Two fresh process populations used reversed
participant blocks: old eXact → current eXact → React, then React → current eXact → old eXact.
Only one participant received load at a time; other participant workers remained resident.

Each block used 60 seconds of discarded c32 warmup, 120 seconds at concurrency 32, a discarded
15-second ramp to 1,500 arrivals/second, 120 seconds at that rate, another discarded 15-second ramp,
and 120 seconds at 2,500 arrivals/second. Total main-run time was approximately 45 minutes. The pilot
selected the upper rate and is not pooled into these results. The admission cap was 512 outstanding
requests, the scheduling-lag limit 50 ms, and the absolute request timeout 10 seconds.

Old and current eXact used frozen server entries of 244,801 and 255,783 bytes respectively. The old
entry is the earlier gap audit's verified baseline. React and shared runtime artifacts were held
fixed. Entry hashes remained unchanged through measurement. No framework implementation changed
during this experiment; this work adds measurement tooling.

## Main results

Valid throughput below is total valid responses divided by total elapsed time, including draining
admitted requests. Latency ranges show the two population p99 values, not a pooled percentile.

| Measurement                       |      Old eXact |  Current eXact |          React |
| --------------------------------- | -------------: | -------------: | -------------: |
| Concurrency 32 valid RPS          |          2,755 |          2,834 |          2,810 |
| Concurrency 32 response p99, ms   |    17.42–17.81 |    17.25–17.60 |    16.93–17.12 |
| 1,500 arrivals/s valid RPS        |       1,499.94 |       1,499.86 |       1,499.87 |
| 1,500 arrivals/s response p99, ms |    11.62–11.64 |    11.06–11.43 |    10.67–11.16 |
| 2,500 arrivals/s valid RPS        |          2,394 |          2,455 |          2,399 |
| 2,500 arrivals/s response p99, ms |  230.66–232.06 |  219.78–227.33 |  228.35–235.65 |
| 2,500 arrivals/s capacity misses  | 24,616 (4.10%) | 10,093 (1.68%) | 23,530 (3.92%) |

The c32 populations individually measured old eXact at 2,723/2,787 RPS, current eXact at
2,814/2,853 RPS, and React at 2,822/2,797 RPS. Current eXact leads old eXact in both populations;
the current/React ordering is mixed.

At 1,500 arrivals/s there were no capacity or scheduling-lag misses. Strict stage-deadline misses
were 0/23/8 for old/current/React. Old eXact had one request error in the second population;
the archive records neither a timeout nor an invalid response for it, and does not retain its
transport-error subtype. Current eXact and React had no request errors. No response-integrity
mismatches were observed.

At 2,500 arrivals/s all participants reached the admission cap. Capacity misses are requests the
driver did not send because that cap was full; they are not failed server responses. Additional
stage-deadline misses were 4/10/2 respectively, with no scheduling-lag misses or request errors.

The driver also contributes latency. At 1,500 arrivals/s its scheduling-lag p99 was approximately
14 ms, and intended-arrival-to-completion p99 approximately 19 ms. Those delays should not be
attributed entirely to framework execution. Request-only latency in the table starts at dispatch.
Percentiles cannot be added or subtracted to decompose individual requests.

## Where the queue develops

At the upper rate, driver CPU was approximately 37–40% of one core, service CPU 65–66%, and worker
process CPU 114–117%. Process CPU can exceed one core because it includes parallel runtime work.
It is not a direct measure of JavaScript main-thread utilization.

Worker telemetry showed mean data-loading elapsed spans of roughly 99–105 ms under pressure.
These spans include fetching, decoding, and client-side handling; they are not service CPU time.
The eXact render span was roughly 0.09–0.11 ms. React's render span has a different scope, so a
direct ratio between those internal render timers would be misleading.

A separate same-worker check alternated normal and preloaded requests at 2,500 arrivals/s. Current
eXact used normal/preloaded/preloaded/normal; React used preloaded/normal/normal/preloaded. Each
block had five seconds of warmup and 20 seconds of measured arrivals. The same compiled renderer
produced identical response bytes and hashes in both conditions for each framework.

| Condition                  | Current eXact response p99 | React response p99 |
| -------------------------- | -------------------------: | -----------------: |
| Normal per-request loading |           223.74–227.71 ms |   233.34–235.39 ms |
| Preloaded fixture data     |               4.38–4.55 ms |       4.45–4.52 ms |

Preloaded blocks had zero capacity misses and approximately 2,499 valid RPS. Normal blocks again
developed capacity misses and long queues. This controlled reversal implicates the per-request
data-loading path in the pressure behavior. Preloading also reuses decoded fixture data, so it
does not isolate networking, fetch pooling, decoding, allocation, or scheduling individually.
Those are the next boundaries to measure before choosing another renderer optimization.

## Interpretation and validation

This is stronger evidence about behavior under sustained load than the earlier short-window
comparison. It does not identify every cause of the historical React gap. Two populations on a
shared workstation cannot establish a universal ranking, and the changed warmup, instrumentation,
and service topology prevent treating differences from old chart RPS as runtime improvements.
The public five-framework charts retain their complete capture and now explain that this diagnostic
uses a separate protocol.

Validation passed: 69 comparison tests, targeted lint and formatting, docs type checking/build,
rendered desktop/mobile docs checks, default-entry environment isolation, and legacy Bun SSR smoke
coverage. Accounting identities and interval totals reconcile; no telemetry sampling errors occurred.
The archive preserves the one observed old-build request error. Post-capture hardening isolates
coordinator execution flags from child processes, makes default entry selection explicit, and labels
progress output as interval RPS. The measured invocation already used empty execution flags and
explicit entries; its captured hot path is unchanged.
