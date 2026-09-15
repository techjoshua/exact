# JavaScript traversal of validated hydration arrays

Status: two scratch serializer prototypes rejected after correctness and isolated
timing screens. Production renderer, serializer and canonical builds are unchanged.

## Hypothesis and scope

The HTTP region traces locate increased time inside native JSON.stringify even
when captured payload values and array representations match the isolated loop.
The hypothesis was that traversing validated arrays in JavaScript could avoid
enough native traversal cost to improve serialization. It also introduces extra
JavaScript recursion, string fragments and leaf encoding work, so this required
measurement rather than inference from the trace.

The first prototype recursively accumulates JSON arrays with += and uses native
JSON.stringify for leaves. It changes only the already-validated hydration path
without a reactive-collection replacer. The existing replacer path and general
encoded-payload entry remain native. All three script-escaping passes remain.

The refinement emits validated finite numbers, booleans and null directly. Simple
strings are quoted directly; strings containing quotes, backslashes, control
characters or surrogate code units retain native JSON encoding. Objects retain
native encoding. This is a prototype at a validated boundary, not a general
replacement for JSON.stringify or a new serialization contract. It adds no support
for previously unsupported values and changes no compiler or rendering engine.

## Validation

Each prototype passes 16 complete-document comparisons on each of Node and Bun,
covering string/stream output, assets, changed selected content and a missing route.
Each also passes 207 hydration comparisons per runtime: 200 seeded nested-value
cases and seven invalid-value/limit cases. Values include script termination text,
control characters, Unicode separators, lone surrogates, numbers and objects.
Invalid cases include cyclic data, nonfinite numbers, accessors and resource limits.
Outputs or errors match current behavior. This is a focused screen, not full
package, reactive-collection, browser or security-boundary acceptance.

## Timing

Each screen has 48 fresh production processes: Node/Bun, string/stream, standard/
96-item fixtures, current/candidate/React, and two reversed implementation orders.
Workers use below-normal priority, 5,000 warmups and 5,000 measured renders. All
eXact document hashes match. Streaming consumes the full stream with Response.text.
Both runtimes load the portable server entry. These are isolated rendering and
consumption times, not HTTP or native Bun-adapter rates. PC workload may vary.

First prototype, large fixture, mean microseconds:

| Runtime / mode | Current | Native-leaf array walker |  React |
| -------------- | ------: | -----------------------: | -----: |
| Node string    |  133.26 |                   158.88 | 129.93 |
| Node stream    |  174.73 |                   198.35 | 328.36 |
| Bun string     |  198.80 |                   248.28 | 187.24 |
| Bun stream     |  244.10 |                   304.58 | 263.07 |

Refinement, measured with its own current and React controls, mean microseconds:

| Runtime / mode | Fixture  | Current | Scalar refinement |  React |
| -------------- | -------- | ------: | ----------------: | -----: |
| Node string    | Standard |   30.56 |             31.46 |  22.19 |
| Node string    | 96 items |  134.28 |            156.19 | 129.18 |
| Node stream    | Standard |   52.11 |             53.51 |  68.98 |
| Node stream    | 96 items |  172.77 |            191.25 | 329.03 |
| Bun string     | Standard |   34.37 |             34.83 |  31.93 |
| Bun string     | 96 items |  196.21 |            234.28 | 185.16 |
| Bun stream     | Standard |   49.99 |             52.16 |  52.26 |
| Bun stream     | 96 items |  241.72 |            277.70 | 260.34 |

The separate screens must not be treated as a precisely paired comparison between
the two candidates. Both lose against their own controls, especially on larger
payloads. Neither warrants an HTTP follow-up or production adoption. These results
do not prove native serialization cannot be improved, but reject these two array
walkers as replacements. The unexplained HTTP penalty is not itself evidence that
a JavaScript serializer will be faster.

The adjacent archive preserves both builders, artifacts, checks and timing scripts,
all 96 measurement rows and logs, fixture, current and React artifacts, and verified
SHA-256 manifest. All owned benchmark processes exited. No public documentation or
package/browser acceptance changes are claimed for these rejected experiments.
