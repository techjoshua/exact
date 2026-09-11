# Bun scheduler.yield experiment

Hypothesis: batching contributes more than the yield primitive. Compare a per-request scheduler.yield and a shared yield Promise (at most 32 starts) with the existing batched setImmediate scheduler. These are diagnostic variants; the yield variants explicitly reject signal-bearing calls and are not production cancellation implementations. No production source is changed.

Both modes use native Bun HTTP transport and the same rebuilt participants, complete authored documents and hydration. React is unchanged. Each mode runs fresh eXact/React/React/eXact workers, ten seconds of warmup, five-second blocks at concurrency 32. eXact runs immediate-batch/yield/shared-yield/immediate-batch. The two immediate controls are averaged. Workstation load can vary. Queue time is included in HTTP throughput.

| Mode | Repeat | Batched immediate RPS | Per-request yield RPS | Shared yield RPS | React RPS |
| --- | ---: | ---: | ---: | ---: | ---: |
| string | 1 | 13,438 | 13,308 | 13,341 | 9,935 |
| string | 2 | 13,258 | 13,607 | 13,534 | 9,931 |
| stream | 1 | 8,426 | 8,515 | 8,267 | 6,145 |
| stream | 2 | 8,158 | 8,315 | 8,313 | 7,554 |

1,037,284 measured responses passed full-body identity validation with zero errors. Scheduler invocation counts match measured requests plus driver preflights. Artifact hash guards pass. The archive preserves raw timing distributions and source. This focused experiment does not establish sparse-traffic or browser behavior.
