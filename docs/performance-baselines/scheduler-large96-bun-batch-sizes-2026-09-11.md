# Large Bun string rendering: batch-size experiment

Hypothesis: smaller render-start batches reduce the slowdown seen with 96 incidents and a batch limit of 32. Same current compiled participants and actual scheduler, native Bun transport. Each request renders its complete document and hydration. React is unchanged. All scheduled variants use scheduler.yield and the production cancellation implementation.

Fresh workers run eXact/React/React/eXact with ten-second warmup and five-second measurement blocks at concurrency 32. Immediate controls surround five sizes (1, 4, 8, 16, 32), with size order reversed in the second eXact worker. Control means are within-worker averages; machine workload may vary.

| Repeat | Immediate RPS | Batch 1 | Batch 4 | Batch 8 | Batch 16 | Batch 32 | React RPS |
| ------ | ------------: | ------: | ------: | ------: | -------: | -------: | --------: |
| 1      |         2,922 |   2,194 |   2,277 |   2,372 |    2,441 |    2,465 |     2,998 |
| 2      |         2,828 |   2,082 |   2,313 |   2,367 |    2,359 |    2,433 |     2,986 |

204,499 complete measured responses validated with zero errors. Invocation counts and artifact guards pass. No production configuration was changed in this experiment.

The prior larger-workload capture and this size sweep are retained together. Smaller batches do not automatically solve the workload-dependent scheduling cost. The remaining gap requires investigation of the large native Bun string path; small-fixture scheduling results cannot justify a universal default.
