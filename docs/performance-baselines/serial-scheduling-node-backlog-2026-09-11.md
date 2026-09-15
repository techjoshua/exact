# Serial scheduling node backlog

Large document, Node string, concurrency 256. Hypothesis: one pending callback, releasing at most 8 or 32 starts, lets networking progress under a backlog and may reduce tail latency; throughput may decrease. React is unchanged.

Diagnostic only, no production queue or adaptive policy change. Each response renders the application and authored shell with hydration; byte/hash identity is checked. Two load drivers report their own percentiles. The A / B values below are separate driver percentiles, not a pooled or averaged percentile. Repeated controls expose machine workload drift.

| Repeat | Framework | Policy       |   RPS | Response p95 A / B (ms) | Response p99 A / B (ms) | TTFB p99 A / B (ms) |
| ------ | --------- | ------------ | ----: | ----------------------- | ----------------------- | ------------------- |
| 1      | exact     | normal       | 3,186 | 95.871 / 95.679         | 111.487 / 111.039       | 111.423 / 110.975   |
| 1      | exact     | scheduled-32 | 4,000 | 81.919 / 79.359         | 96.895 / 96.895         | 96.831 / 96.831     |
| 1      | exact     | serial-8     | 3,715 | 82.879 / 82.687         | 87.167 / 87.103         | 87.103 / 87.039     |
| 1      | exact     | serial-32    | 3,692 | 84.159 / 84.031         | 101.631 / 97.727        | 101.631 / 97.663    |
| 1      | exact     | normal       | 3,482 | 91.903 / 92.031         | 93.247 / 93.247         | 93.183 / 93.183     |
| 1      | react     | normal       | 3,428 | 92.863 / 92.863         | 101.247 / 101.183       | 101.183 / 101.183   |
| 2      | react     | normal       | 3,431 | 95.359 / 95.039         | 102.783 / 102.719       | 102.719 / 102.655   |
| 2      | exact     | normal       | 3,303 | 96.383 / 95.743         | 99.519 / 99.583         | 99.455 / 99.519     |
| 2      | exact     | serial-32    | 3,538 | 90.111 / 90.239         | 103.359 / 103.359       | 103.359 / 103.295   |
| 2      | exact     | serial-8     | 3,466 | 91.327 / 91.519         | 97.727 / 97.663         | 97.663 / 97.599     |
| 2      | exact     | scheduled-32 | 3,701 | 92.799 / 92.927         | 103.295 / 103.807       | 103.231 / 103.743   |
| 2      | exact     | normal       | 3,312 | 97.023 / 97.087         | 104.639 / 105.471       | 104.575 / 105.407   |

214,392 complete measured responses, zero errors. Full capture includes mean, p50, max, CPU, event-loop metrics and telemetry. No percentile aggregation is possible from these summary-only captures.

Assess the bookended controls and both repeats before interpreting changes. This diagnostic stresses queue overflow that concurrency 32 cannot exercise for a 32-start limit. The prototype remains signal-free and cannot replace the production scheduler without lifecycle coverage.
