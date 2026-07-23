# SSR And Hydration Status

This note records the implemented SSR/hydration foundation and the remaining
design pressure. For the server component build/runtime wiring guide, see
[server-components.md](server-components.md). For the adoption hardening plan,
server/request context model, native rendering safety, and data policy, see
[native-ssr-adoption-and-data-policy.md](native-ssr-adoption-and-data-policy.md).

## Goals

- Keep `@exactjs/core` platform-neutral.
- Keep browser rendering in `@exactjs/dom`.
- Keep server rendering in `@exactjs/ssr`.
- Keep hydration and endpoint patch application in `@exactjs/hydrate`.
- Keep secure server-component/action dispatch in `@exactjs/server`.
- Preserve eXact's core model: component instances, reactive values, context, keyed lists, cells, logging, and error contexts.

## Implemented Package Boundaries

### `@exactjs/ssr`

`@exactjs/ssr` owns server rendering:

- Converts core VNodes to HTML strings, raw HTML streams, document event streams, browser-consumable progressive HTML streams, and neutral progressive HTML response objects.
- Executes component constructors and render functions without DOM globals.
- Emits deterministic comment markers for component, cell, dynamic, fragment, and keyed-list boundaries.
- Renders client-boundary placeholders and server child slots.
- Waits for observed `this.task(...)` promises in `renderToStringAsync()` and `renderToHydratableStringAsync()`.
- Streams initial shell HTML before observed async tasks settle through `renderToDocumentStream()` / `renderToHydratableDocumentStream()`, then emits an authoritative root replacement when settled HTML differs.
- Streams directly consumable progressive HTML through `renderToProgressiveHtmlStream()` / `renderToHydratableProgressiveHtmlStream()`, wrapping the shell in a stable root and applying later root replacements with escaped inline scripts.
- Packages progressive HTML streams as `ExactResponseLike` through `renderToProgressiveHtmlResponse()` / `renderToHydratableProgressiveHtmlResponse()` for Fetch, Express, Hapi, Vite, Webpack, Bun, or custom server adapters.
- Serializes hydration bootstrap data through `renderHydrationScript()`.
- Builds boundary refresh, action refresh, keyed-list refresh, and manifest-scoped server handler registries.

### `@exactjs/hydrate`

`@exactjs/hydrate` owns client reattachment and server patch application:

- Reads hydration bootstrap data from the rendered script tag.
- Hydrates generated client islands from `data-exact-client-boundary` placeholders.
- Creates an endpoint client with same-tick batching.
- Sends action, refresh, state contract, dependency, and boundary snapshot payloads.
- Validates successful endpoint response shapes before applying returned patches.
- Applies text, prop, style, keyed-list, state, and replacement patches.
- Falls back to authoritative server replacement HTML when a fine-grained patch misses.

### `@exactjs/server`

`@exactjs/server` owns the runtime-neutral secure endpoint:

- Converts compiler manifests into runtime action and boundary allowlists.
- Rejects unsupported manifest versions, unknown IDs, malformed requests, unknown protocol fields, endpoint mismatches, unauthorized requests, invalid CSRF, mismatched state contracts, and non-JSON-safe payload/results.
- Dispatches independent batch operations in order and skips explicitly dependent operations when prerequisites fail.
- Exposes Fetch, Express, and Hapi adapters as thin wrappers around the same core handler.

### `@exactjs/compiler`

`@exactjs/compiler` owns semantic analysis and artifact generation:

- Emits strictly validated compiler manifest v2 metadata for callable and initializer effects, call edges, state/context flow, artifact targets, components, tasks, render edges, symbols, boundaries, and server actions. Runtime transport protocols remain v1.
- Infers `this.task(...)` placement transitively across project sources and v2 manifests, and supports validated `this.task.server(...)` / `this.task.client(...)` escape hatches.
- Emits task diagnostics for inferred placement decisions, including state-writing tasks promoted to isomorphic SSR/hydration work and lifecycle tasks kept client-side.
- Emits paired client/server artifacts and manifest files with `exactc --artifacts --serverComponents`.
- Splits clear server/client boundaries for pure client components, imported client components, event handlers, refs, generated client islands, server slots, and server parts.
- Provides bundler-neutral artifact plans, dev-server update state, package export maps, component-attached descriptor composition, generated hydration registration modules, compatibility registry modules, and manifest readers.

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
- Non-serializable client-boundary props fail during SSR with the boundary name/id, offending prop path, and generated payload bucket such as `__exactState` or `__exactCapture` when applicable.
- Functions, DOM nodes, class instances, `Map`, `Set`, `Date`, cycles, and other non-plain objects are not serialized.

## Request Protocol

The endpoint accepts:

- `action`: invoke one manifest-allowlisted server action.
- `refresh`: rerender one manifest-allowlisted server boundary.
- `batch`: send same-tick operations together.

Batch operations are independent unless `dependsOn` references a previous unique `opId`. This lets the client send GraphQL-style operation groups without forcing unrelated operations to fail together. The server dispatches independent ready operations concurrently while preserving request-order result envelopes.

Endpoint responses can stream as newline-delimited JSON when the client opts in with `Accept: application/x-ndjson` / `x-exact-stream: 1`. Stream events are `start`, per-operation `patch`/`state`/`html` chunks, terminal `result`, and `complete`; independent batch chunks may be emitted as each operation settles.

Initial document event streams are also newline-delimited JSON. Document stream events are `start`, `shell`, optional root `replace`, optional `hydration`, and `complete`.

For direct HTTP document responses, `renderToProgressiveHtmlStream()` and `renderToHydratableProgressiveHtmlStream()` convert those events into browser-consumable HTML chunks. The shell is emitted first inside a configurable root element, async task settlement can emit an escaped inline replacement script for that root, and hydratable streams include the normal inert hydration JSON script. `renderToProgressiveHtmlResponse()` and `renderToHydratableProgressiveHtmlResponse()` wrap the same streams in the adapter-neutral response shape used by `@exactjs/server`.

The native SSR adoption target adds a root-document mode in which the application renders `html`, `head`, and `body` explicitly. Those tags are normalized only at the document root, and eXact augments their children with reserved framework-owned hydration, manifest, bootstrap, and progressive-stream nodes as required. Authored document children retain their order; hydration treats injected nodes separately so the client root does not reproduce them. This is a target design rather than a description of the current configurable-root stream implementation.

## Remaining Work

The current foundation is usable for the sample path and core protocol tests, but it is not yet a complete production server-component system. The remaining larger pieces are:

- More complete compiler-owned component splitting beyond the current nested local/imported server-child subgraphs.
- Richer server patch generation for complex structural changes beyond the current text, prop/style, element, independent nested structural replacement, list, state, and boundary replacement paths.
- Stronger production context glue for larger apps with many manifests.
- Micro frontend support beyond dynamically loaded remote manifests, immediate remote island hydration, per-boundary endpoints, per-endpoint batching, and same-realm global context tokens.
- Broader production diagnostics surfaced by build tools and dev servers.
- Further micro-frontend deployment certification beyond the documented
  same-release manifest and artifact contract.

Production cache, deployment, authentication/session, observability, limit,
CSP, and package-publication requirements are documented in
[native-ssr-production-guide.md](native-ssr-production-guide.md). Root-document
normalization and deterministic framework augmentation are implemented in the
native renderer.
