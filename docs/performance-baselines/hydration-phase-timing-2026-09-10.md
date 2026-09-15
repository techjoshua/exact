# Sampled hydration phase timing

This diagnostic measures ordinary hydration publication without bypassing any
validation, projection, serialization, or output construction. It prioritizes
investigation; it does not establish an achievable throughput improvement.

The production implementation is unchanged. The isolated instrumented bundle
derives from Node artifact SHA-256
`2ebf7fed2ee0dc972095976bf55230ccc924a120251a463af26838e8ebb2cd18`.
Both runtimes use this portable Node entry in process. This is not a native Bun
HTTP adapter measurement and contains no new React benchmark.

## Method

Each fresh process warms 50,000 complete encoded renders, enables sampling,
warms another 2,000 renders, and measures 20,000 renders. Every 32nd hydration
publication records five elapsed phases in a preallocated Float64Array. Normal
and instrumented processes run in both orders on Node 26.8.1 and Bun 1.4.2,
serially at below-normal process priority. Each runtime supplies 1,250 sampled
publications. Complete documents include all four application asset tags;
final document hashes match across all eight processes.

The user was using the PC. Short interleaved HTTP blocks remain preferable for
capacity comparisons. These separate processes cannot eliminate workload drift.

## Results

Mean sampled microseconds per publication:

| Phase                                          |  Node |   Bun |
| ---------------------------------------------- | ----: | ----: |
| Metadata construction and authorization checks | 0.338 | 0.272 |
| Validation and positional projection           | 2.777 | 2.340 |
| JSON serialization and script escaping         | 2.660 | 2.056 |
| Encoded byte count and limit check             | 0.275 | 0.087 |
| Script attribute escaping and construction     | 0.262 | 0.139 |

Mean complete encoded render elapsed times, microseconds:

| Runtime | Normal | Instrumented |
| ------- | -----: | -----------: |
| Node    | 44.121 |       45.211 |
| Bun     | 36.196 |       35.066 |

Node's instrumented population was 2.5% slower. Bun's was 3.1% faster, which
cannot be credited as an optimization: no work was removed. Workload drift and
changes to JIT behavior can affect these populations. Individual phase timings
also include timestamp/storage overhead, preemption, and any coincident GC.
They are elapsed durations, not CPU attribution. Sub-microsecond phases are
particularly sensitive to timer resolution.

Validation/projection and JSON/escaping dominate the measured publication
function. Byte counting and script construction are much smaller. This supports
investigating traversal and serialization before more object-shape microtuning.
It does not explain the entire HTTP benefit of the earlier cached-script bypass:
that bypass also changes allocation, string reuse, and downstream GC behavior.
This probe excludes result assembly, document scans, final HTML joining, response
encoding, and later collection of hydration temporaries.

The next substantive hypothesis is that the validated positional representation
can reach serialization with less transient work. Any experiment must preserve
changing request data, descriptor safety, cycle handling, reactive collections,
script escaping, and the existing unsupported-value contract. Cached hydration
scripts or graphs remain diagnostic-only and must not enter production.

## Evidence

The adjacent `hydration-phase-timing-2026-09-10-evidence.zip` contains the builder,
runner, instrumented worker and artifact, uninstrumented artifact, fixture,
analysis script, raw samples, summary, and SHA-256 manifest. Related HTTP evidence
is recorded in [whole-stage diagnostics](stage-hydration-http-2026-09-10.md) and
[partial-stage diagnostics](stage-hydration-parts-2026-09-10.md).
