# Node scheduled-demand latency investigation, September 20, 2026

The previous scheduled-demand table showed eXact Node string response p99 of 90.5–93.4 ms at
8,000 offered RPS and 76.5–82.2 ms at 10,000. This was not evidence that higher demand intrinsically
makes the renderer faster. Instrumented controls identified unnecessary transitions in the Node
adaptive admission controller, amplified by short stages that inherited one another's process state.

## Cause

The controller first proves that batched render starts improve completed-response rate and
event-loop delay against immediate-admission controls before and after a trial. Once selected,
the old policy disabled scheduling whenever a subsequent completion rate failed to exceed the
old control rate, or a 30-second recheck deadline expired. This confused lower offered demand
with lower service capacity. Short immediate controls also observed transient completion bursts
that a healthy demand-limited window could not exceed.

At 8,000 offered RPS, scheduled operation showed roughly 70–74% event-loop utilization and low
lag. Disabling it caused queueing and much higher response tails. Rejected retrials then backed
off for up to 30 seconds. The original benchmark's 20-second stages could therefore sample
different controller states. Reversing stage order and giving 8,000 RPS its own 30-second warmup
still reproduced the issue, ruling out rate order as a sufficient explanation or fix.

The final correction recognizes limited demand during both selection and retention. Busy trials
still require a throughput and lag win against both controls. A demand-limited trial may instead
prove lower lag, p95 delay below 3 ms, event-loop utilization below 80%, and completion of at least
99% of requests admitted within its own window. An already-selected policy stays active with low
lag and headroom. Recent healthy operation earns a three-window grace period against transient
busy samples. Sustained busy operation consumes that grace even before a recheck is due, preserving
prompt capacity decisions under saturation. The deadline remains pending, and sparse/idle cleanup
is unchanged. Response rendering, cancellation, hydration data, and body completion contracts are
unchanged. Bun's controller is unchanged.

## Preliminary headroom experiment

These are diagnostic Node string preloaded cases on verified native loopback, each with a fresh
worker, two independent drivers, 30 seconds of target-rate warmup, and 30 seconds of measurement.
They are one population per case, not the two-population publication protocol. Valid RPS uses the
union of the two driver spans, including drain. The p99 range spans the two driver percentiles.
All these cases had zero request errors and zero invalid responses.

| Policy | Offered RPS | Valid RPS | Response p99 range | Missed arrivals |
| --- | ---: | ---: | ---: | ---: |
| Control | 8,000 | 7,871 | 102.85–103.81 ms | 3,531 |
| Headroom correction | 8,000 | 7,999 | 10.69–10.70 ms | 5 |
| Control | 10,000 | 9,989 | 34.62–34.85 ms | 265 |
| Headroom correction | 10,000 | 9,967 | 29.55–29.76 ms | 979 |
| Correction, reverse-order repeat | 10,000 | 9,967 | 36.51–38.94 ms | 985 |
| Correction, reverse-order repeat | 8,000 | 7,999 | 10.26–10.28 ms | 7 |

The large 8,000-RPS tail improvement repeated. The 10,000-RPS tail varied between runs, and its
valid throughput was approximately 0.2% below the paired control. This does not establish a
throughput regression or a guaranteed latency improvement at every load. Missed requests have
no response-latency sample, so latency and successful demand handling must be read together.

A separate throughput matrix used 10 seconds of c16 warmup, then 15 seconds each at preloaded
c32/c128, or 20 seconds at normal-loading c32. String ran control then correction; streaming
reversed that order. These short diagnostic cases protect against a broad capacity loss but do
not replace the full comparison run.

| API/loading | Concurrency | Control RPS | Corrected RPS | Change |
| --- | ---: | ---: | ---: | ---: |
| String preloaded | 32 | 16,311 | 17,094 | +4.8% |
| String preloaded | 128 | 15,913 | 16,858 | +5.9% |
| String normal | 32 | 3,929 | 3,900 | −0.7% |
| Streaming preloaded | 32 | 13,732 | 13,895 | +1.2% |
| Streaming preloaded | 128 | 12,387 | 13,496 | +9.0% |
| Streaming normal | 32 | 3,489 | 3,692 | +5.8% |

No request errors or invalid responses occurred in this matrix. The small normal-string decrease
is within the variation that a single short population cannot resolve.

## Longer observation and final correction

The first headroom-only implementation did not pass full verification. In an interrupted full run,
eXact's two 8,000-RPS populations produced p99 ranges of 35.4 ms and 70.0–70.7 ms. Per-second
measurements showed low latency for most of the run followed by late instability. This capture
was retained and was not published as the replacement baseline.

A 30-second warmup plus 120-second measurement reproduced the failure under tracing. Scheduling
remained enabled until about 98 seconds into the case, then a borderline lag sample caused an
immediate recheck. Subsequent scheduled trials restored roughly 2.6–3.0 ms event-loop delay and
handled approximately 8,000 completions/s, but immediate controls reported bursts above that rate.
Strict capacity comparison rejected these healthy demand-limited trials and backed off repeatedly.
Measured response p99 reached 88.3–88.4 ms. Neither load-driver saturation nor a long GC pause
explained the transition.

Requiring three consecutive unhealthy windows preserved approximately 8,000 valid RPS and
10.9–11.0 ms p99 over the same two-minute observation. A deliberately triggered recheck recovered
in both a headroom-only control and the revised selection prototype in a separate experiment;
that experiment therefore does not independently establish a recovery advantage. Its results are
retained rather than discarded.

Applying the three-window delay to every busy policy was too broad. A short production matrix
showed lower c128 string and c32 streaming throughput. The final implementation grants this
protection only after demonstrated headroom, and consumes it during sustained busy operation.
The following reversed-order intermediate scoped-policy matrix recovered capacity. These are
short, single-population guards, not proof that every small difference is attributable to code.

| API/loading | Concurrency | Control RPS | Scoped policy RPS | Change |
| --- | ---: | ---: | ---: | ---: |
| String preloaded | 32 | 15,554 | 16,359 | +5.2% |
| String preloaded | 128 | 15,453 | 16,264 | +5.3% |
| String normal | 32 | 3,699 | 3,715 | +0.4% |
| Streaming preloaded | 32 | 13,282 | 13,052 | −1.7% |
| Streaming preloaded | 128 | 12,058 | 12,764 | +5.9% |
| Streaming normal | 32 | 3,502 | 3,486 | −0.5% |

Two uninstrumented production 8,000-RPS checks, before and after scoping the grace period,
each sustained approximately 8,000 valid RPS with 10.6 ms p99 for two minutes. All requests were
valid and no request errors occurred. A further unit-tested refinement consumes the grace period
before a future deadline during sustained busy operation. The final full run uses that frozen
implementation at revision `3c2b8772`, with ordinary production workers and the complete suite.

## Final independent Node string arrival comparison

The final full run completed both reversed populations with the frozen implementation and ordinary
production workers. These cases use 30 seconds of target-rate warmup and 60 seconds of measurement
per fresh framework/rate process set. They establish the replacement baseline; the method differs
from the historical sequential 20-second stages.

| Offered RPS | eXact valid RPS | Capacity misses | Request errors | Response p99 range |
| --- | ---: | ---: | ---: | ---: |
| 8,000 | 7,999 | 0.00% | 0 | 10.9–11.5 ms |
| 10,000 | 9,990 | 0.09% | 0 | 24.8–29.4 ms |

Both rates have zero generator-lag misses. There are six end-of-window misses at 8,000 and fifteen
at 10,000 across the measured populations. These unsent arrivals are retained separately from
capacity misses and do not acquire response latency. The late instability from the first full-run
attempt did not recur in either final 8,000-RPS population.

## Alternatives and instrumentation limits

A rejected prototype allowed a 2% completion-rate tolerance when lag improved substantially.
It did not reliably resolve the 8,000-RPS tail: one case remained around 88–91 ms. The retained
change instead uses event-loop headroom to distinguish demand-limited operation.

Initial exploratory captures bundled the adapter for observation and are marked as diagnostic
by their retained runner. Subsequent native observations preserved module layout. Paired control,
tolerance, and headroom cases copied the same adapter output tree and varied its gate implementation.
Worker instrumentation captures the controller instance on its first request and restores the
original request-observation method immediately. Telemetry adds sampled gate state and event-loop
utilization. This instrumentation is absent from ordinary publication workers.

The evidence archive retains the experimental adapter copies and their hashes. Intermediate
production captures retain their built-artifact hashes; the final production source is frozen by
commit and source-state verification. The experimental capture's
ordinary `nodeAdapter` metadata names the workspace build; the separately recorded adapter-copy
hashes identify the code actually selected by its experimental worker. Participant entry and complete
response hashes remained fixed within the comparisons.

## Publication protocol and validation

The new `measure:ssr:arrivals` runner gives every framework/rate case fresh worker, service, and
driver processes. Each rate gets 30 seconds of target-rate warmup and 60 seconds of measurement,
with framework and rate order reversed in the second population. Publication requires that isolation
and minimum duration. Warmup errors remain visible in validation summaries. Historical sequential
rate captures retain their original method and must not be silently relabeled.

A p99 range remains the minimum and maximum of driver/population percentiles, not a pooled percentile
or confidence interval. Higher offered demand is not guaranteed to produce monotonically higher
p99, particularly when admission misses change which requests receive a response. The fix addresses
the identified controller instability; it does not force the table to follow a desired ordering.

Validation: 65 Node adapter tests, 105 framework comparison tests, and 127 build-script tests passed.
Package-content and platform-boundary checks passed. A short real-runner smoke test completed all
eight fresh-process cases and was correctly rejected as too short for publication. The
[full follow-up capture](arrival-policy-final-2026-09-20.md) repeats browser, startup, heap, all Node/Bun
SSR lanes, and the native track with ordinary production workers.

The [structured experiment summary](ssr-arrival-investigation-2026-09-20.json) records capture
hashes, plans, environments, artifact identities, and measured rows. The
[evidence archive](ssr-arrival-investigation-2026-09-20-evidence.zip) retains raw captures,
experimental workers, adapter copies, plans, and validation logs.
