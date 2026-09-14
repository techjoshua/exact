# Synchronous publication callbacks, September 9, 2026

Status: implemented, validated, and retained with an explicit Bun streaming tradeoff. The overall
performance goal remains open.

## Evidence and hypothesis

Node heap allocation sampling after 5,000 warmup renders found estimated allocation of 556.5 KB
per large eXact render versus 443.7 KB for React. On small documents eXact was lower, 67.7 KB versus
74.6 KB. The largest eXact large attribution was executeSynchronousArtifact at approximately 78 KB
per render. Attribution can include inlined allocations and is not a precise count of callbacks.
These observations shifted attention from hydration alone to repeated component execution.

The synchronous publication path allocated callbacks for absent enhancements, already-completed
render output, and output validation. Hypothesis: allocating them only when needed would reduce
large render time by 2-5% without changing the shared engine or component ownership.

The first prototype bypassed the enhancement wrapper but also changed synchronous render errors
from rejected promises to throws. It was not adopted. The corrected prototype catches those render
errors and returns the same rejection, while publication failures retain their original behavior.
Ten focused isolated checks compare sync/pending output, thrown/rejected render failures, and
publication failure with and without enhancement delegation. Full integration validation follows.

## Implementation

Plain synchronous component output calls the existing renderer and publisher directly. Enhancement
callbacks are constructed only for enhanced operations; promise continuations only for pending
output. Missing-output validation uses a shared function. Synchronous publication now has its own
module, with a shared execution-context type used by scheduled artifact execution. The source
architecture check caught the original enlarged module, prompting this separation by responsibility.

No API, ABI, hydration format, task scheduling, cancellation, or output-limit contract changes.
Engineering documentation explains the execution behavior. Public docs and historical performance
charts are unchanged because no public behavior or full benchmark baseline changed.

## Rebuilt renderer comparison

Sixty fresh sequential production processes compare the retained document-tail build, rebuilt
callback build, and React. Each population warms 5,000 renders and measures 12,000. Large cases
have 96 incidents and rotate all three positions over three rounds; small cases have 3 incidents
and two rotations, which are not fully position-balanced. Both runtimes use the same portable
renderer bundle. Streams are fully consumed via Response.text. Applications render their complete
document shells with empty asset tags. Every eXact population verifies document framing and its
final complete-response hash against the previous artifact.

Median microseconds per complete render, lower is better. Paired reduction is the median of
per-round percentage reductions versus previous eXact, not a ratio of independent medians.

| Runtime | Mode | Size | Previous eXact | Current eXact | React | Paired reduction |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| node | string | small | 28.83 | 28.42 | 20.98 | +1.4% |
| node | string | large | 164.05 | 158.45 | 130.15 | +4.7% |
| node | stream | small | 45.22 | 43.99 | 60.99 | +2.7% |
| node | stream | large | 193.02 | 186.92 | 334.30 | +2.9% |
| bun | string | small | 37.45 | 32.38 | 32.00 | +12.3% |
| bun | string | large | 249.28 | 234.11 | 187.10 | +6.1% |
| bun | stream | small | 45.74 | 47.95 | 48.58 | -4.8% |
| bun | stream | large | 292.37 | 303.04 | 265.75 | -0.8% |

The change is retained for reduced allocation volume and consistent Node/string improvements.
Large median paired reductions are 4.7% for Node strings, 2.9% for Node streams, and 6.1% for Bun
strings. Large Bun streams regress by a median paired 0.8%; all three pairs are slower, including
one 12.6% outlier. Small Bun streaming has one 9.6% regression and one essentially unchanged pair.
The accepted tradeoff must remain visible, and further work should investigate it rather than
claim a universal improvement. Small Bun strings have a large noisy control outlier, so the apparent
12.3% paired improvement is not a precise effect estimate.

Current eXact remains behind React on strings and large Bun streams. It leads on Node streams;
small Bun streams are close in this capture. These results do not satisfy the complete goal.

These short shared-PC measurements are not confidence intervals, HTTP throughput, or browser
timings. The full objective cannot be declared complete from these renderer samples alone.

## Allocation follow-up

Estimated KB allocated per Node string render (decimal KB):

| Size | Previous eXact | Current eXact | React |
| --- | ---: | ---: | ---: |
| small | 67.7 | 65.3 | 74.6 |
| large | 556.5 | 531.8 | 443.7 |

The inspector sampled at 16,384-byte intervals across 10,000 renders after warmup, including objects
collected by minor and major GC. These are allocation-volume estimates, not retained heap, peak
memory, or leak measurements. Samples were collected separately from timing. Source attribution
and sampling variance limit conclusions about individual allocation sites.

## Validation and reproduction

All 282 SSR tests, test type checking, 56 production browser checks across both runtimes/modes,
affected-file lint, architecture, JSDoc, explicit-any, platform boundaries, compiled/frozen ABI,
and package contents pass. New public-render regressions verify disposal after an output-limit
failure and preservation of a publication failure while disposing the synchronous component.
Existing tests cover pending children, enhancements, and primary-error/cleanup precedence.

The evidence ZIP includes before/current/React bundles, the two prototypes, scripts, fixed input,
raw timings, allocation profiles and summaries, source snapshots, and passing validation logs.
The initial prototype's results are retained as exploratory evidence, not as results of the
corrected implementation. All benchmark and browser process ownership is released after capture.
