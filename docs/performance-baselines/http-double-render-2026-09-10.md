# Consecutive render invocations during HTTP load

Status: an immediate second invocation is faster, but remains substantially slower
than isolated rendering. Cause unresolved; no production code changed.

## Hypothesis and method

If the HTTP slowdown is primarily an execution-state effect between requests,
rendering again immediately may approach isolated-loop speed. If both calls remain
slow, some pressure persists through HTTP processing. This diagnostic intentionally
renders twice; it is not an implementation optimization or a new throughput baseline.

The scratch worker extends `http-invocation-trace-2026-09-10.md`. Inside the existing
render phase it invokes the same render callback, awaits completion, then invokes
and awaits it again. Separate aggregate timers surround each synchronous invocation
and each post-return interval. The second full document is returned. The first pair
is compared for exact equality outside the timers; subsequent served documents are
validated by the load drivers against the preflight identity. This does not claim
equality checks on every discarded first document.

Both calls use the same original component tree, props, ready fixture data and
shared rendering engine. Isolated loops also render twice through the same wrapper.
Each worker warms 10 seconds under HTTP; isolated captures before and after the
five-second HTTP measurement each warm 10,000 pairs and measure 10,000 pairs.
Four fresh production Node 26.8.1 workers run eXact, React, React, eXact, with two
drivers at concurrency 16 each. All processes run below normal priority, with no
simultaneous profiling, build, or tests. User PC workload may vary.

## Results

All times are mean microseconds. RPS reflects two complete renders per request.

| Worker | HTTP first invocation | HTTP second invocation | First post-return | Second post-return | Diagnostic RPS |
| --- | ---: | ---: | ---: | ---: | ---: |
| eXact 1 | 59.397 | 45.172 | 5.960 | 1.159 | 5,481 |
| React 1 | 43.664 | 35.130 | 3.511 | 0.254 | 7,140 |
| React 2 | 44.778 | 36.034 | 3.722 | 0.271 | 6,909 |
| eXact 2 | 58.374 | 44.327 | 5.968 | 1.206 | 5,550 |

Isolated first/second invocation means across before/after captures range from
22.948 to 24.007 microseconds for eXact, and 22.040 to 23.545 for React. eXact's
second HTTP invocation is about 24% faster than its first, React's about 20%.
Neither approaches its isolated-loop cost. The relative synchronous gap falls
from roughly 14 to 16 microseconds on the first call to 8 to 10 on the second.

The four measured HTTP windows total 125,563 valid responses and zero errors,
excluding warmups, isolated loops and preflights. Complete response sizes remain
4,672 bytes for eXact and 3,660 for React. Each isolated byte count matches its
worker's HTTP identity. Server/adapter build inventories and measured artifact
hashes remain unchanged. All owned processes close successfully; only the user's
existing Codex Node remains.

## Interpretation and next control

This finds both a first-call penalty and a slowdown persisting into the second
call. It does not isolate their causes. In particular, the second invocation
occurs after an await, whereas the first starts from the request callback path.
It may also benefit from recent code/data access. Keeping the first value across
the second render can affect allocation lifetime, and duplicating work changes
the ratio of rendering to networking and attainable request rate.

The next discriminating control should defer the first invocation to a promise
continuation without doing an extra render. If that materially changes its cost,
investigate scheduling/context differences. If it does not, the second-render
advantage is more consistent with recent execution or reduced HTTP work per render,
though neither cause would be proven. Preserve complete rendering and output
validation; do not count a diagnostic that discards rendering as an optimization.

The adjacent archive preserves runner, worker, log, raw capture, summary, canonical
participant artifacts and a verified SHA-256 manifest. No browser/package acceptance
or framework performance improvement is claimed.
