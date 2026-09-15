# Source render scheduler: Node streaming, 2026-09-10

Follow-up to the actual-source Node string result. Hypothesis: grouping render starts may improve streaming throughput too, but delaying startup can harm first-byte latency. This measures both against unchanged React. The same authored full document, streaming API, renderer and response adapter remain in use. Only eXact receives the optional createNodeRenderScheduler gate, through public SSR options.

Four fresh production Node 26.8.1 workers run eXact/React/React/eXact, ten seconds warmup, concurrency 32 with two drivers holding 16 requests each, and five-second measured blocks. Each eXact worker runs normal/scheduled/normal; each React worker runs unchanged once. eXact controls are averaged within workers. Before/after isolated streaming loops warm and measure 2,000 renders with scheduling disabled. Workstation load can vary.

| Worker | eXact immediate RPS | eXact scheduled RPS | React unchanged RPS | Gain vs immediate | Gain vs React |
| ------ | ------------------: | ------------------: | ------------------: | ----------------: | ------------: |
| 1      |               7,313 |              12,558 |               4,299 |           +71.73% |      +192.10% |
| 2      |               7,100 |              12,389 |               4,318 |           +74.50% |      +186.93% |

| Worker | eXact response ms, immediate / scheduled | React response ms | eXact TTFB ms, immediate / scheduled | React TTFB ms |
| ------ | ---------------------------------------: | ----------------: | -----------------------------------: | ------------: |
| 1      |                            4.349 / 2.527 |             7.403 |                        4.328 / 2.510 |         7.366 |
| 2      |                            4.475 / 2.560 |             7.372 |                        4.453 / 2.544 |         7.334 |

All 312,228 measured responses matched full document identity, with zero errors. eXact serves 4,672 bytes and React 3,660 bytes. Schedule calls equal measured requests plus one identity-preflight request per load driver in scheduled blocks, and are zero in controls, React and isolated loops. Artifact and adapter hashes remain unchanged.

There is no response coalescing. The scheduler stores Promise resolvers, not URLs, HTML or response objects. An additional actual-build check queues sixteen distinct input/path combinations through the real scheduler, verifies sixteen distinct outputs against sequential unscheduled output, and asserts sixteen scheduler calls. It passes in both string and streaming modes. Preloaded fixture input reuse is unchanged by scheduling.

The streaming worker does not populate the string-render phase timer, so renderUs is null in its console log. This report uses complete-response throughput and driver latency, not that unavailable timer. Driver TTFB is not CSS parsing or browser paint timing. Browser, sparse-load and Bun validation remain necessary. These short focused results do not replace the full benchmark baseline.

The adjacent archive preserves raw data, scripts, isolation checks and rebuilt artifacts with a verified SHA-256 inventory.
