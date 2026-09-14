# Native Bun garbage-collection events during SSR

Hypothesis: the large-document scheduling slowdown includes collection pressure that the generic performance observer failed to report. Six fresh native Bun workers run immediate eXact, scheduled eXact, and unchanged React, then reversed order. Each uses five seconds warmup and ten seconds measured HTTP load at concurrency 32. The full authored document and hydration are rendered per request.

The loopback JSC inspector enables Heap events. A forced full collection before warmup verifies that each observer receives native events; calibration events are excluded. Events are cleared before the measured block and disabled after it. Heap snapshots of counters are taken outside the load interval. No collection is forced inside the measured interval. Inspector overhead affects these rates, so they do not replace uninstrumented throughput results.

JSC exports the collection timestamps in seconds in [InspectorHeapAgent](https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/agents/InspectorHeapAgent.cpp); durations below convert to milliseconds. Bun exposes the events through its [Heap inspector protocol](https://github.com/oven-sh/bun/blob/main/packages/bun-inspector-protocol/src/protocol/jsc/protocol.json). GC event spans are elapsed intervals, not exclusive CPU costs, and cannot simply be subtracted from CPU profiles or response latency.

| Repeat | Framework | Policy    |   RPS | Full GC | Partial GC | Total GC span (ms) | Max GC span (ms) | GC span per request (us) | Response p99 A / B (ms) |
| ------ | --------- | --------- | ----: | ------: | ---------: | -----------------: | ---------------: | -----------------------: | ----------------------- |
| 1      | exact     | normal    | 2,615 |      13 |       1116 |            1166.75 |             3.97 |                    44.56 | 15.919 / 15.919         |
| 1      | exact     | scheduled | 2,363 |     155 |        720 |            1311.61 |             9.66 |                    55.45 | 22.015 / 25.455         |
| 1      | react     | normal    | 2,813 |      22 |       1272 |            1133.55 |             2.77 |                    40.24 | 15.239 / 15.183         |
| 2      | react     | normal    | 2,843 |      19 |       1280 |            1096.24 |             3.80 |                    38.51 | 14.887 / 15.071         |
| 2      | exact     | scheduled | 2,445 |     158 |        745 |            1310.01 |             9.31 |                    53.52 | 24.383 / 20.527         |
| 2      | exact     | normal    | 2,703 |      14 |       1153 |            1214.59 |             4.25 |                    44.86 | 15.383 / 15.639         |

158,019 complete measured responses, zero errors. All native observers passed forced-GC calibration and all scheduling invocation guards pass.

Scheduling increases full collections from 13-14 to 155-158 per measured eXact block, and GC span per request from approximately 45 us to 54-55 us. This supports an allocation-lifetime cost for scheduling the large fixture; it does not identify the exact retaining object or establish GC as the sole slowdown.

Immediate eXact records about 45 us of GC span per request versus React 39-40 us. React has more collection events overall, not fewer. The remaining immediate-path gap therefore cannot be described as simply far more eXact collections. Avoiding key arrays and positional arrays already regressed measured throughput in separate experiments.

Raw heap counters are retained, but they are not cumulative allocation rates. Bun documents that [heapSize and objectCount describe the last collection survivors while objectTypeCounts includes currently allocated objects](https://bun.sh/reference/bun/jsc/HeapStats). No live-heap delta is presented as total allocated bytes.

The local node:inspector Session compatibility API rejected Heap.enable and HeapProfiler sampling commands. The successful capture uses the native WebSocket inspector with Heap.enable. This resolves the missing-observer evidence gap without modifying framework or React code. No production GC tuning, forced-collection policy, or allocation workaround is adopted.
