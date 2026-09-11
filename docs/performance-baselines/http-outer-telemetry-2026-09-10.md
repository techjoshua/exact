# Outer HTTP telemetry overhead

Status: outer benchmark instrumentation costs throughput in both frameworks but
does not explain most of their renderer invocation gap. No production changes.

## Hypothesis and method

The benchmark adds per-request CPU snapshots, response method wrappers, finish
listeners and a promise awaiting response completion. Their allocations or callback
work might make eXact disproportionately slower. Bypass these outer wrappers while
retaining the participant handler, complete rendering, hydration, normal response
adapter, actual output byte counting, error handling, and inner render-phase timing.
If the wrappers cause the observed synchronous invocation gap, disabling them
should remove much of the roughly 12 to 14 microseconds separating the frameworks
in recent captures. A throughput gain alone would not establish that explanation.

The scratch worker derives from `http-invocation-trace-2026-09-10.md`. In off mode,
handleNodeRequest calls participant.handle directly with a rejection handler, instead
of measureNodeRequest and measureNodeParticipantWork. Framework lifecycle behavior
is unchanged. The Node server, optional payload diagnostic check, render statistics,
GC observer and event-loop monitor remain. This is not an instrumentation-free lane.
response.end and first/completion telemetry disappear in off mode by design.

Four fresh production Node 26.8.1 workers run eXact, React, React, eXact. Each warms
for ten seconds, then runs on/off/off/on or off/on/on/off three-second blocks, with
two fresh drivers at concurrency 16 each. All processes run below normal priority,
without concurrent builds, tests or profilers. User PC workload may vary. Complete
freshly rendered documents are sent in both modes; there is no cached response.

## Results

RPS means weight each worker's two blocks per mode equally. Invocation times are
request-weighted microseconds for synchronous renderer execution.

| Worker | Telemetry on RPS | Telemetry off RPS | Change | Invocation on/off |
| --- | ---: | ---: | ---: | ---: |
| eXact 1 | 9,475 | 10,600 | +11.88% | 45.88 / 44.47 |
| React 1 | 12,895 | 14,195 | +10.08% | 31.92 / 31.87 |
| React 2 | 12,247 | 14,056 | +14.77% | 32.76 / 31.56 |
| eXact 2 | 9,486 | 10,480 | +10.48% | 46.56 / 45.58 |

The 16 blocks contain 561,552 valid responses and zero errors, excluding warmups
and preflights. Full document sizes remain 4,672 bytes for eXact and 3,660 for React.
The runner verifies artifact hashes and unchanged server/adapter build inventories.
All task-owned processes close; only the user's existing Codex Node remains.

The outer instrumentation has material cost, consistently in both frameworks.
However, invocation time changes by approximately 0 to 1.4 microseconds, much less
than the remaining 12.6 to 14.0 microsecond difference between frameworks with it
off. Post-return intervals also remain close: eXact 3.93 to 3.98 microseconds and
React 2.00 to 2.09. Do not attribute the relative renderer slowdown to these outer
wrappers or treat their removal as an eXact framework optimization.

## Consequences

Keep throughput-oriented measurement and detailed request instrumentation distinct
when designing future benchmark reporting. This diagnostic alone does not replace
the published baseline or establish a new benchmark contract, and no benchmark
source was changed here. Both frameworks must receive identical measurement policy.

The main question remains why the synchronous renderer takes longer under HTTP
than in a tight loop. Promise placement, tested fresh-output consumption, and
outer telemetry do not account for most of that increase. Next distinguish CPU
execution time from elapsed invocation time before attributing the remainder to
instruction/data locality, allocation pressure, or thread scheduling. Any CPU-time
probe must first account for its own resolution and overhead; a timer label alone
does not prove it measures exclusive renderer CPU.

The adjacent archive preserves runner, worker, log, capture, summary, participant
artifacts and verified SHA-256 manifest. No framework improvement or browser/package
acceptance is claimed.
