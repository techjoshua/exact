# Batching at the framework render entry, 2026-09-10

Hypothesis: the large worker-level batching gain survives moving the wait into renderHydratableOutput, before root props preparation, hydration capture and render-owner creation. This locates a possible framework-owned boundary without changing the engine or sink API.

The prototype transforms the frozen compiled artifact at that function boundary. It does not modify production package source or establish a public scheduling API. The HTTP worker performs no scheduling delay. A shared setImmediate resolves the waiting Promise batch; every render then continues through the existing implementation. AbortSignal is checked before queueing and after release, before render resources are created. Queued cancellation settles at batch release, not synchronously when the signal aborts.

Two fresh production Node 26.8.1 workers each run normal/batch/normal, ten seconds warmup and five-second blocks with two load drivers holding 16 requests each. Controls are averaged within each worker. Before/after isolated loops warm and measure 10,000 renders with queueing bypassed, verified by counters. Workstation load can vary.

| Worker | Normal RPS | Framework-entry batch RPS | Gain | Mean batch size |
| --- | ---: | ---: | ---: | ---: |
| 1 | 8,664 | 14,386 | +66.04% | 15.93 |
| 2 | 8,663 | 14,402 | +66.25% | 14.98 |

All 317,488 measured responses matched the complete 4,672-byte document, with zero errors. Four ordinary/escaped output parity checks pass. Sixteen concurrent distinct documents match sequential retained-renderer results in one shared batch. Pre-aborted and queued-aborted renders reject with the original reason; a subsequent render succeeds. These are focused prototype checks, not comprehensive cancellation/lifecycle or browser validation.

The extra-check fixture explicitly supplies an empty clientTags string. Omitting it also failed the unmodified participant because its root hydration props contain undefined clientTags. That existing fixture/API issue is independent of this scheduling experiment.

Unlike earlier worker-level scheduling, queue wait is now inside the outer render timer. Its elapsed duration includes waiting and interleaving, and must not be compared as exclusive CPU work with the previous timer. Complete-response throughput remains comparable within each paired run.

The result supports the framework entry as a viable experimental boundary. Production work still needs platform/configuration policy, bounded queue fairness and retention, low-concurrency validation, streaming head timing, browser tests and full integration checks. No production or React baseline changes are claimed. The adjacent archive preserves raw data and verified SHA-256 inventory.
