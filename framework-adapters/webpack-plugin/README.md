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

Attributed plugin imports populate the application-bundle enhancement catalog. The plugin aliases
DOM, hydration, and SSR entry points to the shared facades that supply that catalog; application
aliases remain authoritative, and the compiler does not maintain a plugin registry.

Optional `debug` settings control private server catalogs and compact browser instrumentation.
Disable both for hardened output. See [eXact DevTools](../../docs/devtools.md).
