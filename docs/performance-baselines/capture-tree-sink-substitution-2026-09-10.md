# Capture, tree and sink substitutions, 2026-09-10

## Method and scope

Continue the same-worker fixed-input substitution investigation using the frozen
integrated Node string artifact. No production code changes. Each treatment is
bracketed by normal execution in the same worker, with two fresh worker
populations. Compare each treatment with its adjacent controls, not across
diagnostics. Instrumentation changes normal-path timing and code optimization.

Capture blocks last three seconds; tree and sink blocks last five seconds.
Each worker warms HTTP for ten seconds. Two fresh drivers per block each hold
16 requests in flight. Isolated 10,000-render loops before/after each HTTP block
use their own 10,000-render warmup. Cache priming is separate for isolated loops
and HTTP so pathname representation is not borrowed between contexts.

## Substitution boundaries

- Publish: reserve normal request-local records, then replace each published
  resumption tuple with its fixed precalculated tuple. Component execution and
  ownership remain active.
- Capture: also bypass schema lookup and record construction during reservation.
  A current request-local record array receives the cached tuples. The capture
  instance, options and its initial arrays still allocate. This is not complete
  elimination of capture setup.
- Tree: reuse the completed tree result and its records instead of calling
  renderOwnedOutput. This skips component rendering, associated allocation,
  capture work and render ownership together. Normal root preparation, hydration
  publication, document assembly and HTTP delivery remain. The priming render
  completed its cleanup before its result was retained.
- Sink: execute components and generate their write arguments normally, but
  discard string-sink writes and return precalculated HTML at finish. Keep sink
  destruction and component ownership. This removes accumulation, sink write
  checks and finalization work together, and changes output string reuse.

The fixture has three reservation checks, one published resumption record and
89 string-sink writes per render. Initial capture hypothesis was meaningful
pre-serialization work; the observed one-record count limits expected headroom.
The sink hypothesis was a much smaller effect than whole-tree replay, likely
under 5 percent. These are fixed-input diagnostics, not cache implementations
for application requests or support for removing correctness checks.

Fourteen normal/escaped complete-document parity cases pass. Stage counters
verify the substituted operations do not execute. All measured HTTP documents
match the complete 4,672-byte identity; zero errors. Artifact/adapter hashes
are checked and owned worker/load processes close after each experiment.

## Paired HTTP throughput

| Substitution | Worker | Normal RPS | Substituted RPS | Change |
| --- | ---: | ---: | ---: | ---: |
| publish | 1 | 9,383 | 9,623 | +2.56% |
| capture | 1 | 9,553 | 9,806 | +2.65% |
| capture | 2 | 9,204 | 9,865 | +7.17% |
| publish | 2 | 9,496 | 9,643 | +1.55% |
| tree | 1 | 8,710 | 17,776 | +104.10% |
| tree | 2 | 8,356 | 17,199 | +105.82% |
| sink | 1 | 8,491 | 8,914 | +4.98% |
| sink | 2 | 8,445 | 8,886 | +5.22% |

## Isolated versus HTTP render duration

Microseconds per render. Normal values average adjacent controls; isolated
values average the before/after loops. These are elapsed render intervals, not
exclusive CPU or an additive stage accounting.

| Substitution | Worker | Normal isolated | Substituted isolated | Normal HTTP | Substituted HTTP |
| --- | ---: | ---: | ---: | ---: | ---: |
| publish | 1 | 24.17 | 23.79 | 50.72 | 48.88 |
| capture | 1 | 24.10 | 23.79 | 50.28 | 48.25 |
| capture | 2 | 23.50 | 22.63 | 51.54 | 47.54 |
| publish | 2 | 23.61 | 23.43 | 50.22 | 48.67 |
| tree | 1 | 24.38 | 5.48 | 56.76 | 13.96 |
| tree | 2 | 24.23 | 6.70 | 58.79 | 14.22 |
| sink | 1 | 24.87 | 22.87 | 57.94 | 54.36 |
| sink | 2 | 25.03 | 22.71 | 58.52 | 54.52 |

## Interpretation

Capture publication is a modest contributor in this fixture. Whole-tree replay
removes a much larger amount of both isolated and HTTP render time, and more
time under HTTP. This boundary includes too much work to justify blaming a
specific traversal algorithm, allocator or component helper. It also changes
downstream memory reuse and string representation. The effects are not additive.

Keep narrowing the tree boundary into component preparation, compiled execution
and sink output. Do not infer that doubling throughput with a pre-rendered tree
is an achievable production optimization. The shared renderer must continue
executing the actual application with hydration and lifecycle guarantees.

These experiments do not compare against React and do not complete the broader
Node/Bun string/stream goal. No production optimization is accepted here.

## Evidence

- capture-ablation: 286,873 validated measured responses.
- tree-ablation: 345,807 validated measured responses.
- sink-ablation: 258,639 validated measured responses.

The adjacent archive retains scripts, raw blocks, summaries, parity checks,
diagnostic and current artifacts, fixture and a verified SHA-256 inventory.
Workspace dependencies are not a standalone distribution.
