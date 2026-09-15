# Shared output sink: traversal and first-output audit

Date: 2026-09-09. Diagnostic evidence, not an implemented sink redesign or performance gain.

## Observed traversal

The current retained marker-hex artifact was instrumented at compiled-program execution,
appendProgramText, appendBoundedHtml, continueProgramOutput, renderChildWithTarget, and hydration
publication. Four fresh production-mode processes cover Node/Bun with control/instrumented builds.
Each renders small/large documents in string/stream modes three times. Small has three incidents;
large has 96. Both include two module scripts and two stylesheet links. Every instrumented output
matches its control's full-body hash. Counts repeat exactly across runs and runtimes.

| Fixture | Mode   | Final UTF-16 units | Programs | Program segments | Bounded appends | Appended UTF-16 units |
| ------- | ------ | -----------------: | -------: | ---------------: | --------------: | --------------------: |
| small   | string |              4,669 |       24 |               62 |              76 |                30,676 |
| small   | stream |              4,669 |       24 |               62 |              77 |                34,472 |
| large   | string |             36,382 |      210 |              434 |             448 |               252,326 |
| large   | stream |             36,382 |      210 |              434 |             449 |               278,287 |

The small fixture performs 95 generated program text writes; large performs 1,118. Those operations
coalesce into 42 and 321 string segments, respectively. Deferred segments total 20 and 113. Each
render publishes hydration once. Final UTF-8 sizes are 4,672 and 36,478 bytes.

Appended units count repeated subtree operands at ancestor assembly boundaries. They are NOT byte
copies, allocation totals, live memory, or CPU time. JavaScript engines may retain concatenations
as ropes. Instrumented runs have no timing claims. String and stream hashes differ from each other
because root-boundary publication differs; each is compared only with its matching control.

## First-output characterization

A temporary Vitest diagnostic used the existing compiler-built ControlledText task fixture inside
an authored html/head/body tree. The head contains /early.css; the body task waits on an externally
controlled promise. A first reader.read() was requested, then the test observed it for 50 ms before
releasing the task. No chunk arrived during that interval. After release, the complete document
contained the stylesheet, settled body text, hydration publication, and closing body/html tags.

The diagnostic passed and its observation plus final HTML are archived. The 50 ms interval is a
controlled observation window, not a latency benchmark or proof of a particular scheduling delay.
The source also identifies explicit full-document deferral in streamDocumentRender: a document
with pending work is held until settlement before the shell event is emitted. Existing early-shell
tests with fragment replacement do not establish early head delivery for full documents.

The temporary test was removed from the production test suite after archiving. Its expectation
does not lock in the current delayed behavior. Reproduction places it back under packages/ssr/src
and runs npm exec -w @exactjs/ssr -- vitest run src/sink-audit.test.ts. Two initial successful runs
had intercepted console output; the archived third run writes the observation directly to JSON.

## Ownership and publication constraints found in source

- render-program.ts executes compiler output into segment arrays. direct-component-content.ts and
  program-output.ts recursively turn those segments into strings. tree-output.ts creates the final
  output buffer after the tree returns. Passing a writer into the outer API alone cannot remove this.
- Component boundary ordinals are reserved before descendants. direct-component-output.ts decides
  boundary emission using compiler publication facts and document discovery. A direct writer must
  determine opening boundaries before committing children and preserve ordinal allocation order.
- Component attempts checkpoint resumption and document state. Failed attempts roll back unpublished
  state, and disposal must preserve the original failure. Bytes already sent cannot be rolled back.
- Enhancement routes can capture an accumulated prefix or wrap completed HTML. They need an explicit
  capture scope through the same traversal before writing the transformed result to the parent sink.
- Whole-output extensions can transform completed HTML. These require document buffering while
  ordinary rendering should retain incremental output. This is a sink policy, not a second renderer.
- Scheduled component issuance starts work before serialization. Required work must still settle
  before affected HTML is committed, without making already completed head content wait for body work.
- The request, not individual components, owns final close/destroy. Backpressure must suspend traversal
  when necessary; synchronous accepted writes should not introduce a promise per text span.
- Hydration and framework tail content must precede body/html closing tags. Early publication cannot
  rely on finding and editing closing tags in an already completed document string.

## Experiment justified by the audit

The next substantive experiment should thread one request-owned output sink through the existing
traversal, replacing returned subtree HTML where capture is unnecessary. Start with a string sink
to separate traversal/allocation effects from transport, then run the same traversal with a batched
stream sink. Maintain scoped capture for transforms and retryable boundaries, with explicit commit
points. The initial hypothesis is a 2-8% full-render time reduction from avoiding intermediate
assembly, not a predicted result. Head-before-pending-body is an independent browser-facing criterion.

Validation must cover exact document/hydration equivalence, marker identity, pending-task ordering,
early head publication, cancellation and backpressure, primary-error preservation, once-only disposal,
enhancement routing, output transforms, Unicode buffer boundaries, and output budgets. Compare Node
and Bun strings and streams with the current retained build and React. Do not infer throughput from
these counters or benchmark a second stripped-down rendering engine.

No production runtime or compiler changed. This audit changes the next optimization target and
identifies a missing full-document first-output property. Overall React parity remains unmet.
