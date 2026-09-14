# Scheduler queue wait trace

Hypothesis: bounded serial batches improve loop fairness by moving request latency into the render-start queue. Large96 Node string, concurrency 256. Both frameworks receive the same outer timing wrapper. eXact gets request-local scheduler timing. Instrumentation adds allocations and Promise work, so this is explanatory evidence rather than an uninstrumented performance baseline.

Ten-second warmup, five-second measured blocks, two fresh-worker repeats with reversed ordering and immediate controls before and after scheduled variants. Machine workload may vary. Full authored documents and hydration are validated by response bytes and SHA-256.

| Repeat | Framework / variant | Policy | RPS | Response p95 A / B (ms) | Response p99 A / B (ms) |
| --- | --- | --- | ---: | --- | --- |
| 1 | exact | normal | 3,203 | 98.303 / 98.303 | 115.135 / 115.135 |
| 1 | exact | scheduled-32 | 3,848 | 89.663 / 89.343 | 98.175 / 98.111 |
| 1 | exact | serial-8 | 3,457 | 87.871 / 87.935 | 95.295 / 95.103 |
| 1 | exact | serial-32 | 3,603 | 84.479 / 84.479 | 93.631 / 92.735 |
| 1 | exact | normal | 3,394 | 96.639 / 96.639 | 104.831 / 104.831 |
| 1 | react | normal | 3,563 | 89.663 / 89.727 | 91.583 / 91.263 |
| 2 | react | normal | 3,636 | 88.255 / 88.319 | 90.239 / 90.239 |
| 2 | exact | normal | 3,227 | 96.255 / 96.063 | 101.183 / 99.839 |
| 2 | exact | serial-32 | 3,666 | 82.239 / 82.111 | 88.383 / 87.615 |
| 2 | exact | serial-8 | 3,523 | 85.503 / 85.503 | 96.831 / 97.983 |
| 2 | exact | scheduled-32 | 3,914 | 81.279 / 81.343 | 93.951 / 94.847 |
| 2 | exact | normal | 3,543 | 88.191 / 88.191 | 89.343 / 89.471 |

216,082 complete measured responses, zero errors. Percentiles are separate per-driver values, never pooled or averaged. Invocation guards pass.

| Repeat | Framework | Policy | Mean queue (ms) | Mean remaining call (ms) | Queue share in slow sampled calls |
| --- | --- | --- | ---: | ---: | ---: |
| 1 | exact | normal | 0.001 | 0.222 | 0.0% |
| 1 | exact | scheduled-32 | 12.311 | 6.232 | 75.1% |
| 1 | exact | serial-8 | 69.050 | 1.482 | 98.1% |
| 1 | exact | serial-32 | 55.294 | 6.268 | 89.9% |
| 1 | exact | normal | 0.001 | 0.209 | 0.0% |
| 1 | react | normal | 0.001 | 0.185 | 0.0% |
| 2 | react | normal | 0.001 | 0.181 | 0.0% |
| 2 | exact | normal | 0.001 | 0.220 | 0.0% |
| 2 | exact | serial-32 | 54.458 | 6.160 | 90.2% |
| 2 | exact | serial-8 | 67.824 | 1.453 | 97.9% |
| 2 | exact | scheduled-32 | 12.209 | 6.054 | 77.1% |
| 2 | exact | normal | 0.001 | 0.200 | 0.0% |

One in 64 calls is sampled deterministically, capped at 8,192 samples per block. The last column selects the slowest approximately 5% of these samples. Remaining time is wall time after subtracting this call's measured gate wait, including other requests and Promise continuations. It is not renderer CPU time. Gate timing includes the diagnostic continuation.

Serial 8 moves average waiting to roughly 68-69 ms versus 12 ms with the current scheduler. Approximately 98% of slow sampled serial-8 call time is queue wait. Do not select a default policy from event-loop lag alone. No production policy change.
