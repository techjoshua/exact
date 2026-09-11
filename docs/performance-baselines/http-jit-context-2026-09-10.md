# HTTP versus internal-loop JIT diagnostic

Status: diagnostic of unchanged renderer builds. The fusion prototype remains
paused. No production optimization was added or benchmarked.

The preceding profile located most of the Node string difference inside rendering
and publication. This diagnostic tests whether repeated deoptimization or a lack
of tight-loop warmup explains the HTTP versus isolated-render discrepancy.

## Same worker, same data, different calling context

Each framework runs in one fresh production Node 26.8.1 worker. The sequence is
ten seconds of HTTP warmup, five seconds of HTTP load, five internal loops of
10,000 renders each, then five more seconds of HTTP load. HTTP uses two drivers
with sixteen connections each. Each process runs below normal priority and only
one workload runs at a time. This capture uses Exact then React, not reversed
populations; it is not a capacity comparison or an effect-size estimate.

The loop calls the worker's existing `participant.renderOnly` directly, avoiding
the normal diagnostic endpoint's CPU and heap profiler side effects. It uses the
same loaded participant, cached `diagnosticData` object, document options, and
route as HTTP requests. It renders complete HTML and calls `Buffer.byteLength`.
It collects a timing for each render, so its measurement wrapper differs from
ordinary HTTP's `measureAsyncPhase`. Both loops include full rendering; neither
caches HTML or omits the application tree.

Mean measured microseconds:

| Framework | HTTP before loop | Internal loop | HTTP after loop | Logged deoptimizations in final HTTP block |
| --- | ---: | ---: | ---: | ---: |
| exact | 55.95 | 23.11 | 56.79 | 0 |
| react | 39.34 | 26.55 | 38.51 | 0 |

The five Exact loop means range from 22.47 to 24.12 microseconds; React's range
from 24.98 to 29.74. Exact's HTTP render interval returns to about 56.79 after
50,000 loop renders. There are 200,754 valid measured HTTP responses with zero
response errors. Full response hashes match the retained output. Internal-loop
responses report the corresponding 4,672/3,660 byte counts; this diagnostic does
not add per-iteration HTML hashing to the loop.

The prior identity check already verified deep equality of service-loaded data
and the isolated fixture, and matching full HTML hashes. Deep equality alone does
not prove identical engine object layouts. The same-worker transition here is
stronger evidence that input-object shape alone cannot explain the change in
execution time, since that data object remains the same across phases.

## What the JIT trace does and does not establish

Tracing is enabled after the worker announces readiness, using Node's V8 flag
control in a diagnostic-only route. The route is inactive in ordinary rendering.
Both stdout and stderr are captured after readiness. Phase labels are written by
the owning process before each operation; queued output and concurrent compilation
completion can cross the exact phase boundary. Counts should not be interpreted
as perfectly synchronized instruction-level boundaries.

Neither framework logs a bailout in the final HTTP block. Both do log warmup and
control-transition bailouts, largely in Node HTTP/stream code after warmup. No
repeated renderer bailout pattern explains the sustained final HTTP discrepancy.
This argues against a deoptimization-storm explanation for this run. It does not
rule out differences in optimized machine code, inlining, execution locality,
background compilation, or allocation behavior.

Optimization continues: the trace records 87 optimization completions for Exact
and nine for React in the final HTTP phase. Eighty-one of Exact's entries and two
of React's are unnamed functions. These addresses have not been mapped to source
locations, so assigning their cost to framework callbacks, compiled programs, or
Node internals would be speculation. Completion counts are not compilation CPU
time. This is a concrete remaining attribution question, not proof of a JIT cause.

Extra internal-loop warmup did not transfer the low loop timing back to HTTP.
Repeating longer loop warmups alone is therefore not a justified next optimization.
The result reinforces the importance of the actual HTTP execution context and
does not support using isolated renderer timing to predict server throughput.

## Operational history and limits

An initial attempt passed tracing flags at process startup and timed out waiting
for readiness. It yielded no usable capture; the cause of that timeout is not
established. Process inspection verified the owned processes had exited. The
successful retry enables tracing after readiness. No production source was edited
to bypass the failure. The diagnostic worker changes only its JIT-control route
and its private internal-loop endpoint.

V8 logging and diagnostic control requests affect execution. These numbers must
not replace the ordinary Node/Bun string/stream benchmark charts. There is no new
claim about Bun, streaming, allocation volume, GC CPU, or application browser
latency. No package/browser acceptance is claimed because the framework did not
change. All owned workers, services, and drivers exited.

## Direction

Keep the fusion prototype paused. The useful next analysis is to identify the
unnamed optimization sites and correlate their activity with the larger measured
rendering/preparation/publication costs. Do not infer that merely reducing source
function count or padding object layouts fixes the problem. A proposed change
should have an explicit mechanism and a cost estimate supported by that evidence.

The full performance goal remains unresolved. Evidence is preserved in
`http-jit-context-2026-09-10-evidence.zip`, including the diagnostic worker and
owner, both JIT logs, per-phase load and timing records, analysis, current render
artifacts, and SHA-256 manifest.
