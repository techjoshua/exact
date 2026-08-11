# @exactjs/webpack-plugin

Webpack 5 integration for eXact TypeScript, TSX, and generated artifacts.

## Configuration

```js
import { ExactWebpackPlugin } from '@exactjs/webpack-plugin';

export default {
	resolve: { extensions: ['.tsx', '.ts', '.js'] },
	plugins: [new ExactWebpackPlugin()]
};
```

Use `target: 'server'` and `serverComponents: true` for server builds. The `./loader` export is
available when an existing rule needs explicit loader composition.

## What the plugin handles

The plugin installs the compiler loader, applies client or server export conditions, reports
diagnostics, supports source maps and watch invalidation, verifies browser isolation, and can
configure React compatibility.

For `target: 'server'`, the loader records compiler component facts and the module factory
authorizes resolved package instances before Webpack builds them. Configure `componentLibraries`
once in `exact.config.*`; successful compilations emit private authorization and audit assets under
`.exact/`. Client-only component code does not use this additional gate.

Attributed enhancement imports populate the application-bundle enhancement catalog. The plugin aliases
DOM, hydration, and SSR entry points to the shared facades that supply that catalog; application
aliases remain authoritative, and the compiler does not maintain a plugin registry.
An attributed namespace export with `scope: 'package'` in `exact.config.*` supplies a virtual namespace to
every package component; Webpack emits its catalog registration only from modules that activate it.

Optional `debug` settings control private server catalogs and compact browser instrumentation.
Disable both for hardened output. See [eXact DevTools](../../docs/devtools.md).

## Microfrontends

When `exact.config.*` enables `@exactjs/microfrontends`, the client plugin emits each configured
exposure as an independent ESM entry and preserves its CSS, assets, lazy chunks, hydration
registration, and provided-package identity. No additional Webpack plugin is required.

Use `onRemoteEntries` to publish successful production entries and
`onRemoteDevelopmentEntries` to expose stable development module IDs. Failed watch compilations do
not publish a partial map; the previous successful deployment map remains valid.
