# Node HTTP result telemetry, September 10, 2026

Status: follow-up diagnostic. Production remains the restored previous build.

## Call-path audit

The Node HTTP worker and the in-process screen both call renderParticipant and
read the same htmlWithHydration property from renderToHydratableString. They do
not use different result finalizers. HTTP additionally accounts bytes, creates
the buffered response owner, and writes through the Node response adapter.
The screen instead wraps each string in Response and consumes it sequentially.
The HTTP workload has concurrent socket traffic and different object lifetimes.

## Measurement

The frozen previous eXact, rejected integrated candidate, and React run in
independent warmed Node servers. Six permutations interleave 1.5-second blocks
after ten-second warmups. Two fresh drivers each use concurrency 16. Production
environment, below-normal priority, complete application documents and four
assets are retained. The PC remains in active use.

Before and after each block, the existing telemetry endpoint supplies cumulative
phase totals, process CPU and observed GC counters. No forced GC, inspector
sampler, builds, or tests run concurrently. There are 227,211 valid measured
responses and zero errors. Full response identities match their expected hashes.

An initial probe mistakenly appended the telemetry path to the application URL.
It failed JSON parsing before any measured blocks; its processes closed through
the owner lifecycle. The corrected run uses worker.controlUrl and fresh servers.
The failed warmup is excluded from all results.

## Results

Render phase and process CPU are microseconds per request. GC values are
normalized per 10,000 completed requests.

| Variant   | Requests/s | Render elapsed | Process CPU | GC count | GC elapsed ms |
| --------- | ---------: | -------------: | ----------: | -------: | ------------: |
| baseline  |      7,455 |          65.94 |      158.56 |     41.9 |         32.50 |
| candidate |      7,356 |          67.98 |      155.93 |     40.6 |         33.36 |
| react     |     10,360 |          45.95 |       97.94 |     93.4 |         17.53 |

The candidate improves in three of six blocks. Its mean throughput is only about
1.3% lower here, so the earlier 18% regression magnitude is not reproduced.
PC-load drift, warmup/JIT behavior and process variation remain unresolved
confounders. The earlier capture remains valid historical evidence, but cannot
be presented as a stable causal effect of consuming the result.

The candidate has slightly fewer observed collections but slightly longer total
GC elapsed time per request. This does not establish a major GC regression or
explain the original throughput difference. Its measured process CPU per request
is slightly lower, another counter-result against a simple extra-CPU explanation.

Process CPU deltas include the worker's background/control work during the
bracket, and may include CPU on helper threads. Render phase is elapsed time
across an awaited call and can include scheduling delays. GC duration is elapsed
event duration, not GC CPU time. The columns must not be added or treated as
disjoint CPU budgets. Asynchronous observer delivery also affects GC boundaries.

Both eXact variants still spend around 66-68 microseconds in the measured render
phase versus React's 46. The retained eXact result is not reinstated as a win on
the strength of the candidate's inconclusive second screen. A fresh HTTP CPU
profile should identify the dominant work inside that render gap, rather than
continuing to optimize result representation based only on source allocation
counts or assigning the discrepancy to GC without evidence.

No production code, canonical artifact, API, or ABI changes in this follow-up.
The adjacent archive includes runner/builder, analysis, raw counters and driver
results, exact measured artifacts, and a verified SHA-256 manifest. The overall
performance objective remains unmet.
