# Server-cooperative full-stack DevTools

eXact DevTools inspects the framework's durable component model across the browser, SSR,
continuations, and independently deployed microfrontends. It is an optional, read-only projection:
disconnecting it does not change component scheduling, ownership, cancellation, rendering, or
server dispatch.

## Build and authorization boundaries

Debug output has two independent build controls:

```ts
import { defineConfig } from '@exactjs/config';

export default defineConfig({
	debug: {
		catalog: 'auto',
		runtime: 'auto'
	}
});
```

`catalog` retains compiler explanations in a server-only `.exact-inspection/<buildKey>.json`
asset. `runtime` adds compact source identities and installs the browser bridge. Development
defaults both controls on; production builds require explicit `true`. Set both to `false` for a
hardened build. The Vite, Webpack, and Bun integrations derive both compiler controls; Webpack
emits its catalog in `processAssets`, Bun writes it beneath `outdir`, and all three keep the asset
outside the client graph.

An instrumented client-only page opens a local browser inspection session without probing a
server URL. Server cooperation activates only from an explicit runtime endpoint or the bounded
endpoint in compiler-owned hydration metadata; absence does not imply `/__exact`.

Vite instrumented modules depend on the virtual browser runtime directly, so inspection ownership
is installed before native module evaluation and the first client root render. The injected HTML
bootstrap remains a fallback for pages without transformed native roots. Compiler-generated
reactive cells are transparent at that boundary: a root inspection domain continues into the
authored component tree when the renderer unwraps the compiled root.

Constructing the first inspection owner also activates task-frame event projection. Production
artifacts that omit runtime inspection retain only a small optional dispatch point; task snapshot,
history, value-preview, and event-publication machinery remains outside their execution graph.
This does not make component state opaque, and an instrumented build still installs the capability
before its first root is evaluated.

Vite development mode enables those defaults through `@exactjs/vite-plugin`, not through Vite
itself. Custom middleware servers must include `exact()` in the Vite configuration they load;
calling `createServer()` or `transformIndexHtml()` without the plugin cannot install runtime
inspection. In that case the Chromium panel remains in `Waiting for eXact runtime
instrumentation…` and continues discovery until an instrumented document is loaded.

Runtime authorization is separate:

```ts
const server = createExactServerRuntime({
	contract,
	inspectionCatalogs: [inspectionCatalog],
	allowDebug: async ({ platformRequest, capability }) => {
		const operator = await authenticateIncidentOperator(platformRequest);
		return operator.debug && (capability !== 'source' || operator.sourceDebug);
	}
});
```

Omitted `allowDebug` is unavailable in production. Failed authorization returns the same `404`
used when debug output does not exist. All messages are POSTed to the application's configured
eXact endpoint and inherit its origin, CSRF, request-size, cancellation, and adapter policies.
Sessions are opaque, expiring, and bounded by count. The server uses them to authorize catalog,
snapshot, source, and per-request observation capabilities; it does not retain a cross-request
event timeline or keep an observation stream open.

While browser DevTools is attached, the hydration transport adds the opaque session ID to each
ordinary eXact request. After reauthorization, that request alone creates a bounded observation
collector. JSON responses carry a reserved observation attachment and NDJSON responses carry one
observation frame before completion. Success, failure, cancellation, and stream closure all dispose
the collector with the request. Requests without the header create no observation owner.

The page runtime validates those events, assigns its own monotonic cursor, and owns the only
cross-request history and subscription set. Disconnect clears that store and stops adding the
session header. Consequently, a server response can never remain subscribed to later work and one
operator's request cannot populate another request's collector.

## What is inspectable

The Chromium panel and automation agent consume the same versioned protocol. They can inspect:

- execution roots and microfrontend bindings;
- durable component parents, children, status, and owned elements;
- bounded previews of props, state, and public contexts;
- task placement, readiness, priority, generation, cancellation, and settlement;
- framework task kinds and optional human-facing labels without treating either as authority;
- invoked-task placement, concurrency, pending work, and optimistic generations;
- lifecycle, render invalidation, Activity, Suspense, hydration, and resumption events;
- server requests, continuations, context access, patches, errors, and profiling observations; and
- compiler-owned task and dependency explanations from the exact running build.

No query returns component instances, callbacks, task controllers, context resources, secret
values, or executable operation handles. Selecting an element resolves its logical component owner;
selecting a component highlights only its currently owned DOM elements.

The Chromium **Components** view shows every durable instance in its live parent/child hierarchy.
Selecting a node exposes that instance's bounded state, props, contexts, tasks, and dependency
explanation. The tree and selected-instance details scroll independently. Live updates preserve
both scroll positions and expanded or collapsed detail sections. Selecting another component keeps
the tree position while starting that component's details at the top.

The **Profiler** is an explicit bounded capture rather than an always-running trace. Start
recording, interact with the application, and stop recording to inspect causal frames. Explicit
framework frame markers take precedence; otherwise interaction and request identities group
related work. Unlike the instance-level Components tree, each frame summarizes state and props
changes and plots event markers in one aggregated waterfall lane per authored component type.
Instance identities remain attached underneath for exact selection and highlighting. Because
federated hosts retain independent cursor order, the panel does not imply a total wall-clock
ordering that the protocol cannot prove. Live subscription delivery previews the recording;
pressing Stop pages retained history after the recording's merged cursor before presenting the
final capture, so boundary races do not silently lose events.

## Catalog and source identity

Every runtime subject is qualified by session side, optional microfrontend binding, immutable build
key, execution root, component type, and instance or operation identity. Catalog lookup never falls
forward to another build. A retained build registers its catalog with
`registerExactInspectionCatalog()` and disposes the returned handle when that build retires.

Source paths are build-relative. The panel opens a source provider only when its SHA-256 hash
matches the catalog location. It checks loaded source-map resources first, workspace/file
resources second, and an authorized server excerpt last. Protected source excerpts require the
`source` capability and pre-redacted retained source whenever the compiler catalog contains
secret-qualified names.

Instrumented task functions carry their canonical compiler source ID through a WeakMap marker.
Core records that ID when the function is defined; query consumers never recreate source ordering
from runtime arrays.

## Secret handling

Compiler-qualified state paths, secret contexts, server resources, and secret names become
redaction selectors without carrying values. Redaction occurs before preview traversal. Preview
construction does not invoke getters, `toJSON`, custom inspectors, callbacks, or a failed Proxy
again; depth, entries, UTF-8 bytes, event history, response size, and exports are bounded.

The optional secrets plugin may expose only key names and presence. Debug responses, events,
source excerpts, errors, audit records, and exports must never contain secret values.

## Microfrontend federation

The page host owns the browser session and client tree. A remote root is routed through the page's
existing binding gateway using its registered binding, build, and execution root. The gateway:

1. reauthorizes the page session;
2. validates the exact registered route;
3. opens a bounded child session at the component host's existing eXact endpoint;
4. lets the component host independently evaluate `allowDebug`;
5. strips browser cookies, authorization, origin, and referrer headers before forwarding; and
6. translates child session IDs and remote event identities back to the page session and binding.

For remote operations, the page gateway reauthorizes the parent session, establishes the remote
host's independently authorized child capability, forwards only that child ID, and rewrites the
observations in the same response back to the page identity and binding. The browser then assigns
one page-owned cursor across page, branding, billing, and other responses. It preserves arrival
order but does not claim a cross-host wall-clock total order. One unavailable remote remains visible
without hiding healthy client or sibling roots.

## Chromium and agent use

Build the unpacked extension with:

```sh
npm run build -w @exactjs/chromium-devtools
```

Load `packages/chromium-devtools` in Chromium's extension page, open DevTools, and select the
**eXact** panel. Load the package directory, not its `dist` child: the manifest remains at the
package root and references the generated assets. The build bundles both Manifest V3 content
entries as classic scripts for Chromium and makes every extension-page entry self-contained.
The extension's main-world bridge is installed at document start, while the inspection hook
becomes active only when the application runtime loads. The isolated content script repeatedly
greets the main-world bridge until it receives a document- and bridge-generation acknowledgement;
that acknowledgement separately reports whether runtime instrumentation is ready. The background
worker releases inspection requests only after both layers are ready, eliminating the lossy
document-start ordering race.

Panel and content-script ports reconnect after Manifest V3 worker replacement. The background owns
each unresolved read-only request until its correlated response arrives, requeues in-flight work
when a content generation disappears, and rejects responses from superseded ports. A panel request
therefore survives worker restart, target navigation, and page restoration without requiring a
manual reload. Response timeouts run only while the runtime is known to be ready; one silent ready
connection is replaced and replayed before an unresponsive-runtime error is reported. Closing the
panel releases its queued ownership, subscriptions, highlights, and bridge session, and the bounded
per-tab request limit still prevents unbounded recovery queues. The panel exposes `waiting for page
bridge`, `waiting for runtime instrumentation`, and `reconnecting` states while recovery proceeds.
Component and partition trees provide an independent disclosure control for every branch and retain
collapsed branches across live updates. State, prop, and context sections show nested arrays and
objects as bounded JSON-like own-property summaries by default; expanding one value reveals its
already-redacted bounded preview without expanding unrelated values. Expanded rows use a bounded
content-sized key column and compact indentation, so each nested level does not reserve another
large fraction of the remaining width. Value disclosure state and panel scroll positions survive
live refreshes for the same selected component.

The Tasks section separates execution history from live scheduler frames. Starting a task records
its placement, generation, timing, and bounded argument preview; settlement updates that record
with its final status and a bounded result or error preview. Each execution remains collapsed until
opened. The runtime never retains the original argument, result, or error objects for inspection.
History exists only while an inspection session is attached, defaults to the 200 most recently
started executions across that runtime owner, and is released on detach. Runtime integrations may
set `maxTaskExecutions` when creating the inspection owner; late completion of an older task cannot
evict a newer execution from the bounded history.

The DevTools entry registers `dist/panel.html` from the extension root; generated document paths
are not resolved relative to `dist/devtools.html`.

`@exactjs/devtools-agent` attaches to an existing Chromium target through CDP. It accepts only
validated read-only methods and uses fixed function declarations; callers cannot provide
JavaScript or invoke application behavior. Disconnect removes its CDP binding, releases its object
group, and closes page subscriptions.

## Package ownership

- `@exactjs/devtools-protocol`: DTOs, validators, previews, pagination, and the query service.
- `@exactjs/devtools-runtime`: optional page hook, root ownership, server client, and event merge.
- `@exactjs/chromium-devtools`: Manifest V3 panel and inspected-page bridge.
- `@exactjs/devtools-agent`: read-only CDP projection.
- `@exactjs/compiler`: canonical source identities and server catalog construction.
- `@exactjs/server`: authorization, static queries, catalogs, request collectors, and binding
  federation; it owns no cross-request event history.
- `@exactjs/vite-plugin`, `@exactjs/webpack-plugin`, and `@exactjs/bun-plugin`: paired client
  runtime and server-only catalog packaging.

See package-local `README.md` and `AGENTS.md` files before integrating any of these boundaries.
