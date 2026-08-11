# Open dynamic components

Status: implemented.

Open dynamic components are the client-only escape hatch for a component value whose complete
candidate set cannot be known during compilation. Prefer a
[`createComponentRegistry()`](component-registries.md) whenever the possible components are finite:
registries retain SSR, static placement, and exact chunk planning that an open boundary cannot.

## Typed providers

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

## Acknowledging an opaque value

An ordinary TypeScript value used in component position becomes the same dynamic boundary when its
identity cannot be proven statically. The compiler emits `EXACT2213` so an accidental open lookup
does not silently lose static guarantees. A narrow declaration annotation acknowledges the choice:

```tsx
/** @exact dynamic */
const Panel = installedPanels[this.state.panelName];

return () => <Panel />;
```

The annotation is not a type cast or diagnostic suppression. A scalar, arbitrary callable, foreign
component, unsupported import, or server-only component remains invalid. The language server can
add the annotation when the declaration is safe to edit; finite values should instead use a
component registry, and React-owned values should use the compatibility boundary.

## Rendering and ownership

The client renderer gives every dynamic boundary an owned child range. Pending work uses the
nearest Suspense policy; absence leaves the range empty. Resolution accepts only a native
compiler-branded component or an explicitly adapted foreign component. DevTools shows the
synthetic `DynamicComponent` boundary, its availability state, generation, and adopted component
without fabricating a component instance while unresolved.

SSR never evaluates the candidate expression, imports the module, runs setup, or follows its task
graph. It emits an inert activation range and any static fallback. Hydration adopts that range and
starts client resolution; client-only rendering creates the same range directly.

An open dynamic component cannot carry an eXact continuation, server task, action, refresh
operation, server-homed dependency, or executor. The runtime validates the resolved component's
complete contract before mounting. Use a trusted microfrontend or statically authorized component
boundary when independently deployed code needs server execution. This rule does not sandbox
ordinary browser APIs such as `fetch`.

## Authorized preload hints

When the build host can map the selected boundary to an authorized immutable artifact without
evaluating the component, SSR may add a bounded `modulepreload` hint. The hint can be emitted as
`103 Early Hints`, a final `Link` header, or an early shell link. Arbitrary or client-supplied URLs
are never accepted, and preloading does not activate the boundary or grant execution authority.

Modules without open dynamic boundaries do not import the focused dynamic-component runtime
capability, so ordinary static components and finite registries retain their existing client
closure.
