# Render-start scheduling on native Bun, 2026-09-10

Hypothesis: the scheduling policy may transfer to Bun, but its native response pipeline could show a smaller gain than Node; a modest gain or no improvement was plausible. This measures the actual rebuilt SSR option and exported scheduler implementation. The helper uses Bun support for node:timers. Its Node-adapter import does not change HTTP transport: both participants use bun-fetch with their original native Bun server entries and response adapters. React receives no scheduling change.

For each of string and stream modes, four fresh production Bun 1.4.2 workers run eXact/React/React/eXact. Each warms HTTP for ten seconds. Each eXact worker runs normal/scheduled/normal; each React worker runs one unchanged block. Blocks last five seconds, with two Node load-driver processes each holding 16 requests. Controls average adjacent eXact blocks within each worker. The native Bun handler does not expose the isolated-loop diagnostic, so none is run here. Workstation load can vary.

| Mode | Worker | eXact immediate RPS | eXact scheduled RPS | React unchanged RPS | Gain vs immediate | Gain vs React |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| string | 1 | 9,276 | 13,952 | 9,638 | +50.40% | +44.76% |
| string | 2 | 9,429 | 13,619 | 10,073 | +44.43% | +35.20% |
| stream | 1 | 7,401 | 8,227 | 7,694 | +11.16% | +6.94% |
| stream | 2 | 7,257 | 8,453 | 7,463 | +16.48% | +13.26% |

| Mode | Worker | eXact response ms, immediate / scheduled | React response ms | eXact TTFB ms, immediate / scheduled | React TTFB ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| string | 1 | 3.423 / 2.274 | 3.296 | 3.407 / 2.261 | 3.280 |
| string | 2 | 3.368 / 2.330 | 3.152 | 3.352 / 2.317 | 3.137 |
| stream | 1 | 4.293 / 3.867 | 4.131 | 4.273 / 2.437 | 4.113 |
| stream | 2 | 4.379 / 3.763 | 4.259 | 4.358 / 2.385 | 4.240 |

All 729,862 measured responses matched full document identity, with zero errors. eXact serves 4,672 bytes and React 3,660 bytes. Scheduler calls equal measured requests plus one identity preflight per driver in scheduled blocks; all other blocks have zero calls. Participant, server, Node-adapter and Bun-adapter artifact hash guards pass.

The outer renderMs timer measures obtaining a native Response, not necessarily consuming its entire body. It also includes any awaited scheduling. Do not treat it as equivalent exclusive rendering CPU time across frameworks or modes. The driver throughput and latency here include receiving and validating the complete body.

These focused concurrency-32 captures do not establish sparse-traffic behavior, browser paint timing, larger-document performance or a full benchmark baseline. Scheduling remains opt-in. The full optimization objective remains open until the remaining correctness, browser, publication and representative-workload checks complete.

The adjacent archive preserves raw results, scripts and source/artifacts with a verified SHA-256 inventory.
