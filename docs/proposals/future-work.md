# Candidate future work

Status: exploratory. These are not release commitments or current framework
behavior.

Current capabilities and limits are indexed in [`../README.md`](../README.md).
A candidate should move into its own decision-complete proposal before
implementation.

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
