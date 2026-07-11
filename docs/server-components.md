# Server Components

eXact supports three rendering modes from the same component model:

- Client-only apps compile and run entirely in the browser.
- SSR apps render HTML on the server, serialize hydration data, then attach client behavior.
- Server component apps emit separate client/server artifacts and use a secure endpoint for action and boundary refresh traffic.

Server component mode is opt-in. The authoring goal is still simple: write ordinary eXact components, use `this.task(...)`, and let the compiler infer what can stay on the server. Explicit `this.task.server(...)` and `this.task.client(...)` are escape hatches when the compiler needs a hard boundary.

## Build Artifacts

Use `exactc --artifacts --serverComponents` to emit split artifacts:

```sh
npx exactc --rootDir src --outDir .exact --artifacts --serverComponents src
```

For each source component file the compiler can emit:

- `Component.exact.client.ts`: browser-safe exports, client islands, event handlers, refs, and client tasks.
- `Component.exact.server.ts`: server-renderable exports, server parts, server stubs for client boundaries, and server-safe tasks.
- `Component.exact.manifest.json`: stable IDs, generated symbol names, action contracts, boundary metadata, and component edges.

Generated symbols are deterministic and derived from the authored export name, for example `ProfilePage_ExactClient_1` or `ProfilePage_ExactServer_1`. Runtime protocol identity should use manifest IDs rather than JavaScript function names because bundlers and minifiers may rename symbols.

## Build Tool Integration

The Vite, Webpack, and Bun adapters share the same compiler options:

```ts
exact({
  target: "server",
  serverComponents: true,
  manifestFiles: ["./.exact/ProfilePage.exact.manifest.json"]
});
```

Use `target: "client"` for the browser bundle and `target: "server"` for server rendering. With `serverComponents: true`, client-target artifacts omit server-owned authored components while preserving generated client islands and pure client child components.

Generated element islands can keep server-owned child subgraphs on the server. For example, an interactive shell element with an `onClick` handler can hydrate as a client island while a nested server component, local or imported through manifest metadata, is rendered as a server-owned `props.children` slot instead of being pulled into the browser bundle.

Adapters also understand `.exact` facade imports. A client build resolves `./ProfilePage.exact` to the client artifact; a server build resolves it to the server artifact. Published component libraries can expose `exact-client` and `exact-server` package export conditions so each component remains independently tree-shakable for the selected render target.

`manifestFiles` are read at transform time. Watch pipelines can regenerate `.exact.manifest.json` files and keep imported component classification fresh without recreating plugin instances.

## Server Manifest

Server apps convert compiler manifests into a runtime allowlist:

```ts
import compilerManifest from "../.exact/ProfilePage.exact.manifest.json" with { type: "json" };
import { createExactServerManifest } from "@exact/server";

const manifest = createExactServerManifest(compilerManifest, {
  endpoint: "/__exact",
  actions: {
    "ProfilePage.task.loadProfile": {
      id: "ProfilePage.task.loadProfile",
      componentId: "ProfilePage",
      placement: "server"
    }
  }
});
```

Only IDs present in the runtime manifest can be invoked. The client never sends module paths, export names, function bodies, or arbitrary component names.

## Handler Registry

`@exact/ssr` can build a ready runtime context from manifest-scoped action and boundary handlers:

```ts
import { createExactServerRuntime } from "@exact/ssr";
import { handleExactRequest } from "@exact/server";
import { renderProfilePage } from "./server-entry";

const runtime = createExactServerRuntime({
  manifest,
  actions: {
    "ProfilePage.task.loadProfile": async input => {
      // App code runs here, but only behind the manifest ID allowlist.
      return { state: { profileId: input.state } };
    }
  },
  boundaries: {
    ProfilePage: () => renderProfilePage()
  },
  patchStrategy: "element",
  authorize: validateSession,
  validateCsrf,
  logger
});

const response = await handleExactRequest(request, runtime);
```

The same `handleExactRequest(request, context)` core works with Fetch-compatible runtimes, Express, Hapi, or custom JavaScript servers. `createFetchHandler`, `createExpressHandler`, and `createHapiHandler` are thin adapters over the same validation and dispatch logic. Apps that need lower-level composition can still use `createExactServerHandlerRegistry()` and merge the returned handlers into their own `ExactServerContext`.

## Hydration

Server rendering sends endpoint, state contracts, and action boundary hints to the browser:

```ts
import { createExactHydrationManifestConfig } from "@exact/server";
import { renderToHydratableStringAsync } from "@exact/ssr";

const hydration = createExactHydrationManifestConfig(manifest, {
  sessionId: "s1"
});

const html = await renderToHydratableStringAsync(renderProfilePage(), hydration);
```

The client reads the hydration script automatically:

```ts
import { hydrate } from "@exact/hydrate";
import { ProfilePage_ExactClient_1 } from "../.exact/ProfilePage.exact.client";

hydrate(<ProfilePage />, document.getElementById("app")!, {
  islands: {
    ProfilePage_ExactClient_1
  }
});
```

Hydration restores serialized state before the initial client render and skips duplicated server-completed work when the manifest confirms the server already provided it.

Apps can also provide per-action and per-boundary endpoint routes in the hydration config. The root `endpoint` remains the default, while routed operations are sent to their configured endpoint and batched separately from same-tick operations targeting other endpoints.

Dynamically loaded bundles can register additional hydration metadata against an existing root with `client.registerManifest(...)`. Registration merges endpoint routes, state contracts, action boundary hints, client island components, and optional per-endpoint transport hooks so a remote subtree can route server operations to its own endpoint and hydrate returned client islands without recreating the shell root.

## Protocol

The client endpoint supports:

- `action`: invoke one manifest-allowlisted server action.
- `refresh`: rerender one manifest-allowlisted server boundary.
- `batch`: send same-tick operations together.

Batches behave like independent GraphQL-style operation groups: each operation has its own result, and optional `opId` / `dependsOn` metadata can express dependency ordering. `opId` values must be unique within a batch. Independent operations run concurrently and preserve request-order results. Dependent operations wait for successful prerequisites and are skipped with `dependency_failed` if a prerequisite does not succeed.

Clients can opt into streamed endpoint responses by sending `Accept: application/x-ndjson` or `x-exact-stream: 1`; `@exact/hydrate` does this when `stream: true` is set. Stream responses are newline-delimited JSON events: `start`, zero or more per-operation `patch`, `state`, and `html` chunk events, one terminal `result` event per operation with `index` and optional `opId`, then `complete`. Independent batch chunks may arrive out of order as operations finish; the client restores request-order results before resolving helper promises.

Patch responses can include text updates, prop/style updates, keyed list operations, state updates, and boundary replacement. If a fine-grained patch cannot apply cleanly, the client replaces the nearest server boundary with the authoritative server-rendered HTML.

## Security

The manifest is the execution boundary:

- Unknown action and boundary IDs are rejected.
- Unknown request fields are rejected.
- Endpoint path mismatches are rejected when the manifest configures an endpoint.
- Boundary snapshot IDs must be known to the manifest and, for actions, must match the action's allowed boundary list.
- Payload, state, result, patch, and hydration data must be JSON-safe.
- Serialized request context is rejected unless the action manifest has an exact context contract for every submitted token; exact context reads must be present before dispatch.
- The hydration client validates successful endpoint response shapes before applying patches.
- App-provided `authorize` and `validateCsrf` hooks run before dispatch.
- Server-only code is emitted only into server artifacts.

Rejected requests are logged through framework logging without leaking server internals to the client.

## Future Work: Micro Frontends

Server component support should eventually handle micro frontend trees where the initial HTML is owned by one shell app, but feature bundles are loaded dynamically from other apps or endpoints.

The expected model:

- Only the shell app owns initial document SSR. Remote apps do not participate in that first server render unless the shell explicitly hosts their server artifacts.
- Remote apps can still own server component subtrees after hydration. The shell renders a placeholder, the client loads the remote bundle, registers its manifest/client islands, and requests the remote server-rendered subtree from that remote app's endpoint.
- Endpoint routing is manifest/action/boundary scoped. A shell action can use `/__exact`, while a billing boundary can use `https://billing.example.com/__exact`.
- Client batching groups same-tick operations per endpoint. Operations for different remotes produce separate endpoint batches, while preserving each endpoint's existing `opId` / `dependsOn` dependency behavior.
- A remote endpoint should only accept IDs from the manifests it owns or that the host explicitly provides. Patches from a remote endpoint should only target boundaries owned by that remote manifest unless the host grants cross-manifest authority.
- Dynamically loaded remotes can register manifest metadata, endpoint routing, client islands, and optional per-endpoint transport hooks at runtime.

Context sharing across micro frontend bundles has an explicit same-realm token option:

- Context tokens currently use unique local symbols, so duplicate copies of a shared context module can create separate token identities.
- For cross-bundle context, `createContext(description, true)` creates a globally keyed context while keeping local contexts as the default.
- A global context uses a namespaced `Symbol.for()` key, for example `Symbol.for("exact.context:com.company.auth.user")`.
- Authors should use collision-resistant namespaced descriptions for global contexts, such as `com.company.auth.user`, not generic names like `user`.
- Built-in framework contexts such as logger and error context use global keys so duplicated `@exact/core` copies can share them in one browser realm.
- `Symbol.for()` only solves identity within the same JavaScript realm. Cross-iframe, worker, or remote server endpoint context still has to be passed explicitly as validated serialized request/session data.
- Remote server components should not receive arbitrary client-provided context. Compiler/runtime manifests record action context contracts from `this.getContext(...)` / `this.setContext(...)`, and endpoint validation rejects serialized context tokens that are not allowlisted by the action contract. Cross-endpoint context should still be treated as explicit app/session data, not ambient authority.

## Sample

`apps/server-components` is the executable wiring sample. It uses generated artifacts and manifest data, registers server handlers, exercises the secure endpoint, hydrates a generated client island in jsdom, invokes an action, and applies the returned patch.

Run:

```sh
npm run build:server-components
npm run test:server-components
```
