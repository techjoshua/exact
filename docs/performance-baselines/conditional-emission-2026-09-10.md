# Conditional progressive emission, September 10, 2026

The request trace found a ready head write unnecessarily returning a promise through its ancestor
programs. Progressive stream demand, byte emission, event forwarding, and the head sink now preserve
synchronous completion when available. The direct environment writer also returns synchronously
when its writer does. Actual pressure retains a promise, and abort checks and wire limits remain.
Initial rendering is scheduled through a promise boundary so synchronous producer failures follow
the same stream error path. Public rendering still returns its asynchronous result.

The hypothesis was a modest streaming improvement by eliminating unnecessary ancestor suspension,
without replacing the shared renderer or changing component preparation and hydration publication.

## Focused streaming HTTP comparison

| Runtime/output | Prior eXact requests/s | Candidate eXact requests/s | React requests/s | Change | Positive blocks |
| --- | ---: | ---: | ---: | ---: | ---: |
| Node stream | 7,070 | 7,472 | 5,237 | +5.7% | 6/6 |
| Bun stream | 7,910 | 8,235 | 8,028 | +4.1% | 5/6 |
396,790 valid responses, zero errors.


All six variant orders run in each runtime, 36 blocks total. Each worker warms for ten seconds;
measured blocks last 1.5 seconds with two drivers at concurrency 16 each. Node 26.8.1 and Bun 1.4.2
use production mode, native adapters, full application-owned documents and below-normal priority.
No builds, tests, or profilers run concurrently. The user may use the PC. React is unchanged and
eXact outputs are byte-identical within each runtime. These local rates are not stable capacity.
String throughput was not remeasured in this focused streaming comparison.

## Trace and correctness

The candidate string and streaming traces match their uninstrumented outputs exactly. Both retain
eight component executions, 24 render programs, 89 sink writes and one hydration serialization.
The streaming head flush no longer returns a promise in the ready-reader fixture, removing its
ancestor pending spans. Trace timing is diagnostic only; instrumentation changes execution costs.

The existing 370 SSR tests pass, including early head delivery before a pending body task and
cancellation cleanup. Two new readiness tests cover ready direct writers, actual writer pressure,
ready reader demand and the next blocked read. One initial test expectation omitted the framework's
fragment root wrapper; that expectation was corrected and both tests then passed. The initial
failure log is preserved. All 56 browser checks across Node/Bun string/stream pass, as do test type
checking and focused ESLint. Source architecture, JSDoc, frozen/initial ABI, and package-content checks also pass.
The change is retained: all six Node pairs and five of six Bun pairs improve. Bun's narrow lead
over React in this round remains sensitive to local workload variance.

The renderer still collects the body after head commitment. This change does not establish full
incremental body output, application-only hydration, or React parity across all four benchmark cells.
Head registration remains a separate architectural follow-up.

[Evidence archive](conditional-emission-2026-09-10-evidence.zip) contains before/candidate sources,
artifacts, HTTP results, before/after traces, scripts, and validation logs.
