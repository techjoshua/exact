# Bun adaptive admission investigation, September 20–21, 2026

The Bun controller could reject a useful scheduling policy when throughput was limited by incoming demand. Like the former Node controller, it required the scheduled trial to beat both surrounding immediate windows on native departure rate and lag, discarded selected policies after one unfavorable sample, and forced a return to immediate mode after 30 seconds. An immediate control can briefly drain accumulated requests faster than the sustained offered rate. Finishing all offered work therefore did not guarantee that a lower-lag trial would pass.

A diagnostic trace at 8,000 offered RPS showed scheduling selected for about 30 seconds, followed by a deadline-triggered return to immediate mode and repeated rejected trials. Its measured response p99 was 33.7–34.2 ms. Forced immediate operation measured 34.5–34.8 ms. Forced scheduling measured 10.9–11.1 ms at the same offered rate, without request errors or capacity misses. These controls establish that admission scheduling affects the observed latency on Bun; the mere existence of a similar algorithm was not sufficient evidence.

## Runtime signals and rejected prototype

The installed Bun 1.4.2 `performance.eventLoopUtilization()` returned zero idle, active, and utilization counters both during idle waiting and after synchronous busy work. Treating that result as spare capacity would be incorrect. A conservative prototype used process-wide CPU and Node's 3 ms lag threshold instead. It did not retain the useful policy and measured 35.0–35.7 ms p99 at 8,000 RPS.

Process-wide CPU includes background threads. The forced-scheduling trace used roughly 90–106% of one core process-wide but about 69–72% on the event-loop thread. `process.threadCpuUsage()` produced a useful idle/busy distinction: 2.492 ms CPU during a 100 ms idle timer, and 97.608 ms during a 100 ms busy loop. The independent two-millisecond timer observer reported roughly 3.3–3.9 ms p95 intervals during responsive forced scheduling. Bun therefore needs a different lag threshold from Node's native histogram.

## Final policy

The final controller uses event-loop thread CPU rather than Bun's unavailable utilization counters. A demand-limited trial must improve lag against both immediate controls, keep timer p95 below 8 ms, use less than 85% of one thread's CPU, and drain native requests at least as quickly as 99% of observed arrivals. A selected policy with those headroom and drain properties remains active. Three consecutive unhealthy windows exhaust its transient grace period. Sustained busy operation consumes grace even before the routine deadline, and deferring a probe never resets its deadline.

Busy trials must improve native departure rate against both controls. They must also improve lag against both controls or keep timer p95 below 5 ms. This absolute responsiveness threshold prevents tiny near-floor timer differences from rejecting a measured capacity gain. Busy operation without demonstrated headroom keeps the original 250 ms monitor-tick reassessment deadline; only demonstrated headroom can defer that probe until a complete observation window.

Missing, throwing, zero, or otherwise unusable thread counters disable the headroom exception. Native pending responses remain pending across windows. Departures include cancellations, so the policy does not claim successful-response accounting. No response wrapping, coalescing, data caching, rendering shortcuts, or cancellation changes are introduced. CPU counters are read at observation boundaries, not per request.

## Initial production candidate

The first candidate used stricter 5 ms timer and 80% thread CPU limits. Its diagnostic measurements were 12.4–12.6 ms p99 at 8,000 RPS and 41.0–41.3 ms at 10,000 RPS, versus existing-controller controls of 33.7–34.2 ms and 44.5–44.8 ms. Forced scheduling measured 22.4 ms at 10,000 RPS, motivating further examination rather than always scheduling every workload.

These diagnostic runs use one pair of drivers, 30 seconds of target-rate warmup, and 60 seconds of measurement per fresh worker. Their p99 ranges span two driver percentiles, not a pooled percentile or confidence interval. These initial measurements had zero request errors and invalid responses. Prototype workers expose sampled controller state, so their timings remain diagnostic. Production verification uses uninstrumented workers and response-identity validation. Later failed and interrupted cases remain separate evidence.

## First full attempt and refined Bun limits

The first committed policy (fd135246, 5 ms timer p95 and 80% thread CPU limits) reproduced the 8,000-RPS improvement in the full production workers: 12.3–13.3 ms p99 over both populations. At 10,000 RPS it measured 41.3–41.9 ms in one population but 53.3–53.9 ms in the other. The latter exceeded the preceding full baseline's 48.6–50.2 ms. The run was stopped and retained under the first-full-attempt evidence; these results were not published as a successful final baseline.

Further traced controls showed periodic returns to immediate mode around the 30-second deadlines. The responsive forced-scheduling workload frequently exceeded the first conservative timer/CPU limits even while draining all offered work. A refined experiment required timer p95 below 8 ms and thread CPU below 85%, retaining the native-departure and lag-improvement conditions. In candidate/control-reversed repeated testing, the conservative policy measured 39.1–39.5 ms and 46.0 ms p99. The refined policy measured 23.4–23.6 ms and 25.8 ms, with approximately 10,000 valid RPS and no measured capacity misses or request errors.

One conservative-policy diagnostic control recorded 17 `ECONNRESET` errors on reused sockets, all within a brief burst and without invalid response bodies or worker-reported application errors. Those failures remain in the raw capture. The refined cases had zero errors. This investigation does not attribute the socket-reset cause beyond the captured transport evidence or alter connection handling to conceal it.

The refined candidate added tests for responsive Bun work with 82% thread CPU and 7 ms timer lag, and rejection at 86% CPU or 9 ms lag. All 40 adapter tests and 11 native integration tests passed, as did package-content and runtime-boundary checks. Saturated workload comparisons and an extended production soak then exposed the additional selection and deadline issues described below.

## Saturated capacity selection and deadline timing

The first wider-limit matrix had lower string throughput at c16/c32. Tracing the production adapter showed that those windows were CPU-busy, so the headroom exception was not active. The controller rejected a trial delivering 11,634 native departures per second versus controls of 9,598 and 10,472 because its timer p95 was about 4.1 ms versus a 3.7 ms control. The first attribution to overly permissive headroom was therefore not supported by the trace. Existing strict lag comparisons near the timer's dispatch interval could discard substantial capacity gains and enter long backoff periods.

The revised busy-policy rule still requires a native departure-rate win against both controls. It permits a trial with timer p95 below 5 ms to establish responsiveness without also beating tiny control-window lag differences. Slower trials still require lag wins against both controls. Selected busy policies still reject rate loss, genuinely higher lag, or an expired reassessment deadline. Demand-limited selection continues to require lower lag against both controls plus CPU headroom and native drain balance.

This correction recovered a production string matrix to 11,696 RPS at c16 and 13,138 at c32. The three-minute production measurement at 10,000 offered RPS delivered about 9,998 valid RPS with 26.9 ms p99, no request errors, and 363 capacity misses (about 0.02%). Its per-second captures retain a brief disturbance around measurement seconds 39–41, with individual interval p99 near 80–92 ms. The aggregate improvement is not a hard latency bound. The final 30 seconds had interval p99 maxima of about 36–38 ms.

A longer streaming ABBA comparison then retained a 2.5% relative deficit at c32 (2.0% absolute), while c128 was effectively unchanged. The headroom exception was inactive in the streaming trace. The earlier implementation had moved all enabled-policy deadline checks behind complete 750 ms observations. The final refinement preserves the original 250 ms monitor-tick deadline check whenever there is no demonstrated headroom; only recently responsive demand-limited operation can defer it. Thread CPU reads measured about 0.35 microseconds each on the installed Bun, excluding their direct sampling cost as an explanation for a multi-percent throughput gap. The paired verification below tests the restored busy deadline.

Restoring the busy deadline cadence recovered the longer streaming comparison. In ABBA order, c32 improved 1.56% in absolute eXact RPS and 2.58% in mean eXact/React ratio versus the original adapter. At c128, absolute RPS improved 0.56% and the ratio changed by −0.31%. All measured responses in those repeats were valid and request errors were zero. Individual runs and the earlier negative comparisons remain available; these small-sample differences are not confidence intervals.

The final implementation was frozen at 44721c11 after 43 adapter tests, 11 native Bun integration tests, package-content checks, runtime-boundary checks, and documentation type checking passed. The replacement full run rebuilds all participants, reruns Node/Bun string/streaming browser correctness and native correctness, and records a fresh source snapshot before timing. The long soak above predates only the restored busy-deadline check; the final full capture measures the committed implementation.

## Normal-streaming ratio follow-up

The final full run's normal-loading Bun streaming ratio fell 6.1% versus the preceding full capture. eXact absolute throughput changed by −0.7%, while React improved by 5.7%. This unfavorable result prompted a separate final/original/original/final comparison after the full suite, without rebuilding or changing source. Each case used two drivers, 15 seconds of c16 warmup, and 30 seconds at c32 with normal loading.

| Adapter | eXact RPS | React RPS | eXact/React |
| --- | ---: | ---: | ---: |
| Final, first | 4,382 | 4,543 | 0.965× |
| Original, first | 4,346 | 4,421 | 0.983× |
| Original, second | 4,342 | 4,507 | 0.963× |
| Final, second | 4,323 | 4,447 | 0.972× |

The final adapter improved mean absolute eXact throughput by 0.19%; the mean eXact/React ratio changed by −0.49%. All responses were valid and request errors were zero. Reverting the adapter did not restore the older approximately 1.001× ratio: React also outperformed that older baseline in the original-adapter controls. This does not isolate the cause of React's change, but the direct adapter comparison does not reproduce the 6.1% loss. The full-run deficit remains published rather than being replaced with the smaller focused difference. No production changes followed the full measurement, so that capture still measures the final implementation.

## Final full verification

The [replacement full capture](bun-admission-final-2026-09-20.md) completed all 27 build, correctness, and measurement stages against implementation 44721c11. Both runtimes passed 39 string and 25 streaming browser contracts, and the native track passed 12 contracts. Browser timing, startup, heap, all twelve sustained-load captures, string/stream diagnostics, and native timing were rerun. Using the suite's nearest-rank percentile convention, eXact measured 44 ms FCP at p50 and 49.2 ms mean; the other four frameworks measured 48 ms at p50.

Bun string demand measured 8,000 valid RPS at 8,000 offered RPS (12.3–13.6 ms p99) and 9,998 valid RPS at 10,000 offered RPS (23.4–24.4 ms p99). Those eXact measurement windows had zero capacity misses, zero scheduling-lag misses, zero request errors, and zero invalid responses. The raw captures retain deadline misses and warmup behavior. The preceding full capture measured p99 ranges of 31.1–39.6 ms and 48.6–50.2 ms. Each final range spans four driver/population percentiles. These are observed distribution changes, not guaranteed latency bounds.

The full report contains sustained string and streaming throughput, all eXact/React ratio changes, and the original historical comparison. It retains unfavorable results as well as improvements. Its artifact comparison checks participant entries and server code independently from the adapter.

The [structured investigation](bun-admission-investigation-2026-09-20.json) records diagnostic summaries and hashes. The [evidence archive](bun-admission-investigation-2026-09-20-evidence.zip) contains raw captures, copied adapters, preparation scripts, traces, validation logs, and the separate stopped first full attempt. Its provenance notes distinguish reconstructed initial copies from later capture-time artifact hashes. The overwritten initial candidate directory is excluded.

### Full-run Bun saturated capacity

The following rows compare the final full capture with the immediately preceding full capture. They retain small unfavorable differences alongside gains. The isolated longer streaming ABBA comparison above uses the original and final adapters within the same experimental sequence.

| API | Concurrency | eXact RPS | React RPS | Absolute eXact change | eXact/React ratio change |
| --- | ---: | ---: | ---: | ---: | ---: |
| string | 16 | 11,298 | 10,118 | -0.2% | +0.2% |
| string | 32 | 12,798 | 11,038 | +1.0% | +1.4% |
| string | 64 | 12,866 | 11,536 | +0.3% | +1.6% |
| string | 128 | 11,971 | 11,690 | +0.1% | +2.0% |
| stream | 16 | 7,319 | 7,430 | -0.9% | -1.4% |
| stream | 32 | 7,472 | 7,474 | -0.2% | -0.4% |
| stream | 64 | 7,399 | 7,426 | +0.8% | +0.7% |
| stream | 128 | 6,915 | 7,457 | +0.5% | -2.2% |
