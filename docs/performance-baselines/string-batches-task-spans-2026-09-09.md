# Sink-owned string batching and compiler task-span cases

Date: 2026-09-09. Prototypes and compiler characterization; production unchanged.

## String sink experiment

Following the user's suggestion, the shared-range traversal prototype delegates accumulation policy
to a string sink. Writes append fragments to a staging array. Before an overflow, the sink joins
the staged fragments into a completed batch. Oversized incoming strings bypass empty staging, and
completion joins the finished batches. The final result releases references held by staging arrays.
This avoids extending one global accumulator string for every write.

The two internal staging targets are 2,048 and 8,192 UTF-16 code units, not KiB of allocated memory
or encoded UTF-8 bytes. The initial commentary called them KiB; that was corrected before results.
Using code-unit counts avoids introducing an encoding scan per fragment. Existing final UTF-8
output validation remains. These targets are prototype configuration, not a new public option.

This tests sink policy using the same shared-range visitor. It still consumes generated segment
arrays and completes the tree before the existing outer stream transport publishes it. It therefore
does not test compiler-guided early flushing or a directly backpressured network sink. Unsupported
uncaptured enhancement/component boundaries retain the prototype's explicit rejection behavior.

The hypothesis is that batched joins could reduce the cost of repeatedly extending a shared string;
no additional numerical improvement was preregistered beyond the shared-sink study's 2-8% hypothesis.

## Method and results

Each staging size is paired with the current retained marker-hex build across Node/Bun, string/consumed
stream, small/large documents, and two reversed-order pairs per cell. Total: 64 fresh production-mode
populations, each with 5,000 warmups and 12,000 measured renders. Small has three incidents; large
has 96. Both include two module scripts and two stylesheet links. Both runtimes use the same Node-target
artifact. Streams are consumed with Response.text(). All paired full-document hashes match, all
populations completed, and none was discarded.

Positive means longer rendering time. These are descriptive local comparisons, not confidence
intervals, HTTP throughput, browser latency, or a fresh React comparison. The control is production,
not the preceding shared-string prototype, so these pairs do not isolate batching from the other
traversal prototype changes.

| Staging code units | Runtime | Output | Fixture | Pair 1 time change | Pair 2 time change |
| --- | --- | --- | --- | ---: | ---: |
| 2048 | node | string | small | +7.29% | +1.79% |
| 2048 | node | string | large | +8.90% | +7.91% |
| 2048 | node | stream | small | +6.27% | +6.54% |
| 2048 | node | stream | large | +6.15% | +12.26% |
| 2048 | bun | string | small | +6.00% | +4.09% |
| 2048 | bun | string | large | +2.59% | +11.29% |
| 2048 | bun | stream | small | +14.65% | +12.89% |
| 2048 | bun | stream | large | +0.82% | +4.48% |
| 8192 | node | string | small | +5.70% | +7.78% |
| 8192 | node | string | large | +8.75% | +9.04% |
| 8192 | node | stream | small | +3.51% | +4.31% |
| 8192 | node | stream | large | +8.75% | +7.05% |
| 8192 | bun | string | small | +1.44% | +6.35% |
| 8192 | bun | string | large | -1.43% | +1.00% |
| 8192 | bun | stream | small | +2.39% | +2.43% |
| 8192 | bun | stream | large | -3.61% | +0.51% |

Neither batched prototype establishes a broad benefit over production, so neither is adopted.
This does not invalidate sink-owned buffering. It means these implementations are not throughput
improvements over the retained renderer. Removing generated intermediate arrays and introducing
compiler-guided task boundaries remain separate work.

Twenty-nine isolated staging checks cover empty input, exact/full boundaries, overflow, oversized
fragments, split surrogate pairs, escaping characters, the character ceiling, and released array
references. They do not establish streaming cancellation/backpressure or full lifecycle correctness.
No package/browser suite was run for rejected incomplete prototypes.

## Compiler task-span characterization

Six sources were compiled using the current native exactc binary. All compiled without diagnostics
and emitted server programs. The archive contains sources, complete compiler responses, emitted
code, and the compiler binary's SHA-256 identifier.

| Case | Task write | Relevant head input | Finding |
| --- | --- | --- | --- |
| Static head | body | Literal title | No head state read is required. |
| Settled-prop head | body | props.css | Head need not depend on the body-only task. |
| Task title | title | state.title | Head title reads the task-written path. |
| Task head attribute | css | state.css | Stylesheet attribute reads the task-written path. |
| Nested siblings | page.body | state.page.title | Analysis preserves distinct exact nested paths. |
| Head helper | title | readTitle(), which reads state.title | Read is located in the helper body; syntax-local head scanning is insufficient. |

The emitted static-head component is still classified as scheduled. Its returned render function
constructs nested prepared programs and eagerly reads state.body when constructing body values.
Existing analysis facts can inform dependency-aware emission, but they do not by themselves split
that returned function or postpone affected eager reads. There is no implemented SSR task-span
plan in this capture.

The required compiler/runtime change is to derive ordered output spans and their transitive task
dependencies, including attribute/structure/context effects, then evaluate and publish unaffected
spans before awaiting affected work. The same renderer should issue writes to whichever sink owns
the destination. Completed tasks require no new wait. Sink policy controls string batching or byte
transport; it does not decide which task affects the view.

These six cases establish available analysis facts, not a general dependency proof. Alias/derived
dataflow, conditional structure, broad/unknown effects, and context changes require additional
compiler and runtime coverage when the plan is implemented. Current production retains all prior
improvements, and overall React parity remains unmet.
