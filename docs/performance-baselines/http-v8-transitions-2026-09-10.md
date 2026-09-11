# V8 transitions between isolated and HTTP rendering

Status: no measured-phase deoptimization attributable to the eXact renderer bundle
was found. The invocation slowdown persists. No production code changed.

## Hypothesis and method

Identical function-entry counts do not imply identical optimized execution. If V8
drops renderer functions from optimized code when HTTP resumes, that could explain
the greater cycle cost without extra function calls. Trace optimization and
deoptimization around warmup, isolated loops and HTTP measurement using the current
uninstrumented participant artifacts and the existing timing worker.

The first attempt enabled V8 tracing on the startup command line and timed out in
the worker readiness handshake before measurement. Process inspection confirmed
cleanup. Its failure log is retained; no timings were obtained or retried under
the same live handle. The successful attempt enables trace-opt, trace-deopt and
trace-file-names through v8.setFlagsFromString after readiness, with stdout capture
already attached. The exact reason for the initial handshake failure is not proven.

Four fresh production Node 26.8.1 workers run eXact, React, React, eXact. Each warms
for ten seconds under HTTP, runs an isolated capture, measures five seconds of
HTTP concurrency 32, then runs another isolated capture. Each isolated capture
warms 10,000 iterations and measures 10,000. Processes run below normal priority.
No build/test workload overlaps the diagnostic. User PC workload may vary.

Worker phase markers share stdout with native V8 trace output. Some lines are
interleaved. The parser extracts marker tokens even within such lines, but exact
boundary attribution and source attribution for damaged lines are limited. Raw
logs are preserved. Counts below describe recognized source-attributed events,
not a claim of perfect tracing or proof that every function remains optimized.

## Results

| Worker | Renderer-bundle deopts recognized in warmup | Renderer-bundle deopts recognized after initial HTTP warmup | HTTP invocation mean |
| --- | ---: | ---: | ---: |
| eXact 1 | 12 | 0 | 53.13 microseconds |
| eXact 2 | 13 | 0 | 54.12 microseconds |

Warmup events include render, normalizeRenderResult and keyedChild, with wrong-map
and consequent lazy bailouts. Measured HTTP invocations still cost substantially
more than the isolated results from earlier diagnostics. React's HTTP invocation
means here are 37.61 and 40.81 microseconds.

Recognized deoptimization events across all sources during the http-start phase
number 13 and 7 for eXact, 18 and 15 for React. These include Node HTTP/stream code
and benchmark wrappers. eXact's createExactBufferedDocument, the diagnostic response
construction wrapper, and writeNodeResponse deoptimize around HTTP resumption;
optimization records also show those functions being compiled again during the
capture. These are outside the synchronous renderer call being investigated.
They do not establish an eXact renderer tier-drop explanation for the persistent gap.

The four load windows contain 191,572 valid responses and zero errors, excluding
warmups and preflights. Diagnostic RPS are 8,675 and 8,293 for eXact, 11,044 and
10,266 for React. Logging overhead and phase-transition effects mean these are
not replacement baseline results. Complete document identity remains validated;
artifact hashes and server/adapter inventories are unchanged. All owned processes
close, leaving only the user's Codex Node.

## Interpretation

This weakens recurrent renderer deoptimization as the explanation; it does not
rule out optimization differences, native work, GC or locality. Extra benchmark
and transport work clearly exists, but prior controls show that bypassing output
consumption and outer telemetry does not eliminate the invocation gap. The
remaining work is to identify reducible execution cost within the observed render
path, without confusing entry frequency with CPU cost or treating a synthetic
cached response as a framework optimization.

The evidence archive contains both startup-attempt logs and the successful runner/
worker, raw per-worker traces, phase/source summaries, capture, participant artifacts
and verified SHA-256 manifest. No runtime, compiler or sink change is adopted here.
