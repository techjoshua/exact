# Serial scheduling node wide

Large document, Node string, concurrency 256. Hypothesis: bounded serial drains of 64 or 128 starts may recover throughput lost with 8 or 32 while retaining opportunities for other event-loop work. Compare the existing scheduler with unchanged React.

Diagnostic only, no production queue or adaptive policy change. Each response renders the application and authored shell with hydration; byte/hash identity is checked. Two load drivers report their own percentiles. The A / B values below are separate driver percentiles, not a pooled or averaged percentile. Repeated controls expose machine workload drift.

| Repeat | Framework | Policy | RPS | Response p95 A / B (ms) | Response p99 A / B (ms) | TTFB p99 A / B (ms) |
| --- | --- | --- | ---: | --- | --- | --- |
| 1 | exact | normal | 3,398 | 90.175 / 90.303 | 92.415 / 93.183 | 92.287 / 93.119 |
| 1 | exact | scheduled-32 | 3,812 | 84.607 / 84.415 | 102.655 / 101.183 | 102.655 / 101.183 |
| 1 | exact | serial-64 | 3,871 | 80.831 / 80.767 | 86.143 / 86.655 | 86.143 / 86.591 |
| 1 | exact | serial-128 | 3,784 | 94.847 / 93.951 | 105.343 / 104.255 | 105.279 / 104.191 |
| 1 | exact | normal | 3,501 | 90.111 / 90.111 | 91.391 / 91.327 | 91.391 / 91.327 |
| 1 | react | normal | 3,412 | 93.631 / 93.567 | 101.375 / 101.183 | 101.311 / 101.183 |
| 2 | react | normal | 3,565 | 89.023 / 88.959 | 93.311 / 93.247 | 93.247 / 93.183 |
| 2 | exact | normal | 3,110 | 97.151 / 97.087 | 104.959 / 104.959 | 104.895 / 104.895 |
| 2 | exact | serial-128 | 3,821 | 90.559 / 89.663 | 96.383 / 95.999 | 96.383 / 95.999 |
| 2 | exact | serial-64 | 3,687 | 85.183 / 84.031 | 99.007 / 99.455 | 98.943 / 99.391 |
| 2 | exact | scheduled-32 | 3,915 | 83.199 / 83.327 | 94.591 / 94.143 | 94.527 / 94.079 |
| 2 | exact | normal | 3,411 | 93.631 / 93.567 | 95.487 / 95.743 | 95.423 / 95.679 |

219,395 complete measured responses, zero errors. Full capture includes mean, p50, max, CPU, event-loop metrics and telemetry. No percentile aggregation is possible from these summary-only captures.

Serial 64 changes throughput by +1.55% and -5.84% relative to the current scheduler. Response p99 improves in repeat one and regresses in repeat two. Event-loop p99 consistently drops from roughly 63-64 ms to 26-27 ms. Serial 128 does not reliably improve response tails or event-loop delay. Neither variant is adopted.

The separate 1,024-start timer probe observed 1,024 starts before the timer with the current scheduler, 64 with serial 64, and 128 with serial 128. This is timer fairness evidence, not measured network latency.

Next investigation: separately measure scheduler queue wait and render/service time. A policy must account for end-to-end p95/p99 and throughput as well as loop lag. The current captures cannot identify each request's contribution to the latency tail.
