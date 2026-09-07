# Post-restart benchmark refresh � September 7, 2026

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

The user restarted the benchmark PC before this capture. Windows reports boot time
2026-09-07T17:23:39.5000000Z; the sequential measurement run began at
2026-09-07T17:29:04.7344932Z. Production builds and all 35 shared correctness checks passed before
measurement. No task-owned build, test, or unrelated profiler ran concurrently with timed samples.
A reboot reduces some potential background interference; it does not establish an otherwise idle
host or make small differences causal.

## Method and publication

The framework implementation was unchanged during this refresh. Browser timing uses 50 balanced
rounds per framework, plus one discarded round; heap composition uses 10 separate snapshots per
framework, plus one discarded round. Frozen production HTML and assets are served over common HTTP
with framework servers stopped and live API/SSE behavior retained. Fresh cache-disabled contexts
share a warm Chromium process. Startup profiling records 30 samples per framework at each of
1x, 4x and 6x CPU throttling. Client resource hashes match across all three captures.

All five frameworks have 500 warm sequential requests and 500 sixteen-request bursts, with 100
warmup requests and the same capacity priming as the previous diagnostic capture. Server memory
and response payload diagnostics were also refreshed. Descriptive P99 values from finite samples
should not be interpreted as guaranteed tail bounds.

Sustained HTTP capacity retains the existing eXact/React protocol: two independent driver processes,
ten seconds warmup, and two fresh process populations with reversed framework order. The preloaded
sweep measures 15 seconds per stage at total concurrency 16, 32, 64 and 128. Normal loading measures
20 seconds at concurrency 32. Scheduled arrivals measure 20 seconds at 8,000 and 10,000 offered
requests/second. Published RPS aggregates valid responses over simultaneous driver spans, including
final drain; short-window RPS diagnostics are not substituted for capacity results.

All browser, heap, sequential, burst, server-memory, payload and capacity charts initially used this refresh.
Scheduled-arrival charts were subsequently updated to the first same-plan rerun documented in the
[error investigation](arrival-errors-2026-09-07.md). The preloaded concurrency curve was later
updated in the [concurrency refresh](concurrency-refresh-2026-09-07.md); the remaining chart groups
retain this capture.
Startup evidence is archived separately; the public page does not display a startup CPU chart.

## Browser means

| Framework      | Navigation ms | FCP ms | Optimistic ms | Settlement ms | Retained JS heap MB |
| -------------- | ------------: | -----: | ------------: | ------------: | ------------------: |
| Exact          |        31.886 | 47.120 |         2.016 |        13.322 |               2.488 |
| React          |        39.994 | 49.920 |         1.982 |        12.630 |               2.303 |
| SvelteKit      |        32.094 | 44.080 |         1.654 |        13.418 |               2.078 |
| Nuxt           |        43.106 | 48.320 |         1.224 |        13.470 |               2.334 |
| TanStack Start |        54.226 | 45.520 |         2.238 |        13.012 |               2.759 |

## Comparison with the previous published capture

These are separate runs, not interleaved before/after optimization measurements. The code did not
change, so differences must not be credited to a new framework optimization.

| eXact metric                | Previous | Post-restart |
| --------------------------- | -------: | -----------: |
| Navigation completion       |   30.886 |       31.886 |
| First contentful paint      |   44.560 |       47.120 |
| Optimistic feedback         |    1.862 |        2.016 |
| Authoritative settlement    |   13.590 |       13.322 |
| Warm browser used heap      |    2.488 |        2.488 |
| Best measured preloaded RPS |     9410 |         7200 |

React's best measured preloaded rate is 6703 RPS.
Each curve's peak is the best measured concurrency in this sweep, not a universal throughput limit.
Request errors, offered-demand misses and per-population latency ranges remain visible in the raw
capacity evidence and the public tables.

## Evidence and validation

The final eXact arrival population recorded 124 non-timeout request failures during the first
second of the 8,000 offered-RPS stage. There were no invalid responses. Across both populations,
these failures represent 0.049% of completed attempts at that offered rate. The driver used for
this capture did not retain individual transport error codes, so the root cause is unresolved. The original capture
is preserved in the historical archive. The public scheduled-arrival chart now uses the subsequent
same-plan rerun described above. All other capacity stages in this original capture had
zero request errors.

The subsequent [error investigation](arrival-errors-2026-09-07.md) adds bounded error diagnostics
and fixes Node adapter reporting gaps. It does not establish the historical failures' cause.

The publisher previously rejected every capture with errors. It now explicitly admits errors
only for scheduled arrivals, publishes their counts and percentages, and continues to compute
throughput from valid responses only. Incomplete evidence, inconsistent accounting, mismatched
identities and artifacts, and errors in concurrency captures remain publication failures.
This reporting change does not modify the driver or timed workload.

| Node metric                      |   eXact mean / P99 |  React mean / P99 |
| -------------------------------- | -----------------: | ----------------: |
| Warm sequential response         |   1.401 / 2.640 ms |  1.423 / 2.916 ms |
| Sixteen-request burst completion | 11.040 / 18.889 ms | 9.517 / 15.196 ms |

Capture manifest, reboot context, commands and source hashes (local capture: `post-restart-2026-09-07.json`)
links the raw browser, heap, SSR diagnostics, startup, preloaded, normal-loading and arrival captures.
Historical captures remain unchanged. Public publishers validate completeness, ordering, response
identity, accounting and artifact compatibility before publication.

Validation passed: all 35 shared correctness checks; nine publication checks, including explicit
arrival-error accounting and continued rejection of errors in concurrency captures; targeted lint;
docs type checking and standalone production build. Desktop and mobile verification checks eight
distribution tables, five heap rows, all capacity tables and the new error column against the
published JSON, with no page errors or page-level horizontal overflow. All task-owned benchmark
and verification listeners are closed. The refreshed documentation is local, not deployed.
