# Readiness-poll elision diagnostic

Status: upper-bound scratch experiment completed. General readiness handling remains
unchanged in production; this is not an accepted backpressure redesign.

## Hypothesis and scope

StringProgramSink.ready is synchronous and empty. HeadPublishingSink inherits it
and reports pressure from flush instead. CapturedProgramSink.ready is also empty.
The current benchmark therefore performs readiness polls that return immediately.
The hypothesis was that removing those calls and their dead continuation branches
could expose a small improvement, though JIT inlining may already remove much of it.

An AST-guided scratch edit replaces 83 ready-call sites in each frozen Node/Bun
artifact with undefined. Explicit head/await flushes and their waits are retained.
This changes generated and runtime calls, so it measures an upper bound and cannot
be adopted for sinks that report pressure through ready. It adds no second renderer
or render-mode branch to generated components.

Sixteen complete-document output cases pass on each runtime, covering string and
stream output. They do not validate general pressure-producing sinks, cancellation,
pending tasks, early-head timing, or production compiler/ABI acceptance.

## Isolated timing

Forty-eight fresh production processes cover Node/Bun, string/stream, standard/
96-item documents, current/candidate/React, and two reversed orders. Workers run
below normal priority with 5,000 warmups and 5,000 measured renders. All eXact
document hashes match. Streams are fully consumed with Response.text. Both runtimes
load the portable server entry; these are not HTTP or native Bun-adapter rates.
PC workload may vary. Means are microseconds per complete render/consumption.

| Runtime / mode | Fixture | Current | Elision | React |
| --- | --- | ---: | ---: | ---: |
| Node string | Standard | 30.16 | 29.67 | 22.52 |
| Node string | 96 items | 134.71 | 135.20 | 130.44 |
| Node stream | Standard | 50.27 | 50.69 | 67.84 |
| Node stream | 96 items | 183.40 | 172.50 | 328.10 |
| Bun string | Standard | 32.52 | 31.92 | 31.24 |
| Bun string | 96 items | 198.80 | 195.81 | 185.11 |
| Bun stream | Standard | 48.58 | 48.36 | 52.28 |
| Bun stream | 96 items | 245.05 | 241.95 | 251.55 |

The Node large-stream control populations are 193.24 and 173.56, while candidates
are 171.19 and 173.81. The average does not establish a repeatable six-percent gain.
Node small-stream directions also disagree. Node small-string improves in both
orders, but the magnitude is small. These observations do not justify deleting
required readiness handling or establish a comparable HTTP improvement.

## Narrower source finding

writeProgramBoundary drains opening pressure before child rendering, child output
before closing, and closing pressure before completion. writeProgramChild returns
only after that completion. The generated child, keyedChild, component and
directComponent operations use that helper, while the continuation generator still
adds another ready call after their settled result.

That duplicate poll is a more defensible candidate than general elision. Any
compiler change must classify the specific helpers whose result includes draining,
preserve ordinary text/attribute/static-write checks, and verify pending child and
closing-drain behavior. The current maySuspend default is not itself a sufficient
proof that an arbitrary future helper drains its sink. This report identifies the
candidate; it does not claim that a selective compiler change was implemented.

The adjacent archive preserves builder, artifacts, parity checks, timing worker and
runner, all 48 measurements and logs, fixture, current/React artifacts and verified
SHA-256 manifest. All owned processes exited; only the user's Codex Node remained.
No source, public documentation, package or browser acceptance change is claimed.
