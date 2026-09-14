# Shared accumulator traversal prototypes

Date: 2026-09-09. Experimental artifacts only; no production adoption.

## Hypothesis and implementation

The prior sink audit justified testing whether avoiding recursive subtree assembly reduces full
render time by 2-8%. Three frozen-bundle prototypes modify the existing program visitor and child
traversal to write completed spans into a request-local string accumulator. They retain compiler
program execution, task issuance, ownership, hydration publication, and the existing outer string
and streaming consumers. They do not create an independently compiled benchmark renderer.

1. Initial shared accumulator: program output writes into a request-local accumulator; generic
   operations and structural marker ranges are captured locally. The visitor initially allocates
   write and continuation closures per program.
2. Direct visitor: moves continuation logic to shared functions and restores the single-string
   program shortcut. Local capture policy remains identical.
3. Shared ranges: marker pairs write their opening before content and closing afterward. Plain
   fragments, direct child ranges, and keyed ranges can retain shared accumulation. Generic operations
   and enhanced fragments still use local capture.

The initial development draft misplaced range opening markers after content. A full-output diff
identified this before timing. The first timed version restored local capture; the third version
implements ordered marker writes. All timed variants match their controls byte for byte.

These prototypes are incomplete architectural experiments. They reject uncaptured enhancement routes
and component publication boundaries that cannot yet be emitted incrementally. They retain generated
segment arrays, expose no public sink API, and finish the accumulator before existing stream consumers
publish it. They do not implement early head delivery, backpressured traversal, or compiler task-span
dependencies. They must not be presented as production implementations of the requested model.

## Method

Each variant is independently compared with marker-hex-current in 32 fresh production-mode processes:
Node/Bun, string/consumed stream, small/large documents, two reversed-order pairs per cell. Total:
96 populations. Each uses 5,000 warmups and 12,000 measured renders. Small has three incidents; large
has 96. Both include two module scripts and two stylesheet links in application-owned documents.
Both runtimes use the same Node-target artifact. Streams are consumed with Response.text(). Every
population completed and every paired full-document hash matched; no observations were discarded.

Positive means longer rendering time. Compare each variant only with its own paired control, not
absolute timings across batches. These local pairs are not confidence intervals or HTTP/browser
measurements. React was not rerun because no candidate advanced to adoption.

| Variant | Runtime | Output | Fixture | Pair 1 time change | Pair 2 time change |
| ------- | ------- | ------ | ------- | -----------------: | -----------------: |
| initial | node    | string | small   |             +3.96% |             +1.97% |
| initial | node    | string | large   |             -0.66% |            +12.09% |
| initial | node    | stream | small   |             +0.51% |             +2.21% |
| initial | node    | stream | large   |             +1.89% |             +5.32% |
| initial | bun     | string | small   |             +6.61% |             +9.63% |
| initial | bun     | string | large   |             +6.55% |             +5.30% |
| initial | bun     | stream | small   |             +5.27% |             +5.83% |
| initial | bun     | stream | large   |             +7.49% |             +8.15% |
| -direct | node    | string | small   |             +0.89% |             +4.84% |
| -direct | node    | string | large   |             +1.40% |             +3.05% |
| -direct | node    | stream | small   |             -1.16% |             +2.75% |
| -direct | node    | stream | large   |             +2.37% |             +9.41% |
| -direct | bun     | string | small   |             +2.30% |             +1.33% |
| -direct | bun     | string | large   |             -4.03% |             -5.63% |
| -direct | bun     | stream | small   |             +3.04% |             -5.19% |
| -direct | bun     | stream | large   |             +1.83% |             -1.03% |
| -ranges | node    | string | small   |             +1.17% |             -0.43% |
| -ranges | node    | string | large   |             +2.17% |             +4.00% |
| -ranges | node    | stream | small   |             +0.68% |             +0.69% |
| -ranges | node    | stream | large   |             +5.49% |             -1.18% |
| -ranges | bun     | string | small   |             +1.97% |             +2.41% |
| -ranges | bun     | string | large   |             +1.76% |             +5.17% |
| -ranges | bun     | stream | small   |             +3.81% |            +10.96% |
| -ranges | bun     | stream | large   |             -0.76% |             +1.53% |

No variant establishes a broad win. The initial version is mostly slower. Removing completed-work
callbacks improves the implementation but does not yield consistent gains across target workloads.
The range-writing variant also fails to establish a general gain. None is adopted. This rejects
these implementations, not compiler-guided incremental writing as an architectural direction.

## Scope diagnostic

Separate untimed Node runs count program invocations using the shared accumulator versus local
capture. Each fixture/mode is repeated three times. This establishes how much of the actual tree
the prototype reaches, rather than assuming that changing the root changes every descendant.

| Variant                   | Fixture | Output | Shared programs | Captured programs |
| ------------------------- | ------- | ------ | --------------: | ----------------: |
| shared-accumulator-direct | small   | string |              20 |                 4 |
| shared-accumulator-direct | small   | stream |              20 |                 4 |
| shared-accumulator-direct | large   | string |             206 |                 4 |
| shared-accumulator-direct | large   | stream |             206 |                 4 |
| shared-accumulator-ranges | small   | string |              24 |                 0 |
| shared-accumulator-ranges | small   | stream |              24 |                 0 |
| shared-accumulator-ranges | large   | string |             210 |                 0 |
| shared-accumulator-ranges | large   | stream |             210 |                 0 |

## Compiler dependency finding and next work

The user correctly identified that tasks need not delay unaffected shell content. Existing
continuation contracts carry stateReads, stateWrites (with exact/broad/unknown confidence),
contextWrites, serverContextWrites, and dependency paths. The compiler's render-program update
lowering also analyzes dependencies of text, component, structural, and attribute expressions.
These are useful inputs, not an already implemented SSR prefix-commit protocol.

Current server lowering prepares eager values before emitting a program. Scheduled components and
full-document stream settlement operate at broader boundaries. The missing connection is to map
transitive task effects onto ordered SSR spans, including structural and attribute dependencies,
and defer reads of affected spans until the required task generation settles. A prefix using settled
props can be safe even when it is not literal HTML. A head attribute or context affected by the task
must remain behind the dependency boundary; unknown effects cannot be treated as independence.

The intended traversal is: emit the compiler-proven unaffected prefix, flush after the completed
head or before required suspension, await only relevant unfinished work, emit affected content,
then publish hydration and final closing tags. Task execution and lifetime ownership remain with
the existing task machinery. This is still one shared renderer with different sinks.

Further experiments should implement that compiler/runtime connection and genuinely batched sink
writes, rather than interpreting these whole-result accumulator measurements as an early-flush test.
No new package/browser suite was run for rejected incomplete prototypes. Output equality protects
the measured fixtures only, not unsupported boundary and lifecycle behavior. Current production
remains marker-hex-current with all retained improvements. Overall React parity remains unmet.
