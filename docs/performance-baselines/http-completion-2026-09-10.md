# HTTP completion experiments and render intervals, September 10, 2026

Status: diagnostic experiments, no production integration. The hypothesis was that avoiding a
ready buffered-response promise boundary might yield a small whole-request improvement, roughly
0–3%. It was not assumed to explain the entire Node string gap. A separate experiment removes
the benchmark harness's extra asynchronous render-and-response helper without changing the adapter.

## Native Node string HTTP results

Each row is an independent capture. Rates must not be pooled across captures.

| Capture                                     | Current eXact RPS | Candidate RPS | React RPS | Candidate change | Faster pairs |
| ------------------------------------------- | ----------------: | ------------: | --------: | ---------------: | -----------: |
| Ready buffered adapter completion           |             8,390 |         8,322 |    12,619 |            -0.8% |          3/6 |
| Synchronous buffered harness helper         |            10,375 |         8,419 |    13,571 |           -18.9% |          0/6 |
| Same harness change, phase totals collected |             8,535 |         9,815 |    12,220 |           +15.0% |          5/6 |

The adapter candidate keeps header assignment order and the existing buffered-body claim. It
returns synchronously after a successful `end`, with pending production and failure cleanup still
asynchronous. Its caller awaits only actual completion promises. This would change the public
completion/error surface and requires full API and failure-path review before any integration.

The harness candidate leaves `writeNodeResponse` unchanged. It renders through the same timed
entry used by the React branch, then constructs eXact's buffered response synchronously. Both
experiments preserve full HTML and hydration bytes in the measured workload. Ready-request traces
confirm each independently reduces promise resources from 16 to 14. Neither change removes the
response body owner or changes response framing.

The adapter experiment has no established gain. The harness result reverses substantially between
fresh worker populations. The follow-up reads existing cumulative telemetry before and after load
blocks without forcing GC. This adds control requests outside the measured load windows and is
not identical measurement scheduling. The reversal prevents attributing either percentage solely
to the changed await boundary. Fewer promises alone are not sufficient evidence of higher RPS.

## Render intervals under HTTP load

The phase-total capture reports mean elapsed microseconds:

| Interval                                  | Current eXact | Harness candidate | React |
| ----------------------------------------- | ------------: | ----------------: | ----: |
| Render timing wrapper                     |         56.52 |             49.94 | 34.58 |
| Request entry to first response write     |         63.47 |             56.20 | 41.78 |
| Participant entry through response finish |         97.09 |             85.86 | 65.97 |

The first two means differ by approximately seven microseconds for each framework. These are
elapsed intervals, not mutually exclusive CPU buckets. They include promise resumption and any
coincident scheduling or GC. They suggest that the adapter's work after render completion is not
the dominant interval difference in this capture.

A further probe times just the synchronous call into each imported renderer. It uses the same
original harness, adds two clock reads and a constant-space counter per call, and returns the
original renderer result without awaiting or observing its promise. The existing `envelopeMs`
telemetry slot, unused in this Node lane, stores this diagnostic interval.

| Instrumented interval      |    eXact |    React |
| -------------------------- | -------: | -------: |
| Synchronous renderer entry | 45.79 µs | 33.45 µs |
| Full render timing wrapper | 50.08 µs | 35.80 µs |

The synchronous entry includes all work performed before the renderer returns, but eXact's final
`htmlWithHydration` read occurs after an await in its participant entry. The full interval includes
that read and subsequent resumption. The difference largely precedes return from the renderer in
this instrumented capture. This does not establish which rendering function accounts for it.

An uninstrumented eXact control in this capture measured 8,556 RPS versus 9,792 for instrumented
eXact and 11,980 for instrumented React. The instrumentation plus fresh-process/runtime variation
is material. These timings must not be promoted to ordinary throughput or CPU attribution. The
earlier serial in-process byte-counting result, 22.35 µs for eXact and 24.51 for React, remains valid
for its harness but does not predict relative rendering cost in the HTTP workload. The next target
is the difference between those execution contexts, not an assumption that all remaining cost is
socket delivery or that fewer await expressions automatically improve throughput.

## Validation and evidence

All four captures use Node 26.8.1 production workers, priority 10, full authored documents, preloaded
application data and four asset tags. Each uses all six variant orders, ten-second worker warmup,
1.5-second measured blocks, and two drivers at concurrency 16 each. No timing workloads overlap.
The PC remains available for user activity. The four captures total 1,106,045 valid responses and
zero errors. Every started measured request completes and matches its expected full response hash.
eXact current/candidate bytes match exactly in every capture. React remains unchanged except for
the explicitly described synchronous-entry timing probe in the fourth capture.

Candidate traces also preserve output identity. No package or browser validation is claimed for
these unintegrated prototypes. Node adapter and benchmark source files remain unchanged; the
retained SSR bundles still match the conditional-emission artifacts. All owned servers and drivers
exit. The overall Node/Bun string/stream performance objective remains unresolved.

[Evidence archive](http-completion-2026-09-10-evidence.zip) preserves the load hooks, actual transformed
modules, raw request results and telemetry, traces, source snapshots, and SHA-256 manifest.
