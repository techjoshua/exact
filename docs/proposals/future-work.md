# Candidate future work

Status: exploratory. These are not release commitments or current framework
behavior.

Current capabilities and limits are indexed in [`../README.md`](../README.md).
A candidate should move into its own decision-complete proposal before
implementation.

## Progressive native forms and file transport

Task-owned forms currently coordinate validation, pending UI, optimism, server invocation, and
router work. Investigate a compiler-generated, no-JavaScript submission contract only after the
transport can preserve the same allowlisting, context, cancellation, validation, redirect, and
settlement guarantees as the hydrated path.

File uploads need a separate streaming policy covering size limits, content validation, temporary
storage ownership, cleanup, cancellation, replay protection, and deployment-specific storage.
Do not encode those concerns as ordinary serialized task arguments or imply progressive behavior
that the generated server artifact cannot actually provide.

## Registry scope beyond finite local graphs

Native component registries intentionally describe a finite, immutable set of compiler-visible
components. The focused
[`compiler-authored-dynamic-component-boundaries.md`](compiler-authored-dynamic-component-boundaries.md)
proposal now owns intentionally opaque local, lazy, and authorized client-only remote component
selection, including its warning annotation, server-call prohibition, generation fencing, and
cleanup. Possible later registry-specific work remains limited to preload heuristics or explicitly
measured inactive-instance caching; it must not weaken registry identity or SSR guarantees.

## Optional visual and simulation adapters

Motion, gestures, physics, and gravity compose today through ordinary state, callbacks, contexts,
task ownership, and the physics force seam. Consider convenience adapters only where repeated
application code demonstrates a stable cross-package contract. Keep each base package independently
usable and avoid introducing a required dependency cycle.

The focused
[`exploratory-motion-values-and-orchestration.md`](exploratory-motion-values-and-orchestration.md)
proposal now owns investigation of finite spring timing, interpolation helpers, reactive motion
values, gesture handoff, timelines, shared elements, and scroll/view motion. In particular, it does
not select a general component-resource API merely for motion ergonomics.

Related experiments may evaluate shared-layout coordination across independently updated roots and
worker-oriented physics helpers. They must preserve renderer-owned DOM identity, deterministic
simulation, generation fencing, cancellation, and bounded inspection.

## Reactive secret rotation

Secrets are currently compiler-qualified server values resolved through
runtime providers. Investigate whether a provider may expose a reactive secret
version so rotation invalidates only affected server work.

The experiment must prove behavior across independently compiled provider,
library, and application packages. Rotation must not permit secret values or
derived confidential data to enter client artifacts, hydration, patches,
logs, diagnostics, profiling, or public source maps.

Open questions include whether the reactive value represents availability,
value, version, or a combination; how in-flight work is cancelled; and which
contract survives package publication.

## Reactive Sudoku sample

A polished Sudoku application remains a useful dogfooding project for
fine-grained structured state, derived validation, keyboard and touch input,
accessibility, undo/redo, and stable list/grid identity.

The first version should include givens, entries, pencil marks, conflicts,
selection, completion, accessible grid semantics, keyboard controls, mobile
controls, and transactional undo. Rows, columns, houses, peers, conflicts, and
candidates should be derived rather than copied into parallel mutable stores.

The sample should measure that a one-cell edit does not recreate the board and
should add tests in proportion to the risk of its rule and history engines.
