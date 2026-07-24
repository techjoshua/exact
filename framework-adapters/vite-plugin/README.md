# @exactjs/vite-plugin

Compiler integration for eXact applications built with Vite 5 through Vite 8.

```ts
import { exact } from '@exactjs/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [exact()]
});
```

The plugin compiles eXact TSX, resolves generated `.exact` facades, applies client or server export
conditions, participates in HMR and diagnostics, and can enable React compatibility and
microfrontend projections.

It also configures the automatic JSX runtime with `@exactjs/jsx`. This is required explicitly by
Vite 8's Oxc transform and also protects Vitest runs that load the Vite configuration. User Vite
configuration can still override the returned Oxc options; set `configureJsxRuntime: false` when a
mixed or custom pipeline owns JSX lowering.

Runner-owned `*.test.*`, `*.spec.*`, and `*.jest.*` modules are left to that automatic runtime by
default because their top-level test calls are not application placement boundaries. Imported
component modules still receive full compilation. Set `compileTestModules: true` only for a test
module deliberately written to satisfy normal application-module placement rules.

Use `target: "server"` for server artifacts, `serverComponents: true` for split server-component
builds, and `reactCompatibility` only when the application intentionally consumes React packages.
