# Preferred yield scheduler: production implementation on Node

Hypothesis: preferring scheduler.yield while retaining prompt cancellation and propagating yield failures should preserve the scheduling gain. The preceding diagnostic omitted signal support. This capture uses the rebuilt Node-adapter scheduler, selecting node:timers/promises scheduler.yield when available and setImmediate otherwise. The old scheduler is restored from the SHA-verified prior source-render-scheduler-bun archive. React is unchanged. Both participants use Node HTTP transport.

Each mode uses fresh eXact/React/React/eXact workers, ten-second warmup and five-second blocks at concurrency 32. eXact runs old/new/old, with averaged old controls. React runs unchanged. Machine workload can vary. Each response is rendered independently and validated against complete-document identity. Source API defaults remain opt-in.

| Mode | Repeat | Previous scheduler RPS | Preferred yield RPS | React RPS | Change |
| --- | ---: | ---: | ---: | ---: | ---: |
| string | 1 | 14,214 | 13,949 | 10,295 | -1.87% |
| string | 2 | 14,368 | 14,575 | 10,814 | +1.44% |
| stream | 1 | 12,218 | 12,465 | 4,321 | +2.02% |
| stream | 2 | 12,312 | 12,778 | 4,411 | +3.78% |

949,772 complete validated measured responses, zero errors. Scheduler counts match measured requests plus driver preflights. Participant and dependency artifact guards pass. Node-adapter tests: 38 passed, including yield and fallback batching/cancellation, asynchronous yield rejection and synchronous failure recovery. Build and targeted lint passed.

HTTP benchmark calls are signal-free; cancellation correctness is established separately by unit tests. These runs do not establish browser or sparse-traffic performance. Larger workloads and browser and sparse-traffic validation remain outstanding.
