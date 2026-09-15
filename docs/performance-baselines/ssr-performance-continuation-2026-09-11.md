# SSR performance continuation, September 11, 2026

Status: the experiments and browser/sparse checks listed here are complete. The broader objective of beating React in every comparable workload remains unmet. No speculative scheduler, sink, serializer, or compiler change was adopted in this pass. Existing retained framework improvements remain in place.

1,127,114 complete measured HTTP responses across six new captures, zero errors. Every eXact candidate has the same full-document bytes and SHA-256 as its current control, across both repeats. Schedule invocation counts match requests plus identity preflights. React receives no scheduling policy or rendering change.

## Decisions

| Experiment                                             | Result                                                                                          | Decision                                 |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Queue-wait trace                                       | Serial batches of 8 move average gate wait from about 12 ms to 68-69 ms at Node concurrency 256 | Do not choose policy from loop lag alone |
| Microtask-paced Bun batches                            | Both one- and four-checkpoint variants lose throughput                                          | Reject                                   |
| Preserve document-edge writes                          | Immediate Bun strings regress; scheduled strings improve slightly                               | Reject for this workload                 |
| Count keys without allocating a key array              | Both modes regress in both repeats                                                              | Reject                                   |
| Validate and emit positional JSON together             | Both modes regress substantially                                                                | Reject this prototype                    |
| Inline generated primitive checks on current HTTP path | Opposite directions across repeats; control drift remains                                       | No compiler change                       |

| Experiment             | Repeat | Mode      | Current RPS | Candidate RPS |  Change |
| ---------------------- | ------ | --------- | ----------: | ------------: | ------: |
| edge-sink              | 1      | normal    |       2,814 |         2,739 |  -2.67% |
| edge-sink              | 1      | scheduled |       2,449 |         2,492 |  +1.74% |
| edge-sink              | 2      | normal    |       2,845 |         2,772 |  -2.56% |
| edge-sink              | 2      | scheduled |       2,425 |         2,469 |  +1.80% |
| key-count              | 1      | normal    |       2,797 |         2,657 |  -5.00% |
| key-count              | 1      | scheduled |       2,408 |         2,361 |  -1.98% |
| key-count              | 2      | normal    |       2,807 |         2,676 |  -4.66% |
| key-count              | 2      | scheduled |       2,493 |         2,329 |  -6.60% |
| fused-json             | 1      | normal    |       2,890 |         2,382 | -17.59% |
| fused-json             | 1      | scheduled |       2,492 |         2,075 | -16.72% |
| fused-json             | 2      | normal    |       2,901 |         2,344 | -19.22% |
| fused-json             | 2      | scheduled |       2,503 |         2,145 | -14.28% |
| projector-current-http | 1      | normal    |       2,886 |         2,844 |  -1.46% |
| projector-current-http | 1      | scheduled |       2,489 |         2,451 |  -1.53% |
| projector-current-http | 2      | normal    |       2,819 |         2,903 |  +2.97% |
| projector-current-http | 2      | scheduled |       2,457 |         2,513 |  +2.29% |

## Current remaining SSR gap

In the last paired large96 native Bun string capture, mean bookended immediate eXact throughput is 2,853 RPS versus React 3,005 RPS, 5.1% lower. Scheduled eXact is 2,473 RPS. These are short, production-mode, concurrency-32 HTTP blocks on a shared workstation, not cloud capacity guarantees. Reported means do not remove control drift.

The small-document scheduled Node/Bun string/stream wins and the large-document Node/Bun streaming wins are recorded in the preceding production scheduler reports. This pass did not rerun those cells, and enabling scheduling is an explicit host configuration, not the default. Do not present the selected scheduled results as default framework behavior.

## Browser and sparse traffic

The [browser capture](scheduler-browser-performance-2026-09-11.md) passed 288 measured scenarios across Node/Bun, string/stream, local/constrained profiles and immediate eXact/scheduled eXact/React. eXact navigation medians are lower than React in all cells. Constrained first paint is broadly tied; React retains about a 1 ms optimistic-feedback advantage under CPU throttling. Scheduling has no consistent quiet-host browser benefit or penalty in these samples. This is not a controlled historical regression comparison.

The [sparse check](scheduler-sparse-traffic-2026-09-11.md) passed 18 measured full responses after 30-second idle periods. Median scheduled-minus-immediate response time was approximately 0.18 ms on Node and 0.27 ms on Bun. Three samples per cell cannot establish tail percentiles or zero overhead.

## Implementation and validation

Production renderer, compiler, sinks and scheduling behavior are unchanged. Engineering documentation, Node adapter guidance and the public advanced page now explain that throughput, p95/p99, queue residence and document size must inform scheduling decisions. Existing serialization limits, rejection behavior, task/lifecycle guarantees and the single renderer are preserved. No ABI fixtures were regenerated.

Documentation formatting, targeted docs-page ESLint and whitespace checks passed. No framework test suite was repeated for rejected scratch-bundle experiments. Previously completed production SSR, adapter, ABI, platform and browser correctness checks remain recorded in the preceding reports. All task-owned benchmark and browser server processes exited.

## Evidence

- [Queue residence trace](scheduler-queue-wait-trace-2026-09-11.md)
- [Microtask pacing](bun-paced-render-starts-2026-09-11.md)
- [Document edge sink](bun-deferred-document-edges-2026-09-11.md)
- [Hydration key counting](bun-hydration-key-count-2026-09-11.md)
- [Fused positional JSON](bun-fused-positional-json-2026-09-11.md)
- [Current generated-projector recheck](bun-current-projector-inline-http-2026-09-11.md)

Each report has a SHA-256-verified evidence archive with its capture and scripts. The continuation archive adds cross-variant document-identity and invocation verification. These experiments exhaust the concrete local hypotheses evaluated in this pass, not every possible future framework optimization. The remaining Bun gap is recorded as unresolved; no universal performance-completion claim is made.
