# Preferred yield scheduler: production implementation on Bun, streaming repeat

The preceding streaming repeat had old controls drifting from 6,590 to 8,086 RPS, so a focused repeat was required. Hypothesis: preferring scheduler.yield while retaining prompt cancellation and propagating yield failures should preserve the scheduling gain. The preceding diagnostic omitted signal support. This capture uses the rebuilt Node-adapter scheduler, selecting node:timers/promises scheduler.yield when available and setImmediate otherwise. The old scheduler is restored from the SHA-verified prior source-render-scheduler-bun archive. React is unchanged. Native Bun transport remains in use.

Each mode uses fresh eXact/React/React/eXact workers, ten-second warmup and five-second blocks at concurrency 32. eXact runs old/new/old, with averaged old controls. React runs unchanged. Machine workload can vary. Each response is rendered independently and validated against complete-document identity. Source API defaults remain opt-in.

| Mode   | Repeat | Previous scheduler RPS | Preferred yield RPS | React RPS | Change |
| ------ | -----: | ---------------------: | ------------------: | --------: | -----: |
| stream |      1 |                  8,334 |               8,536 |     7,487 | +2.43% |
| stream |      2 |                  8,347 |               8,692 |     7,581 | +4.13% |

328,637 complete validated measured responses, zero errors. Scheduler counts match measured requests plus driver preflights. Participant and dependency artifact guards pass. Node-adapter tests: 38 passed, including yield and fallback batching/cancellation, asynchronous yield rejection and synchronous failure recovery. Build and targeted lint passed.

HTTP benchmark calls are signal-free; cancellation correctness is established separately by unit tests. These runs do not establish browser or sparse-traffic performance. Larger workloads and Node performance of this changed primitive remain outstanding.
