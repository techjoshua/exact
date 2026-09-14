# Adaptive scheduling node tails

Small document, Node string. Adaptive policy trials scheduling after sustained lag and backs off if lag does not improve. Monitoring runs in both eXact controls. React is unchanged.

Diagnostic only, no production queue or adaptive policy change. Each response renders the application and authored shell with hydration; byte/hash identity is checked. Two load drivers report their own percentiles. The A / B values below are separate driver percentiles, not a pooled or averaged percentile. Repeated controls expose machine workload drift.

| Repeat | Framework | Policy | RPS | Response p95 A / B (ms) | Response p99 A / B (ms) | TTFB p99 A / B (ms) |
| --- | --- | --- | ---: | --- | --- | --- |
| 1 | exact | normal | 7,104 | 5.971 / 5.903 | 9.087 / 7.079 | 9.071 / 7.063 |
| 1 | exact | adaptive | 12,210 | 4.191 / 4.107 | 8.775 / 5.387 | 8.759 / 5.367 |
| 1 | exact | forced | 11,273 | 4.403 / 4.395 | 9.071 / 9.471 | 9.063 / 9.447 |
| 1 | exact | normal | 8,162 | 5.407 / 5.403 | 8.815 / 8.495 | 8.807 / 8.479 |
| 1 | react | normal | 10,089 | 4.143 / 4.099 | 9.471 / 4.863 | 9.455 / 4.847 |
| 2 | react | normal | 10,051 | 4.135 / 4.187 | 4.915 / 9.911 | 4.899 / 9.895 |
| 2 | exact | normal | 7,649 | 5.555 / 5.623 | 6.551 / 8.215 | 6.527 / 8.191 |
| 2 | exact | forced | 13,272 | 3.725 / 3.733 | 9.159 / 8.743 | 9.143 / 8.735 |
| 2 | exact | adaptive | 13,540 | 3.549 / 3.523 | 9.007 / 8.967 | 8.967 / 8.951 |
| 2 | exact | normal | 8,157 | 5.323 / 5.391 | 6.231 / 7.647 | 6.211 / 7.591 |

812,451 complete measured responses, zero errors. Full capture includes mean, p50, max, CPU, event-loop metrics and telemetry. No percentile aggregation is possible from these summary-only captures.

Adaptive scheduling improves throughput in both repeats, but this does not establish sparse-traffic overhead or sustained behavior under changing workloads. The prototype does not continuously reconsider a successful trial.
