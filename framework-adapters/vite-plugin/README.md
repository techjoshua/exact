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

Client builds also verify the final Rollup output graph. A module, dynamic import, chunk, or
runtime asset carrying an `.exact.server` contribution fails the build after bundling, while
private development source maps remain available for debugging.

The same generated-artifact path carries distributed component actions and finite component
registries. Action operation identities remain opaque, while registry entries retain eager/lazy
provenance, placement, and target ownership. Final client-graph verification rejects server action
bodies and server-only registry entries instead of relying on authored names.

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
With compatibility enabled, imported and runtime-selected components can be rendered directly
from native eXact JSX. The compiler inserts the adapter without compiling dependency
implementations from `node_modules`; compiler-branded eXact components pass through unchanged and
unbranded values use the active React layer. Reference the matching
`@exactjs/react-compat/types18` or `types19` facade in the application TypeScript configuration.

See [Actions and forms](../../docs/actions-and-forms.md) and
[finite component registries](../../docs/component-registries.md).

## DevTools build output

The plugin reads `debug` from its options or prepared eXact config. On server builds, `catalog`
collects target-neutral compiler inspection once per authored module and emits one private
`.exact-inspection/<buildKey>.json` asset. Client builds never receive that catalog. On client
builds, `runtime` emits compact correlation and injects `@exactjs/devtools-runtime` before the
application entry. Set both controls to `false` for hardened output.

Instrumented native client modules also import the virtual runtime as a side effect. This creates a
module-graph ordering barrier, ensuring inspection ownership is installed before an application
entry can render its first root; the HTML bootstrap still covers pages without transformed roots.

Production deployments should provide the same immutable `buildKey` and `executionRoot` to their
client and server builds, register the emitted catalog with the server runtime, and configure
`allowDebug` separately. See [Server-cooperative full-stack DevTools](../../docs/devtools.md).
