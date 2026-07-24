# eXact

eXact is an experimental TypeScript web framework built around reactive state, component instances, and fine-grained DOM updates.

The repository is an npm workspace monorepo. The current implementation slice contains:

- `@exactjs/reactive`: reactive proxies, refs, tracking, batching, `unwrap`, `peek`, computed values, and snapshots.
- `@exactjs/core`: component instances, readonly props, context, refs, tasks, lifecycle hooks, vnodes, and `this.map()`.
- `@exactjs/jsx`: TypeScript JSX entrypoints and JSX namespace types used by the compiler toolchain.
- `@exactjs/dom`: browser mounting, DOM patching, delegated events, DOM refs, and keyed list reconciliation.
- `@exactjs/compiler`: eXact JSX/TSX transform core for expression-preserving compiled JSX.
- `@exactjs/ssr`: server-side HTML rendering with hydration boundary markers.
- `@exactjs/hydrate`: client hydration entrypoint and server patch application.
- `@exactjs/server`: adapter-neutral secure server-component/action request handling.
- `@exactjs/vite-plugin`: Vite integration for the eXact compiler.
- `@exactjs/webpack-plugin`: Webpack integration for the eXact compiler.
- `@exactjs/bun-plugin`: Bun integration for the eXact compiler.
- `@exactjs/vitest` and `@exactjs/jest`: compiler-aware test-runner setup and shared matchers.
- `create-exact-app`: interactive project scaffolding across supported build and runtime platforms.

Packages expose focused subpaths where environment or integration boundaries require them. Browser rendering is intentionally exported from `@exactjs/dom`; platform-neutral component APIs live in `@exactjs/core`.

## Current API Contract

The current contract is intentionally small:

- Component functions construct instances once and return render functions.
- Instance state is reactive and instance-owned through `this.state`.
- Compiled `this.state` writes are conditional: primitives use identity checks, while plain JSON objects and arrays reconcile unchanged branches in place. Repeated parsed API responses therefore do not cascade reactive updates, and keyed rendered arrays retain records by their declared key across reorders.
- `batch()` is atomic for synchronous reactive writes: successful batches publish one deduplicated notification set, while a thrown callback restores object properties, nested values, array contents, sparse holes, and proxy identities before rethrowing. Nested batches commit into their parent and can be rolled back independently when their error is caught.
- Props are parent-owned reactive input; child writes fail in development/test mode.
- JSX values produced by the compiler preserve expression boundaries for text, props, styles, dynamic children, and component props.
- `ReactiveValue<T>` represents derived read-only state and can be used wherever reactive state can be read.
- Ordinary `items.map(render)` expressions in JSX become keyed framework lists when the item type declares `@exact key`; primitive string lists use their value. `this.map(collection, key, render)` remains the explicit escape hatch.
- A reactive collection has one stable keyed-list identity contract. Duplicate keys and conflicting extractors fail before reconciliation; eXact never silently falls back to positional matching because doing so would corrupt component identity.
- Context is descendant-scoped and is the service mechanism for logging, error handling, and app services.
- Errors flow through `ErrorContext`; boundaries are normal components that provide a new error context.
- The compiler rejects setup-time reactive snapshots captured by unmanaged async callbacks. Direct component-setup listeners on `window`, `document`, and `globalThis` are automatically moved into abort-owned client lifecycle tasks; nested unmanaged callbacks must use `this.task.client(...)`. Use `peek(() => value)` when an intentional snapshot is required.
- Browser rendering, DOM patching, DOM refs, delegated events, and CSS helpers live in `@exactjs/dom`.

The conformance suite in `packages/dom/src/conformance.test.ts` is the executable version of that contract. It covers reactive DOM bindings, keyed list identity, context overrides, error boundaries, logging overrides, and DOM refs.

## Development

```sh
npm install
npm run build
npm test
```

Create a standalone application with:

```sh
npm create exact-app@latest
```

The scaffolder offers Vite, Webpack, and Bun builds; every supported runtime adapter; Vitest or
Jest; and optional repo-local installation of the eXact Agent Skill.

## TypeScript compatibility

eXact applications use TypeScript 7 for editor support and command-line type-checking. eXact's
compiler, expression tooling, transforms, and test integrations currently use the stable
TypeScript 6 programmatic API. Those packages declare `typescript` as an npm alias of
`@typescript/typescript6`, allowing the API implementation to coexist safely with an
application's TypeScript 7 installation.

This split is required because TypeScript 7.0 does not ship a programmatic compiler API. The
repository builds against TypeScript 6 and runs a separate TypeScript 7 compatibility build so
application-facing types, JSX, and configuration remain compatible. The compiler integration can
move to TypeScript 7 after its new API is released and adopted.

The Kanban sample can be run from the workspace root:

```sh
npm run dev:kanban
npm run build:kanban
```

## Package Releases

Public `@exactjs/*` packages use one synchronized version. Internal dependencies use ordinary
semver ranges, so npm links matching local workspaces during development and preserves
registry-valid dependencies in published packages.

Prepare a version change from the workspace root:

```sh
npm run version:packages -- --version=0.2.0
npm install --package-lock-only --ignore-scripts
npm run check:publish
```

The version command updates every public package, every internal dependency range, and public
scope access together. `check:publish` rejects version drift and local dependency protocols
before dry-packing every public package. Private applications and fixtures remain outside the
published version set.

## Public Package Surface

The package entrypoints are:

- `@exactjs/reactive`
  - App/library surface: `reactive`, `computed`, `unwrap`, `peek`, `ref`, `subscribe`, `watch`, `flushSync`, `snapshot`, `isReactive`.
  - Types: `Reactive`, `ReactiveRef`, `ReactiveValue`, `ReactiveOptions`, `StopHandle`.
- `@exactjs/core`
  - App surface: `Component`, `Child`, `ContextToken`, `createContext`, `createRef`, `LoggerContext`, `createConsoleLogger`, `ErrorContext`, `createErrorContext`, logging and error types.
  - Framework/lower-level surface used by eXact packages and tests: vnode creation, component instance creation/rendering, compiled JSX helpers, and framework logging/error routing hooks.
- `@exactjs/request`
  - Ambient request URL and redirect context for SSR, with pluggable storage and a Node `AsyncLocalStorage` adapter.
- `@exactjs/router`
  - Nested history/hash routing through `Router`, `Route`, `Outlet`, `Link`, `NavLink`, `Navigate`, and `RouteContext`.
- `@exactjs/forms`
  - Accessible field composition and native/callback validation through `FormContext` and `FieldContext`.
- `@exactjs/testing`
  - Fluent component instances, state/context inspection, accessible DOM queries, user events, task settling, and Vitest/Jest matchers.
- `@exactjs/vitest`
  - Vite/eXact compiler setup, Vite 8 Oxc JSX configuration, automatic matcher installation, and the shared component-testing APIs.
- `@exactjs/jest`
  - Jest environment and matcher setup plus an eXact-aware TypeScript/TSX transformer.
- `@exactjs/jsx`
  - Root exports: `jsx`, `jsxs`, `Fragment`, `_`.
  - Automatic JSX subpaths: `@exactjs/jsx/jsx-runtime` and `@exactjs/jsx/jsx-dev-runtime`.
  - Keyed fragment marker: `_`.
  - JSX namespace types.
- `@exactjs/dom`
  - Browser app surface: `render(vnode, container, options?)`.
  - CSS helper surface: `px`, `rem`, `em`, `percent`, `vh`, `vw`, `vmin`, `vmax`, `fr`, `ms`, `s`, `deg`, `rad`, `turn`.
- `@exactjs/compiler`
  - Build-tool surface: `createCompilerSession`, `transform`, `transformSource`, `compileFile`, `compileProject`, `compileFileArtifacts`, `compileProjectArtifacts`, `createExactArtifactPlan`, `diffExactArtifactPlans`, `createExactArtifactDevState`, `updateExactArtifactDevState`, `readExactArtifactManifestEntries`, `exactExportConditions`, `resolveExactArtifactImport`, `createExactArtifactGraph`, `createPackageExportMap`, `createExactHydrationRegistrationModule`, the compatibility registry helpers, and `preprocessPropPunning`.
  - Semantic surface: `analyzeSource` and emitted manifests for component/task placement planning.
  - CLI: `exactc`.
- `@exactjs/plugin-host`
  - Runtime-safe surface: output transforms/validation and plugin resource lifecycle helpers. `@exactjs/plugin-host/runtime` is the explicit alias for this same platform-neutral surface.
  - Node preparation surface: `@exactjs/plugin-host/node` owns package discovery, configuration loading, registry preparation/invalidation, and generated plugin types.
  - Treat `@exactjs/plugin-host/node` as external when bundling build tooling; it intentionally loads application configuration and plugin entrypoints through the native Node module loader.
- `@exactjs/ssr`
  - Server render surface: `renderToString(vnode, options?)`, `renderToStringAsync(vnode, options?)`, `renderToStream(vnode, options?)`, `renderToDocumentStream(vnode, options?)`, `renderToHydratableDocumentStream(vnode, options?)`, `renderToProgressiveHtmlStream(vnode, options?)`, `renderToHydratableProgressiveHtmlStream(vnode, options?)`, `renderToProgressiveHtmlResponse(vnode, options?)`, `renderToHydratableProgressiveHtmlResponse(vnode, options?)`.
  - Hydration bootstrap surface: `renderHydrationScript(options?)`, `renderToHydratableString(vnode, options?)`, `renderToHydratableStringAsync(vnode, options?)`.
  - Server boundary surface: `createBoundaryRefreshHandler(render, options)`, `createActionRefreshHandler(options)`, `createExactServerHandlerRegistry(options)`, `createExactServerRuntime(options)`.
  - Emits deterministic comment markers for component, cell, dynamic, fragment, and keyed-list item boundaries.
  - Node plugin preparation: `prepareExactRenderPlugins` from `@exactjs/ssr/plugins`.
- `@exactjs/hydrate`
  - Client hydration surface: `hydrate(vnode, container, options?)`.
  - Client endpoint surface: `createExactClient(container, options?)`, `invokeExact(options)`, `readExactHydrationConfig(root?, scriptId?)`.
  - Patch surface: `applyPatches(container, patches, options?)`.
- `@exactjs/server`
  - Server runtime surface: `handleExactRequest(request, context)`.
  - Manifest bridge: `createExactServerManifest(compilerManifest | compilerManifest[], options?)`.
  - Hydration bridge: `createExactHydrationManifestConfig(serverManifest, state?)`, `createExactHydrationStateContracts(serverManifest)`, `createExactHydrationActionBoundaries(serverManifest)`.
  - Adapter helpers: `createFetchHandler`, `createExpressHandler`, `createHapiHandler`.
  - Security model: manifest-allowlisted action and boundary IDs only; no client-provided module or function dispatch.
  - Node plugin preparation: `prepareExactServerPlugins` from `@exactjs/server/plugins`.
- `@exactjs/hapi-adapter`
  - Hapi 21 plugin: register `exactHapiPlugin` with `{ runtime }` to mount the manifest endpoint with safe JSON payload defaults.
  - Direct handler: `createExactHapiHandler(runtime)` for applications that intentionally own their Hapi route configuration.
  - Converts Web response streams to Node streams and propagates Hapi client disconnects into the eXact request signal.
- `@exactjs/vite-plugin`
  - Vite adapter: `exact({ target?: "default" | "client" | "server" })`.
  - Adds `exact-client` or `exact-server` package export conditions based on the configured target.
  - Configures the `@exactjs/jsx` automatic runtime for Vite 8's Oxc transform.
- `@exactjs/webpack-plugin`
  - Webpack adapter: `new ExactWebpackPlugin({ target?: "default" | "client" | "server" })`.
  - Adds target package export conditions, `.exact` facade resolution helpers, and a pre-loader for TSX/JSX transforms.
- `@exactjs/bun-plugin`
  - Bun adapter: `exact({ target?: "default" | "client" | "server" })`.
  - Adds target package export conditions, `.exact` facade resolution, and TSX/JSX transform hooks.
  - Integration-tested with Bun 1.3.5 through the real `Bun.build()` API.

## JSX

The eXact rendering model is compiler-based. JSX expressions become fine-grained reactive DOM and component boundaries only when the eXact compiler runs. `@exactjs/jsx` supplies the TypeScript JSX entrypoints and JSX namespace types that the compiler toolchain expects; it is support infrastructure, not a second app runtime.

Configure TypeScript with `jsxImportSource` set to `@exactjs/jsx`:

```json
{
	"compilerOptions": {
		"jsx": "preserve",
		"jsxImportSource": "@exactjs/jsx"
	}
}
```

When React 18 or 19 is installed, the Vite, Webpack, and Bun adapters automatically enable the matching React compatibility runtime. TSX/JSX that references runtime values imported from `react` or `react-dom` is compiled as React JSX and directly imports the target-specific eXact compatibility modules, while type-only and unused React imports do not change JSX ownership. Explicit JSX directives take precedence:

```tsx
/** @jsxImportSource react */
export function ReactView() {
	return <button>React-compatible</button>;
}
```

Use `@jsxImportSource @exactjs/jsx` to force eXact ownership in a mixed file, `reactCompatibility.source` for import-free React component directories, an explicit `reactCompatibility.target` to override version detection, or `reactCompatibility: false` to disable automatic compatibility. Resolver aliases continue to cover precompiled React packages in `node_modules`; those packages do not need to be recompiled.

Compiler mode is build-tool agnostic through `@exactjs/compiler`:

```ts
import { transformSource } from '@exactjs/compiler';

const result = transformSource(source, { filename: 'Component.tsx' });
```

Long-running build tools should own their incremental compiler state and dispose it with the host lifecycle:

```ts
import { createCompilerSession, transformSource } from '@exactjs/compiler';

const session = createCompilerSession();
const result = transformSource(source, {
	filename: '/workspace/src/Component.tsx',
	session
});

session.invalidate('/workspace/src/Component.tsx'); // HMR update
session.dispose(); // watcher or development server shutdown
```

Sessions scope invalidation to affected TypeScript workspaces and remove virtual source, generated-source, and stable-identity state when a file is deleted.

Pass `sourceMap: true` to `transformSource()`, `compileFile()`, or artifact compilation APIs when generated output should carry a v3 source map back to the original source.

### Import placement and client assets

eXact uses import attributes when a module needs an explicit evaluation boundary. The compiler consumes the `exact` attribute, uses it for placement analysis, and removes it before the host bundler sees the module:

```ts
import './browser-registration.js' with { exact: 'client' };
import { readPrivateConfig } from './private-config.js' with { exact: 'server' };
```

Side-effect imports of `.css`, `.less`, and `.scss` default to client evaluation and client delivery. A value-bearing style import, such as a CSS module, remains available to both server and client evaluation while still being delivered as a client asset. The Vite, Webpack, and Bun adapters retain client asset edges during server compilation so their asset pipelines can extract and emit them.

Adapters can describe additional asset kinds with `assetRules`. Rules classify extensions or query forms as styles, images, video, audio, fonts, documents, data, workers, or other assets and record their import mode, evaluation target, and delivery target in manifest version 4. This keeps asset discovery generic; an adapter remains responsible for loading or emitting the actual file.

Callable APIs can declare where invocation is valid without making a mere reference to that value environment-specific:

```ts
/** @exact client */
declare function mountBrowserUI(): void;

/** @exact server */
declare function readPrivateConfig(): string;
```

An opaque helper invoked from an already-known client event callback or server task inherits that invocation boundary. Opaque exported components and unbounded module initializers remain placement errors rather than being guessed.

For projects that want a precompile step before their existing TypeScript build, use `exactc`:

```sh
npx exactc --rootDir src --outDir .exact src
npx exactc --rootDir src --outDir .exact --target server --manifest src
npx exactc --rootDir src --outDir .exact --artifacts src
npx exactc --rootDir src --outDir .exact --artifacts --serverComponents src
npx exactc --rootDir src --outDir .exact --sourceMap src
```

That rewrites `.tsx` files to `.ts` and `.jsx` files to `.js` under the output directory, preserving relative paths. Your normal TypeScript/bundler pipeline can then compile the generated sources.
`--target client|server` emits target-specific artifacts from the compiler's task placement analysis, and `--manifest` writes a sibling `.exact.json` manifest for the secure server runtime.
`--sourceMap` writes sibling `.map` files and appends `sourceMappingURL` comments to generated files.
`--artifacts` emits paired files for package/app multi-target builds:

- `Component.exact.client.ts`
- `Component.exact.server.ts`
- `Component.exact.manifest.json`

Packaged component libraries can publish these generated variants and let app build tooling choose the client or server file based on the render target.
The generated target files are real ESM modules that preserve named exports, so package authors can expose them through package export conditions and bundlers can tree-shake unused components independently. When an exported component splits, the server artifact also exports a deterministic server-part alias such as `ProjectCard_ExactServer_1`, and the client artifact exports generated client islands such as `ProjectCard_ExactClient_1`. The `.exact.manifest.json` file records the source file, target artifact paths, exported names, component render edges, generated symbols, and server-refreshable boundary IDs for resolver/runtime integration.
`createExactArtifactPlan()`, `diffExactArtifactPlans()`, `compileArtifactPlanEntries()`, `createExactArtifactDevState()`, `updateExactArtifactDevState()`, `readExactArtifactManifestEntries()`, `exactExportConditions()`, `resolveExactArtifactImport()`, and `createExactArtifactGraph()` are bundler-neutral primitives shared by the Vite, Webpack, and Bun adapters. The artifact plan and diff helpers let build tools coordinate watched source files with generated client/server/manifest outputs before running compilation, including added, removed, changed, and unchanged retained inputs. Dev servers can compile only the added and changed plan entries instead of rebuilding an entire project, and can pass retained `importedManifests` into `compileArtifactPlanEntries()` so changed files still split imports from unchanged client components. `createExactArtifactDevState()` and `updateExactArtifactDevState()` package that loop into a reusable state object: initial compile, changed-input diffing, retained manifest loading, selective compilation, and graph rebuild. `readExactArtifactManifestEntries()` loads generated `.exact.manifest.json` files back into graph-ready artifact entries, so long-running build tools can rebuild package exports, descriptor composition, and component edges without retaining compiler result objects in memory. `createPackageExportMap()` can turn `compileProjectArtifacts()` results or loaded manifest entries into package export entries with `exact-client` and `exact-server` conditions, so libraries can generate their multi-target `exports` map instead of hand-maintaining per-component paths. Compiled target artifacts attach client and server descriptors to their public component functions. Application entrypoints import the components they use and call `composeExactComponentDescriptors()`; `createExactHydrationRegistrationModule()` generates that composition together with endpoint routes, state contracts, and action boundary hints for `client.registerManifest(...)`. The older client-island and server-part registry entry/module helpers remain available for compatibility, but are not the component-package publication contract. `createExactArtifactGraph()` includes `componentEdges`, `clientIslands`, and `serverParts`.
When the compiler splits one authored component into generated server/client pieces, the authored root keeps its public name and generated pieces use deterministic names derived from it, such as `ProjectCard_ExactClient_1`. Manifest protocol identity should use stable generated IDs, not JavaScript function names, because bundlers and minifiers may rename local symbols.
Project artifact compilation now uses a manifest prepass, so a file that imports a client component from another eXact source file can split that imported tag out of its server artifact without a manual directive. The consuming server artifact keeps only the serialized boundary props and any server-owned child slot, while the manifest records the imported component ID from the producing file and the owner component ID from the consuming file. Server action hydration contracts use that owner ID so an action on `Page` can request the current HTML for `Page`-owned client boundaries before generating patches.
Imported client component aliases, default imports, and namespace imports keep the producing component's author boundary identity. For example, `import { ClientWidget as Widget }`, `import Widget from "./ClientWidget"`, and `<Widgets.ClientWidget />` can all emit a `ClientWidget` boundary, so hydration registries can stay keyed by stable component names instead of local binding names.
The Vite, Webpack, and Bun adapters also support `.exact` facade imports. With `target: "client"`, `import { ProjectCard } from "./ProjectCard.exact"` resolves to `ProjectCard.exact.client.ts`; with `target: "server"` it resolves to `ProjectCard.exact.server.ts`.
For packaged component libraries that publish `exact-client` and `exact-server` export conditions, the adapter target adds the matching resolver condition during setup.
Each adapter also accepts `importedManifests`, forwarding the same compiler manifest graph used by `compileProjectArtifacts()` into per-file transforms. That gives Vite, Webpack, and Bun the same imported client-component splitting behavior when a dev server or build pipeline has already collected package/project manifests.
Each adapter also accepts `manifestFiles`; those JSON files are read at transform time, so watch pipelines that regenerate `.exact.manifest.json` files can keep imported component classification fresh without recreating the plugin instance. Vite, Webpack, and Bun transform errors include the source filename before the compiler diagnostic text.
The Vite, Webpack, and Bun adapters pass source maps through to their host build tool by default; set `sourceMap: false` on the adapter options to disable that pass-through.
Server component mode is opt-in through `serverComponents: true` on compiler/artifact APIs and the Vite, Webpack, and Bun adapters. In that mode, client-target artifacts omit server-owned authored components while still walking them to emit generated client islands and pure client child components. Client-only builds leave this disabled.
For precompile workflows, `exactc --artifacts --serverComponents` enables the same split behavior.

In server-target artifacts, pure client components are emitted as server-safe boundary stubs instead of leaking browser-only code into the server bundle. Isomorphic components can still split simple interactive JSX islands such as elements with `onClick` or `ref` into server-rendered client-boundary placeholders. The compiler also splits clear client component tags out of server artifacts, replacing each tag instance with a source-stable boundary named after the client component and pruning imports that become unused after the split. Exported pure-client component stubs keep a component-level boundary ID, while rendered client component tag instances get distinct IDs so repeated tags and their server child slots can refresh independently. The client artifact preserves the interactive component and exports generated island aliases for element-level splits, which can be registered with the hydration client:

```tsx
import { hydrate } from '@exactjs/hydrate';
import { ProjectCard_ExactClient_1 } from './ProjectCard.exact';

hydrate(<App />, document.getElementById('app')!, {
	islands: {
		ProjectCard_ExactClient_1
	}
});
```

This first split path handles pure client component stubs, generated element islands inside isomorphic components, no-child client component islands, client component islands with JSON-safe text/expression children, and client component islands with JSX children rendered as server-owned child slots. Static props, spreads, exact `this.state.*` reads, child expressions, local captures, and other dynamic prop expressions are inferred and serialized into the boundary payload during server render, so the client can hydrate without a waterfall. JSX element children stay in the server artifact and hydrate through stable server-slot markers, letting client components render `props.children` without replacing server-owned DOM. Generated element islands can also keep server-owned child component subgraphs on the server when those children depend on server-only imports, so an interactive shell can hydrate on the client without pulling its server child into the browser bundle. The compiler emits those slots as `server-slot` manifest boundaries, and the hydration client can refresh a slot ID through the same secure endpoint while preserving the surrounding hydrated client island. Element islands get generated client components such as `ProjectCard_ExactClient_1`; the server sends a `__exactState` snapshot for state paths used by the island and a `__exactCapture` payload for owner-local values referenced by generated island handlers or children. Component-local function declarations and function-valued local variables captured by an island are cloned into the generated client component instead of being serialized. The generated client component initializes its local state from that snapshot before rendering the interactive element and its children. Boundary props must evaluate to JSON-serializable values; non-serializable values fail during server rendering. More advanced arbitrary closure capture, endpoint-backed boundary data, and expression-level distributed execution remain compiler/runtime expansion points.

Vite is supported through a thin adapter over the same compiler:

```ts
import { exact } from '@exactjs/vite-plugin';

export default {
	plugins: [exact()]
};
```

The compiler preserves JSX expressions as reactive bindings, so ordinary JSX values can update at their owning text, prop, style, child, or component-prop boundary. Uncompiled JSX may create structural VNodes in narrow tests, but it does not preserve arbitrary expression boundaries after JavaScript has evaluated them. Apps should use `@exactjs/vite-plugin` or `exactc`.

Browser apps mount through `@exactjs/dom`:

```tsx
/** @jsxImportSource @exactjs/jsx */
import { render } from '@exactjs/dom';
import type { Component } from '@exactjs/core';

function Counter(this: Component<{ count: number }>) {
	this.state.count = 0;

	return () => <button onClick={() => this.state.count++}>{this.state.count}</button>;
}

render(<Counter />, document.getElementById('app')!);
```

`render()` accepts root options for framework-level services:

```tsx
import { createConsoleLogger } from '@exactjs/core';
import { render } from '@exactjs/dom';

const logger = createConsoleLogger({ level: 'debug' });

render(<App logger={logger} />, document.getElementById('app')!, { logger });
```

If no logger is provided, eXact uses its default console logger.

Runtime renderer boundaries use quiet text anchors by default so component/cell/dynamic boundaries do not clutter the browser Elements panel. To inspect those internal boundaries while debugging the renderer, opt into named marker comments:

```ts
render(<App />, document.getElementById("app")!, { debugMarkers: true });
```

## Keyed Lists

Use ordinary `Array.map()` in compiled JSX. Mark the stable identity member on the item type; the compiler lowers the expression to the framework's keyed-list protocol. The framework owns the JSX `key`, so item JSX does not specify it.

```tsx
type Todo = {
	/** @exact key */
	id: string;
	text: string;
};

function TodoList(this: Component<{ todos: Todo[] }>) {
	this.state.todos = [];

	return () => (
		<ul>
			{this.state.todos.map((todo) => (
				<li>{todo.text}</li>
			))}
		</ul>
	);
}
```

`/** @exact key=id */` on the object type is equivalent. A zero-argument string-returning method may also carry `/** @exact key */`. String arrays use each item as their key. Duplicate keys still fail deterministically at runtime. Use `this.map()` when an explicit selector is clearer or when a callback needs native `map` index/array semantics.

## Component API

Component functions construct component instances. They run once, initialize instance state/services, and return a render function:

```tsx
function Counter(this: Component<{ count: number }>) {
	this.state.count = 0;

	this.onMount(() => this.log.info('mounted'));
	this.task(({ signal }) => {
		void signal;
	});

	return () => <button onClick={() => this.state.count++}>{this.state.count}</button>;
}
```

The main instance APIs are:

- `this.state`: reactive instance-owned state.
- `this.reactive(...)`: explicit derived reactive values for runtime-only code and advanced escape hatches.
- `this.task(...)`: inferred run-once or dependency-driven work with `AbortSignal` cleanup. Tasks are setup declarations and must be registered directly while the component function is executing; registering from render functions, callbacks, or later async continuations is rejected by the compiler and runtime.
- `this.task.server(...)` / `this.task.client(...)`: explicit compiler placement escape hatches for SSR/server-component builds; explicit server tasks may not reference browser-only globals, and explicit client tasks may not reference server-only imports.
- `this.map(collection, key, render)`: keyed list rendering with framework-managed keys.
- `this.getContext(...)` / `this.setContext(...)`: descendant-scoped services.
- `this.ref(...)` / `this.refs`: DOM ref binding and lookup.
- `this.onMount(...)` / `this.onUnmount(...)` / `this.onRender(...)`: lifecycle hooks.
- `this.log`: component-scoped logging.

### Compiler-owned task resources

Compiled task bodies automatically tie asynchronous work and disposable browser resources to the current task generation. Authors can use the platform APIs directly: eXact cancels timers, animation and idle callbacks, fetches, and observers; closes `WebSocket`, `EventSource`, and `BroadcastChannel`; terminates `Worker`; and disposes recognized subscriptions and `Disposable`/`AsyncDisposable` values when a task reruns or its component unmounts.

Nonstandard package contracts can use the compiler's closed annotation vocabulary. `@exact cleanup=release` on a resource type (or bare `@exact cleanup` on its method) describes legacy disposal; `@exact own` on a return type or local binding transfers lifecycle ownership; and `@exact track` on a calculation callback parameter makes safe callback-derived calculations eligible for reactive caching. Standard `AbortSignal`, `Symbol.dispose`, and `Symbol.asyncDispose` contracts are inferred and need no annotation. Unknown annotation keys are compile errors.

The compiler also inspects callable signatures. When an optional parameter is an `AbortSignal`, or an options object has a typed `signal?: AbortSignal` property, the generated call receives the task signal automatically while preserving an author-supplied signal and options. This includes `fetch()` and project APIs with the same typed contract:

```ts
this.task(this.state.projectId, async (projectId) => {
	const response = await fetch(`/api/projects/${projectId}`);
	const result = await client.loadProject(projectId, { cache: 'reload' });
	this.state.project = await response.json();
	this.state.related = result;
});
```

Resource values may be used locally for the duration of the task. Returning an explicit cleanup function remains supported and suppresses automatic ownership. Letting an owned resource escape through component state, an outer variable, a returned value, or an unknown call is a compile error because the framework could no longer guarantee its lifetime. Disposal failures are reported through the nearest `ErrorContext` as task failures.

## Error Boundaries

Errors are delivered through `ErrorContext`. A component becomes an error boundary by providing an error receiver for descendants. Its render function can then decide whether to show errors, hide children, keep rendering, or report the failures elsewhere:

```tsx
import {
	ErrorContext,
	createErrorContext,
	type Child,
	type Component,
	type ErrorReport
} from '@exactjs/core';

function Boundary(
	this: Component<{ errors: ErrorReport[] }>,
	props: { children?: Child | Child[] }
) {
	this.state.errors = [];
	const errors = createErrorContext(this.state.errors);
	this.setContext(ErrorContext, errors);

	return () =>
		this.state.errors.length ? (
			<section role="alert">
				<h2>Something went wrong</h2>
				{this.map(
					this.state.errors,
					(error) => error.id,
					(error) => (
						<article>
							<pre>{String(error.error)}</pre>
							<button type="button" onClick={() => errors.clear(error)}>
								Clear
							</button>
						</article>
					)
				)}
				<button type="button" onClick={() => errors.clearAll()}>
					Clear all
				</button>
			</section>
		) : (
			props.children
		);
}
```

Failures include construction, render, event, task, lifecycle, reactive, and DOM phases. Components can also report errors without throwing:

```ts
this.getContext(ErrorContext).report(new Error('Save failed'), {
	source: 'component',
	phase: 'save'
});
```

If no component-provided `ErrorContext` receives the failure, eXact's root context records all reported errors and renders them in place of the app.

Task failures are captured for both synchronous throws and rejected promises. Lifecycle cleanup continues even when one cleanup handler throws.

## Reactive Values

In compiler mode, ordinary JSX expressions and task dependency arguments are reactive expression positions. Safe derived `const` values that read component state or props are inferred by the compiler, so everyday code can stay plain:

```tsx
function Profile(this: Component<{ firstName: string; lastName: string; saving: boolean }>) {
	const fullName = `${this.state.firstName} ${this.state.lastName}`;
	const tone = this.state.saving == true ? 'gray' : 'black';

	this.task(fullName, (name, { signal }) => {
		void signal;
		console.log(name);
	});

	return () => (
		<span title={fullName} style={{ color: tone }}>
			{fullName}
		</span>
	);
}
```

The compiler infers conservative derived consts: identifier declarations whose initializers are side-effect-free expressions over `this.state`, component props, or other inferred derived consts. Setup-level derived consts become shared lazy cells, so multiple JSX, list, and task consumers reuse one cached calculation. Collection callbacks may mutate values declared inside the callback, but cannot mutate captured values. Calls outside the recognized collection methods, `new`, `await`, captured assignments, increment/decrement, and nested function/class bodies remain outside automatic inference. Use `this.reactive(() => ...)` when you need an explicit runtime reactive value or when runtime-only code needs source identity.

Reactive values are cached after first use and recompute when their tracked dependencies change. Structurally equal plain objects and arrays retain the previously published identity, so repeated API-shaped calculations neither invalidate consumers nor churn list identities. Component-owned derived subscriptions are released automatically during unmount.

`this.reactive()` returns a component-scoped `ComponentReactiveValue`, which extends the base
`ReactiveValue` contract with a `.task()` registration shorthand. A `ReactiveValue` created
directly through `@exactjs/reactive` does not have that method. Pass any reactive value to
`this.task(reactiveValue, work)` when the general form is clearer.

In compiler mode, selected API arguments are treated as reactive expression positions. This means:

```ts
const query = this.reactive(this.state.query);

query.task(async (query, { signal }) => {
	void signal;
	console.log(query);
});
```

is compiled as if it had been written with an explicit expression boundary:

```ts
const query = this.reactive(() => this.state.query);
```

The component-scoped shorthand above registers the same dependency relationship as:

```ts
this.task(query, async (query, { signal }) => {
	void signal;
	console.log(query);
});
```

`this.task(dep, ..., work)` dependency arguments are captured the same way in compiler mode. Runtime-only code should use explicit lambdas or existing reactive values when source identity matters.

Reactive state fields read as normal JavaScript values. In compiler mode, expression positions preserve the reactive source:

```ts
this.reactive(this.state.query);
this.task(this.state.query, async (query) => {});
```

Runtime-only code should write the expression boundary explicitly:

```ts
this.reactive(() => this.state.query);
this.reactive(() => this.state.query).task(async (query) => {});
```

JSX elements are internally mounted through cell boundaries. In compiler mode, expression cells and `ReactiveValue`s let the renderer patch an already chosen JSX subtree in place without rerunning unrelated component code.

## SSR And Hydration

For the end-to-end server component build/runtime flow, see
[docs/server-components.md](docs/server-components.md). The native adoption
roadmap, server/request context direction, component-package contract, rendering
safety policy, and generalized data/secret policy are consolidated in
[docs/native-ssr-adoption-and-data-policy.md](docs/native-ssr-adoption-and-data-policy.md).

The current SSR/server-component foundation implements:

- `@exactjs/ssr` renders VNodes/components to HTML with boundary markers.
- `renderToStringAsync()` waits for observed `this.task()` promises before rendering the component instance, so server-loaded reactive state can be serialized into the first response. Synchronous, asynchronous, and progressive SSR own every constructed component and unmount it after the render or stream ends; cancellation aborts tasks and releases component resources in child-first order.
- `renderHydrationScript()` serializes endpoint/state bootstrap data as inert escaped JSON.
- Hydration state and state contract payloads must be JSON-serializable; validation is side-effect-free and bounded by `maxHydrationDepth`, `maxHydrationNodes`, and `maxHydrationBytes` (defaults: 100 levels, 100,000 values, and 16 MiB).
- `@exactjs/hydrate` automatically reads bootstrap data from the hydration script, invokes the configured endpoint, and applies returned patches. Server child slots use the same refresh flow: if a refresh ID targets `data-exact-server-slot`, the client sends that slot's current `innerHTML` as the diff hint and applies text/replacement patches inside the slot without replacing the hydrated client island around it.
- Dynamically registered hydration manifests are idempotent for identical metadata and reject conflicting endpoint routes, state contracts, action boundary hints, transports, or client island component names.
- `@exactjs/hydrate` coalesces same-tick action and refresh operations into a strict `type: "batch"` endpoint request. Batch operations are validated independently and dispatched in dependency waves; independent ready operations run concurrently while results preserve request order. Server contexts can tune bounded protocol budgets with `limits.maxBatchOperations`, `maxBatchConcurrency`, `maxJsonDepth`, `maxJsonNodes`, `maxRequestBytes`, `maxResponseBytes`, `maxPatches`, `maxStreamEvents`, and `maxStreamBytes`. Client transports have corresponding `streamLimits` controls. Malformed top-level requests still fail as a whole, while operation-level errors return ordered per-operation results. Operations may include unique `opId` values and `dependsOn` metadata; dependent operations are skipped with `dependency_failed` when a prerequisite did not succeed.
- Endpoint responses can stream as newline-delimited JSON when clients opt in with `stream: true` / `Accept: application/x-ndjson`. Streamed batches emit `start`, per-operation `patch`/`state`/`html` chunks, terminal `result` events, and `complete`; independent operation chunks may arrive as soon as they settle while client helpers still resolve in request order. Producers use zero-prefetch demand flow, adapters honor writable backpressure and cancellation, malformed UTF-8 is rejected, and every response/result/chunk is checked against the requested operation identity before application.
- Initial document rendering can stream as newline-delimited JSON through `renderToDocumentStream()` / `renderToHydratableDocumentStream()`. Document streams emit `start`, `shell`, optional root `replace` when async server tasks settle into different HTML, optional `hydration`, and `complete`. Apps that want browser-ready chunks instead of event objects can use `renderToProgressiveHtmlStream()` / `renderToHydratableProgressiveHtmlStream()`, which stream the shell in a root container and send later root replacements as safe inline scripts. `renderToProgressiveHtmlResponse()` / `renderToHydratableProgressiveHtmlResponse()` package those streams as runtime-neutral `ExactResponseLike` objects for server adapters.
- Action invocations can opt into server boundary snapshots through `actionBoundaries`, either in `renderHydrationScript()`/`renderToHydratableString()` bootstrap data or in `createExactClient()` options. The client sends current HTML only for configured boundary IDs, and `@exactjs/server` rejects snapshot IDs that are not present in the manifest boundary allowlist.
- `createActionRefreshHandler()` runs an allowlisted server action, rerenders configured server boundaries, and returns replacement/text/exact-element patches using the submitted boundary snapshots as diff hints.
- Hydration bootstrap data may include per-action state contracts; when present, the client sends only the exact state reads required for that action.
- `@exactjs/server` owns adapter-neutral request handling and rejects anything not present in the manifest allowlist.
- `createExactServerManifest()` converts one or more compiler manifests into runtime action/boundary allowlists, including compiler-generated client island boundary IDs. Conflicting duplicate action or boundary IDs across compiler manifests fail during manifest creation; app-provided boundary overrides remain explicit.
- `createExactHydrationStateContracts()` extracts the compiler-derived action state contracts for `renderHydrationScript()` / `@exactjs/hydrate`.
- If the manifest includes an endpoint path, the shared handler rejects requests for any other path before dispatching.
- Request, response, and patch protocol objects are strict: unknown fields are rejected instead of being forwarded through the server runtime, and the hydration client validates successful response shapes before applying patches.
- `createBoundaryRefreshHandler()` rerenders a server boundary and returns patches through the same secure endpoint path. It defaults to boundary replacement, can emit text patches for text-only boundary output with `patchStrategy: "text"`, and can diff compiler-assigned `data-exact-id` elements with `patchStrategy: "element"`, including nested text, prop, style, and independent nested structural replacements. `@exactjs/hydrate` includes the current boundary HTML on refresh requests as a diff hint; the server still renders authoritative next HTML and falls back to boundary replacement if the hint cannot be used safely. Refresh responses include that authoritative HTML, so the client can replace the refreshed boundary if a fine-grained patch cannot apply cleanly.
- `renderKeyedListSnapshot()` and `createKeyedListRefreshHandler()` produce key-stable list/item marker snapshots and return list insert/move/remove patches through the secure endpoint. Compiled `this.map()` calls receive stable list boundary IDs that SSR uses as exact marker targets. The keyed-list refresh handler can infer the previous snapshot from the boundary HTML that `@exactjs/hydrate` sends on refresh, while `diffKeyedListItems()` remains available as the lower-level primitive for custom snapshot storage.
- `this.task(...)` placement is inferred by the compiler. Use `this.task.server(...)` or `this.task.client(...)` only when inference needs an explicit boundary; contradictory environment usage fails compilation.
- Compiler manifests include state read/write contracts for server-capable tasks and context contracts for `this.getContext(...)` / `this.setContext(...)` usage. The server runtime validates exact state reads and serialized context tokens on action requests before dispatch, giving server actions a narrow data/context contract instead of requiring whole-app state or arbitrary client-provided context by default.

Example:

```tsx
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableStringAsync } from '@exactjs/ssr';

const server = await renderToHydratableStringAsync(<App />, {
	endpoint: '/__exact',
	state: { userId: 'u1' }
});

hydrate(<App />, document.getElementById('app')!);
```

Server components are not yet a complete production distributed component protocol. The pieces now in place are the semantic compiler manifest, client/server compiler targets, secure generic endpoint, dependency-aware concurrent batched action/refresh dispatch, streamed endpoint result events, initial document event streams, progressive initial HTML streams and neutral response helpers, hydration state exchange, server boundary replacement patches, text/exact-element boundary diffs, independent nested structural element replacements, compiler-assigned list boundary IDs, key-stable list snapshot patch helpers, inferred list snapshots from submitted boundary HTML, refreshable server child slots, action-triggered boundary refresh helpers, per-instance client component boundaries, server-part artifact aliases, generated client islands, manifest-driven imported client component splitting, context contract metadata with endpoint validation, bundler-neutral artifact graph metadata, incremental artifact plan compilation with retained manifest inputs, reusable dev-server artifact state helpers, component-attached descriptors with generated hydration composition, immediate hydration for registered remote islands, and thin Vite/Webpack/Bun adapters. The remaining work is richer distributed patch semantics and production integration guidance.

## Logging

Every component instance has a logger facade:

```tsx
function SaveButton(this: Component<{}>) {
	return () => (
		<button
			onClick={() => {
				this.log.info('saving');
			}}
		>
			Save
		</button>
	);
}
```

Supported levels are `trace`, `debug`, `info`, `warn`, and `error`. Log message, data, and error arguments can be lazy functions; disabled levels do not evaluate those functions:

```ts
this.log.trace(
	() => `patching ${items.length} items`,
	() => ({ items })
);
```

Errors are preserved as native console error arguments:

```ts
this.log.error('save failed', error, { taskId });
```

Apps can override component logging through context:

```tsx
import { LoggerContext, createConsoleLogger } from '@exactjs/core';

function App(this: Component<{}>) {
	this.setContext(LoggerContext, createConsoleLogger({ level: 'debug' }));
	return () => <Dashboard />;
}
```

Framework diagnostics use the root logger passed to `render()`. The default console logger prints `info` and above; `trace` and `debug` are opt-in.

## Web essentials

`@exactjs/router` supplies component-reference routes with nested outlets. `Router` uses an explicit `LocationSource` when supplied, otherwise it reads the ambient server request or the browser History API:

The planned renderer-neutral data-router core and versioned React Router v5
and v6/v7 compatibility facades are specified in the
[React Router compatibility plan](docs/react-router-compatibility-plan.md).

```tsx
import { Link, Outlet, Route, Router } from '@exactjs/router';

function Layout() {
	return () => (
		<main>
			<nav>
				<Link to="/users">Users</Link>
			</nav>
			<Outlet />
		</main>
	);
}

render(
	<Router basename="/app">
		<Route component={Layout}>
			<Route index component={Home} />
			<Route path="users/:id" component={User} />
			<Route path="*" component={NotFound} />
		</Route>
	</Router>,
	document.getElementById('app')!
);
```

For Node SSR, install concurrency-safe storage once and wrap each render. Other runtimes can implement the small `RequestContextStorage` contract:

```ts
import { installNodeRequestContext } from "@exactjs/request/node";
import { runWithRequestContext } from "@exactjs/request";

installNodeRequestContext();
const result = await runWithRequestContext(
  { url: new URL(request.url), redirect: (location, status) => recordRedirect(location, status) },
  () => renderToStringAsync(<App />)
);
```

The built-in portable storage is intentionally synchronous and throws if a callback returns a promise, preventing silent request-context leakage. Use `@exactjs/request/node` (or provide an async-safe storage implementation) before wrapping asynchronous SSR work. `createRequestScope()` creates an independent synchronous scope when no storage is supplied.

History mode supports SSR directly. Hash fragments are not sent in HTTP requests, so hash-mode SSR needs an explicit fragment-bearing `LocationSource` when server and client matching must agree.

`@exactjs/forms` composes accessible fields without taking ownership of application values:

```tsx
<Form onValidSubmit={(_event, data) => save(data)}>
	<Field
		name="email"
		required
		validate={(value) => String(value).includes('@') || 'Enter an email'}
	>
		<Label>Email</Label>
		<Input type="email" />
		<FieldHelp>We will only use this for account messages.</FieldHelp>
		<FieldError />
	</Field>
	<button type="submit">Save</button>
</Form>
```

Fields validate on first blur and submit, then revalidate invalid values on input. Callback validators may be asynchronous; stale results are ignored. Repeated field names must supply distinct `id` values.

## Component testing

`@exactjs/testing` mounts real DOM-rendered components and exposes their framework instances through a runner-neutral fluent API:

```tsx
const view = await testComponent(Counter).props({ initial: 1 }).context(AuthContext, auth).mount();

await view.root.setState({ count: 2 });
await view.root.getByRole('button', { name: 'Increment' }).click();

expect(view.root.state().count).toBe(3);
expect(view.root.find(Status).context(AuthContext)).toBe(auth);
view.unmount();
```

Queries are available by selector, role/name, label, visible text, and `data-testid`. Singular queries reject missing or ambiguous matches. State and event actions flush reactive rendering and await observed component tasks; use `{ settleTasks: false }` for intentionally long-lived work, `view.flush()` for synchronous rendering only, or `view.settle()` explicitly.

Use the runner integrations to install matchers and compiler behavior together:

```ts
import { exactVitest } from '@exactjs/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [exactVitest()],
	test: { environment: 'jsdom' }
});
```

`@exactjs/jest` provides equivalent matchers, jsdom setup, and the eXact TypeScript/TSX
transformer. The lower-level `@exactjs/testing/vitest` and `@exactjs/testing/jest` entrypoints
remain available for custom runner configurations.

## Compiled JSX Conveniences

Compiler mode supports normal fragment shorthand for unkeyed fragments:

```tsx
<>
	<span />
</>
```

Use the reserved `_` tag for keyed or prop-bearing fragments:

```tsx
<_ key={id}>
	<span />
</_>
```

Prop punning lowers a local binding into a same-named prop:

```tsx
<UserCard {user} {selected} />
```

`class` and `className` accept plain strings, arrays, and truthy maps:

```tsx
<div className="panel active" />
<div className={["panel", isActive && "active"]} />
<div className={{ panel: true, active: isActive }} />
```

`style` accepts plain CSS strings, plain objects, reactive entries, and CSS unit helpers from `@exactjs/dom`:

```tsx
import { percent, px, rem } from "@exactjs/dom";

<div style="height: 10px; margin-top: 1rem" />
<div style={{ height: "10px", marginTop: "1rem" }} />
<div style={{ height: px(this.state.height), marginTop: rem(this.state.top), width: percent(this.state.progress) }} />
```

The v1 unit helpers are `px`, `rem`, `em`, `percent`, `vh`, `vw`, `vmin`, `vmax`, `fr`, `ms`, `s`, `deg`, `rad`, and `turn`.

Form controls can bind a DOM property to one writable reactive location through the native
`input` or `change` event. The namespaced attribute spells this as `property:event`:

```tsx
<input value:input={this.state.query} />
<input type="number" value:change={this.state.quantity} />
<input type="checkbox" checked:change={this.state.enabled} />
<input type="checkbox" value="priority" checked:change={this.state.filters} />
<textarea value:input={this.state.notes} />
<select value:change={this.state.status}>...</select>
<select multiple value:change={this.state.tags}>...</select>
```

The compiler infers string, number, `Date`, array, `null`, and `undefined` conversion from
the bound location's type. Radio inputs bind their checked state to their declared value;
checkboxes bound to string or number arrays add and remove their declared value.
Bindings require one assignable member or element access; derived expressions, conflicting
`value`/`checked` props, and ambiguous `null | undefined` unions are compile errors. Binding
listeners are independent from authored `onInput` and `onChange` handlers.

## Parcel Lab demo

`apps/shipping-calculator` is a progressive-SSR, server-components shipping calculator with reactive streamed rate updates, a credential-free DOOP provider, optional live-carrier adapters, and one responsive modern-CSS component tree. Run it with `npm run dev:shipping`; see the app README for provider configuration and data-handling notes.
