# Explicit queue comparison for eXact HTTP rendering, 2026-09-10

Hypothesis before measurement: nextTick and queueMicrotask deferral will produce little throughput improvement, whereas setImmediate will reproduce the earlier gain at concurrency 32. This tests the actual queue APIs rather than treating an earlier Promise deferral as a complete substitute.

A diagnostic worker schedules the same render callback through a Promise resolved by process.nextTick, queueMicrotask, or setImmediate. The unchanged control performs no added deferral. The queued modes all include the Promise continuation; this does not compare direct callback execution without that Promise. Queue wait is recorded separately from synchronous render invocation and remains included in complete-response latency. Isolated loops bypass queueing, verified by counters.

Only eXact is executed in this experiment. No React renderer, app, scheduling or production baseline is changed. The worker uses the retained compiled eXact artifact and unchanged response adapter. This is not a framework implementation or new full benchmark baseline.

Two fresh production Node 26.8.1 workers each warm HTTP for ten seconds. The first runs normal/nextTick/normal/microtask/normal/immediate/normal; the second reverses that order. Blocks last five seconds, with two fresh load drivers holding 16 requests each. Controls average the two adjacent normal blocks. Before/after isolated loops each warm and measure 10,000 renders. Workstation load can vary.

| Worker | Queue | Normal RPS | Queued RPS | Change | Invocation us, normal / queued | Response mean ms, normal / queued | Queue mean us |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | nextTick | 8,786 | 8,884 | +1.12% | 52.79 / 52.01 | 3.614 / 3.573 | 2.7 |
| 1 | microtask | 8,894 | 8,678 | -2.43% | 52.43 / 53.62 | 3.569 / 3.659 | 2.7 |
| 1 | immediate | 8,635 | 10,187 | +17.97% | 53.61 / 48.89 | 3.679 / 3.115 | 1374.8 |
| 2 | immediate | 8,320 | 9,938 | +19.45% | 54.13 / 48.71 | 3.820 / 3.193 | 1423.1 |
| 2 | microtask | 8,475 | 8,593 | +1.40% | 53.31 / 52.38 | 3.747 / 3.695 | 2.8 |
| 2 | nextTick | 8,446 | 8,398 | -0.57% | 53.56 / 53.28 | 3.759 / 3.780 | 2.8 |

All 615,877 measured responses matched the complete 4,672-byte document, with zero errors. Queue counters match render invocations in each treatment, and are absent in controls and isolated loops. Artifact and adapter hash guards pass.

This measures a scheduling effect, not its underlying CPU or I/O mechanism. It does not prove that unconditional deferral is appropriate: earlier low-concurrency tests included a single-request regression. Production adoption still needs an actual framework-owned boundary, response ownership and cancellation coverage, and early streaming/browser validation.

The adjacent evidence archive includes raw blocks, summaries, worker and runner scripts, participant artifacts and verified SHA-256 inventory.
