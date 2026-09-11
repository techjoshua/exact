# Batching render calls instead of readiness promises

Hypothesis: batching actual render calls reduces promise-job transitions enough to recover roughly 5-15% of the large Bun string throughput loss. Diagnostic work schedulers invoke each request independently inside one batch callback, resolving its own promise with the render result. They wrap the participant render-and-response call and omit the source readiness gate. This changes the scheduled scope as well as promise-job ordering, so an effect would not isolate either mechanism alone. These scratch schedulers are not production cancellation or yield-failure implementations.

Native Bun string HTTP, 96 incidents, concurrency 32. Fresh eXact/React/React/eXact workers, ten-second warmup and five-second blocks. Immediate controls bracket gate/work-yield/work-immediate, with order reversed on repeat. React is unchanged. Each complete response must match its framework document identity.

| Repeat | Immediate before | Gate RPS | Work yield RPS | Work immediate RPS | Immediate after | React RPS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 2,888 | 2,436 | 2,466 | 2,488 | 2,893 | 2,950 |
| 2 | 2,910 | 2,442 | 2,490 | 2,546 | 2,471 | 2,702 |

158,804 complete measured responses validated with zero errors. Invocation counts and artifact guards pass.

The first pass shows only a small recovery and remains below immediate rendering. The second immediate controls drift substantially, preventing a strong within-repeat baseline comparison. These results do not justify changing the public scheduler from a readiness gate into a render-work API. The diagnostic is not adopted. The large native Bun string gap remains open.
