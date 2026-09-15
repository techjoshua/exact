# Executed allocation expressions in the current SSR bundle

Status: diagnostic census completed. No production change or throughput claim.

## Method and limits

A TypeScript AST transform instruments object literals, array literals, new
expressions, arrow functions and function expressions in the current Node eXact
server bundle. Each site increments a counter immediately before its original
expression. Counts are reset before rendering and read after the complete string
result is awaited. Module initialization is excluded.

Three fixtures receive ten parity warmups and twenty independently counted renders.
Every full document equals the uninstrumented current bundle's output. Every count
vector is identical across the twenty repetitions within its fixture. Runtime is
production Node 26.8.1, below-normal process priority. Artifacts are hash recorded.

These are executed source expressions, not actual heap allocations or allocated
bytes. V8 can eliminate allocations, while operations such as map, spread, string
building, async functions and imported/native helpers can allocate beyond these
counters. Wrapping anonymous functions can affect inferred names and optimization.
Instrumented timing is intentionally not reported. There is no React comparison,
HTTP measurement, or proof that these counts explain the HTTP slowdown.

## Results

| Counted expression kind | Standard document | 96-item document |
| ----------------------- | ----------------: | ---------------: |
| Object literal          |               172 |            1,288 |
| Constructor expression  |                60 |              247 |
| Arrow function          |               167 |            1,097 |
| Array literal           |                69 |              441 |
| Total                   |               468 |            3,073 |

The empty-comments variant also totals 468. This does not demonstrate a reduction
in rendered comment work; only parity and the resulting expression counts are claimed.

Selected sites:

| Site                           | Standard | 96-item |
| ------------------------------ | -------: | ------: |
| Writer-output object           |       24 |     210 |
| Prepared render-program object |       22 |     208 |
| Boundary child callback        |       20 |     113 |
| Direct-content wrapper         |        8 |     101 |
| Issued-child preparation array |        8 |     101 |
| Artifact execution object      |        8 |     101 |

Standard traversal additionally constructs 21 ChildrenOutput and 21
SsrOperationTarget instances. Raw results retain every active site, bundle line,
expression excerpt, count and fixture output hash.

## What this changes

The counts identify the repeated program and component layers as candidates for
an architectural experiment, but do not establish that removing them will improve
CPU time. The structural-stack and boundary-state-machine experiments already show
why fewer calls or constructors cannot substitute for measured throughput.

Prior reports were checked before selecting another candidate: lazy issuer arrays,
direct-content wrapper removal, and leaf writer-output reuse have already been
experimented with. This census is not grounds to repeat them unchanged. A larger
component scheduler would need to address the invocation/output/execution ownership
layers together, preserving eager preparation, per-invocation sibling cleanup,
pending descendants and document ancestry. That redesign remains unimplemented.

The adjacent archive contains six SHA-256-verified files: the instrumenter, reporting
script, complete results, instrumented artifact, original artifact and input fixture.
