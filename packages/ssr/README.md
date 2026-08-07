# @exactjs/ssr

Server rendering and server-runtime composition for eXact applications.

## Usage

```tsx
import { renderToStringAsync } from '@exactjs/ssr';

const html = await renderToStringAsync(<App />);
```

## Rendering modes

The package supports synchronous and asynchronous strings, streaming and progressive documents,
hydratable output, refresh-boundary diffing, and server-runtime creation. Choose the smallest mode
that fits the response.

Plain SSR can remain script-free. Pair hydratable output with `@exactjs/hydrate` and the matching
compiler-generated client artifacts. Component inputs included in hydration must be deterministic
and serializable.

Generated server entries pass their bundle-local enhancement catalog through render
options. Available declarations run as ordinary server components; absent optional capabilities
leave authored output unchanged and warn once per identity.

Generated task handlers, component identities, resumption records, and registry selections are
opaque contracts shared with the client runtime.

See [SSR and hydration](../../docs/ssr-hydration.md), [tasks](../../docs/tasks.md), and
[component registries](../../docs/component-registries.md).
