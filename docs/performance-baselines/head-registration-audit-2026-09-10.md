# Compiler-directed head registration, September 10, 2026

Status: investigation, not an implemented public API.

The proposed request-owned head collection would accept prepared component references or render
programs. An authored or generated document shell would render those entries once through the
existing renderer and sink. Registration must not render content into temporary strings or introduce
a second traversal merely to discover destinations.

## Current evidence

`native/typescript-go/overlay/internal/exactcompiler/jsx_render_program_document.go` proves a
canonical authored head/body pair with `canonicalProgramDocument`. The benchmark Document has
that shape. Its compiled program already bypasses `normalizeDocumentChildren` in
`packages/ssr/src/render/intrinsic-receipt.ts`. Removing generic document discovery alone therefore
cannot explain or recover the benchmark's shell gap.

`appendRenderProgramElement` in `jsx_render_program_lowering.go` issues nonstatic document children
as independent child programs. Its comment records the client-adoption reason: document hosts
adopt ordinary children through their existing boundaries. Head registration must preserve those
identities even if server execution is coalesced.

`renderProgramServerValues` emits eager slot values when a component prepares its render program.
`prepareSsrChild` consumes those values and rejects pending ones. A direct head reference can be
registered at that existing preparation point, without a tree walk. This does not prove that head
contributions hidden behind unevaluated descendant components are already discoverable. Their
registration and readiness need explicit compiler/runtime semantics.

`host.ts` currently owns document claims and balanced ancestry; `program-writer-output.ts` owns
head flush and async lifetime. A registry must preserve both. Moving an entry's destination must
not move its component state, context, cancellation, or disposal to an unrelated owner.

## Experiment and acceptance direction

First compare a compiler-issued direct head/body plan against today's separately issued programs,
using dynamic asset entries and live application rendering. Hold hydration ownership and payload
constant to isolate placement/preparation cost. Count prepared invocations, slot arrays, writer
outputs and callbacks as well as encoded render time. Do not compare a literal cached head with a
dynamic head and attribute the entire gain to registration.

Keep registration ordered and request-owned. Execute registered entries once. Head-dependent tasks
must settle before commitment; unrelated body tasks should not delay the head. Decide how descendant
contributions become known before commitment rather than silently dropping or reordering late
entries. Registration after a head has been committed cannot insert bytes into the already-sent
prefix.

Required behavioral evidence: static and dynamic entries, imported components, conditional and
scheduled entries, deterministic order, failure and cancellation cleanup, retry rollback without
duplicate registration, concurrent request isolation, existing browser adoption identities, and
head delivery while a body-only task remains pending. Authored full documents and framework-provided
shells must retain their intended semantics.

Hydration scope is independent of destination. A server-only shell should not publish its own state,
but an explicitly hydrated component located in the head still needs its supported client contract.
The application-only hydration integration remains separate from this placement experiment.
