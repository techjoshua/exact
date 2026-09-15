# Native document-prefix check experiment

Hypothesis: a single-chunk native startsWith call can reduce the named document-prefix checking hotspot, plausibly improving throughput 2-5%. The scratch compiled-artifact change preserves the original cross-chunk path. No production source change is adopted.

Same 96-incident fixture on native Bun string HTTP, concurrency 32, five-second blocks after ten-second warmup. Current/candidate/unchanged React workers run in one order and then reverse. Each eXact worker runs immediate/scheduled/immediate. All output must match complete-document identity.

| Repeat | Scheduling | Current RPS | Candidate RPS | Change |
| ------ | ---------- | ----------: | ------------: | -----: |
| 1      | normal     |       2,849 |         2,834 | -0.52% |
| 1      | scheduled  |       2,442 |         2,526 | +3.41% |
| 2      | normal     |       2,820 |         2,818 | -0.07% |
| 2      | scheduled  |       2,433 |         2,391 | -1.73% |

192,551 measured responses passed full identity validation, zero errors. Artifact and invocation-count guards pass.

The change provides no consistent throughput benefit and is rejected. Profiling attribution to the prefix check does not prove that character-by-character comparison causes that cost: reading a rope string may trigger work that a native predicate also requires. That explanation remains a hypothesis, not a measured allocation result. The large Bun string scheduling gap remains open.
