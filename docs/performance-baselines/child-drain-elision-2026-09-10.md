# Selective removal of duplicate child drain polls

Status: scratch experiment completed. Backpressure checks pass; no consistent
rendering-speed improvement established. Production compiler/runtime unchanged.

## Scope and hypothesis

writeProgramChild completes only after writeProgramBoundary drains opening, child
output and closing writes. Generated child, keyedChild, component and directComponent
operations use this helper. Generated continuation code nevertheless polls ready
again after the settled operation result. The hypothesis was that removing just
these redundant polls could reduce overhead without weakening ordinary write pressure.

An AST-guided edit replaces the post-settlement ready expression with undefined
only when the preceding stage invokes one of those four helpers. It finds 18 sites
in each frozen Node/Bun bundle; this fixture has no directComponent matching site.
All other readiness checks, helper-owned drains and explicit flushes remain.
Continuation labels and dead branches remain in the scratch artifact. No Go compiler
source or ABI contract is changed by this experiment.

## Validation

Sixteen complete-document comparisons pass per runtime, string and stream, with
varied assets/content and a missing route. A second harness changes StringProgramSink
to create a pending promise after every nonempty write. A write before the pending
drain clears fails immediately. Twelve comparisons per runtime cover small/large
documents, successful string/stream output, and string-render drain failure at
writes 1, 3, 15 and 35. HTML, write sequence and errors match current behavior.

The first pressure harness searched for a class declaration, while this bundle
uses a class expression, and failed before running render tests. The shell continued
to the timing command. After timing completed, the harness was corrected and all
pressure tests passed. No test or build ran concurrently with timing. This harness
error is not a framework defect. These checks do not replace pending-task, package,
browser or compiler acceptance for a production implementation.

## Isolated timing

Forty-eight fresh production processes cover Node/Bun, string/stream, standard/
96-item fixtures, current/candidate/React, and two reversed orders. Workers use
below-normal priority, 5,000 warmups and 5,000 measured renders. Full eXact document
hashes match. Streaming consumes the full stream with Response.text. Both runtimes
load the portable server entry, so this is not HTTP or native Bun-adapter timing.
PC workload may vary. Means are microseconds per completed render/consumption.

| Runtime / mode | Fixture | Current | Selective elision | React |
| --- | --- | ---: | ---: | ---: |
| Node string | Standard | 29.62 | 29.85 | 21.84 |
| Node string | 96 items | 137.34 | 136.55 | 132.59 |
| Node stream | Standard | 57.36 | 54.58 | 69.28 |
| Node stream | 96 items | 173.27 | 173.72 | 331.60 |
| Bun string | Standard | 33.60 | 32.47 | 30.87 |
| Bun string | 96 items | 194.63 | 195.09 | 180.51 |
| Bun stream | Standard | 49.29 | 48.35 | 53.91 |
| Bun stream | 96 items | 238.93 | 242.58 | 264.64 |

Directions remain mixed. In particular, the large-fixture string timings provide
little evidence of improvement, and Bun large-stream output is slower on average.
The narrower transformation preserves the tested drain ordering, but that fact
does not establish a throughput gain. Keep this as a possible compiler cleanup;
do not claim it closes the React gap or promote it based on the broader unsafe
elision experiment's averages.

The adjacent archive contains the builder, artifacts, parity/pressure checks,
all 48 measurements, scripts/logs, fixture, original artifacts and verified SHA-256
manifest. All owned processes exited. No source or public documentation change,
package acceptance or browser validation is claimed.
