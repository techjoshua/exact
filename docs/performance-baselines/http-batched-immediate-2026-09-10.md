# Batched immediate scheduling, 2026-09-10

Hypothesis before measurement: sharing one setImmediate callback across waiting render requests may improve throughput by another 3 to 10 percent over one callback per request. It reduces callback count and changes interleaving between rendering and response publication. This experiment does not independently isolate those two effects.

The diagnostic worker queues Promise resolvers in an array. The first resolver schedules setImmediate; subsequent resolvers join that batch. The callback detaches the pending batch, then resolves every Promise. The waiting render continuations execute afterward. Each request still renders its full document using the retained eXact renderer and unchanged output adapter. This is eXact-only; no React behavior or baseline changes.

Two fresh production Node 26.8.1 workers each run normal/immediate/batch/immediate/normal. Normal has no added deferral; immediate schedules one callback per request. Workers warm HTTP for ten seconds; each measured block lasts five seconds with two fresh drivers holding 16 requests each. Controls are averaged within each worker. Isolated before/after loops each warm and measure 10,000 renders and bypass queueing. Workstation load can vary.

| Worker | Normal RPS | Per-request immediate RPS | Batched RPS | Batch gain vs normal | Batch gain vs immediate | Mean requests per batch |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 8,470 | 9,889 | 14,133 | +66.86% | +42.92% | 15.64 |
| 2 | 8,419 | 10,024 | 14,179 | +68.41% | +41.45% | 14.55 |

| Worker | Scheduling | Synchronous invocation us | Await after invocation us | Initial queue us | Complete response mean ms |
| --- | --- | ---: | ---: | ---: | ---: |
| 1 | normal | 52.96 | 4.80 | 0.00 | 3.749 |
| 1 | immediate | 48.15 | 1.42 | 1430.63 | 3.211 |
| 1 | batch | 32.12 | 257.65 | 449.93 | 2.242 |
| 2 | normal | 53.80 | 4.82 | 0.00 | 3.773 |
| 2 | immediate | 48.33 | 1.41 | 1416.89 | 3.165 |
| 2 | batch | 32.59 | 247.11 | 443.46 | 2.236 |

The render timer spans synchronous invocation and awaiting its returned value. Under batching, that await can include other requests running before this continuation resumes. It is not an exclusive CPU-time measure. Initial scheduling wait is separately excluded from that timer but included in response latency. Per-stage durations across concurrently active requests cannot be added as exclusive work.

All 510,024 measured responses matched the full 4,672-byte document, with zero errors. Batch request counters match render-invocation counters only in batch blocks. Queue counters match invocation counts in queued blocks, and are absent from normal blocks and isolated loops. Artifact and adapter hash guards pass.

No production scheduling change is adopted from this diagnostic. It still needs a framework-owned scheduling boundary, cancellation and ownership coverage, low-concurrency behavior, bounded batching/fairness, and early streaming/browser validation. These results are not a full Node/Bun string/stream benchmark baseline.

Raw blocks, scripts, summaries and participant artifacts are in the adjacent evidence archive with a verified SHA-256 inventory.
