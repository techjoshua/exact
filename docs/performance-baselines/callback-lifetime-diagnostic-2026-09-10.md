# Callback lifetime and repeated optimization

Status: diagnostic only. Neither callback retention nor a renderer change is
integrated. The conditional-fragment prototype remains paused.

## Hypothesis

The source-attribution capture found repeated compilation at request-local callback
sites. One possible mechanism is that optimized code loses useful retaining
references as short-lived callback functions disappear between requests. This
diagnostic tests whether keeping recent callback functions alive changes the
compilation pattern. It does not assume that compilation count explains the
whole HTTP timing difference or that retaining request state is a good API.

An asserted AST transformation locates 23 callback expressions mapped by the
preceding V8 source-origin capture. Both variants wrap those exact expressions in
the same `auditRememberCallback(index, fn)` call and return the fresh function
unchanged. A module-level environment flag controls whether the wrapper stores
the function in a fixed 23-element array. Each slot retains only the most recent
callback from that source location. No old callback is invoked again and no
rendered HTML, task result, or request state is reused for another request.

This intentionally changes reachability. Stored callbacks can retain their
captured component/request objects until replaced or process exit. That makes it
a causal diagnostic, not a production cache or proof of lifecycle equivalence.
It also adds stores/write barriers, and both variants include wrapper-call
instrumentation. No whole-render heap-byte reduction is claimed.

The builder's twelve changing-request output comparisons pass: retained and
unretained string/stream results match the unmodified build, including Unicode
and script-like text. These checks do not replace cancellation, ownership,
enhancement, package, or browser acceptance.

## Same-worker context transition

Each variant uses a fresh production Node 26.8.1 worker at below-normal priority.
Unretained runs first, retained second. The sequence remains ten seconds of HTTP
warmup, five seconds HTTP load, five internal loops of 10,000 complete renders,
then five seconds HTTP load. Two drivers use sixteen connections each. Only one
workload runs at a time; PC use can vary. JIT tracing starts after readiness.

Mean measured microseconds:

| Variant    | HTTP before loop | Internal loop | HTTP after loop | Final-phase optimization completions |
| ---------- | ---------------: | ------------: | --------------: | -----------------------------------: |
| unretained |            56.94 |         23.86 |           55.84 |                                   93 |
| retained   |            58.22 |         25.32 |           61.70 |                                    8 |

There are 170,522 valid measured HTTP responses and zero response errors. Both
variants have the same full-response hash. Internal loops still generate complete
HTML and count its bytes. These diagnostic timings are not new ordinary benchmark
scores, and one order is insufficient to estimate a dependable performance effect.

Of the final-phase optimization completions, unnamed functions account for 87 in
the unretained case and three in the retained case. This is a large change in the
specific event pattern that motivated the diagnostic. Callback reachability
therefore affects that pattern in this run. It does not identify the exact V8
weak-reference or code-reclamation mechanism.

The timing does not improve alongside the reduced optimization count. Final HTTP
GC observer durations are approximately 2.95 microseconds per render unretained
and 3.05 retained. Their small difference does not explain the entire observed
timing difference, although GC duration is not total allocation/barrier CPU cost.
Added retention and stores, optimized-code differences, and machine variation
prevent attributing the timing to a single cause.

## What this changes about the next step

Repeated compilation is connected to callback lifetime, but suppressing it does
not by itself produce the desired performance in this diagnostic. Counting fewer
optimization events is not an acceptance criterion, just as counting fewer arrays
was insufficient in the flat-frame experiment.

Do not introduce strong callback retention into production or use this capture to
claim a safe callback cache. Shared execution functions with request-owned records
would be a different implementation with different costs. Prior execution-target,
publication-receiver, ready-props, and direct-child-callback experiments must inform
any such proposal; it should not be justified solely by the recompile counts.

The goal remains reducing actual request execution and publication work while
preserving lifecycle semantics. The larger Node string gap is still unresolved.
This diagnostic narrows the JIT hypothesis and prevents treating compilation reuse
as a sufficient explanation or performance fix. The next proposed architectural
change needs a cost model for the runtime work it removes and the work it adds.

## Evidence

`callback-lifetime-diagnostic-2026-09-10-evidence.zip` contains the matched source
sites, isolated transformed bundle, builder/output assertions, worker and owner,
both JIT logs, raw HTTP/loop/GC records, analysis, retained control, and verified
SHA-256 manifest. Canonical Exact Node output remains byte-identical to the
retained conditional-emission build. All owned workers, services, and drivers
exited. No runtime, compiler, adapter, or public API source changed.
