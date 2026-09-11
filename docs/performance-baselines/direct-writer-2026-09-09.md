# Direct generated writers and sink policy

Date: 2026-09-09. Experimental artifact transformations; production unchanged.

This study removes the compiled-program segment arrays retained by the earlier shared-accumulator
experiments. It compares continuation mechanisms and then isolates sink buffering policy. Large
documents improve with ordinary continuations and runtime-appropriate sink policies, but smaller
documents do not establish a consistent win. These prototypes are retained as implementation
evidence, not adopted as a complete SSR engine.

## Hypotheses and implementation

Removing intermediate segment arrays and the subsequent traversal should reduce allocation and
bookkeeping. That benefit must exceed continuation and direct-write overhead. No numerical minimum
was required for adoption, and no numeric gain was preregistered for this experiment.

The prototype transforms 25 generated server writers. Fourteen have no deferred child sites and
remain ordinary synchronous functions. Eleven have 18 potential suspension sites. Static markup,
escaping, attribute serialization, character bounds, and child output use the existing primitives,
but write into the request's shared sink instead of constructing a program output array. Child
positions render immediately in order. The old buffered program entry rejects if accidentally used.

The first variant uses generators at those 11 writers. The second generates ordinary named
continuation functions. Available child results continue synchronously; only actual promises use
`.then`. Both use one traversal for string and consumed-stream output. These are alternate
experiments, not two retained production rendering engines.

The third variant applies the previously tested 8,192 UTF-16-code-unit staging policy to the new
direct writer. Its control is the same ordinary-continuation traversal, so this comparison isolates
buffering policy. Staging arrays join when full or before overflow; oversized fragments bypass
empty staging; completion joins finished batches. The threshold is not an encoded byte count.
This improves Bun in every paired cell and slows Node in every paired cell.

The fourth comparison uses ordinary continuations with direct string accumulation on Node and
8,192-character batches on Bun. Both artifacts carry the current task-readiness changes. The rebase
script verifies that the readiness and execution module regions account for every difference
between the earlier marker-hex control and the actual current artifact, then replaces those regions
in the candidates. It does not silently discard a retained framework change. The current control
was also verified byte-for-byte against the built comparison server entry.

The fifth experiment removes the per-program output wrapper by passing the sink and child-rendering
function separately to generated writers. It compares against the corresponding rebased direct-write
prototype, retaining each runtime's sink policy. It improves large-document Bun strings and streams
and Node streams in both pairs. Node strings become slower in all four pairs; smaller streaming
cases vary by runtime.
This is a structural allocation reduction, not a measured heap-allocation result. No numerical gain
was preregistered beyond the stated modest allocation/dispatch-saving hypothesis.

## Method

Five experiments each contain 32 fresh production-mode processes: Node/Bun, string/consumed stream,
small/large documents, two reversed-order pairs, and control/candidate. Total: 160 populations.
Each performs 5,000 warmups and 12,000 measured renders. Runtime versions are Node 26.8.1 and
Bun 1.4.2. The fixtures have 3 or 96 incidents and the same two scripts and two stylesheet links.
Each framework entry constructs its complete application document. All paired complete-document
hashes match. No population was discarded.

Both runtimes use the same Node-target artifact layout. Streams are consumed with Response.text().
These are renderer comparisons, not actual Node/Bun HTTP adapters, socket throughput, browser
latency, or a fresh React comparison. Positive values below mean longer rendering time. The pairs
are descriptive local evidence, not confidence intervals. Compare buffering against its stated
control rather than multiplying percentages across separately timed phases.

## Generators

| Runtime | Output | Document | Pair 1 time change | Pair 2 time change |
| --- | --- | --- | ---: | ---: |
| node | string | small | +3.57% | +4.64% |
| node | string | large | +3.28% | +0.21% |
| node | stream | small | +1.56% | +6.92% |
| node | stream | large | +4.64% | +5.24% |
| bun | string | small | +2.43% | +7.55% |
| bun | string | large | +8.22% | +1.76% |
| bun | stream | small | -0.30% | +6.74% |
| bun | stream | large | +4.96% | +0.78% |

## Ordinary continuations

| Runtime | Output | Document | Pair 1 time change | Pair 2 time change |
| --- | --- | --- | ---: | ---: |
| node | string | small | +1.64% | +4.80% |
| node | string | large | -4.17% | -3.75% |
| node | stream | small | +1.83% | +2.27% |
| node | stream | large | -0.66% | -0.79% |
| bun | string | small | +4.78% | +1.29% |
| bun | string | large | +1.17% | +2.12% |
| bun | stream | small | +4.41% | +7.19% |
| bun | stream | large | +2.34% | +2.32% |

## Sink batching

| Runtime | Output | Document | Pair 1 time change | Pair 2 time change |
| --- | --- | --- | ---: | ---: |
| node | string | small | +1.43% | +2.32% |
| node | string | large | +14.42% | +13.85% |
| node | stream | small | +6.40% | +1.62% |
| node | stream | large | +10.33% | +11.79% |
| bun | string | small | -10.03% | -5.17% |
| bun | string | large | -5.17% | -7.75% |
| bun | stream | small | -2.88% | -4.47% |
| bun | stream | large | -6.21% | -4.38% |

## Current build comparison

| Runtime | Output | Document | Pair 1 time change | Pair 2 time change |
| --- | --- | --- | ---: | ---: |
| node | string | small | +1.42% | +0.01% |
| node | string | large | -4.39% | -2.28% |
| node | stream | small | +1.27% | +2.62% |
| node | stream | large | +0.40% | -1.02% |
| bun | string | small | -4.26% | +2.30% |
| bun | string | large | -2.96% | -3.69% |
| bun | stream | small | +1.42% | -3.55% |
| bun | stream | large | -2.46% | -2.61% |

## Separate sink and rendering capability

| Runtime | Output | Document | Pair 1 time change | Pair 2 time change |
| --- | --- | --- | ---: | ---: |
| node | string | small | +2.93% | +0.31% |
| node | string | large | +0.16% | +3.93% |
| node | stream | small | +4.69% | -5.99% |
| node | stream | large | -6.87% | -1.30% |
| bun | string | small | +0.91% | +0.58% |
| bun | string | large | -3.71% | -2.70% |
| bun | stream | small | -0.25% | -0.97% |
| bun | stream | large | -1.85% | -1.74% |

## Correctness checks

One hundred sixty-eight untimed cases cover seven artifacts on Node and Bun, string and stream output,
immediate or deliberately suspended child traversal, and success or injected failure at child
positions 1 and 5. Successful full-document hashes match the frozen control. Failures stop further
child traversal, and retained host-stack and traversal-depth state unwind. The two current-build
artifacts receive the same checks after their readiness rebase.

The existing progressive HTML API logs rendering failures and emits an error script rather than
rejecting the consumed stream in these cases. Tests check that behavior and ensure that the failed
document is not published as a completed shell. String rendering rejects with the injected error.
The first test expectation incorrectly required stream rejection; inspecting the production stream
implementation corrected that expectation. Expected error logs are archived.

The first validation launch also encountered a local script filename collision: generation replaced
the intended runner with an instrumented module. It performed no checks and is not counted. The
runner now has a distinct filename and an operation timeout; all 168 reported cases executed.

These checks do not establish browser hydration, network backpressure, cancellation, task generation
fencing, full resource disposal, or enhancement behavior. Package/browser suites were not run for
incomplete, unadopted artifact prototypes.

## What remains before production integration

The prototypes still accumulate the complete tree before the existing outer stream publishes it.
They do not yet flush the head before a body task. Eager slot reads remain in the generated
preparation prefix. Compiler task-region dependencies and deferred evaluation remain necessary.

The existing shared-range prototype explicitly rejects unsupported uncaptured component boundaries
and enhancement routes. The direct operation-target route also rejects scheduled component
references because it has not replaced the old segment-based sibling preparation contract.
These are experiment limits, not acceptable application restrictions for the resulting framework.
Scheduled sibling issuance must retain its concurrency and cleanup behavior during integration.

The separate sink/rendering-capability experiment removes a new prototype allocation without
restoring intermediate segment arrays. Further work should integrate direct writes with the actual
compiler and full boundary semantics. The compiler should own continuation emission and adjacent
static-output coalescing. The shared
renderer must retain explicit capture scopes where output can be transformed or replaced, while
the request owns sink completion, failure, and cancellation cleanup.

The measured large-document gains justify continuing this design. They do not prove that it beats
React overall, and the persistent performance goal remains incomplete. No production package or
public contract changed in this study.
