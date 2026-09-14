# Publication preparation substitutions, 2026-09-10

## Scope and hypothesis

Follow the [hydration stage experiment](hydration-stage-substitution-2026-09-10.md)
by isolating root-prop preparation, publication options, compact metadata
construction and payload byte counting. Hypothesis: metadata construction alone
is below roughly 2 percent of HTTP throughput; root-prop object copies and
publication records could offer a larger, approximately 1 to 5 percent gain.

Each diagnostic reuses a precalculated fixed-input result in the same warmed
Node string worker. The normal shared renderer, validation and JSON encoding
remain active. Root mode reuses prepared root options. Options mode reuses
publication options after rendering. Metadata mode copies the precalculated
envelope and inserts current state and resumption references. Bytes mode reuses
the computed payload byte length while retaining the limit comparison.

Metadata still allocates an envelope, so this measures its construction work
against copying and patching a known layout, not total allocation elimination.
Reusing records can affect downstream allocation, optimization and memory access.
These substitutions are valid only for this fixed fixture and are not proposed
production caches or exclusive CPU measurements.

## Controls and correction

Two fresh workers each warm HTTP for ten seconds, then run nine three-second
blocks: four substitutions bracketed by normal execution. Worker two reverses
treatment order. Two fresh load drivers per block each hold 16 requests in
flight. The paired control is the mean of immediately adjacent normal blocks.
Isolated loops before/after each block independently prime caches to avoid
confounding literal versus URL-derived pathname representation.

The first diagnostic version copied cached metadata without restoring current
resumption identity. The validator uses that identity to choose structural
validation. That version is excluded from conclusions and retained in evidence.
The corrected version restores current state and resumption references, while
preserving a fresh mutable envelope for positional projection.

Ten normal/escaped full-document parity cases pass for the corrected version.
All 521,433 measured HTTP responses match the complete 4,672-byte
document, with zero errors. Stage counters confirm the selected operation is
skipped and the other measured stages still run. Artifact and adapter hashes
remain unchanged over the experiment. Owned worker/load processes are closed.

## Corrected results

| Stage    | Worker | Normal RPS | Substituted RPS | Change |
| -------- | -----: | ---------: | --------------: | -----: |
| root     |      1 |      9,533 |           9,714 | +1.90% |
| root     |      2 |      9,614 |           9,721 | +1.11% |
| options  |      1 |      9,594 |           9,697 | +1.08% |
| options  |      2 |      9,712 |           9,640 | -0.74% |
| metadata |      1 |      9,693 |           9,850 | +1.61% |
| metadata |      2 |      9,652 |           9,684 | +0.32% |
| bytes    |      1 |      9,815 |           9,523 | -2.98% |
| bytes    |      2 |      9,380 |           9,788 | +4.36% |

Raw isolated and HTTP render durations are preserved in summary.json and
capture.json in the evidence archive. Small changes require caution given
background workstation load and instrumentation. This experiment does not
establish an eXact versus React result or recoverable production speedup.

## Decision

Do not redesign publication metadata based on these small substitutions alone.
The earlier JSON substitution provides the stronger consistent signal. Continue
by separating per-component state capture and the tree-rendering stage, preserving
full output and normal ownership for the portions that still execute. The broader
Node/Bun string/stream performance objective remains open. No framework behavior
or public documentation changes are justified by this diagnostic.

The adjacent evidence archive contains both diagnostic versions, frozen current
artifacts, runner/check sources, raw results, fixture and a verified SHA-256
inventory. Workspace dependencies are not packaged as a standalone distribution.
