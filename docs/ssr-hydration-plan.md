# SSR And Hydration Status

This note records the implemented SSR/hydration foundation and the remaining design pressure. For the server component build/runtime wiring guide, see [server-components.md](server-components.md).

## Goals

- Keep `@exact/core` platform-neutral.
- Keep browser rendering in `@exact/dom`.
- Keep server rendering in `@exact/ssr`.
- Keep hydration and endpoint patch application in `@exact/hydrate`.
- Keep secure server-component/action dispatch in `@exact/server`.
- Preserve eXact's core model: component instances, reactive values, context, keyed lists, cells, logging, and error contexts.

## Implemented Package Boundaries

### `@exact/ssr`

`@exact/ssr` owns server rendering:

- Converts core VNodes to HTML strings or streams.
- Executes component constructors and render functions without DOM globals.
- Emits deterministic comment markers for component, cell, dynamic, fragment, and keyed-list boundaries.
- Renders client-boundary placeholders and server child slots.
- Waits for observed `this.task(...)` promises in `renderToStringAsync()` and `renderToHydratableStringAsync()`.
- Serializes hydration bootstrap data through `renderHydrationScript()`.
- Builds boundary refresh, action refresh, keyed-list refresh, and manifest-scoped server handler registries.

### `@exact/hydrate`

`@exact/hydrate` owns client reattachment and server patch application:

- Reads hydration bootstrap data from the rendered script tag.
- Hydrates generated client islands from `data-exact-client-boundary` placeholders.
- Creates an endpoint client with same-tick batching.
- Sends action, refresh, state contract, dependency, and boundary snapshot payloads.
- Validates successful endpoint response shapes before applying returned patches.
- Applies text, prop, style, keyed-list, state, and replacement patches.
- Falls back to authoritative server replacement HTML when a fine-grained patch misses.

### `@exact/server`

`@exact/server` owns the runtime-neutral secure endpoint:

- Converts compiler manifests into runtime action and boundary allowlists.
- Rejects unsupported manifest versions, unknown IDs, malformed requests, unknown protocol fields, endpoint mismatches, unauthorized requests, invalid CSRF, mismatched state contracts, and non-JSON-safe payload/results.
- Dispatches independent batch operations in order and skips explicitly dependent operations when prerequisites fail.
- Exposes Fetch, Express, and Hapi adapters as thin wrappers around the same core handler.

### `@exact/compiler`

`@exact/compiler` owns semantic analysis and artifact generation:

- Emits compiler manifests for components, tasks, state effects, render edges, symbols, boundaries, and server actions.
- Infers `this.task(...)` placement and supports `this.task.server(...)` / `this.task.client(...)` escape hatches.
- Emits paired client/server artifacts and manifest files with `exactc --artifacts --serverComponents`.
- Splits clear server/client boundaries for pure client components, imported client components, event handlers, refs, generated client islands, server slots, and server parts.
- Provides bundler-neutral artifact plans, dev-server update state, package export maps, registry modules, and manifest readers.

## Marker Model

SSR uses compact HTML comments and exact data attributes:

- Component boundary markers.
- Cell markers.
- Dynamic child markers.
- Fragment markers.
- Keyed list and keyed item markers.
- `data-exact-id` markers for fine-grained element patching.
- `data-exact-client-boundary` placeholders for generated client islands.
- `data-exact-server-slot` placeholders for server-owned children inside client islands.

Markers are intended to be deterministic enough for hydration and patching, while remaining ignorable by normal browser rendering.

## State And Serialization

The current model is explicit and JSON-safe:

- Hydration bootstrap state is provided by the app through render options or `createExactHydrationManifestConfig()`.
- Compiler-derived action state contracts tell the client which exact state reads to include for an action.
- Client-boundary props, hydration payloads, request payloads, response payloads, and patch payloads must be JSON-safe.
- Non-serializable client-boundary props fail during SSR with the offending prop path.
- Functions, DOM nodes, class instances, `Map`, `Set`, `Date`, cycles, and other non-plain objects are not serialized.

## Request Protocol

The endpoint accepts:

- `action`: invoke one manifest-allowlisted server action.
- `refresh`: rerender one manifest-allowlisted server boundary.
- `batch`: send same-tick operations together.

Batch operations are independent unless `dependsOn` references a previous unique `opId`. This lets the client send GraphQL-style operation groups without forcing unrelated operations to fail together.

## Remaining Work

The current foundation is usable for the sample path and core protocol tests, but it is not yet a complete production server-component system. The remaining larger pieces are:

- More complete compiler-owned component splitting across nested subgraphs and package boundaries.
- Richer server patch generation for complex structural changes beyond the current text, element, list, state, and boundary replacement paths.
- Streaming SSR and streamed server component refresh responses.
- Stronger generated registry/context glue for larger apps with many manifests.
- Micro frontend support for dynamically loaded remote manifests, per-boundary endpoints, per-endpoint batching, and optional global context tokens for cross-bundle context sharing.
- Better diagnostics for ambiguous placement inference and serialization failures sourced from generated compiler captures.
- Production guidance for cache headers, deployment topology, auth/session integration, and package publishing conventions.
