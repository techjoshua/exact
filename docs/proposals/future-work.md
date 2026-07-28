# Candidate future work

Status: exploratory. These are not release commitments or current framework
behavior.

Current capabilities and limits are indexed in [`../README.md`](../README.md).
A candidate should move into its own decision-complete proposal before
implementation.

## Native TypeScript compiler backend

The TypeScript 7 native API proof of concept can load in-memory TSX, query the
Go type checker, and advance incremental snapshots while reproducing a narrow
slice of the current expression projection. The next step is a complete
`@exactjs/expressions` semantic backend with differential and performance gates,
followed by native validation and emission.

See [`native-typescript-compiler.md`](native-typescript-compiler.md) for the
findings, architecture, migration phases, fork contingency, and acceptance
criteria.

## Remove compiler manifest files

The current compiler still produces `*.exact.manifest.json` planning sidecars,
although hydration implementations and several runtime contracts have already
moved to descriptors attached to executable component artifacts.

The goal is to remove user-visible coordination around generating, locating,
watching, merging, and versioning sidecars without weakening:

- cross-file placement and artifact selection;
- package publication contracts;
- server action and refresh allowlists;
- client/server state, context, and capture contracts;
- secret and residency analysis; or
- diagnostics and optional audit output.

See [`../manifest-usage-inventory.md`](../manifest-usage-inventory.md) for the
current consumers and
[`remove-compiler-manifests.md`](remove-compiler-manifests.md) for the proposed
clean break.

## Runtime component registries

The compiler supports declared components, immutable aliases, and finite
conditional component values. It intentionally rejects opaque lookup such as:

```tsx
const View = views[this.state.kind];
return () => <View />;
```

A useful explicit registry would declare a finite component set while allowing
runtime selection. The design must preserve:

- client/server placement and artifact reachability;
- tree shaking and lazy chunk boundaries;
- SSR and hydration identity;
- prop typing;
- server operation allowlisting; and
- a clear failure for unknown registry keys.

This should be an eXact compiler contract, not an application-local
`createVNode()` escape that hides the graph.

## Conditional classes through namespaced props

Investigate compiler support for declaring a statically named conditional class
as a namespaced intrinsic-element prop:

```tsx
<div
	className={['card', this.state.compact && 'compact']}
	className:selected={this.state.selected}
	className:disabled={!this.state.enabled}
/>
```

Each `className:name` entry would append `name` after the ordinary `class` or
`className` input while its value is truthy and omit it while falsey. An entry
without an initializer would be unconditionally enabled. The compiler should
lower all inputs to one canonical class value so namespaced props do not escape
into DOM attributes, SSR markup, hydration contracts, or component props.

An initial design should:

- support intrinsic and custom elements, but reject the syntax on components;
- preserve the authored order of namespaced classes after the ordinary class
  input;
- treat `class` and `className` as aliases of the same input;
- report an error for duplicate class tokens when the collision is statically
  provable, while accepting possible collisions hidden in dynamic class values;
- retain the existing truthy-map semantics rather than requiring boolean-only
  conditions; and
- either define correct spread ordering and single-evaluation semantics or
  reject prop spreads on elements using conditional class props in the first
  version.

The suffix is limited by TypeScript's JSX namespaced-name grammar. It can
represent common names such as `selected` and `is-active`, but not every valid
CSS token, including names with another colon, a slash, brackets, or a leading
digit. Existing string, array, map, CSS-module, and computed class forms must
remain available.

Before lowering the feature to the existing class-list representation, make
class normalization a shared DOM, SSR, and hydration contract. The DOM renderer
currently normalizes arrays and truthy maps, while native SSR and static
hydration do not apply the same normalization. Add compiler diagnostics and
emission tests plus DOM reactivity, SSR, and hydration regression coverage.

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

## Coordinated platform transitions and form actions

Tasks, state, Suspense, and the DOM API can express optimistic updates, pending
forms, navigation transitions, and browser View Transitions today, but the
framework does not yet provide a single compiler-aware authoring model for
them.

A proposal should investigate:

- a scoped View Transition boundary integrated with Activity and Suspense;
- form submission tasks with pending/result state and automatic cancellation;
- optimistic state overlays that commit or discard with a task generation;
- server action placement and validation without hidden form protocols; and
- accessibility and no-JavaScript behavior.

The source model should remain ordinary TypeScript and native forms. Avoid
adding Hook-shaped APIs merely because React uses them.

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
