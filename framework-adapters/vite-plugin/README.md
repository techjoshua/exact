# @exactjs/vite-plugin

Vite integration for compiling and serving eXact applications.

## Configuration

```ts
import { exact } from '@exactjs/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [exact()] });
```

Applications with separate client and server configs can build both in one process and reuse one
native compiler project generation:

```ts
import { buildExactViteApplication } from '@exactjs/vite-plugin/build';

await buildExactViteApplication(['vite.config.ts', 'vite.server.config.ts']);
```

Use `target: 'server'` for server artifacts, `serverComponents: true` for split server-component
builds, and `reactCompatibility` only when the application consumes React-owned packages.
The plugin rejects a Vite `build.ssr` configuration that omits `target: 'server'`, as well as a
server-target plugin placed in a browser build, so a production server cannot silently bundle
client component artifacts.
Set `renderMode: 'hydrate'` for a browser bundle that adopts SSR HTML, or `renderMode: 'client'`
for a fresh-mount-only browser bundle. These modes prune unused emitted contract fields; the
default `universal` behavior preserves the complete contract.

## What the plugin handles

The plugin compiles eXact TSX, configures the automatic JSX runtime, resolves generated `.exact`
facades, adds client or server conditions without discarding Vite's platform conditions, supports HMR, and verifies that server-only
code does not enter the final browser graph.

For `target: 'server'`, compiler-recorded component package requests are resolved and authorized
before Vite loads their implementations. Configure trust once through `componentLibraries` in
`exact.config.*`; successful builds emit server-private authorization and audit manifests under
`.exact/`. Client-only package components do not pass through this server authorization gate.
Automatic dependency discovery is disabled for server targets so unresolved component candidates
cannot be prebundled before that gate; authorized packages still participate in ordinary Rollup
chunking after resolution.

Attributed enhancement imports reached by an application bundle populate the shared bundle-local
enhancement catalog. The adapter redirects DOM, hydration, and SSR entry points through the common
renderer facades that supply that catalog;
the compiler does not consult or maintain a plugin registry for this decision.
An attributed namespace export with `scope: 'package'` in `exact.config.*` supplies a virtual namespace to
every package component; Vite emits its catalog registration only from modules that activate it.

The `internationalization` option runs `@exactjs/intl-analyzer` over original TSX
before this ordinary compiler transform. It accepts generated data-only `catalogs` or watched
XLIFF 2.1/protocol-JSON `catalogFiles` and generates validated per-source companion modules with
generation fencing. XLIFF is the recommended persisted translation source; runtime protocol JSON
is derived build data. The
owner and source locale can be explicit or derived from entry-package intl metadata; an optional
`developmentLocale` overrides only development catalog selection. Catalog-file edits relink and
invalidate those companions without recompiling component source. Analyzer-local ownership is joined to public compiler component facts, so
messages outside recognized components fail the build. Generated companions are component-owned
and side-effect-free when unused, allowing Rollup to prune translations for an unused component in
a shared source module. An
optional `onDescriptors(descriptors, moduleId)` callback supports external translation tools. The
optional `onClientRequirements(requirements, moduleId)` callback reports finite `temporal` and
`intl-duration-format` requirements for generator-owned polyfill planning. Generated companions
also export that list. Shared `clientCapabilityProviders` configuration selects native support, a
bundled side-effect module, or a pinned HTTPS CDN script; configured client providers run before
their dependent companion, while server builds emit none. The option is disabled by default and
uses the shared native analyzer/build coordinator documented in
[internationalization](../../docs/internationalization.md).

`include` and `exclude` define the complete set of modules owned by the transform. Test modules
are left to the runner by default; imported application components are still compiled.

## DevTools

Optional `debug` settings control private server inspection catalogs and compact browser
instrumentation. Production client and server builds should share a stable build identity.

See [eXact DevTools](../../docs/devtools.md) and
[component registries](../../docs/component-registries.md). Component authorization permits
in-process server execution and is not a JavaScript sandbox.
