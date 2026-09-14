# Adaptive scheduling bun tails

Large document, native Bun string. Adaptive policy trials scheduling after sustained lag and backs off if lag does not improve. Monitoring runs in both eXact controls. React is unchanged.

Diagnostic only, no production queue or adaptive policy change. Each response renders the application and authored shell with hydration; byte/hash identity is checked. Two load drivers report their own percentiles. The A / B values below are separate driver percentiles, not a pooled or averaged percentile. Repeated controls expose machine workload drift.

| Repeat | Framework | Policy   |   RPS | Response p95 A / B (ms) | Response p99 A / B (ms) | TTFB p99 A / B (ms) |
| ------ | --------- | -------- | ----: | ----------------------- | ----------------------- | ------------------- |
| 1      | exact     | normal   | 2,483 | 15.327 / 15.335         | 17.071 / 16.991         | 16.991 / 16.895     |
| 1      | exact     | adaptive | 2,415 | 16.279 / 16.479         | 19.615 / 20.239         | 19.519 / 20.159     |
| 1      | exact     | forced   | 2,477 | 16.175 / 18.815         | 21.567 / 25.759         | 21.519 / 25.711     |
| 1      | exact     | normal   | 2,696 | 14.663 / 14.599         | 15.783 / 15.687         | 15.711 / 15.623     |
| 1      | react     | normal   | 2,887 | 13.583 / 13.575         | 14.479 / 14.439         | 14.383 / 14.319     |
| 2      | react     | normal   | 2,717 | 14.039 / 14.103         | 15.071 / 14.983         | 14.991 / 14.903     |
| 2      | exact     | normal   | 2,732 | 14.655 / 14.599         | 15.791 / 15.735         | 15.711 / 15.647     |
| 2      | exact     | forced   | 2,446 | 17.183 / 16.527         | 23.151 / 21.999         | 23.119 / 21.951     |
| 2      | exact     | adaptive | 2,431 | 16.991 / 17.327         | 19.759 / 20.719         | 19.695 / 20.623     |
| 2      | exact     | normal   | 2,646 | 15.247 / 15.327         | 16.799 / 16.863         | 16.703 / 16.767     |

207,756 complete measured responses, zero errors. Full capture includes mean, p50, max, CPU, event-loop metrics and telemetry. No percentile aggregation is possible from these summary-only captures.

The controller disabled unsuccessful trials, but adaptive scheduling still lost throughput and worsened tails relative to immediate controls. Lag alone is insufficient to select the policy. Do not enable this prototype by default.
