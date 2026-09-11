# Serial scheduling bun tails

Large document, native Bun string. Serial queue schedules only one pending callback and schedules the next bounded drain from inside it. Current queue can schedule several callbacks in one turn. React is unchanged.

Diagnostic only, no production queue or adaptive policy change. Each response renders the application and authored shell with hydration; byte/hash identity is checked. Two load drivers report their own percentiles. The A / B values below are separate driver percentiles, not a pooled or averaged percentile. Repeated controls expose machine workload drift.

| Repeat | Framework | Policy | RPS | Response p95 A / B (ms) | Response p99 A / B (ms) | TTFB p99 A / B (ms) |
| --- | --- | --- | ---: | --- | --- | --- |
| 1 | exact | normal | 2,527 | 15.639 / 15.607 | 17.199 / 17.071 | 17.135 / 17.023 |
| 1 | exact | scheduled-32 | 2,472 | 16.575 / 16.199 | 23.679 / 23.327 | 23.599 / 23.295 |
| 1 | exact | serial-4 | 2,249 | 17.407 / 17.359 | 19.039 / 19.023 | 18.959 / 18.943 |
| 1 | exact | serial-8 | 2,340 | 16.767 / 16.751 | 17.983 / 18.303 | 17.935 / 18.255 |
| 1 | exact | serial-32 | 2,481 | 17.759 / 17.359 | 23.679 / 23.599 | 23.631 / 23.535 |
| 1 | exact | normal | 2,815 | 14.567 / 14.599 | 15.815 / 15.711 | 15.743 / 15.615 |
| 1 | react | normal | 2,959 | 13.695 / 13.711 | 14.687 / 14.743 | 14.599 / 14.679 |
| 2 | react | normal | 3,099 | 12.887 / 12.895 | 14.191 / 13.823 | 14.087 / 13.751 |
| 2 | exact | normal | 2,986 | 13.751 / 13.735 | 14.543 / 14.751 | 14.455 / 14.663 |
| 2 | exact | serial-32 | 2,561 | 15.311 / 16.783 | 22.095 / 22.975 | 22.047 / 22.927 |
| 2 | exact | serial-8 | 2,269 | 18.335 / 18.143 | 20.255 / 20.415 | 20.223 / 20.335 |
| 2 | exact | serial-4 | 1,898 | 20.863 / 20.783 | 22.415 / 22.287 | 22.367 / 22.239 |
| 2 | exact | scheduled-32 | 2,278 | 19.327 / 18.751 | 26.431 / 22.607 | 26.383 / 22.543 |
| 2 | exact | normal | 2,699 | 14.767 / 14.735 | 16.007 / 15.759 | 15.895 / 15.703 |

178,633 complete measured responses, zero errors. Full capture includes mean, p50, max, CPU, event-loop metrics and telemetry. No percentile aggregation is possible from these summary-only captures.

Smaller serial batches reduce some p99 values relative to batches of 32, while losing throughput and increasing p95. Immediate rendering remains the better large-document Bun choice here. The signal-free prototype lacks production cancellation and scheduler-failure handling.

Separate Node fairness probe: 1,024 queued starts, each doing approximately 0.05 ms of synchronous work. A timer armed by the first start ran after all 1,024 starts with the current scheduler, and after 32 with the serial prototype. This demonstrates timer fairness, not HTTP or socket latency.
