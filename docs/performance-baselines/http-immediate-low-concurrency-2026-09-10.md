# Low-concurrency rendering deferral, 2026-09-10

Follow-up to the concurrency-32 setImmediate experiment. Hypothesis: moving rendering to a later event-loop phase may improve batching under load but add latency when requests arrive individually. This diagnostic tests whether the earlier throughput gain justifies unconditional scheduling.

Production Node 26.8.1, unchanged full-document participants and adapters. Four fresh workers run eXact/React/React/eXact, with one load driver and concurrency one or four. Each worker warms HTTP for ten seconds and runs normal/deferred/normal three-second blocks at each concurrency. The second population reverses concurrency order. Controls are averaged within each worker. Workstation load may vary. Queue delay is included in response latency. This is a worker-only string-rendering experiment, not a production implementation.

| Framework | Worker | Concurrency | Normal RPS | Deferred RPS | Change | Response mean ms, normal / deferred |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| exact | 1 | 1 | 4,658 | 4,702 | +0.95% | 0.191 / 0.189 |
| exact | 1 | 4 | 9,154 | 9,692 | +5.87% | 0.416 / 0.393 |
| react | 1 | 1 | 5,299 | 5,213 | -1.61% | 0.166 / 0.169 |
| react | 1 | 4 | 10,965 | 11,957 | +9.04% | 0.347 / 0.318 |
| exact | 2 | 1 | 4,827 | 4,371 | -9.43% | 0.184 / 0.205 |
| exact | 2 | 4 | 8,683 | 9,663 | +11.29% | 0.440 / 0.395 |
| react | 2 | 1 | 5,204 | 5,282 | +1.50% | 0.169 / 0.167 |
| react | 2 | 4 | 11,062 | 11,546 | +4.37% | 0.344 / 0.329 |

| Framework | Worker | Concurrency | TTFB mean ms, normal / deferred | TTFB p95 ms, normal / deferred |
| --- | ---: | ---: | ---: | ---: |
| exact | 1 | 1 | 0.176 / 0.174 | 0.266 / 0.260 |
| exact | 1 | 4 | 0.403 / 0.381 | 0.634 / 0.614 |
| react | 1 | 1 | 0.152 / 0.155 | 0.223 / 0.224 |
| react | 1 | 4 | 0.335 / 0.307 | 0.568 / 0.512 |
| exact | 2 | 1 | 0.169 / 0.188 | 0.251 / 0.299 |
| exact | 2 | 4 | 0.426 / 0.382 | 0.675 / 0.602 |
| react | 2 | 1 | 0.154 / 0.152 | 0.238 / 0.224 |
| react | 2 | 4 | 0.332 / 0.318 | 0.581 / 0.518 |

Control quantiles above are averages of the two adjacent block quantiles, not quantiles of a pooled distribution.

All 546,486 measured responses passed complete-document validation, with zero errors. Artifact and adapter hash guards passed. No production code changed.

The concurrency-one result does not reproduce the large gain at concurrency 32, and one eXact repetition regresses. The evidence does not justify an unconditional yield before every render. Scheduling remains a load-dependent experimental direction. Its benefit in both frameworks does not explain the remaining relative gap.

A production experiment must use an actual framework-owned dispatch boundary, preserve immediate request-body consumption and synchronous response-body claiming, and separately validate streaming head delivery and browser latency. Delaying before claiming an already-created response body can change ownership semantics. These results do not authorize that change.

The adjacent evidence archive includes raw results, scripts and a verified SHA-256 inventory. This is a focused diagnostic, not a new full benchmark baseline.
