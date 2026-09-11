# Warmed Node string CPU and allocation profiles, September 10, 2026

Status: diagnostic captures complete. No production changes. The overall performance objective remains unmet.

Both frameworks render their complete application-owned document in production mode, using the controlled three-incident fixture and four asset tags. Each capture uses four fresh processes in reversed framework orders, ten seconds of warmup, then ten seconds at 3,000 offered requests/s across two load drivers. CPU and allocation captures run separately. Every measured response passes status and whole-body identity checks. Application and runtime artifact hashes are checked before and after capture. All owned processes closed; only the preexisting user Node process remained.

The CPU capture completed 119,971 valid responses with 29 scheduling misses and no response errors. The allocation capture completed 119,986 valid responses with 14 scheduling misses and no response errors. Scheduling misses are offered requests not started, not failed responses. Instrumented CPU timings are not ordinary throughput measurements.

## CPU

Weighted process CPU time was 210.0 microseconds/request for eXact and 171.9 for React. CPU sampling used a 250-microsecond interval. The following stack-attributed sample durations are diagnostic estimates, not independently timed phases or an additive decomposition of process CPU time:

| Sampled work, microseconds/request | eXact | React |
| --- | ---: | ---: |
| Combined rendering and hydration publication | 81.1 | 50.7 |
| Garbage collection | 6.6 | 2.5 |
| HTTP output and sockets | 39.3 | 38.0 |
| HTTP input and dispatch | 14.9 | 14.0 |

Within eXact's combined render bucket, hydration JSON serialization accounts for 8.8, validation/projection 4.6, and other hydration publication 0.8. React's application serialization remains inside its rendering bucket, so a zero React hydration column would misrepresent the comparison. Response ownership and the eXact adapter account for another 2.0 sampled microseconds/request.

## Allocations

Inspector heap sampling uses a 16,384-byte interval with both minor- and major-collected objects included. These estimates measure allocated JavaScript heap bytes, including churn, not retained heap, leaks, object counts, or complete native/external buffer allocations. Stack attribution can reflect inlined work and does not identify individual object types.

Total estimated allocation is 93.02 kB/request for eXact versus 93.74 for React, using decimal kB. Individual populations are 93.23 and 92.81 for eXact, 93.60 and 93.89 for React. This does not support an explanation based on greater aggregate allocated bytes in eXact. Its greater sampled GC time could involve allocation shape, lifetimes, or collection timing; this capture does not isolate that cause.

Largest individual eXact allocation sites:

| Attributed site | kB/request |
| --- | ---: |
| renderPreparedSsrProgram | 5.88 |
| executeSynchronousArtifact | 4.89 |
| createChunkedHydratableResult | 4.87 |
| Node handleWriteReq | 4.87 |
| Final htmlWithHydration join | 4.74 |
| writeProgramChild | 3.94 |
| renderComponentReference | 3.26 |

Grouped by source module, render-program accounts for 10.60 kB/request, synchronous-artifact 7.28, children 4.97, operation-target 4.02, and program-boundary 3.94. These module totals overlap the site table and must not be added to it. The final join stack passes through the htmlWithHydration getter. The traversal sink still accumulates with +=; final hydration assembly is a separate step.

React's largest individual sites are flushSubtree at 18.75 kB/request, renderElement at 6.35, retryNode at 5.90, and pushTextInstance at 4.68. Its legacy server-renderer module accounts for 59.32 kB/request.

The captures justify investigating per-program and per-component execution scaffolding, including callback reuse, and final output construction. They do not establish that any proposed removal is safe or faster. Necessary response strings and lifecycle ownership must remain accounted for. Bun and streaming allocations were not measured in this capture.

Evidence: `warmed-http-profiles-2026-09-10-evidence.zip` contains raw profiles, captures, analyzers and runners. Artifact identities and environment metadata are recorded in each capture.json.
