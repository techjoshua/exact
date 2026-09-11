# Branching output ownership prototypes, 2026-09-10

## Design

Extend the earlier leaf-only facade experiment to branching programs that do
not own prepared siblings. An AST proof excludes generated functions accessing
output members other than sink. Runtime source review confirms ordinary child
writing forwards through the target without mutating output preparation.
This marks 21 writer definitions eligible and four ineligible.

The first prototype caches an output wrapper on its traversal target while its
sink is unchanged. It reduces fixture output-wrapper creation from 24 to 20.
Most nested programs use different targets, limiting reuse. The second prototype
lets the existing target represent output directly by supplying sink/render/
prepareReferences members. It reduces separate output-wrapper creation to six,
using the target directly for 18 invocations. It rejects member collisions,
unexpected preparation and sink changes. Capture/function-target paths retain
ordinary output objects. These guards are diagnostic restrictions, not a complete
production capability design.

Both execute the actual component tree and all generated writer operations.
Document-host entry/exit and preparation-owning programs retain the original
flow. No HTML, hydration, component state or result is precalculated. A production
design would require compiler-owned capability metadata, explicit target fields
and complete capture/ownership coverage; source inspection is not a public ABI.

## Validation and measurement

Four ordinary/escaped document parity checks pass for each prototype. The merged
prototype also passes twelve forced-pressure/failure comparisons on Node and
twelve on Bun using the portable artifact: small/large string renders, selected
drain failures and complete stream output. These are not native Bun HTTP results.

Two fresh Node string workers per prototype run normal/candidate/normal after
ten seconds of HTTP warmup. Blocks last five seconds, with two fresh drivers each
holding 16 requests in flight. Controls average adjacent normal blocks in the
same worker. Separate isolated loops before/after each block warm and measure
10,000 renders. Artifact and adapter hashes remain unchanged.

| Prototype | Worker | Normal RPS | Candidate RPS | Change |
| --- | ---: | ---: | ---: | ---: |
| branch-output | 1 | 8,666 | 8,842 | +2.04% |
| branch-output | 2 | 8,677 | 8,604 | -0.84% |
| merged-output | 1 | 8,596 | 8,565 | -0.36% |
| merged-output | 2 | 8,600 | 8,376 | -2.61% |

All measured responses match the complete 4,672-byte document, zero errors.
Raw render timings and per-worker blocks are preserved in the archive.

## Allocation follow-up

After HTTP completed, four separate Node workers compare normal/merged in both
orders. Each warms 50,000 renders and samples 10,000 at a 16 KiB interval,
including objects collected by minor and major GC. These estimate allocation
volume, not retained heap, exact counts or GC pause time.

| Sample | Mode | Sampled bytes/render |
| --- | --- | ---: |
| 1 | none | 67,299 |
| 2 | reuse | 66,401 |
| 3 | reuse | 66,523 |
| 4 | none | 66,996 |

Eliminating wrapper constructions does not remove all their fields: the merged
prototype adds output fields to existing objects. Shape changes and property
storage can offset object savings. The data do not isolate those costs, and
constructor count is not an allocation-byte measurement.

## Decision

Do not adopt these dynamic target-mutation prototypes as a performance win.
Any follow-up must explain what a fixed-layout combined target/output removes
that these implementations retain, then test that specific hypothesis. Preserve
preparation ownership and sink identity. The broader Node/Bun string/stream goal
remains open. No production source was changed for these prototypes.

## Evidence

- branch-output: 260,923 validated measured responses.
- merged-output: 256,912 validated measured responses.

The adjacent archive contains builders, checks, runners, raw HTTP and allocation
captures, summaries, current/diagnostic artifacts, fixture and verified SHA-256
inventory. Workspace dependencies are not a standalone distribution.
