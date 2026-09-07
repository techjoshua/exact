# SSR promises, allocation, and prepared setup — September 7, 2026

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

This completes the three investigations left incomplete by the earlier
[response-path screens](ssr-next-experiments-2026-09-07.md): synchronous adapter promises, CPU and
allocation under low/high concurrency, and repeated immutable setup. The retained candidate uses
shallow request-local ancestry for hydration validation, with native `Set` promotion for deeper
graphs and before calling existing compiled positional projectors.

## Experiments

| Candidate                                                       | Evidence                                                                                                               | Decision                                                                       |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Reuse a fulfilled promise on synchronous adapter success        | Removes one promise per request; HTTP c16 9,147 → 8,921 RPS and c128 8,261 → 8,133                                     | Reject                                                                         |
| Cache immutable frame-constructor/ownership selection           | Focused screen about 1.3% faster; HTTP c16 9,052 → 9,079 and c128 8,294 → 8,351, with mixed population direction       | Reject: insufficient benefit for retained cache and branches                   |
| Plain hydration ancestor stack                                  | 4,545 validator comparisons passed; HTTP c16 9,052 → 9,324 and c128 8,294 → 8,527                                      | Superseded: did not preserve the version-one projector's native `Set` contract |
| Encode the completed document to `Buffer` before `response.end` | Both HTTP populations slower than their baseline                                                                       | Reject                                                                         |
| Hybrid hydration ancestry                                       | About 1.6% higher c16 and 1.4% higher c128 HTTP throughput; about 700 fewer sampled bytes per rendered/encoded request | Retain, with ABI and depth/cycle regression coverage                           |

A final paired normal-loading check compared the frozen baseline and rebuilt retained artifact
at c32, with ten seconds warmup and twenty seconds measured per block. Aggregate valid throughput
increased from 2,763 to 2,814 RPS (1.8%), with improvement in both reversed process populations.
This comparison, not the movement between historical public captures, supports the normal-loading
improvement claim.

The promise experiment kept the public `Promise<void>` return type and separate asynchronous cleanup
and error handling. An isolated async-hooks diagnostic counted 2,000 promise initializations for
1,000 awaited baseline writes and 1,000 for the candidate. Reducing that count did not improve the
complete HTTP path, so no adapter change was retained.

Each HTTP comparison used two load drivers against one worker, ten seconds of discarded warmup,
and twenty seconds each at total concurrency 16 and 128. Two fresh populations reversed variant
order. Responses were checked against the same byte count and hash. Rates aggregate valid responses
over the union of simultaneous driver stage spans, including drain. Absolute RPS from separate
captures is not used to assign an optimization effect.

## Under-load profiling

Separate CPU and allocation captures used a warmed worker and two drivers at c16 and c128. Each
profile ran for ten seconds after five seconds warmup. Profiler runs were isolated from throughput
acceptance runs; their request rates are not published as capacity.

| Profile observation                                                          |          c16 |         c128 |
| ---------------------------------------------------------------------------- | -----------: | -----------: |
| Sampled allocation per completed request, including Node and instrumentation | 44,067 bytes | 44,271 bytes |
| Native `writev` sampled self time per completed request                      |     22.77 µs |     29.26 µs |
| `cpuUsage` sampled self time per completed request                           |      7.49 µs |      7.58 µs |
| Positional hydration validation sampled self time per completed request      |      4.22 µs |      3.97 µs |

Allocation per request was nearly flat. Native write cost increased, while positional validation
was similar. This is evidence against attributing the high-concurrency drop to an allocation cliff;
it does not prove a single transport mechanism explains all of it. CPU instrumentation itself has
measurable cost. The public results remain instrumented local HTTP capacities, not a measurement of
pure rendering or a universal production ceiling.

The socket profile motivated the explicit-buffer experiment rather than another speculative
string-loop change. Its regression ruled out retaining that transport change. No object pool,
cross-request mutable cache, or delayed request cleanup was introduced.

## Retained implementation and compatibility

`packages/ssr/src/hydration-json.ts` starts with a shallow active-path stack. It promotes to a native
`Set` at sixteen active containers, bounding linear lookup on deeper graphs. Promotion copies all
active ancestors, so cycles remain distinguishable from repeated sibling references. Every exit,
including a rejected value, unwinds the active container. The diagnostic pass has independent state.

Before a version-one compiled projector runs, the validator promotes to a native `Set` even for
shallow graphs. `PositionalProjectionContext` and its public `active: Set<object>` declaration are
unchanged. A regression test uses `Set.prototype.has.call` to verify both native identity and the
presence of ancestors established before promotion. Another protects deep cycles and shared siblings
across the promotion threshold. The existing accessor, prototype, serialization, depth, node-limit,
and positional-schema checks remain in force.

The unbounded stack prototype also improved the isolated 70-level validation case, but it was not
retained: the hybrid bounds lookup and preserves compiled-projector compatibility. Its focused
allocation sample fell from approximately 27,754 to 27,048 bytes per rendered/encoded request.
Those figures include the diagnostic response sink and final encoding; they are not retained heap.

The rebuilt hybrid's isolated shallow validation measured about 0.632 → 0.519 µs. Its synthetic
70-level case measured 5.368 → 5.704 µs, approximately 0.34 µs slower (6.2%). Promotion and the
bounded lookup checks have a cost; this is a measured common-request improvement with a deep-graph
tradeoff, not a claim that every possible hydration graph becomes faster. The original unbounded
stack's deep result must not be substituted for the retained hybrid's result.

The unmodified source was rebuilt before promotion and matched the frozen baseline byte-for-byte.
The rebuilt candidate then passed all 234 SSR tests and all 35 shared browser/SSR behavior checks.
The server bundle grows slightly; no client ABI, hydration payload, or author-facing syntax changes.

## Public capacity refresh

The public preloaded concurrency sweep, normal-loading lane, and scheduled-arrival tables are
recaptured using the rebuilt retained artifact and React. Their plans use two fresh reversed
framework populations and two drivers per active worker. Preloaded stages measure fifteen seconds
each; normal loading and arrival-rate stages measure twenty seconds each, after ten seconds warmup.
These durations are recorded in the displayed method rather than silently inheriting older defaults.

The refreshed preloaded curve peaks at 9,410 RPS for eXact (c16) and 9,293 RPS for React (c32).
The separately captured normal-loading lane measures 2,768 and 2,735 RPS respectively. Rankings
vary with concurrency; these small differences do not establish a universal framework advantage.

The experiment archive (local capture: `ssr-followthrough-2026-09-07.json`) preserves ordered comparisons, profiler
summaries and CPU profiles, candidate sources, validation evidence, and the normal-loading capture.
The capacity archive (local capture: `ssr-followthrough-capacity-2026-09-07.json`) holds the rebuilt preloaded and
arrival-rate captures used by the validated public publisher. Historical captures remain unchanged.
