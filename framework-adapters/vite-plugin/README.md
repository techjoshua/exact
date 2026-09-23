# @exactjs/vite-plugin

Vite integration for compiling and serving eXact applications.

## Configuration

```ts
import { exact } from '@exactjs/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [exact()] });
```

Applications with separate client and server configs can build both in one process and reuse one native compiler project generation:

```ts
import { buildExactViteApplication } from '@exactjs/vite-plugin/build';

await buildExactViteApplication(['vite.config.ts', 'vite.server.config.ts']);
```

Use `target: 'server'` for server artifacts, `serverComponents: true` for split server-component
builds, and `reactCompatibility` only when the application consumes React-owned packages.
The plugin rejects mismatched Vite and eXact build targets.
Set `renderMode: 'hydrate'` for a browser bundle that adopts SSR HTML, or `renderMode: 'client'`
for a fresh-mount-only browser bundle. These modes prune unused emitted contract fields; the
default `universal` behavior preserves the complete contract.
For an SSR-only server entry, combine `target: 'server'` with `renderMode: 'server-render'` to omit
later continuation-dispatch executors. Keep the default for a server bundle that also calls
`composeExactExecutorContract()` or handles continuation requests.

## What the plugin handles

The plugin compiles eXact TSX, configures the automatic JSX runtime, resolves generated `.exact` facades, preserves Vite's platform conditions, supports HMR, and keeps server-only code out of the final browser graph.

For `target: 'server'`, compiler-recorded component package requests are resolved and authorized
before Vite loads their implementations. Configure trust once through `componentLibraries` in
`exact.config.*`; successful builds emit server-private authorization and audit manifests under
`.exact/`. Client-only package components do not pass through this server authorization gate.
Server dependency discovery waits for authorization; allowed packages use ordinary Rollup chunking.

Attributed enhancement imports populate the shared bundle-local enhancement catalog. The adapter
routes renderers through facades that supply it; the compiler maintains no plugin registry. An
attributed `scope: 'package'` namespace supplies a virtual namespace to every package component,
with registration emitted only from modules that activate it.

The optional `internationalization` integration analyzes source messages, watches XLIFF or
protocol-JSON catalogs, and emits component-owned translation companions. It supports descriptor
callbacks and compiler-proven client capability providers. See
[internationalization](https://github.com/techjoshua/exact/blob/main/docs/internationalization.md)
for catalog ownership, locale selection, invalidation, and polyfill configuration.

`include` and `exclude` select transformed modules. Tests stay runner-owned unless
`compileTestModules` is true; `typescriptConfig` can select their test project.

## DevTools

Optional `debug` settings control private server inspection catalogs and compact browser
instrumentation. Production client and server builds should share a stable build identity.

See [eXact DevTools](https://github.com/techjoshua/exact/blob/main/docs/devtools.md) and [component registries](https://github.com/techjoshua/exact/blob/main/docs/component-registries.md). Component authorization permits
in-process server execution and is not a JavaScript sandbox.

[Documentation](https://techjoshua.github.io/exact/#/runtimes) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/framework-adapters/vite-plugin)

## One browser HTML file

```ts
import { defineConfig } from 'vite';
import { exactSingleFile } from '@exactjs/vite-plugin';
export default defineConfig({ plugins: [exactSingleFile()] });
```

This builds one HTML entry with embedded scripts, styles, imported images, and fonts. Dynamic
imports are folded into the script. Use hash navigation for offline `file:` URLs. Import assets
through Vite; external CSS/modules, unresolved URLs, `srcset`, separate worker files, and server
operations are rejected. Optional application fetches still require connectivity.

`buildExactViteApplication()` accepts an optional `afterBuild(configFile)` callback to publish
client asset metadata before the server build while retaining the shared compiler generation.
