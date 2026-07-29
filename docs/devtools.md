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
hardened build.

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
Sessions are opaque, expiring, bounded by count and retained bytes, and reauthorized while event
streams remain open.

## What is inspectable

The Chromium panel and automation agent consume the same versioned protocol. They can inspect:

- execution roots and microfrontend bindings;
- durable component parents, children, status, and owned elements;
- bounded previews of props, state, and public contexts;
- task placement, readiness, priority, generation, cancellation, and settlement;
- named action placement, concurrency, pending work, and optimistic generations;
- lifecycle, render invalidation, Activity, Suspense, hydration, and resumption events;
- server requests, continuations, context access, patches, errors, and profiling observations; and
- compiler-owned task and dependency explanations from the exact running build.

No query returns component instances, callbacks, task controllers, context resources, secret
values, or executable operation handles. Selecting an element resolves its logical component owner;
selecting a component highlights only its currently owned DOM elements.

## Catalog and source identity

Every runtime subject is qualified by session side, optional microfrontend binding, immutable build
key, execution root, component type, and instance or operation identity. Catalog lookup never falls
forward to another build. A retained build registers its catalog with
`registerExactInspectionCatalog()` and disposes the returned handle when that build retires.

Source paths are build-relative. The panel opens a source provider only when its SHA-256 hash
matches the catalog location. Protected source excerpts require the `source` capability and
pre-redacted retained source whenever the compiler catalog contains secret-qualified names.

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

Page, branding, billing, and other roots retain independent event cursors. Merged timelines
round-robin bounded records while preserving each host's order; they do not invent a wall-clock
total order. One unavailable remote remains visible without hiding healthy client or sibling roots.

## Chromium and agent use

Build the unpacked extension with:

```sh
npm run build -w @exactjs/chromium-devtools
```

Load `packages/chromium-devtools` in Chromium's extension page, open DevTools, and select the
**eXact** panel. The extension's main-world bridge is installed at document start, while the
inspection hook becomes active only when a consumer connects. Closing the panel closes live
subscriptions and releases highlights and bridges.

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
- `@exactjs/server`: authorization, sessions, queries, streams, catalogs, and binding federation.

See package-local `README.md` and `AGENTS.md` files before integrating any of these boundaries.
