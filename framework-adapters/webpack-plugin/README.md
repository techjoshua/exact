# @exactjs/webpack-plugin

Webpack 5 compiler integration for eXact TSX and generated `.exact` artifacts.

```js
import { ExactWebpackPlugin } from '@exactjs/webpack-plugin';

export default {
	resolve: { extensions: ['.tsx', '.ts', '.js'] },
	plugins: [new ExactWebpackPlugin()]
};
```

The plugin adds its loader rule, client or server export conditions, semantic diagnostics,
source-map support, React compatibility aliases, and compiler-session lifecycle handling. Use
`target: "server"` and `serverComponents: true` for server builds. The `./loader` export is
available for advanced rule composition.

Configure compiler-cooperative DevTools with `debug: { catalog, runtime, buildKey,
executionRoot }`. Development watch builds enable both `auto` controls. A client build injects the
page bridge and compact compiler IDs; a server build emits
`.exact-inspection/<buildKey>.json` during `processAssets`. Paired production builds must provide
the same immutable build/root identity. Set both controls to `false` for hardened output. Rich
catalog data is never emitted into the client compilation.

Set `reactCompatibility: { target: 18 }` or `{ target: 19 }` to render imported or
runtime-selected components directly from native eXact JSX. The loader emits a cached
compatibility adapter; compiler-branded eXact components pass through unchanged while unbranded
values use the active React layer. Webpack aliases the dependency's React runtime, and dependency
implementations in `node_modules` are not eXact-compiled. Reference the matching
`@exactjs/react-compat/types18` or `types19` facade for TypeScript.
