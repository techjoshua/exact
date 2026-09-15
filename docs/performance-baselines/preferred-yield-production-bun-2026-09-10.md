# Preferred yield scheduler: production implementation on Bun

Hypothesis: preferring scheduler.yield while retaining prompt cancellation and propagating yield failures should preserve the scheduling gain. The preceding diagnostic omitted signal support. This capture uses the rebuilt Node-adapter scheduler, selecting node:timers/promises scheduler.yield when available and setImmediate otherwise. The old scheduler is restored from the SHA-verified prior source-render-scheduler-bun archive. React is unchanged. Native Bun transport remains in use.

Each mode uses fresh eXact/React/React/eXact workers, ten-second warmup and five-second blocks at concurrency 32. eXact runs old/new/old, with averaged old controls. React runs unchanged. Machine workload can vary. Each response is rendered independently and validated against complete-document identity. Source API defaults remain opt-in.

| Mode   | Repeat | Previous scheduler RPS | Preferred yield RPS | React RPS | Change |
| ------ | -----: | ---------------------: | ------------------: | --------: | -----: |
| string |      1 |                 13,677 |              13,911 |     9,868 | +1.71% |
| string |      2 |                 13,317 |              13,401 |     9,983 | +0.63% |
| stream |      1 |                  8,277 |               8,423 |     7,313 | +1.77% |
| stream |      2 |                  7,338 |               6,818 |     7,521 | -7.09% |

812,792 complete validated measured responses, zero errors. Scheduler counts match measured requests plus driver preflights. Participant and dependency artifact guards pass. Node-adapter tests: 38 passed, including yield and fallback batching/cancellation, asynchronous yield rejection and synchronous failure recovery. Build and targeted lint passed.

HTTP benchmark calls are signal-free; cancellation correctness is established separately by unit tests. These runs do not establish browser or sparse-traffic performance. Larger workloads and Node performance of this changed primitive remain outstanding.
