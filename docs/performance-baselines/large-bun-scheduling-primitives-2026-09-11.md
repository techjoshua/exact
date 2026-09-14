# Large Bun strings: scheduling primitive comparison

Hypothesis: if the preferred yield primitive is responsible for the large-document loss, the prior batched setImmediate scheduler may recover roughly 15-20% throughput. Compare both against immediate rendering, with unchanged React controls. Both schedulers retain their production cancellation implementations; the old implementation is restored from the previously verified archive.

Native Bun string transport, 96 incidents, concurrency 32, ten-second warmup and five-second blocks. Fresh eXact/React/React/eXact workers. Immediate controls bracket old-immediate and preferred-yield blocks; their order reverses on repeat. Each request independently renders its full document and hydration.

| Repeat | Immediate RPS | Batched setImmediate RPS | Batched yield RPS | React RPS |
| --- | ---: | ---: | ---: | ---: |
| 1 | 2,880 | 2,343 | 2,442 | 3,035 |
| 2 | 2,843 | 2,502 | 2,442 | 2,993 |

136,309 complete measured responses validated with zero errors. Artifact and invocation-count guards pass.

Both scheduled variants lose to immediate rendering. The old primitive does not consistently outperform yield. This does not support reverting the primitive preference as a solution. The next diagnostic batches execution of render callbacks rather than only releasing readiness promises, to test whether promise-job transitions contribute.
