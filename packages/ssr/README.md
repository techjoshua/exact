# @exactjs/ssr

Server rendering and server-runtime composition for eXact.

The package renders synchronous, asynchronous, hydratable, streaming, and progressive HTML;
creates hydration configuration; diffs refresh boundaries; and builds the runtime consumed by
platform adapters.

```ts
import { renderToStringAsync } from '@exactjs/ssr';

const html = await renderToStringAsync(<App />);
```

Use compiler-generated manifests for actions, boundaries, and server components. Pair hydratable
output with `@exactjs/hydrate`; plain SSR can remain script-free.
