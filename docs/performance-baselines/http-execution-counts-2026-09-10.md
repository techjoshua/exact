# Function-entry counts in isolated and HTTP rendering

Status: observed function-entry counts are identical in both execution contexts.
No production code changed. Instrumented timing is not a throughput result.

## Hypothesis and scope

HTTP may trigger additional work inside the synchronous renderer even when final
HTML matches. Instrument every function-like body in the current bundled eXact
participant and compare per-invocation entry counts. Different counts would identify
concrete extra calls before another sink rewrite. Equal counts narrow the search
but do not establish equal instruction count, loop work, native operations or GC.

A TypeScript AST pass adds counters to 820 function-entry sites, including block
bodies, concise arrows, methods, getters and constructors. Directive prologues are
preserved. Each render resets the counters, invokes the original participant,
then snapshots counts immediately upon its return. Awaited continuation work is
outside this synchronous snapshot, matching the invocation interval investigated
by the earlier cycle probe. Module initialization and external imported package
functions are not included in this bundled-source counter set.

Each capture retains its first count vector and compares every following vector,
recording changed sites and differing-call counts. The before, HTTP and after
vectors are also compared directly. This counts entries, not branch executions or
loop iterations within functions. The observer and counter allocations materially
change execution cost; their RPS and render timings must not be compared with
normal benchmark results.

Two fresh production Node 26.8.1 eXact workers each receive ten seconds of HTTP
warmup, an isolated capture, five seconds of HTTP concurrency 32 through two fresh
drivers, and another isolated capture. Each isolated capture first warms 10,000
iterations and measures 10,000. Processes run below normal priority without
concurrent tests/builds/profilers. Full fresh documents and hydration are retained.

## Results

| Population | Before-loop renders | HTTP observed renders | After-loop renders | Entries per render | Active sites | Differing vectors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| First | 10,000 | 30,088 | 10,000 | 2,369 | 265 | 0 |
| Second | 10,000 | 31,658 | 10,000 | 2,369 | 265 | 0 |

All six first vectors are identical. HTTP observation counts include two driver
preflights per worker. Measured load stages total 61,742 valid responses with zero
errors. Both workers retain the 4,672-byte complete document, matching their
isolated captures. The runner verifies instrumented artifact/worker hashes and
unchanged server/adapter build inventories. All owned processes close; only the
user's existing Codex Node remains.

Selected high-frequency sites per invocation:

| Site | Entries |
| --- | ---: |
| StringProgramSink.ready | 184 |
| StringProgramSink.write | 89 |
| unwrap | 73 |
| mapRenderValue | 69 |
| appendProgramText | 60 |
| countSsrNodes | 55 |
| readPreparedServerRenderProgram | 42 |
| validatePositionalValue | 40 |
| Each of four boundary helpers | 28 |

These are entry frequencies, not CPU rankings. For example, a no-op ready method
may inline cheaply despite its high count. Do not target a helper solely because
it appears near the top of this table.

## Consequences

There is no extra volume of calls at the observed sites under HTTP. The same
instrumented function-entry vector becomes more expensive in the HTTP execution
context. This supports checking optimization state, inner control flow, memory
behavior and locality rather than assuming additional task execution or a second
renderer path. It does not prove those calls execute identical branches or loops,
nor that GC/native work is absent from their elapsed intervals.

The stack experiment remains a separate, unaccepted prototype. No runtime helper
should be removed merely to reduce this count. The next evidence should identify
work or execution cost that can actually be reduced while preserving ownership,
hydration, tasks and sink behavior.

The archive preserves AST instrumenter, site map, instrumented artifact, worker,
runner, log, raw capture, comparison summary, ranked site counts and verified
SHA-256 manifest. No browser/package acceptance or production speedup is claimed.
