# @exactjs/ssr

Server rendering and server-runtime composition for eXact.

The package renders synchronous, asynchronous, hydratable, streaming, and progressive HTML;
creates hydration configuration; diffs refresh boundaries; and builds the runtime consumed by
platform adapters.

```ts
import { renderToStringAsync } from '@exactjs/ssr';

const html = await renderToStringAsync(<App />);
```

Compose private contracts from compiler-generated server artifacts for actions, boundaries, and
distributed component continuations. Pair hydratable output with `@exactjs/hydrate`; plain SSR can
remain script-free.

Hydratable results expose the same public component resumption activations serialized into their
hydration script. Server-only context and resources may influence permitted HTML but never enter
that client record.
