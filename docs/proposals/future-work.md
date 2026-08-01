# Candidate future work

Status: exploratory. These are not release commitments or current framework
behavior.

Current capabilities and limits are indexed in [`../README.md`](../README.md).
A candidate should move into its own decision-complete proposal before
implementation.

## JavaScript runtime object layout

Investigate whether the client renderer and server runtime can reduce polymorphic
inline caches and hidden-class transitions without increasing retained heap size.
This is an implementation optimization, not a dependency on V8 semantics; behavior
must remain correct and competitive in other supported JavaScript engines.

The initial audit identified these candidates:

- VNodes conditionally carry domain metadata and text VNodes omit fields present
  on ordinary and cell VNodes. A canonical construction layout may make renderer
  property access more predictable, but adding absent own properties can affect
  reflection and must be treated as a contract decision.
- `Mounted` records are the renderer's hottest and most polymorphic objects.
  Host nodes, components, portals, dynamic ranges, Activity, Suspense, and raw HTML
  add different optional fields in different orders. Compare a common fixed-layout
  header plus variant state against the current compact representation.
- Component instances and task registrations acquire optional controllers,
  cleanup functions, settlements, and renderer callbacks after construction.
  Internal lifecycle state may benefit from an eagerly initialized fixed-layout
  record or a private sidecar, provided public component inspection remains clear.
- Server protocol and patch objects use conditional spreads to keep wire payloads
  minimal. Preserve the serialized format, but consider separate fixed-layout
  internal work records where request dispatch repeatedly reads the same fields.
- Renderer roots have several construction paths and late-added optional fields.
  They are lower priority because roots are few and long-lived compared with
  VNodes and mounted records.

Do not pad every record speculatively. Added slots consume memory and can make
cache locality worse even when they reduce map polymorphism. Evaluate candidates
with representative Chrome and Node versions using allocation counts, retained
heap, inline-cache or deoptimization evidence, and the existing reactive and DOM
benchmarks. Accept a layout change only when repeated measurements improve a hot
workload without materially regressing another supported engine or observable
own-property behavior.

See [`javascript-runtime-object-layout.md`](javascript-runtime-object-layout.md)
for the initial measurements, rejected options, prioritized experiments, and
acceptance gates.

## Partial prerender and resume

Native eXact progressive SSR can emit a fallback shell and reveal settled
Suspense ranges. It does not yet stop a prerender, serialize a resumable
component/task continuation record, and resume that work in a later request.

An eXact design should serialize compiler-defined continuation state rather
than renderer call stacks. It must answer:

- which component instances and task generations are resumable;
- how request/application contexts are reacquired;
- how build identity and operation contracts are pinned;
- how secret and server-only values are excluded;
- how stale or retired deployments fail; and
- whether resumption continues on a server, a client, or either.

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

## Complete microfrontend host coverage

The trusted microfrontend reference path is implemented for Vite/Rollup.
Webpack and Bun have artifact-mapping proofs but need complete lifecycle
integration and heterogeneous producer/consumer conformance before being
advertised.

Possible later work also includes primary page-bundle replacement and
component-authenticated protocol messages. Deployment discovery, signing, and
rollout control remain platform concerns unless a concrete framework invariant
requires otherwise.

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
