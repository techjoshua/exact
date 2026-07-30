# @exactjs/ssr

Server rendering and server-runtime composition for eXact.

The package renders synchronous, asynchronous, hydratable, streaming, and progressive HTML;
creates hydration configuration; diffs refresh boundaries; and builds the runtime consumed by
platform adapters.

```ts
import { renderToStringAsync } from '@exactjs/ssr';

const html = await renderToStringAsync(<App />);
```

Compose private contracts from compiler-generated server artifacts for task operations, boundaries, and
distributed component continuations. Pair hydratable output with `@exactjs/hydrate`; plain SSR can
remain script-free.

Hydratable results expose the same public component resumption activations serialized into their
hydration script. Server-only context and resources may influence permitted HTML but never enter
that client record.

Eager and lazy registry selections render through the ordinary component/Suspense pipeline.
Registry binding, key, and opaque compiled identity are retained in the component marker name so
the hydration client can reject a stale or different selection without accepting ambiguous
component ownership.

Synchronous rendering emits native Suspense fallbacks with explicit status markers. Async
rendering waits for blocking descendants, and progressive document streams emit the smallest
outermost settled Suspense range when boundary-local replacement can reproduce the final output;
otherwise they conservatively replace the root.

See [Task interactions and forms](../../docs/actions-and-forms.md) and
[finite component registries](../../docs/component-registries.md).

Request rendering automatically inherits a server inspection owner when its server runtime retains
the selected build/root catalog. SSR component, state, readiness, and disposal observations fan out
only to active authorized sessions and do not retain request-owned instances. Lower-level render
APIs may receive an explicit `inspection` owner. See
[Server-cooperative full-stack DevTools](../../docs/devtools.md).
