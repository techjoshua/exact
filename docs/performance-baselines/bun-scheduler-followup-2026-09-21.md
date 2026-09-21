# Bun scheduler follow-up, September 21, 2026

No additional scheduler, fixture, or measurement-protocol change was adopted. The retained implementation is the Bun fragment-buffering improvement at `1663f74b37fe440c86da9082c934ba07938874b1`, already measured by the [full comparison](bun-stream-counting-final-2026-09-21.md). Its charts remain current. These focused experiments do not replace a full capture or establish complete historical performance recovery.

Measurements ran serially in private native Linux loopback namespaces with Bun 1.4.2 and Node v26.9.0. Private artifact and adapter copies isolate each candidate. Scheduled-demand cases use two drivers, 30 seconds of target-rate warmup, and 60 seconds of measurement. Concurrency sweeps use 10 seconds of warmup and 15 seconds each at total concurrency 16, 32, 64, and 128. Each focused case has one population; full captures have repeated populations. P99 ranges below span individual driver percentiles, not confidence intervals.

See the [structured results](bun-scheduler-followup-2026-09-21.json) and [raw evidence, profiles, and experimental sources](bun-scheduler-followup-2026-09-21-evidence.zip). Unexecuted runner files in the archive are not evidence of completed measurements; execution journals and complete captures identify what ran.

## Correct reference labels

The [September 20 capture](bun-admission-final-2026-09-20.md) reports Bun streaming at 10,000 offered RPS as **6,681 valid RPS, 33.11% missed arrivals, and 108.29–136.32 ms p99**. Bun string is **9,998 valid RPS and 23.42–24.42 ms p99**. The **9,866 RPS / 1.34% misses / 72.26–77.82 ms p99** row belongs to **Node streaming**. An earlier conversational summary incorrectly called that Bun string. The published historical capture has the correct labels.

## Shorter Bun control probes: rejected

This candidate keeps CPU thresholds, native-departure accounting, batching, cancellation, and rendering unchanged. It removes the unmeasured interval after a scheduled trial and requires one completed high-lag control window during reassessment of a previously selected policy. Initial selection remains unchanged. All 24 existing controller tests pass unchanged against the candidate, including workload changes, accumulating native bodies, idle cleanup, and unavailable CPU counters.

String tail latency improved in two pairs: from 39.2–39.6 ms to 24.6–24.8 ms, then from 33.0–33.3 ms to 23.6–23.7 ms. However, throughput guards failed. A Node experiment had already shown a c64 streaming loss; the following independent Bun guards establish why a Bun-only change was also not adopted.

| Bun workload           | c16 ratio change | c32 ratio change | c64 ratio change | c128 ratio change |
| ---------------------- | ---------------: | ---------------: | ---------------: | ----------------: |
| Preloaded streaming    |            +3.8% |            +4.9% |            +4.2% |             -3.2% |
| 96-row string document |            +1.7% |            -1.7% |            -2.7% |             -1.0% |

These are changes in eXact/React valid-RPS ratios, preserving the requested relative comparison. The candidate does not meet the requirement to improve latency without losing throughput elsewhere. The larger-page guard failed, so the prepared conditional repeat was not run.

### Fresh scheduled-demand pairs at 10,000 offered RPS

| Variant        | API    | Valid RPS | Capacity misses | Response p99 range, ms | Errors / invalid |
| -------------- | ------ | --------: | --------------: | ---------------------: | ---------------: |
| Control        | stream |     7,163 |          28.28% |          123.90–127.87 |            0 / 0 |
| Shorter probes | stream |     7,236 |          27.55% |          103.55–131.97 |            0 / 0 |
| Control        | string |     9,998 |           0.02% |            32.99–33.34 |            0 / 0 |
| Shorter probes | string |    10,000 |           0.00% |            23.65–23.70 |            0 / 0 |
| Asset control  | stream |     6,957 |          30.36% |          128.77–136.32 |            0 / 0 |
| Asset cache    | stream |     6,552 |          34.38% |           97.53–149.76 |            0 / 0 |
| Asset control  | string |    10,000 |           0.00% |            25.54–25.57 |            0 / 0 |
| Asset cache    | string |    10,000 |           0.00% |            25.20–25.23 |            0 / 0 |

The streaming shorter-probe pair improves valid RPS by only 1.0%, with mixed p99 results. It does not by itself establish a repeatable gain. Fresh unchanged streaming controls reached 6,957 and 7,163 RPS, exceeding the historical 6,681 reference, while the retained full capture measured 6,592. This demonstrates variation with unchanged framework code; it is not permission to discard the unfavorable full result. The full capture remains the published baseline.

## Static asset parsing: rejected

The fixture reparses build-generated script and stylesheet tags on every render. A bounded one-entry cache improved render-only diagnostics and Bun closed-loop capacity, but scheduled streaming demand fell from 6,957 to 6,552 valid RPS. String results were essentially unchanged. The cache is not adopted. It belongs to fixture preparation, not the framework scheduler, and a fair published application change would require equivalent preparation for React. Twenty-eight exact-output checks passed on each runtime across string/stream output, empty tags, repeated tags, changed tags, and duplicate sources.

## Other completed experiments

- Raising CPU selection and retention thresholds to 95% sometimes reduced string tails, but Node streaming regressed and Bun string results were inconsistent. Rejected.
- Relaxing retention alone also lost Node streaming throughput and worsened Bun string p99, with negligible streaming gain. Rejected.
- Replacing Bun's fragment array with repeated string concatenation did not improve the matched comparisons. Rejected.
- Removing Node constructor indirection did not establish a consistent gain. Render-only diagnostics did not reproduce a current-renderer slowdown. No constructor change was adopted.

## Measurement overhead and attribution

Node CPU profiles attributed approximately 6–7% of sampled time to `process.cpuUsage`. The benchmark calls it twice per request, in addition to periodic telemetry. Private variants removed only per-request CPU collection and retained wall timings, error accounting, and periodic process CPU. Node closed-loop streaming ratios improved approximately 0.4–4.3%. Bun string scheduled demand rose from about 9,970 to 9,995 RPS and p99 fell from about 55 to 40 ms. This is a measurement-overhead finding, not a framework speedup. The production measurement protocol remains unchanged.

A diagnostic socket counter observed approximately one native write operation per eXact Node preloaded streaming response. That case did not support a redundant-write optimization. Render-only experiments exclude HTTP and scheduler costs and cannot be presented as request-capacity measurements.

The useful scheduler effect demonstrated here is lower tail latency while demand is within capacity. At saturated streaming demand, shorter probes did not establish a consistent capacity improvement. The exact cause of every cross-capture difference remains unproven; the results do not justify changing CPU thresholds, dropping correctness work, or claiming complete recovery.

## Evidence limitations and unrelated observations

Two captures named `node-threshold-large-string-*` actually used the ordinary Node fixture. They are retained as ordinary-page captures and are not large-page guards. The new Bun large-page guard does expand both participants to 96 incident rows.

One unchanged Bun per-request-CPU control recorded two warmup ECONNRESET errors. Raw evidence retains them. The new asset and shorter-probe scheduled-demand pairs and Bun workload guards had zero request errors and invalid responses. Existing React overload timeouts remain documented in the full capture and were not investigated here.
