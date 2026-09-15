# Event-loop deferral before rendering, 2026-09-10

## Hypothesis and method

Earlier microtask deferral and disabled-inlining controls did not remove the
larger HTTP rendering cost. Test a distinct boundary: await a promise resolved
by setImmediate before starting the synchronous render timer. This lets socket
processing and rendering run in different event-loop phases. That description
does not establish why any performance change occurs.

A diagnostic-only worker switch applies the same deferral to eXact and React.
Every request still renders its full application-owned document. The actual
render entry points and original output adapters are unchanged. Queue wait is
timed separately. Isolated loops explicitly bypass deferral, verified by counters.
This is a benchmark-worker experiment, not a shipped Node-adapter optimization.

Four fresh production Node 26.8.1 workers run eXact/React/React/eXact. Each warms
HTTP for ten seconds, then runs normal/deferred/normal for five seconds each.
Two fresh load drivers per block each hold 16 requests in flight. The normal
control is the average of adjacent blocks within the same worker. Before/after
isolated loops each warm and measure 10,000 renders. Workstation load can vary.

## Throughput and synchronous invocation

| Framework | Worker | Normal RPS | Deferred RPS |  Change | Normal invocation us | Deferred invocation us |
| --------- | -----: | ---------: | -----------: | ------: | -------------------: | ---------------------: |
| exact     |      1 |      8,360 |       10,328 | +23.55% |                53.78 |                  46.52 |
| react     |      1 |     11,028 |       13,018 | +18.05% |                38.32 |                  34.67 |
| exact     |      2 |      8,441 |       10,115 | +19.84% |                53.27 |                  47.54 |
| react     |      2 |     10,784 |       12,847 | +19.13% |                38.89 |                  34.72 |

## Queue wait and complete response latency

Response means are request-weighted across the two drivers; adjacent control
means are then averaged. Queue wait is included in end-to-end response latency,
but excluded from the synchronous invocation timer above.

| Framework | Worker | Added queue mean ms | Normal response mean ms | Deferred response mean ms |
| --------- | -----: | ------------------: | ----------------------: | ------------------------: |
| exact     |      1 |               1.352 |                   3.799 |                     3.072 |
| react     |      1 |               1.030 |                   2.879 |                     2.435 |
| exact     |      2 |               1.385 |                   3.765 |                     3.137 |
| react     |      2 |               1.041 |                   2.943 |                     2.467 |

All 618,191 measured responses match their complete document
identity, zero errors. eXact serves 4,672 bytes and React 3,660 bytes. Queue
counters match render-invocation counters only in deferred HTTP blocks. Normal
HTTP and all isolated loops have no queue counter. Artifact and adapter hashes
remain unchanged. Owned workers and load processes close.

## Interpretation and adoption gates

Scheduling materially affects HTTP invocation cost and throughput in this setup.
Both repetitions improve response latency despite queue wait. Both frameworks
benefit, so this does not explain or eliminate the relative gap: deferred eXact
remains approximately 21 percent below deferred React in each population.
These effects are not additive with previous substitutions. They do not identify
whether batching, execution locality, socket behavior or another mechanism is
responsible, nor prove an optimal scheduling strategy.

Before adoption, measure low-concurrency latency and early streaming/browser
behavior. Locate a corresponding framework-owned scheduling boundary instead
of changing only the benchmark. Current createExactNodeHandler starts body
consumption immediately before asynchronous dispatch; that must remain true.
Queued cancellation, request-body failures, context initialization and produced
response ownership need appropriate regression coverage. The benchmark string
path currently renders before calling writeNodeResponse, whereas a lazy produced
body can render during adapter consumption. Those locations are not equivalent.

No production changes or new benchmark baseline are claimed here. The complete
Node/Bun string/stream performance objective remains open.

The adjacent archive includes scripts, raw results, summaries, participant
artifacts and verified SHA-256 inventory. Workspace dependencies are not a
standalone distribution.
