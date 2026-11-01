# @exactjs/hydrate

Browser hydration and server-response patching for eXact applications. Adopts `@exactjs/ssr` output, activates client islands, and coordinates server operations through a client owned by each root.

## Usage

```ts
import { createExactClient } from '@exactjs/hydrate';

const client = createExactClient(document.getElementById('app')!, { islands });
```

Passing `islands` to `createExactClient` starts island discovery, including when the registry is empty. Omit it to attach transport before a later explicit hydration call or `client.registerComponents({ islands })`.

`createExactClient` and public `hydrate` discover serialized bootstrap configuration, including scripts beside the application root. An explicit configuration read is normally unnecessary. For inspection, `readExactHydrationConfig()` searches the document. Passing a root restricts the search to that subtree and returns `{}` if it contains no valid configuration. For detached or shadow-root content, pass the container holding the script.

Generated enhancement modules register providers and hydration support automatically. Hydration adopts compatible DOM before activating enhancements. Manual enhancement catalogs require the `/enhanced` entry, which activates support for both roots and islands.

## Activation and loading

Eligible interaction-only islands load on their first supported event. Eager islands load immediately, activating dormant ancestors needed to adopt server slots. Siblings share a pending ancestor load, and `whenSettled()` waits for the complete chain. After bootstrap capture starts, both retain supported interactions during loading and replay them after adoption. Earlier events cannot be recovered. `hydration: { strategy: 'eager' }` starts all eligible islands immediately.

Hydration loads selected lazy registry components before adopting their DOM. The returned root's `whenSettled()` waits for imports and adoption. Input edits made while loading are preserved. Event handlers become active after adoption.

Applications with browser-owned service calls and no compiler-generated server operations, response patches, or client islands can use the hydration-only entry. Bundlers can omit server-operation and island support:

```ts
import { hydrate } from '@exactjs/hydrate/root';

const root = hydrate(app, document.getElementById('app')!);
```

When SSR uses `publishRootProps: true`, construct the client root from the same bounded bootstrap record instead of a second application-data script:

```tsx
const container = document.getElementById('app')!;
hydrateAfterNavigation(() => {
	const props = readPublishedRootProps<AppProps>(App, container);
	return <App {...props} />;
}, container);
```

The compiled root binds compiler-proven compact positional payloads to the matching client artifact. Named payloads from older or structurally open roots remain supported. Hydration reuses the same decoded object graph.

`hydrateAfterNavigation()` activates after document readiness or earlier interaction. Its synchronous factory defers props decoding and root creation until activation. Static module evaluation is unchanged, and activation may precede first contentful paint. Hydrate embedded documents from their own window's runtime.

## Server operations and limits

Hydrate the same compiled application that produced the server output. Server endpoints own authorization, CSRF policy, payload limits, and operation allowlists. Positive safe-integer client `streamLimits` caps reject oversized responses or requests. Caps are local and do not configure the server. Breaches use the client logger and reject the invocation. Without `maxRequestBytes`, single and batched envelopes above 4 MiB warn and continue. Response thresholds also warn and continue by default. See [production limits](https://github.com/techjoshua/exact/blob/main/docs/native-ssr-production-guide.md#limits).

Authored component tasks supply generated Array submission and application bindings automatically. Explicit root-state integrations select contracts and bindings from compiled components:

```ts
const { continuations, continuationArrays } = composeExactComponentContracts(
	[ClientPage],
	'client'
);
const client = createExactClient(container, { continuations, continuationArrays, state, endpoint });
await client.invokeTask(operationId, { dependencies: [] });
```

Registration includes target-local `continuationArrays` callbacks for proof-bearing continuations. Keep generated IDs opaque and use the build integration's selected ID. Missing admitted executable bindings reject before transport. Root request ordering is retained, while completion patches preserve unchanged Array and member identities in `state`.

`ExactClient.applyPatches()` is for framework integrations deliberately applying validated patches within that client's root. Direct transport invocation and unscoped patch application are package-private.

See [SSR and hydration](https://github.com/techjoshua/exact/blob/main/docs/ssr-hydration.md) and [component registries](https://github.com/techjoshua/exact/blob/main/docs/component-registries.md).

[Documentation](https://techjoshua.github.io/exact/#/learn/server-execution) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/packages/hydrate)
