# SSR and hydration

Status: implemented foundation with the explicit limits listed below.

## Package ownership

- `@exactjs/ssr` renders strings, documents, event streams, progressive HTML,
  hydratable output, and adapter-neutral response objects.
- `@exactjs/hydrate` adopts server DOM, activates client islands, invokes the
  server endpoint, validates results, and applies patches.
- `@exactjs/server` owns allowlisted action/refresh dispatch, request
  validation, authorization hooks, limits, and runtime-neutral adapters.
- `@exactjs/compiler` owns placement, artifact generation, operation
  contracts, hydration registration, and final client-bundle isolation.

## Server rendering

Native SSR emits deterministic markers for components, cells, dynamic
children, fragments, keyed lists, Suspense, Activity, client islands, and
server slots. Async string rendering drains observed blocking work. Progressive
rendering emits a shell and can reveal settled Suspense ranges independently;
it falls back to an authoritative root replacement if work outside those
ranges changed.

Root-document mode accepts authored `html`, `head`, and `body` and inserts
framework-owned hydration or progressive-stream nodes into reserved positions.
Rendering applies output-size, task-pass, and task-duration limits.

## Hydration

Hydration adopts matching server nodes rather than recreating them. It
preserves element identity, form state, refs, handlers, retained Activity
ranges, and component ownership.

Component resumption records authorize state restoration only while hydration
adopts an SSR range or mounts its mismatch fallback. Once that synchronous
transaction completes, components introduced by routing, conditional views, or
other browser updates are ordinary fresh client instances; exhausted SSR records
cannot claim them.

Finite component-registry selections retain the registry binding, selected
key, and opaque compiled entry identity in their component marker. A matching
selection adopts normally. A nested mismatch remounts only that owned
component range and preserves compatible sibling DOM; a root mismatch follows
the configured root recovery policy.

The compiler classifies safe interaction-only islands. Their SSR fallback
contains the real intrinsic markup and binding values but no active handlers.
The generated hydration registration uses dynamic imports, so the island code
loads on first supported interaction. While it loads:

- action-like events retain their order;
- repeated input/change events coalesce to the latest value per target;
- replay is generation-fenced and discarded if the boundary was replaced; and
- load failure restores the native browser fallback where possible.

Refs, initial client work, opaque prop spreads, unsupported events, and
server-only child graphs remain eager.

## Server exchanges and patches

The endpoint supports individual action/refresh operations and same-tick
batches. Independent operations may run concurrently; `dependsOn` expresses an
explicit prerequisite. NDJSON responses can publish independently settled
operation chunks.

The client sends only compiler-approved state, dependency, capture, and
boundary snapshots. Successful responses are shape-validated before
application. Available patches include:

- text, attributes/properties, and styles;
- keyed-list changes;
- component state;
- compiler-stable dynamic range replacement;
- independent nested element replacement; and
- authoritative boundary replacement.

Stable dynamic markers let a server refresh replace one structural expression
without recreating unaffected siblings or component instances. Boundary
replacement remains the correctness fallback.

## Data boundary

Hydration bootstrap data and protocol values use validated JSON-safe data.
Compiler-approved `Map` and `Set` state uses tagged entries and is restored as
real collections; continuation changes travel as ordered entry or membership
deltas. Functions, DOM nodes, unsupported class instances, `Date`, cycles,
server contexts, and secret-qualified values are rejected.

## Remaining work

- More complete compiler splitting for complicated server-child subgraphs.
- Additional proven structural patch forms.
- Broader lazy-island classification where source remains statically safe.
- Full production conformance for microfrontends outside Vite/Rollup.
- Advanced partial-prerender/resume semantics; current progressive rendering
  does not serialize an opaque suspended renderer state.

See [server-components.md](server-components.md) for authoring and
[component-registries.md](component-registries.md) for finite dynamic
component selection,
[actions-and-forms.md](actions-and-forms.md) for coordinated actions, and
[native-ssr-production-guide.md](native-ssr-production-guide.md) for production
operation.
