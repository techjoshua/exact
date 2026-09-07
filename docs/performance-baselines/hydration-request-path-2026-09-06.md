# Hydration and request-path experiments, 2026-09-06

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

Six further experiments did not establish a consistent SSR throughput lead over React. Retain
only lazy creation of the hydration collection map: it removes an unconditional allocation and
the separate presence flag, with approximately unchanged HTTP throughput. Do not describe this
as a throughput optimization. The raw evidence (local capture: `hydration-request-path-2026-09-06.json`) includes
all renderer screens, the three-way HTTP capture, allocation samples, request CPU profiles,
artifact hashes, and runners.

## Experiments and decisions

The baseline includes the accepted buffered-accounting refinement. Every renderer screen uses
four fresh process populations, 15,000 discarded warm renders, and 20 balanced batches of 2,000
renders per variant. Each render includes final `Buffer.from` encoding and verifies byte counts;
completed batches must match the baseline's full-output hash.

- Combining three script-character escape scans into one regular expression did not improve
  consistently. Restore the existing escaping implementation.
- Creating the reactive-collection `WeakMap` only when validation finds a registered collection
  removes unused bookkeeping. The isolated screen averaged 20.452 versus 20.261 microseconds
  per render, improving in three of four populations. Retain the simpler implementation, without
  claiming a reliable HTTP gain. The earlier allocation experiment had also found timing
  inconclusive; this followup does not establish a general reversal of that result.
- Replacing the active-ancestor `Set` with a stack produced inconsistent renderer timings and
  would make cycle checks linear in nesting depth. Restore the `Set`; deep-payload performance
  was not measured because the common fixture did not justify advancing the candidate.
- Reusing the already-enumerated object keys to bypass live own-property checks was inconsistent
  and also unsafe: an earlier authored getter can remove a later property or change the prototype.
  A stale key list cannot prove current ownership. Restore the checks and add regression coverage
  for that mutation case.
- Appending positional cells to initially empty arrays instead of filling pre-sized arrays did
  not demonstrate an additional renderer improvement. Restore pre-sized arrays. Allocation
  tradeoffs for this rejected variant were not measured.
- Preparing and caching validator closures once per immutable compiler schema also failed to
  improve consistently. Warm means were 20.524 microseconds for the unchanged baseline, 21.269
  for lazy-map-only, and 21.093 for prepared validators plus lazy maps. The prepared variant
  was slower than unchanged eXact in three populations and faster in one; it was faster than
  lazy-map-only in two and slower in two. Restore the interpreter. A separate balanced first-render
  diagnostic used 12 fresh processes per variant: medians were 3.319, 3.250, and 3.481 ms,
  respectively. This includes first-render/JIT work after module import, not process startup,
  and does not isolate schema preparation cost. No validator cache or added metadata remains.

## Full HTTP confirmation

Unchanged eXact, the lazy-map candidate, and React use the standard Node comparison workers and
the same controlled API service. Four fresh process populations each run 50 balanced rounds:
ten sequential requests, one sixteen-request burst, and one 500 ms c32 sustained window per
variant per round. Discarded two-second c32 primes precede the sequential and sustained lanes.
Response validation follows timing, and frozen artifact identities are checked before and after.
All baseline/candidate output hashes and byte counts match.

| Metric                      | Unchanged eXact | Lazy-map eXact |    React |
| --------------------------- | --------------: | -------------: | -------: |
| Sustained aggregate c32 RPS |         2,466.6 |        2,466.8 |  2,475.4 |
| Sequential mean             |        0.780 ms |       0.768 ms | 0.745 ms |
| Sixteen-request burst mean  |        7.718 ms |       7.791 ms | 7.389 ms |

Candidate throughput changes across populations were +0.2%, -0.4%, +1.6%, and -1.3%. The aggregate
change is +0.008%, effectively zero. Sequential mean improved 1.6%, while burst mean worsened
1.0%; these small mixed results are not evidence of a broadly faster request path. React's
aggregate throughput is 0.35% higher than the candidate in this capture.

Four separately sampled allocation rounds average 27,641 versus 27,410 bytes per render, with
one round moving in the opposite direction. That approximate 231-byte difference is noisy sampling
evidence, not an exact saving or a retained-heap measurement. The certain structural change is
that renders without registered collections no longer construct the unused `WeakMap`.

## Full-request CPU attribution

A separate diagnostic worker exposes temporary inspector start/stop controls around the unchanged
request handler. For each framework, normal-service and preloaded-data lanes receive a two-second
c32 warmup followed by five seconds under CPU sampling. These sequential single-process profiles
are attribution evidence, not balanced performance comparisons. Profiler overhead and native-frame
attribution prevent treating their sample shares as exact optimization ceilings.

In normal-service eXact requests, the bundled participant/renderer accounts for approximately
641 ms of the 5,153 ms sampled duration (12.4%). The Node adapter accounts for 25 ms (0.5%),
and the separate response-body module for 20 ms (0.4%). Native writes, Undici fetch work, garbage
collection, and shared instrumentation account for much of the remainder. Preloading data raises
the renderer's share to approximately 1,307 ms of a roughly five-second profile. This confirms
that the adapter itself is a smaller target than the compiled rendering path.

Positional validation remains the largest named eXact renderer site: approximately 70 ms in the
normal profile and 127 ms with preloaded data. JSON serialization, text output, and byte charging
remain visible. The profile supports investigating a substantially cheaper positional conversion,
but the ownership shortcut and alternative array construction tested here do not supply one.
It does not justify weakening validation, changing the shared benchmark loader for eXact alone,
or claiming improvements from different workstation captures.

## Contracts and validation

The retained change belongs to SSR hydration bookkeeping. Collection registration and encoding,
JSON escaping, graph validation, graph/byte limits, and hydration representation remain unchanged.
No compiled-component ABI methods or protocol fields were added. Existing tests cover ordinary
hydration, registered keyed collections, positional getters, invalid values, and limits; the new
test protects live property ownership after an earlier getter mutates the input.

All 221 SSR tests passed. The final SSR and participant builds passed; the final participant hash
matches the frozen lazy-map candidate used in the HTTP capture. Documentation verification,
JSDoc contracts, package-content checks, and whitespace checks passed. No builds, tests, or
profilers ran alongside timed benchmark captures, and all owned workers were closed.

The public five-framework charts retain their complete capture. These experiments do not measure
browser startup, browser retained heap, Bun performance, or a complete framework ranking.
