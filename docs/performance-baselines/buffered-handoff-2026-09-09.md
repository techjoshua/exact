# Node buffered response handoff audit

Date: 2026-09-09. Diagnostic only; production unchanged.

The current HTTP comparison leaves a 22.6% Node string throughput deficit. This audit asks whether
the framework's buffered response ownership machinery is a plausible primary cause.

## Actual path

`framework-comparison/src/ssr-benchmark-worker.mjs` renders eXact's complete document first, wraps
the string with `createExactBufferedResponse`, and awaits `writeNodeResponse`. It does not invoke
`createExactNodeHandler`, so that handler's request-body reading, context initialization, and
disconnect listeners are not part of this benchmark path.

`packages/server/src/response-body.ts` creates a response with shared lazy accessors and one
single-consumer buffered body. `framework-adapters/node-adapter/src/handler.ts` selects its buffered
branch, claims the existing string through `toText()`, and passes it to `response.end()`. It does
not allocate a Web stream, concatenate the existing single string, or perform UTF-8 encoding itself.
The benchmark computes telemetry byte counts before this handoff.

## Isolated measurement

Hypothesis: the response object, ownership claim, and adapter dispatch together add less than
2 microseconds per completed document and are unlikely to explain the entire HTTP deficit.

Node 26.8.1, NODE_ENV=production. Three alternating-order pairs in one process, 10,000 warmups and
200,000 measured handoffs per population. Both paths allocate the same header record, iterate its
entries, and pass the same complete string to a mock response. The eXact path uses the actual built
server and Node adapter modules. The direct comparison performs those operations without eXact's
response object. Every output is checked for identity and the total call count is verified.

| Population | Direct microseconds/handoff | eXact microseconds/handoff | Added time |
| ---------- | --------------------------: | -------------------------: | ---------: |
| 1          |                       0.166 |                      0.588 |      0.422 |
| 2          |                       0.154 |                      0.564 |      0.411 |
| 3          |                       0.154 |                      0.581 |      0.427 |

This is a microbenchmark with mocked header and socket operations. It isolates ownership and
dispatch, not real HTTP behavior. It cannot measure Node's header-generation choices, socket
batching, string flattening during encoding, backpressure, or interactions with renderer garbage
collection. The direct comparison is not React's implementation and its timing is not React RPS.
Single-process JIT effects further limit extrapolation.

The observed added cost is about 0.42 microseconds. That supports keeping attention on rendering
and publication rather than removing single-consumer ownership to chase the whole deficit. It
does not rule out transport-specific effects that this mock deliberately excludes.

No production code changed. No package or browser regression tests were run for this measurement.
The overall objective remains unmet. The source runner and raw observations are preserved in the
accompanying archive, together with hashes of the built modules used.
