# @exactjs/config

Typed configuration contracts for eXact applications and framework plugins.

```ts
import { defineConfig } from '@exactjs/config';

export default defineConfig({
	plugins: []
});
```

`defineConfig` preserves the concrete configuration type while validating the shared schema.
Framework plugins augment the registry through TypeScript declaration merging, allowing one
configuration file to project compiler, server, render, client, and testing behavior.

`debug.catalog` controls rich server-only inspection catalog output; `debug.runtime` independently
controls compact browser correlation and the page hook. Both accept booleans or `'auto'`.
Production debugging should set both deliberately and configure `allowDebug` in the server
runtime. Hardened builds set both to `false`. Debug redactions contain selectors and names only,
never values. See [Server-cooperative full-stack DevTools](../../docs/devtools.md).
