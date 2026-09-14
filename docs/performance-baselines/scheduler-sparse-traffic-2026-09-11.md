# Sparse host scheduling checks

Three measured string-document requests per participant and runtime, each after 30 seconds idle, following one discarded warmup. Participants are eXact immediate, eXact scheduled and unchanged React. Request order rotates. Connections close after each response. Node uses the comparison browser transport; native Bun SSR uses the browser frontend proxy. These few samples check quiet-host behavior, not p95/p99 or throughput.

| Runtime | Participant | Median TTFB (ms) | Median response (ms) | Response range (ms) |
| --- | --- | ---: | ---: | --- |
| node | exact-immediate | 2.071 | 2.198 | 2.040-3.785 |
| node | exact-scheduled | 2.239 | 2.380 | 2.305-4.654 |
| node | react | 2.013 | 2.122 | 1.944-3.629 |
| bun | exact-immediate | 5.189 | 5.235 | 5.205-7.276 |
| bun | exact-scheduled | 5.452 | 5.509 | 4.245-7.108 |
| bun | react | 4.740 | 4.783 | 4.694-6.022 |

18 complete measured responses passed status, document, and stable hash checks. Immediate and scheduled eXact hashes match. Scheduling remains opt-in; these low sample counts do not establish a zero-cost guarantee. The adaptive prototype is not installed or measured here.
