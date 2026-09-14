# Direct writer rebased on retained production improvements

Date: 2026-09-09. Experimental bundle; not adopted.

The direct writer is rebuilt from the actual current participant entry rather than patching the
older prototype with selected module replacements. Its control SHA-256 is
`fe5c90d02d7b6e9a2c26a0e7fce5be8c0347ebfc6f2fa9650ffccf16d3eb591a`.
The reproducible transformation chain retains current compiler text-surroundings emission and
current runtime modules, then replaces the buffered traversal with the experimental continuation
writer and sibling preparation scope. Twenty-five generated writers include 11 continuation
programs and 18 child sites. Four programs prepare five known direct-component references.

The hypothesis is that removing intermediate traversal stages could help total rendering time.
This rebase tests whether that remains true after the retained compiler/runtime improvements.
Thirty-two production processes cover Node/Bun, string/consumed stream, three/96 incidents with
four assets, and two reversed-order pairs per cell. Each uses 5,000 warmups and 12,000 measured
renders. All paired complete-document hashes match; no completed sample was discarded.
Positive percentages mean slower rendering. These are local renderer timings, not HTTP rates.

| Runtime | Mode | Fixture | Pair 1 time change | Pair 2 time change |
| --- | --- | --- | ---: | ---: |
| node | string | small | +3.21% | +5.47% |
| node | string | large | +5.15% | +4.91% |
| node | stream | small | +6.06% | +4.77% |
| node | stream | large | +4.60% | -0.57% |
| bun | string | small | +12.07% | +7.13% |
| bun | string | large | +4.29% | +4.44% |
| bun | stream | small | +1.39% | +11.32% |
| bun | stream | large | +4.25% | +3.34% |

The current prototype is not a throughput improvement. Its direct traversal has extra output
context and cleanup machinery, so eliminating segments alone is insufficient. In particular,
the experimental execution wrapper unconditionally creates cleanup callbacks even for programs
that acquire no sibling resources. The retained production scope-elision optimization is present
in the input but superseded by this experimental execution implementation. A next isolated
experiment should retain that ownership optimization in the new writer. It must prove preparation
is acquired synchronously before the first suspension before omitting a pending cleanup wrapper.

The rebased candidate passes six real scheduled-child cases: success, failure before the second
child is visited, and abort while the task gate remains closed, on Node and Bun. Both children
start before the gate opens and each is disposed once. These use compiler-generated child tasks
and a hand-built parent writer, as detailed in the real-siblings report. This is not full compiler
integration or browser validation.

The prototype still needs general component preparation, enhancement and boundary captures,
selective waiting, early head flushing, and transport backpressure. It uses string accumulation
on both runtimes in this comparison; the earlier Bun batching variant is not included. No public
or production source changed. React was not rerun, and the overall goal remains unmet.

The archive preserves the full transformation chain, frozen artifacts, raw measurements, task
fixture and results, fixed benchmark input, and a verified SHA-256 manifest.
