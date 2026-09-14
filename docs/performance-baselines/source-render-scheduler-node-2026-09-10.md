# Source render scheduler: Node integration, 2026-09-10

This measures the actual createNodeRenderScheduler implementation exported by the rebuilt Node adapter, passed through the SSR scheduleRender option in the rebuilt eXact participant. No generated artifact is patched and no worker delay substitutes for framework behavior. The worker only selects the public option and counts calls. The callback is not included in component or hydration props. React is unchanged and rejects attempts to enable its scheduling control.

Hypothesis: the source implementation retains the large loaded gain of the framework-entry prototype; concurrency-one behavior may show a smaller gain or latency cost. Scheduling remains opt-in. Concurrency one is a continuously busy single-request load, not one or two requests per minute. This experiment does not establish sparse-traffic latency.

Four fresh production Node 26.8.1 workers run eXact/React/React/eXact. Each warms HTTP for ten seconds. Each eXact worker runs normal/scheduled/normal at concurrency one and 32, reversed concurrency order for the second population. React runs one unchanged block at each concurrency. Blocks last five seconds. Concurrency one uses one driver; concurrency 32 uses two drivers with 16 requests each. Adjacent eXact controls are averaged. Before/after isolated loops warm and measure 10,000 renders without scheduling. Workstation load can vary.

| Worker | Concurrency | eXact immediate RPS | eXact scheduled RPS | React unchanged RPS | Gain vs immediate | Gain vs React |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1 | 4,387 | 4,387 | 4,814 | -0.01% | -8.87% |
| 1 | 32 | 8,660 | 14,045 | 10,246 | +62.19% | +37.08% |
| 2 | 1 | 4,463 | 4,227 | 5,077 | -5.30% | -16.74% |
| 2 | 32 | 8,318 | 13,658 | 10,063 | +64.20% | +35.73% |

| Worker | Concurrency | eXact response ms, immediate / scheduled | React response ms | eXact TTFB ms, immediate / scheduled |
| --- | ---: | ---: | ---: | ---: |
| 1 | 1 | 0.204 / 0.204 | 0.184 | 0.188 / 0.188 |
| 1 | 32 | 3.667 / 2.257 | 3.097 | 3.649 / 2.244 |
| 2 | 1 | 0.201 / 0.212 | 0.175 | 0.184 / 0.195 |
| 2 | 32 | 3.818 / 2.321 | 3.154 | 3.800 / 2.308 |

All 591,196 measured responses matched complete document identity, with zero errors. eXact serves 4,672 bytes and React 3,660 bytes. Schedule counts match render counts only in scheduled eXact HTTP blocks; controls, React and isolated loops have zero schedule calls. Artifact and adapter hash guards pass.

Prior source checks passed: 31 Node-adapter tests, 376 SSR tests before adding one scheduled-head variant, and seven focused render-start/head tests afterward. The SSR and Node adapter build successfully. The full SSR output reported success; its PowerShell wrapper returned an error because expected stderr was redirected. Further direct-run/package/browser validation remains pending.

This is a focused Node string integration result, not completion of the Node/Bun string/stream objective or a replacement full benchmark baseline. Default runs remain unscheduled. Actual sparse traffic, streaming, Bun and browser latency need validation before choosing an automatic scheduling policy.

The adjacent archive contains raw results, scripts, current source and participant artifacts with a verified SHA-256 inventory.
