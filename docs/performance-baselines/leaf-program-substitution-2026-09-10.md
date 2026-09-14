# Leaf program substitution, 2026-09-10

## Scope and hypothesis

After tree replay exposed a broad cost, isolate nonbranching compiled writers.
Hypothesis: leaf HTML generation contributes meaningful work beyond sink
accumulation. Preserve individual writes rather than batch them into one string.

An AST classification finds 14 nonbranching and 11 branching writer definitions.
The fixed fixture executes 11 leaf invocations producing 17 of its 89 sink writes.
The diagnostic records those writes during priming, keyed by occurrence and
verified program identity. Treatment invokes beginSsrProgram with the original
static arguments, then replays each write. Compiler IDs, node counts and static
limit checks remain active. Replay checks synchronous readiness after each write.

Component preparation, parent traversal, host entry/exit, program completion
and ownership remain active. Pending target attribute contributions cause a
diagnostic error rather than silently bypass their consumption. Priming verifies
expected ID/node deltas and synchronous completion. The fixture is fixed; dynamic
per-value rendering and its checks are intentionally replaced here. This is not
a general caching implementation or proof of safety for other applications.

The result covers only leaf writer invocation. Eager input evaluation, program
construction and branching writers still run. Most writes come from those
branching writers, so a small result cannot exclude broader compiled-render cost.

## Measurement

Two fresh Node string workers each run normal/replay/normal, ten seconds HTTP
warmup and five seconds per block. Two fresh drivers per block each hold 16
requests in flight. Controls average adjacent normal blocks in the same worker.
Isolated loops before/after each block warm and measure 10,000 renders. Compare
within this diagnostic; instrumentation and workstation load affect controls.

| Worker | Normal RPS | Replay RPS | Change | Normal HTTP us | Replay HTTP us |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 8,442 | 8,637 | +2.31% | 58.33 | 56.06 |
| 2 | 8,476 | 8,781 | +3.59% | 58.88 | 55.80 |

All 256,531 measured responses match the complete 4,672-byte document,
zero errors. Four ordinary/escaped full-document parity cases pass. Counters
confirm replayed invocations. Artifact and adapter hashes are checked, and owned
worker/load processes close. Raw isolated durations remain in summary.json.

## Next boundary

Inspect branching-writer work and the eager construction of render-program
invocations before considering a compiler/runtime redesign. State capture, prop
scanning and sink accumulation already have bounded substitution evidence. No
production optimization is accepted from this diagnostic, and the complete
Node/Bun string/stream performance objective remains open.

The adjacent archive includes raw blocks, summaries, source/check/runner scripts,
frozen current and diagnostic artifacts, fixture and a verified SHA-256 inventory.
Workspace dependencies are not included as a standalone distribution.
