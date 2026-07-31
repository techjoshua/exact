# @exactjs/hydrate

Browser hydration and server-response patching for eXact applications.

The package reads hydration configuration, adopts server-rendered component and island markers,
invokes server task operations and refreshes, applies element or range patches, and coordinates client
runtime state.

Use it with hydratable output from `@exactjs/ssr` and private contracts attached to generated
client artifacts. Hydration configuration is data, not executable application state; server
endpoints continue to validate operations, authorization, CSRF policy, and payload limits.

`HydrateOptions.onHydration` observes whether a root or client island adopted existing DOM,
mounted fresh DOM, or updated an existing hydrated root. Component resumption records restore only
compiler-declared state and shared context, and settled server work is armed without an immediate
duplicate run.

Resumable SSR component ranges hydrate eagerly. They first attempt static DOM
adoption; a mismatch rolls back any activation records consumed by that attempt
before mounting fresh DOM. Generated continuation descriptors retain task/action
kind and invocation concurrency metadata when read from serialized config.

Blocking distributed continuations validate their response first, then stage authorized DOM,
component-state, and public-context changes under the task generation signal. The nearest
readiness boundary publishes that response atomically or discards it when the generation is stale.

Invoked task continuations return their validated result through the existing response envelope and
carry invocation generations for stale-commit fencing. Named component markers validate registry
and selected-entry identity; a nested mismatch mounts only that component range and preserves
compatible adopted siblings.

## Interaction hydration

Compiler-approved intrinsic islands whose initial client work consists only of supported events
and reactive form bindings render inert, usable HTML during SSR. Passing their registry to
`createExactClient()` leaves those ranges dormant by default and installs one capture-phase
activation broker. The first click, input, change, submit, key activation, focus, or composition
start adopts the existing range into that client's component domain before ordinary event
delivery continues. `hydrateClientIslands()` remains available as the lower-level registration
API when an application is not creating the complete client runtime.

Dirty form controls remain authoritative during adoption and publish through their existing
compiler-owned binding. Stable generated element identity fences mismatch recovery and permits one
safe replay if the stale SSR range must be replaced. Refs, initial client work, unsupported event
types, and server-only child graphs remain eager.

Automatic classification is the default. Applications may force all approved islands to hydrate
immediately:

```ts
createExactClient(root, {
	islands,
	hydration: { strategy: 'eager' }
});
```

The strategy changes activation timing only. It does not weaken serialization, placement,
component ownership, or server-operation contracts.

See [Task interactions and forms](../../docs/actions-and-forms.md) and
[finite component registries](../../docs/component-registries.md).

When an inspection owner is supplied or installed by the browser runtime, hydration emits
activation, resumption, continuation, and patch observations under the selected build, binding,
and execution root. Records carry opaque identities and counts, not response payloads or component
instances. See [Server-cooperative full-stack DevTools](../../docs/devtools.md).
