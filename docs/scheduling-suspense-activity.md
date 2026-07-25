# Scheduling, Suspense, Activity, and async components

Status: implemented in native eXact, SSR/hydration, and the React compatibility
runtime.

These facilities extend eXact's setup-once, fine-grained reactive model. They
do not introduce a component rerender loop.

## Scheduling

Reactive and task work uses three priorities:

- `interactive` for DOM-event work;
- `normal` for ordinary reactive invalidation and tasks; and
- `deferred` for preparation that may yield to user-visible work.

Use `this.task.deferred(...)` when timing is a deliberate policy. Placement,
priority, and readiness compose:

```ts
this.task.server.deferred.blocking(() => warmRecommendations());
```

Deferred work changes when a generation runs. `blocking` changes whether the
nearest readiness boundary waits for it. Neither option changes where the task
runs unless a placement facet is also present.

## Async component lowering

An async component may await ordinary operations whose results flow into
`this.state`:

```tsx
async function ShippingOptions(this: Component<ShippingState>) {
	this.state.options = await getOptions(this.state.destination);
	return () => <Options options={this.state.options} />;
}
```

The compiler emits synchronous component setup plus owned, restartable
continuation work. Reactive reads become generation dependencies, recognized
APIs receive the task abort signal, and state writes are staged. A successful
generation publishes all staged writes together; failed, cancelled, or stale
generations discard them.

Sequential awaits and `try`/`catch`/`finally` preserve source order. Native
destructuring may publish several state locations atomically. Framework
cancellation bypasses authored catches so obsolete work cannot commit an
application fallback, while `finally` still runs for cleanup.

Explicit `this.task()` remains the form for external effects, cleanup,
nonblocking work, manually named dependencies, placement, or scheduling
policy.

## Suspense

`Suspense` establishes a readiness context inherited by descendant component
instances. Blocking task generations register with that context.

On first mount, the fallback remains visible until the candidate generation is
ready. On later updates, committed content stays visible while the replacement
candidate prepares. State and DOM publish together, preventing partially
settled work from becoming visible.

Nested boundaries own independent generations. SSR can emit a fallback shell
and progressively replace the smallest settled Suspense marker range.
Hydration adopts explicit content/fallback markers rather than guessing which
branch the server rendered.

## Activity

`Activity` owns a mounted range with these modes:

| Mode         | DOM                           | Reactive work |
| ------------ | ----------------------------- | ------------- |
| `active`     | Connected                     | Normal        |
| `parked`     | Stored in a detached fragment | Paused        |
| `background` | Stored in a detached fragment | Deferred      |

Parking preserves component instances, state, DOM nodes, form values, refs,
handlers, nested boundaries, and logically owned portal output. It is not an
unmount. `this.onDeactivate()` and `this.onActivate()` describe connectivity;
`this.onUnmount()` remains final disposal.

Dirty work accumulated while parked publishes when the range becomes active.
Context writes outside a parked ownership scope retain their normal behavior;
the framework does not silently suppress an application-wide context update.

## React compatibility

React-owned source retains React semantics. The compatibility runtime maps
transitions, deferred values, Suspense candidates, and React Activity onto the
same scheduler, readiness ranges, and retained-DOM primitives while preserving
Hook, effect, and class lifecycle rules.

This reproduces the supported observable behavior, not Fiber internals. Full
lane entanglement, Fiber error stacks, postponed Fiber-state serialization,
and React's private progressive streaming protocol are intentionally not
public eXact contracts.
