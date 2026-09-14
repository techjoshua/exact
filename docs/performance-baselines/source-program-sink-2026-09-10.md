# Source integration of ordered program sinks

Date: 2026-09-10. Internal runtime integration; public stream selection is not yet migrated.

## Source change

The shared program visitor now accepts an internal request-owned destination through
SsrContext.writerSink. This is separate from the output byte-accounting ledger. The sink owns
buffering and byte limits. It accepts each ordered span once; the visitor checks readiness
before subsequent work, flushes a completed head, and flushes before awaiting pending children.
Scoped string capture uses the same visitor. Enhancement rendering suspends outer publication
until routing has determined the final target order and wrappers, restoring the destination
through success or failure.

Failure handling retains parent host ownership until pending descendants settle. The first
implementation used Promise.all alone for child work and a pending drain, which could release
an ancestor while the child still owned its scope. The corrected implementation observes both
promises and waits for descendant settlement before unwinding. A synchronous flush failure
also observes and waits for the child. The destination owner must cancel request tasks on
terminal transport failure so that cancelled descendants can release their scopes.

This is an integration step toward one renderer with interchangeable destinations. Public
entry points do not yet install the destination. Their full-document streaming behavior remains
unchanged. Compiler-emitted writer signatures and the released-artifact epoch are unchanged.
Native writer migration, structural boundary capture, request-owned sinks, and progressive
hydration-tail publication remain required before the full application uses progressive traversal.

## Correctness checks

All 298 SSR tests pass. Seven new cases cover head publication while a body child remains
pending, write pressure before later children, final-drain completion, rejected pressure,
synchronous flush failure with later child rejection, asynchronous flush failure while nested
hosts remain owned, and nested enhancement capture restoration on success and failure.
The success/failure capture case is parameterized, giving seven executed cases in total.
These are runtime boundary tests, not a claim that the public response already publishes its
head before pending work. No browser performance improvement is claimed.

SSR package build, repository test type checking, source architecture, focused ESLint, platform
boundaries, and package contents checks pass. Engineering documentation records the current
integration boundary; public application documentation is unchanged because public behavior
is unchanged.

## Performance checks

The initial hypothesis was negligible overhead in ordinary rendering while the destination is
absent. The first comparison showed a possible large Bun string regression: 224.25 to 231.13
microseconds. Inspection found that the initial implementation checked for a promise after
every local string append and allocated extra host callbacks even without a shared sink.
The refinement confines drain checks to shared destinations and preserves direct local appends.
The hypothesis for that refinement was to recover the possible overhead without changing
publication or cleanup behavior.

Both runs use fresh production-mode Node 26.8.1 and Bun 1.4.2 processes, 5,000 warmups and
12,000 measured renders per sample, two reversed-order samples per cell. Documents contain
three or 96 incidents, all four assets, the authored shell, and hydration/bootstrap output.
Streams are fully consumed through Response.text(). No build or test runs concurrently with
timing. Complete-document hashes match across candidates and controls. These are renderer
microseconds, not HTTP requests/s.

The isolated application build uses the production native compiler and built source packages.
Comparing all 126 bundled regions finds changes only in program output and enhancement rendering.
The saved production application artifact is the control; the native sink prototype is not a
variant in this particular overhead check.

### Initial source integration

| Runtime | Document | Mode | Production control | Initial source | Change |
| --- | --- | --- | ---: | ---: | ---: |
| node | assets | string | 34.70 | 35.63 | +2.7% |
| node | assets | stream | 54.80 | 55.71 | +1.6% |
| node | large | string | 158.03 | 157.37 | -0.4% |
| node | large | stream | 191.98 | 194.07 | +1.1% |
| bun | assets | string | 37.06 | 35.44 | -4.4% |
| bun | assets | stream | 50.94 | 51.00 | +0.1% |
| bun | large | string | 224.26 | 231.12 | +3.1% |
| bun | large | stream | 280.26 | 277.29 | -1.1% |

### Refined local collection

| Runtime | Document | Mode | Production control | Refined source | Change |
| --- | --- | --- | ---: | ---: | ---: |
| node | assets | string | 34.47 | 35.05 | +1.7% |
| node | assets | stream | 54.49 | 54.78 | +0.5% |
| node | large | string | 159.08 | 159.49 | +0.3% |
| node | large | stream | 191.20 | 192.36 | +0.6% |
| bun | assets | string | 35.35 | 35.63 | +0.8% |
| bun | assets | stream | 53.64 | 51.71 | -3.6% |
| bun | large | string | 223.41 | 226.99 | +1.6% |
| bun | large | stream | 277.20 | 277.10 | -0.0% |

Both complete runs are preserved; neither is relabeled as a measurement of the other artifact.
Machine variation and the small sample count limit interpretation. This work establishes and
validates the source integration boundary, rather than demonstrating a throughput improvement.
React was not rerun here. Its last paired lead in string rendering remains unresolved; see
[the native lazy-frame comparison](native-lazy-frame-2026-09-09.md).

The [evidence archive](source-program-sink-2026-09-10-evidence.zip) includes both timed runs,
the exact three application artifacts, source and tests, build/run scripts, validation output,
and a verified SHA-256 manifest.
