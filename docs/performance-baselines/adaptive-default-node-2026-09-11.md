# Automatic Node admission, September 11, 2026

Accepted for the initial 0.5.0 release. Node adapter handlers enable adaptive admission by default.
Native Bun retains immediate admission. There is one SSR engine and no response sharing.
`createNodeHandler(callback)` wraps a custom page/application handler before eager string or
streaming rendering. `createExactNodeHandler(context)` applies the same policy to framework
endpoints. An outer handler owns admission when it dispatches to another Node handler.

## Decision signal

Four closely spaced requests start an unreferenced event-loop monitor. Sparse requests create
no monitor, timer, or scheduling promise. Sustained lag triggers a brief scheduling trial.
The controller compares completed-response capacity and event-loop delay with immediate windows
before and after the trial. Retention requires higher capacity and lower lag than both controls,
with at least 100 completions in each compared window. Failed trials back off; successful trials
are reconsidered after five seconds or sooner when their observed benefit disappears.

Server handler duration is not client latency. An earlier candidate incorrectly compared handler
p95/p99: immediate work measured around 0.1 ms inside the handler while deferred work measured
around 1.7 ms, despite better client throughput and latency. Requests can wait in networking
queues before Node invokes the handler. That candidate was rejected and its diagnostic run
intentionally interrupted. Interruption errors are not framework failures.

The initial lag-only controller also accepted some large-document cases with worse response tails.
A subsequent candidate used the mean surrounding capacity; the final controller requires beating
both controls to reduce sensitivity to changing PC load. Client p95/p99 remain external validation
metrics. Neither event-loop delay nor server completion rate proves a universal tail-latency gain.
Trials can briefly be slower before the controller backs off.

## One-host workload changes

One process served 3, then 96, then 3 incident rows. eXact used the actual default Node handler
throughout, without recreating its controller between document changes. Two independent drivers
used total concurrency 32 for small documents and 128 for large ones. eXact stages lasted 20 seconds;
unchanged React controls lasted 8 seconds. Participant order reversed between rendering modes.
Every response was checked against the complete document hash. All measured requests succeeded.

| Framework | API    | Rows | Valid RPS | Driver p95 ms   | Driver p99 ms   |
| --------- | ------ | ---: | --------: | --------------- | --------------- |
| eXact     | string |    3 |      9275 | 6.69 / 6.69     | 12.32 / 11.60   |
| eXact     | string |   96 |      2531 | 61.02 / 61.12   | 66.43 / 66.81   |
| eXact     | string |    3 |      9423 | 6.70 / 6.52     | 11.46 / 7.75    |
| React     | string |    3 |      7558 | 6.90 / 6.91     | 10.09 / 10.26   |
| React     | string |   96 |      2687 | 58.49 / 58.34   | 63.90 / 63.62   |
| React     | string |    3 |      7535 | 6.92 / 6.76     | 11.18 / 8.11    |
| React     | stream |    3 |      3336 | 13.62 / 13.54   | 16.30 / 15.72   |
| React     | stream |   96 |      1172 | 126.27 / 126.27 | 131.84 / 131.58 |
| React     | stream |    3 |      3396 | 12.76 / 12.78   | 14.82 / 14.93   |
| eXact     | stream |    3 |      6795 | 8.65 / 8.65     | 13.05 / 12.57   |
| eXact     | stream |   96 |      1578 | 118.14 / 118.27 | 126.72 / 126.33 |
| eXact     | stream |    3 |      6737 | 8.91 / 8.92     | 11.89 / 11.94   |

The policy trace shows scheduling retained for small string documents, rejected during the large
string phase, and retained again after returning to small documents. Streaming reconsidered the
changed workload and recovered when small documents returned. After an idle interval, twelve
requests spaced 500 ms apart made zero yield calls in both modes.

Small-document throughput exceeds React here. Large-string throughput remains below React;
p99 is mixed and is not described as a universal improvement. PC usage varied across captures.
Use adjacent controls, not historical absolute rates, to interpret changes.

The trace instrumented the private controller once per sampling callback; this is diagnostic
instrumentation, not a public API or the final capacity harness. Source and compiled adapter
snapshots with hashes are retained with the capture. A fixture-only const-assignment error was
corrected before the completed run; its failed preflight is retained separately.

See [SSR and hydration](../ssr-hydration.md) for the public contract and the
[final full capture](ssr-completion-2026-09-11.md) for sustained default-policy capacity.
The [evidence archive](adaptive-default-node-2026-09-11-evidence.zip) preserves the candidate
captures, source snapshots, transition traces, and validation logs.
The older lag-only and mean-control captures are historical
experiments, not descriptions of the shipped controller.
