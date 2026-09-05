# Dynamic component selection

Use an ordinary TypeScript branch when a component chooses between a few locally known views. Use
`createComponentRegistry()` when a finite choice is reusable, keyed, or lazy. Only use an open
dynamic boundary when the candidate set genuinely cannot be known during compilation.

```tsx
const CurrentPanel = this.state.mode === 'edit' ? Editor : Preview;
return () => <CurrentPanel document={this.state.document} />;
```

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

`createComponentRegistry()` is compiler source syntax, just like an eXact component definition.
Do not execute a registry module outside an eXact compilation pipeline; the compiler replaces the
declaration with its target-specific client or server artifact.

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

This API deliberately stays finite. The following open boundary is a warned, explicitly
acknowledged client-only escape hatch. It does not retain registry SSR guarantees or permit server
calls.

## Open dynamic fallback

`createDynamicComponent()` creates a stable component facade during component setup. Its resolver
may synchronously return a compiler-branded component, report absence with `null` or `undefined`,
or asynchronously load a component:

```tsx
const Panel = createDynamicComponent<PanelProps>((signal) =>
	extensionProvider.resolve(this.state.panelName, { signal })
);

return () => (
	<Suspense fallback={<LoadingPanel />}>
		<Panel account={this.state.account} />
	</Suspense>
);
```

The compiler observes resolver dependencies. A dependency change aborts the current generation,
starts the newest one, and prevents stale settlement from mounting. Replacing a selected component
disposes its instance rather than retaining an inactive instance for possible reuse.

An ordinary TypeScript value used in component position becomes the same dynamic boundary when its
identity cannot be proven statically. The compiler emits `EXACT2213` so an accidental open lookup
does not silently lose static guarantees. A narrow declaration annotation acknowledges the choice:

```tsx
/** @exact dynamic */
const Panel = installedPanels[this.state.panelName];

return () => <Panel />;
```

The annotation is not a type cast or diagnostic suppression. Invalid or foreign component values
remain invalid; React-owned values still use the compatibility boundary.

The client renderer gives every dynamic boundary an owned child range. Pending work uses the
nearest Suspense policy, absence leaves the range empty, and resolution accepts only a native
compiler-branded component or explicitly adapted foreign component. DevTools exposes the boundary,
availability, generation, and adopted component.

SSR never evaluates the candidate, imports its module, runs setup, or follows its task graph. It
emits an inert range and any static fallback; hydration adopts that range and begins client
resolution. An open dynamic component cannot carry a continuation, server task, action, refresh,
server-homed dependency, or executor. Use a trusted microfrontend or statically authorized
component boundary when independently delivered code needs server execution.

When the build host can map a selection to an authorized immutable artifact without evaluating the
component, SSR may emit a bounded `modulepreload` hint. Arbitrary or client-supplied URLs are never
accepted, and preloading does not activate the boundary or grant authority.
