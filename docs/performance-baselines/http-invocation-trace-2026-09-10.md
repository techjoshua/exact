# Renderer invocation inside HTTP requests

Status: the dominant relative increase occurs inside the synchronous invocation,
not solely in promise completion or response-wrapper creation. Cause unresolved.
No production changes were made.

## Question and measurement

The isolated renderer is close to React, yet eXact takes longer during HTTP load.
Split the existing asynchronous render timer at the return from its work callback.
The invocation interval includes synchronous rendering and any GC or preemption
during it. The post-return interval includes continuation scheduling and any work
performed after returning; it is not pure promise overhead or pure CPU time.

A scratch worker derives from the original worker through the previous diagnostic
copy, removes Inspector instrumentation, and adds aggregate timers. The existing
measureAsyncPhase await is retained. Isolated renderOnly uses that same wrapper so
both contexts share these timing boundaries. Response.end synchronous call duration
and eXact buffered-response construction are also measured. These are instrumented
diagnostic results, not replacement benchmark baseline scores.

Four fresh production Node 26.8.1 workers run sequentially: eXact, React, React,
eXact. Each receives ten seconds of HTTP warmup, an isolated loop, five seconds of
HTTP concurrency 32 using two drivers, and another isolated loop. Each isolated
capture warms 10,000 iterations and measures another 10,000. No forced GC or CPU
profiling is invoked. All processes run below normal priority. User workload may
vary. The current canonical artifacts render complete application-owned documents
with hydration and two scripts plus two stylesheets.

## Results

All times below are mean microseconds per invocation. RPS belongs to instrumented
HTTP load. Each loop's output byte length matches that worker's validated HTTP
identity (eXact 4,672 bytes, React 3,660 bytes).

| Worker | Loop before: invocation | HTTP: invocation | Loop after: invocation | HTTP: post-return | HTTP: response.end | HTTP RPS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| eXact 1 | 24.342 | 55.719 | 23.521 | 5.225 | 26.580 | 8,082 |
| React 1 | 23.431 | 42.127 | 23.417 | 2.964 | 22.267 | 9,914 |
| React 2 | 24.714 | 38.995 | 23.132 | 2.770 | 21.012 | 10,817 |
| eXact 2 | 23.149 | 53.105 | 22.946 | 5.078 | 25.618 | 8,634 |

eXact response construction takes 0.938 and 0.869 microseconds. Isolated
post-return time is 0.687 to 0.828 microseconds for eXact and 0.171 to 0.195 for
React. The four HTTP windows total 187,446 valid responses, zero errors.

This supports the user's observation: rendering regains its isolated speed after
the HTTP interval in the same worker. eXact's invocation grows by approximately
30 microseconds compared with its local loops; React's grows by roughly 15 to 19.
The extra eXact post-return time is much smaller. Wrapper construction alone is
too small to account for the gap, though allocation there could have indirect
effects elsewhere. response.end is also more expensive for eXact, with unequal
document sizes and different adapter header paths among possible contributors.

These elapsed intervals do not identify GC, CPU scheduling, instruction/data
cache state, code optimization, or allocation lifetime as the cause. Do not add
overlapping request timings as though they were exclusive CPU buckets.

## Next discriminating measurement

Render twice consecutively within a diagnostic HTTP request, separately recording
each invocation. Use the same component tree and initial data, and validate the
returned full document. If the immediate second invocation approaches isolated
speed, investigate execution-state effects between requests. If both remain slow,
investigate pressures that persist during HTTP processing. This deliberately
duplicates rendering and is a diagnostic, not a throughput optimization or a new
benchmark baseline. It must not introduce a second rendering engine.

Worker ownership closed successfully; only the user's Codex Node remained. The
runner verifies artifact hashes and unchanged server/adapter build inventories.
The evidence archive preserves worker, runner, log, raw capture, summary, artifacts,
and a verified SHA-256 manifest. No browser/package acceptance was needed for this
scratch instrumentation, and no production performance improvement is claimed.
