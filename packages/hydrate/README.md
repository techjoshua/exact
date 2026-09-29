# @exactjs/hydrate

Browser hydration and server-response patching for eXact applications.

## Overview

Adopts `@exactjs/ssr` output, activates client islands, and coordinates server operations through a client owned by each root.

## Usage

```ts
import { createExactClient } from '@exactjs/hydrate';

const client = createExactClient(document.getElementById('app')!, {
	islands
});
```

`createExactClient` and public `hydrate` discover serialized bootstrap configuration, including
scripts beside the application root. An explicit configuration read is normally unnecessary.
For manually supplied enhancement catalogs, the `/enhanced` entry activates support for both roots and islands.
For inspection, `readExactHydrationConfig()` searches the document. Passing a root restricts the
search to that subtree and returns `{}` if it contains no valid configuration. For detached or
shadow-root content, pass the container that holds the script.

Eligible interaction-only islands load on their first supported event. Eager islands load immediately.
After bootstrap capture starts, both retain supported interactions during loading and replay them
after adoption. Earlier events cannot be recovered. `hydration: { strategy: 'eager' }` starts all eligible islands immediately.

When a server-rendered view selects a lazy registry entry, hydration loads that component before
adopting its DOM. The returned root's `whenSettled()` promise waits for selected imports and adoption.
Input edits made while loading are preserved. Event handlers become active after adoption.

Hydrate the same compiled application that produced the server output. Server endpoints remain
responsible for authorization, CSRF policy, payload limits, and operation allowlists.

Generated enhancement modules register their providers and hydration support automatically.
Hydration adopts compatible DOM before activating enhancements. Manual enhancement catalogs
require the `/enhanced` entry described above.

Applications with ordinary browser-owned service calls and no compiler-generated server
operations, response patches, or client islands can select the hydration-only entry:

```ts
import { hydrate } from '@exactjs/hydrate/root';

const root = hydrate(app, document.getElementById('app')!);
```

Bundlers can omit server-operation and island support from this entry. The main entry supports
applications that need those capabilities.

When SSR uses `publishRootProps: true`, construct the client root from the same bounded bootstrap
record instead of shipping a second application-data script:

```tsx
const container = document.getElementById('app')!;
hydrateAfterNavigation(() => {
	const props = readPublishedRootProps<AppProps>(App, container);
	return <App {...props} />;
}, container);
```

Passing the compiled root binds any compiler-proven compact positional payload to the matching
client artifact. Named payloads from older or structurally open roots remain supported. The later
hydration call reuses the same decoded object graph.

`hydrateAfterNavigation()` schedules activation after the document is ready, or activates earlier
when the user interacts. A synchronous factory defers props decoding and root creation until that
activation. Static module evaluation is unchanged, and activation may precede first contentful paint.
Hydrate embedded documents from their own window's runtime.

Use `ExactClient.applyPatches()` only for framework integrations that deliberately apply validated
patches within that client's root. Direct transport invocation and unscoped patch application are
package-private implementation details.

See [SSR and hydration](https://github.com/techjoshua/exact/blob/main/docs/ssr-hydration.md) and
[component registries](https://github.com/techjoshua/exact/blob/main/docs/component-registries.md).

[Documentation](https://techjoshua.github.io/exact/#/learn/server-execution) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/packages/hydrate)
