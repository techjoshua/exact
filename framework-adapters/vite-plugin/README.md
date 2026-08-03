# @exactjs/vite-plugin

Vite integration for compiling and serving eXact applications.

## Configuration

```ts
import { exact } from '@exactjs/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [exact()]
});
```

Use `target: 'server'` for server artifacts, `serverComponents: true` for split server-component
builds, and `reactCompatibility` only when the application consumes React-owned packages.

## What the plugin handles

The plugin compiles eXact TSX, configures the automatic JSX runtime, resolves generated `.exact`
facades, applies client or server export conditions, supports HMR, and verifies that server-only
code does not enter the final browser graph.

Attributed plugin imports reached by an application bundle populate the shared bundle-local
enhancement catalog. The adapter redirects DOM, hydration, and SSR entry points through the common
renderer facades that supply that catalog;
the compiler does not consult or maintain a plugin registry for this decision.

`include` and `exclude` define the complete set of modules owned by the transform. Test modules
are left to the runner by default; imported application components are still compiled.

## DevTools

Optional `debug` settings control private server inspection catalogs and compact browser
instrumentation. Production client and server builds should share a stable build identity.
Disable both controls for hardened output.

See [eXact DevTools](../../docs/devtools.md) and
[component registries](../../docs/component-registries.md).
