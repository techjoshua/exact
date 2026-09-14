# SSR throughput investigation, September 8, 2026

Status: investigation complete. No production runtime candidate is adopted. The markerless renderer
and its optimized scalar writer remain unchanged. Public aggregate benchmark charts are unchanged.

This follows the [forced-build audit](ssr-fresh-build-2026-09-08.md). All experiments use the verified
markerless comparison artifact and unchanged React artifact. Node 26.8.1 runs both HTTP servers.
Builds, tests, and other timing experiments do not overlap measurements. Other workstation activity
is uncontrolled.

## Findings

The isolated renderer advantage does not establish the same advantage inside an HTTP request.
Fresh stack samples still show hydration publication offsetting most of the HTML-rendering gain.
Response ownership and adapter work add another smaller cost. Removing that layer in a diagnostic
has a repeatable benefit in alternating measurements, but its size is considerably smaller than
the initial separate-process captures suggested.

There is no separate eXact HTTP parser in this workload. The benchmark host dispatches both
participants through the same Node request handling. Its eXact branch creates a produced response
and uses the real Node response adapter; it does not exercise the complete `createExactNodeHandler`
request-context and endpoint-dispatch pipeline. Differences in the sampled input bucket do not
identify a framework parsing defect.

## Fresh profiles

Two populations reverse eXact/React order. Each uses two independent drivers, warmup, then 6,000
offered RPS for ten seconds. The inspector samples at a requested 1 ms interval. The table aggregates
sample deltas per valid request using leaf frames and their call stacks.

| Sampled work                                          | eXact |          React |
| ----------------------------------------------------- | ----: | -------------: |
| HTML rendering, components, escaping, byte accounting | 28.97 |          35.88 |
| Hydration or document-state publication               | 10.33 |           2.66 |
| Response ownership and adapter                        |  2.91 | Not applicable |
| HTTP output and socket work                           | 32.83 |          30.53 |
| HTTP input and dispatch                               | 12.77 |          10.00 |
| Benchmark telemetry                                   |  7.80 |           8.10 |

These are sampled wall-time microseconds per request, not exact CPU timers for each subsystem.
Sampling, preemption, native work, category attribution, and profiling overhead limit precision.
The table is a map for experiments; its rows must not be subtracted to predict exact RPS gains.
In particular, eXact's HTML advantage is about 6.91 sampled units, while its publication excess is
about 7.67. The previously measured isolated render times remain valid for that isolated workload.

The Node adapter currently joins synchronous spans and makes one terminal `response.end()` call.
There is no active buffer pool or per-component socket write to remove. React's fixture commits
headers explicitly and reaches Node's `writev` path; eXact's implicit header path reaches
`writeUtf8String`. That difference warrants measurement, not an assumption that either is superior.

## Contract-preserving candidates

Each HTTP candidate has two fresh populations with reversed order, two drivers, five-second warmup,
and ten-second capacity stages at 32 total concurrency. RPS below uses total valid responses divided
by the union of the two driver stage intervals. The direct-header capture also includes 6,000-RPS
arrival stages.

| Experiment                                                                  | Control RPS | Candidate RPS | Change | Decision                           |
| --------------------------------------------------------------------------- | ----------: | ------------: | -----: | ---------------------------------- |
| Commit produced-response headers directly after successful production       |      10,652 |        10,712 |  +0.6% | Mixed population results; reject   |
| Separate synchronous completion from asynchronous adapter control flow      |      11,398 |        10,929 |  -4.1% | Slower in both populations; reject |
| Pass `Buffer.byteLength` directly instead of an adapter forwarding callback |      10,377 |        10,149 |  -2.2% | Mixed population results; reject   |

The header candidate retains pre-commit production and cleanup failure handling, but changes header
installation timing. No production behavior is changed on the strength of its inconclusive result.
The synchronous candidate retains the response-body claim, cancellation, cleanup, error reporting,
and Promise-returning API. A smaller number of asynchronous operations alone did not help.

A separate construction test grouped the shared lazy body/stream descriptors into one
`Object.defineProperties` call. It preserved enumeration and single-consumer behavior but increased
construction plus consumption time from 0.297 to 0.729 us. It is also rejected.

## Response-layer diagnostic

The diagnostic calls the same `renderParticipantToSink`, assembles the same document, and uses the
same status and headers. It bypasses the produced-response wrapper and Node adapter, including their
failure and cleanup path. It is an upper-bound probe, not a production replacement.

| Separate-process diagnostic                               | Control RPS | Bypass RPS | React RPS |
| --------------------------------------------------------- | ----------: | ---------: | --------: |
| Ordinary telemetry                                        |       9,704 |     11,520 |    10,873 |
| Reduced per-request telemetry, applied to both frameworks |      12,650 |     16,182 |    13,934 |

The apparent gains of 18.7% and 27.9% were too large to attribute solely to object construction.
A focused test with a minimal response sink measured 13.33 us through the real factory/adapter
versus 12.60 us directly. Additional profiles of control/bypass requests did not expose a single
cost matching the large capacity difference. Those observations prompted a more controlled test.

### Alternating paths in one worker

Both eXact paths stay in the same worker, with identical response hashes. React has its own worker.
After warmup, nine rounds rotate and reverse the three participants. Each block lasts three seconds
at 32 total concurrency. Drivers are independently owned and closed after each block. This probe
does not poll worker telemetry during load, although ordinary per-request instrumentation remains.

| Mean valid RPS across nine rounds         | Result |
| ----------------------------------------- | -----: |
| eXact through its normal response adapter | 14,337 |
| eXact diagnostic bypass                   | 15,011 |
| React                                     | 14,524 |

The bypass wins eight of nine rounds and averages 4.7% above the normal eXact path. This is stronger
evidence for a modest response-path opportunity than the much larger separate-process figures.
It does not isolate one function, and it changes process lifetime, block duration, and telemetry
polling relative to the ten-second experiments. Do not claim that it proves the cause of their
variation or replaces the prior public eXact/React throughput ratio.

## What to pursue

1. Preserve one request-scope owner and one terminal write while investigating a cheaper
   platform-specific consumption path for compiler-closed synchronous output. Any candidate must
   retain cancellation, cleanup-before-commit, single consumption, and generic error publication.
   The bypass suggests a modest opportunity; the failed synchronous-control-flow experiment shows
   that merely removing an `async` wrapper is insufficient.
2. Keep hydration publication in the optimization budget. It still offsets the HTML advantage in
   HTTP profiles. Future candidates need a demonstrated reduction in projection, validation, or
   serialization work with identical values and boundary behavior. Removing guarantees or adding
   new scalar encodings is not an established optimization.
3. Use alternating control/candidate blocks alongside independent populations when testing small
   gains. Keep React in the comparison and preserve raw per-population results. A favorable isolated
   render or one process population is insufficient evidence for an HTTP improvement.

## Correctness and evidence

All timed HTTP captures completed with zero request errors and stable response identities. The
header experiment recorded 69 missed admissions, retained separately from completed requests.
The initial profile capture recorded 43 and the control/bypass profile recorded five. The other
capacity-only probes do not measure offered-rate admissions. No cleanup or cancellation guarantees
are weakened in production, and no fresh runtime test suite is claimed for the rejected probes.
All task-owned worker, service, and driver processes are closed after the investigation.

The [summary](ssr-throughput-dive-2026-09-08.json) includes population results, microbenchmark samples,
alternating blocks, aggregate stack attribution, and artifact hashes. The
[evidence archive](ssr-throughput-dive-2026-09-08-evidence.zip) retains raw profiles, raw load reports,
experimental source, the paired renderer artifacts, and an integrity inventory. The runners use
the repository's process owners and load-validation modules.
