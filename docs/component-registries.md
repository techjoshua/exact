# Finite component registries

This document describes the implemented native component-registry contract.
The design rationale and delivery inventory remain in
[`proposals/safe-dynamic-component-registries.md`](proposals/safe-dynamic-component-registries.md).

## Declare a finite registry

`createComponentRegistry()` declares an immutable, compiler-visible set of
eager and lazy native eXact components:

```tsx
import { createComponentRegistry, type KeyOf } from '@exactjs/core';

const Widget = createComponentRegistry(({ lazy }) => ({
	summary: SummaryWidget,
	chart: lazy(() => import('./ChartWidget.js').then((module) => module.ChartWidget))
}));

type WidgetKey = KeyOf<typeof Widget>;

function Dashboard(this: Component<{ selected: WidgetKey }>, props: { selected: WidgetKey }) {
	this.state.selected = props.selected;
	const CurrentWidget = Widget[this.state.selected];

	return () => <CurrentWidget />;
}
```

The registry must be a named, module-level `const` initialized from a finite
object definition. Entries cannot be added, removed, or replaced after
creation. Unsafe object keys, branching definitions, side effects, and
unprovable computed keys are compiler diagnostics.

## Keys and untrusted input

`KeyOf<typeof Registry>` derives the exact key union. Use `hasComponent()` to
narrow an untrusted string before indexing:

```tsx
if (!hasComponent(Widget, requested)) return <NotFound />;
const CurrentWidget = Widget[requested];
return <CurrentWidget />;
```

`preloadComponent()` starts a lazy entry without rendering it, and
`renderComponent()` supports a typed key-and-props selection. Heterogeneous
registries can use `ComponentSelection<typeof Registry>` when each key has a
different props contract.

## Identity and lifecycle

Each registry key exposes a stable component facade. Rendering the same key
retains the component instance. Selecting a different key replaces that
component range even when two keys refer to the same underlying implementation.
This makes state, tasks, refs, resources, and cleanup follow the authored
selection.

Lazy loads are deduplicated per entry. A rejected loader may be retried.
Generation fencing prevents a stale A-to-B-to-A candidate from committing
after the selected key changes.

## Compiler and artifact model

The compiler assigns the registry and every entry opaque identities, records
eager or lazy provenance, placement, module/export ownership, and target
artifacts, and includes that information in optional explanation output.
Authored registry and entry names remain diagnostics, not protocol identifiers.

Dynamic selection must be a finite registry key. The compiler follows static
members, immutable aliases, and reactive finite indices. It rejects mutation,
scoped lazy factories that escape their definition, client/server
contradictions, and lazy imports whose export cannot be proven.

## SSR and hydration

Eager and lazy entries use the ordinary component and Suspense rendering
pipeline. Hydratable output retains the registry binding, selected key, and
opaque compiled identity in the component marker.

Hydration adopts a matching selection. A nested identity mismatch remounts only
that component range and keeps compatible sibling DOM adopted. A root identity
mismatch still falls back to the root recovery policy.

`inspectComponentRegistry()` returns immutable entry snapshots containing
eager/lazy mode, load status, and generation. It does not expose component
implementations or loader functions.

## React and remote boundaries

The native registry contract owns eXact components. React-owned values must
cross the existing explicit React compatibility adapter when their ownership
is not already compiler-branded. Automatic React ownership inference is not
part of this delivery.

Remote, open-ended runtime registries are a separate trust and deployment
problem. This API deliberately stays finite. Additional production graph
verification and remote-registry design remain deferred proposal work.
