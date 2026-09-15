# Sampled synchronous renderer regions under HTTP

Status: diagnostic trace completed. No production change or new performance baseline.

## Input-boundary audit

The Node benchmark's preloaded branch retains diagnosticData after loadInitialData.
Its renderOnly loop uses that same object, and both use the module-level
documentOptions object. The HTTP route comes from URL.pathname while the loop uses
a literal path. The diagnostic comparison therefore does not reconstruct the
application data per HTTP request. This finding applies to the preloaded diagnostic,
not the normal workload that includes a service fetch.

## Instrumentation

Eight synchronous function regions in the frozen current artifact are wrapped.
Every 64th render invocation records inclusive wall time and time excluding nested
instrumented regions. Other invocations still pass through the wrappers but do not
take region timestamps. Sampling ends when renderParticipant returns its promise,
so awaited continuations are outside the region trace. The existing outer trace
continues measuring invocation and post-return work separately.

Exclusive region time includes uninstrumented descendants, wrappers and some
instrumentation bookkeeping. Recursive child regions are subtracted. These values
are not self-CPU samples, unbiased production costs, or a complete response-time
partition. Instrumentation changes call structure, allocation and optimization;
the ratios identify investigation candidates rather than proving causal costs.

Two independent production Node 26.8.1 workers each receive ten seconds of HTTP
warmup. Before and after a five-second HTTP window, the same worker performs
10,000 loop warmups followed by 10,000 measured loop renders. The HTTP drivers use
concurrency 16 each. Processes run below normal priority; PC workload may vary.
No profiler, build or other benchmark overlaps the capture.

Each measured loop has 157 sampled invocations. HTTP windows contain 624 and 635.
Both workers retain identical calls per sampled document for these regions:
context 1, child issuance 8, program writer 24, children 21, component reference 8,
positional validation 40, serialization 1, hydration publication 1.

## Results

Mean exclusive microseconds per sampled document across the two workers:

| Region, including uninstrumented descendants | Loop before |  HTTP | Loop after |
| -------------------------------------------- | ----------: | ----: | ---------: |
| Context creation                             |        0.53 |  1.43 |       0.46 |
| Issued component content                     |        3.98 |  9.46 |       3.64 |
| Program writer execution                     |       10.77 | 17.41 |       9.35 |
| Structural children                          |        8.98 | 11.73 |       6.81 |
| Component reference execution                |        5.57 |  7.93 |       3.87 |
| Positional validation                        |        6.31 |  7.75 |       5.53 |
| JSON serialization and script escaping       |        2.27 |  6.82 |       2.02 |
| Remaining hydration publication              |        1.24 |  2.38 |       1.52 |

The serializeJson region includes JSON.stringify and three replacement passes for
less-than, U+2028 and U+2029. The trace does not separate those costs. Its individual
HTTP values are 6.94 and 6.70 microseconds, versus 2.34 and 2.20 before HTTP.
This repeated increase is worth isolating, but does not show that serialization
alone explains the overall slowdown. Component issuance and program execution
also slow substantially. These measurements do not establish cache, allocation,
clock-frequency or scheduling effects as the cause.

Diagnostic HTTP rates are 7,974.89 and 8,106.91 RPS. The 80,494 measured responses
are valid with zero errors. These instrumented rates are not a React comparison
or suitable for replacement of the public baseline. Sixteen additional complete
Node string/stream output cases match the uninstrumented current artifact.

## Implication and evidence

The slowdown is distributed across multiple observed regions with unchanged call
counts. A useful next diagnostic is to split native JSON serialization from script
escaping before proposing another hydration optimization. Removing validation or
escaping is not justified by this trace.

All owned processes closed. The adjacent archive contains 13 verified files,
including builder, instrumented artifact/worker, runner, raw capture, summary,
parity check and original artifacts. The initial archive verification caught
absolute-path normalization in archive entry names. The archive was rebuilt with
workspace-relative names, and every manifest hash and ZIP entry then verified.
