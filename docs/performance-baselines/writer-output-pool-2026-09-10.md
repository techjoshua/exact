# Request-local writer-output pool

Status: scratch prototype rejected after correctness and isolated timing screen.
Production source and canonical applications remain unchanged.

## Hypothesis

The allocation-expression census found 24 writer-output objects in the standard
document and 210 in the 96-item fixture. Reusing completed outputs within one
request could reduce allocation proportional to sibling count, while retaining
separate objects for concurrently active writers. The expected benefit was small
for the standard fixture and more apparent on the larger tree.

The prototype acquires an output from a request-owned array, initializes its
context, sink, traversal target and forwarding methods, then runs the same writer
and document-host handling. Release occurs after writer completion, sibling cleanup
and host handling settle. Both success and failure clear references and preparation
before returning the object. There is no cross-request pool, output cache, sink
specialization, or separate render engine. Original package source is untouched.

## Correctness and counts

- 16 complete-document parity cases on each of Node and Bun, string and stream.
- 610 Node node/depth/output-limit comparisons, all matching.
- Two focused ownership cases on each runtime: successful and failed writers with
  pending asynchronous cleanup. Another writer starts before cleanup completes
  and must receive a different object. Later acquisition must not inherit old
  preparation. Event order matches the current implementation.
- Instrumented creation counts fall from 24 to 7 in the standard fixture and
  from 210 to 7 in the large fixture. Counted output also matches current HTML.

The counts are output-object creations, not sampled heap-volume measurements.
The pool, reference clearing and acquire/release dispatch introduce their own
work. These checks do not replace package, browser, cancellation or full document
head-pressure acceptance. No production change is being proposed from this screen.

## Isolated renderer screen

Each cell has two fresh production processes per implementation, with reversed
implementation order, 5,000 warmups and 5,000 measured renders. Workers run below
normal priority. String mode awaits the full string; streaming consumes the full
stream through Response.text(). Every variant preserves its document hash across
populations, and both eXact variants agree. Both runtimes use the portable server
entry. This does not exercise Bun's native HTTP adapter and is not an HTTP RPS
comparison. PC workload may vary. Values are mean microseconds, lower is better.

| Runtime / mode | Fixture  | Current |   Pool |  React |
| -------------- | -------- | ------: | -----: | -----: |
| Node string    | Standard |   30.21 |  30.47 |  22.60 |
| Node string    | 96 items |  137.93 | 139.70 | 130.15 |
| Node stream    | Standard |   51.86 |  53.10 |  68.87 |
| Node stream    | 96 items |  171.22 | 178.72 | 326.64 |
| Bun string     | Standard |   32.24 |  32.17 |  32.04 |
| Bun string     | 96 items |  197.32 | 202.52 | 183.53 |
| Bun stream     | Standard |   49.09 |  48.59 |  52.54 |
| Bun stream     | 96 items |  238.87 | 241.25 | 260.20 |

All four large-fixture means are worse despite avoiding 203 output constructions.
This does not establish a precise regression magnitude from only two populations,
but does not justify an HTTP follow-up or adding mutable pooling ownership to
production. The small Bun differences do not overcome that lack of evidence.
Fewer allocations at this boundary have not demonstrated a rendering speed gain.
The broader React HTTP objective remains unresolved.

The evidence archive includes prototype builder/artifacts, ownership and parity
checks, limits, creation counts, timing worker/runner/log, all 48 measurements,
fixture and measured original artifacts. File hashes and archived contents are
verified. All benchmark processes exited; only the user's Codex Node remains.
