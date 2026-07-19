# React Ecosystem Adapter Plan

## Purpose

eXact can run many existing React libraries through `@exact/react-compat`, but doing so retains the React compatibility runtime and its associated rendering, hook, context, and bundle costs. The adapter system described here provides a progressive path from an unchanged React package to a native eXact integration while allowing migrated and unmigrated components to share the same store, client, cache, and descendant-scoped services.

The system must work for application source processed by the eXact compiler and for already-published JavaScript packages whose JSX has been lowered to `react/jsx-runtime` or `React.createElement`. The initial implementation targets the repository's current Node and Vite stack. Webpack, Bun, and other hosts follow after the common discovery and transformation engine has been proven through Node and Vite without requiring host-specific semantic implementations.

React Router requires version-conditioned component, hook, helper, and factory
substitutions selected from the actual resolved source package instance. Its
detailed core, compatibility, SSR, and conformance program is specified in
[react-router-compatibility-plan.md](react-router-compatibility-plan.md). That
plan extends the generic protocol defined here; it does not introduce a
router-specific registry.

## Goals

- Let an installed eXact adapter replace selected React package component exports with native eXact components.
- Rewrite public React and React DOM imports directly to eXact compatibility entrypoints instead of relying primarily on package aliases.
- Apply substitutions to authored source and eligible prepackaged ESM or CommonJS dependencies.
- Keep native adapter entrypoints free of React and React compatibility dependencies.
- Preserve tree shaking: installing an adapter must add no application code unless one of its replacements is used.
- Share service instances and descendant context across alternating eXact and React compatibility layers.
- Discover adapters below an application framework in the dependency graph without per-application bundler configuration.
- Give the application final authority to ignore transitively discovered adapters.
- Keep registration policy and transformation behavior host-neutral so later Webpack, Bun, and other integrations can reuse the Node/Vite-proven core.

## Non-goals

- Replacing provider implementations that a published dependency has copied into its own bundle without retaining an identifiable module/export boundary.
- Reproducing arbitrary runtime component provenance after a component has escaped through opaque higher-order functions or dynamic registries.
- Allowing third-party adapters to replace eXact internals, the core React runtime mapping, Node built-ins, URLs, or arbitrary files.
- Automatically translating React hooks into native eXact APIs. Each native adapter owns its public API and migration guidance.
- Making native adapters depend on their corresponding React binding packages.

## Terminology

- **Source package**: the React ecosystem package whose export is referenced, such as `@tanstack/react-query`.
- **Adapter package**: the eXact package that declares substitutions and provides native replacements, such as `@exact/tanstack-query`.
- **Replacement**: a public component export provided by the adapter package.
- **Marker package**: the zero-runtime package that identifies participants in the adapter protocol and versions its metadata contract.
- **Build root**: the nearest application or workspace package selected by the host integration for the current build.
- **Compatibility-owned module**: code that must continue to execute through React compatibility.
- **eXact-owned module**: code compiled and executed as native eXact code.

## Package protocol

### Marker package

Create `@exact/react-compat-adapter-api` as a zero-runtime protocol package. It should contain TypeScript types, schema constants, metadata validation helpers, and adapter-author documentation. It must not import React or participate in browser rendering.

An adapter must declare a direct dependency on the marker package. The direct dependency edge is the transitive discovery signal and the dependency range declares the protocol generation the adapter expects.

```json
{
	"dependencies": {
		"@exact/react-compat-adapter-api": "^1.0.0"
	}
}
```

### Adapter metadata

The adapter package's `package.json` is the only substitution metadata source. There is no separate manifest and no executable registration script.

```json
{
	"name": "@exact/tanstack-query",
	"exact": {
		"reactCompatibility": {
			"schemaVersion": 1,
			"substitutions": {
				"@tanstack/react-query": {
					"version": ">=5 <6",
					"exports": {
						"QueryClientProvider": {
							"subpath": "./provider",
							"export": "QueryClientProvider"
						},
						"QueryErrorResetBoundary": {
							"subpath": "./provider",
							"export": "QueryErrorResetBoundary"
						}
					}
				}
			}
		}
	},
	"exports": {
		".": "./dist/index.js",
		"./provider": "./dist/provider.js"
	}
}
```

Replacement modules are expressed as package-relative public subpaths. The normalized target for the first mapping above is `@exact/tanstack-query/provider#QueryClientProvider`. The schema deliberately has no arbitrary target package field.

The single `version` plus `exports` form above is the one-variant shorthand.
Adapters that support incompatible source-package API families may instead
declare non-overlapping `variants`, each with its own version range and export
map. Discovery normalizes both forms into variants and selects one from the
actual source package instance resolved from the importer. The
[React Router compatibility plan](react-router-compatibility-plan.md) defines
the motivating duplicate-major behavior.

### Application policy

The build root can suppress discovered adapters in its own `package.json`:

```json
{
	"exact": {
		"reactCompatibility": {
			"ignoreAdapters": ["@company/legacy-redux-adapter", "@exact/tanstack-query"]
		}
	}
}
```

Only the build root's ignore policy applies. A dependency cannot suppress another dependency's adapter. Package-level suppression is the initial supported granularity; individual substitution suppression should be added only in response to a demonstrated use case.

## Protocol rules

1. An adapter may replace an import only with a public export that the declaring adapter package itself provides.
2. Replacement subpaths must exist in the adapter package's `exports` map and resolve for the active client or server conditions.
3. Source modules must be bare package specifiers. Relative paths, absolute paths, URLs, and Node built-ins are invalid.
4. Every substituted source export must be named explicitly. Wildcard export substitutions are not supported initially.
5. Every source package mapping or normalized source variant must declare a
   supported semantic version range; variant ranges for one source module
   cannot overlap.
6. The adapter must directly depend on `@exact/react-compat-adapter-api` using a compatible protocol range.
7. Third-party adapters cannot replace `@exact/*`, `react`, `react-dom`, or their public subpaths. Core React runtime rewriting remains owned by eXact.
8. Substitution is one-pass. A replacement output is never fed back through the substitution table.
9. Two active adapters cannot claim the same resolved source package instance,
   subpath, and export. Conflicts fail before source transformation; ordering
   and last-wins behavior are forbidden. Distinct installed source instances
   may select different non-overlapping version variants.
10. Multiple incompatible installed versions of one adapter package fail the build unless the resolver can prove that they belong to isolated build roots.
11. Metadata is inert JSON. Discovery never executes dependency package code.
12. Application ignore policy is applied before conflict and source-version validation.
13. The transformer must preserve an original import when the binding has non-substituted runtime uses.
14. Diagnostics must identify the adapter package and version, source package and version, source export, replacement export, and build root.

## Discovery

### Package graph query

The conceptual query is the equivalent of:

```sh
npm ls @exact/react-compat-adapter-api
```

The implementation should not shell out to npm during normal builds. Instead, React compatibility should consume a package-graph abstraction capable of finding packages with a direct dependency edge to the marker:

```ts
interface ExactPackageGraph {
	packagesDependingDirectlyOn(name: string): readonly ExactPackageNode[];
	manifest(node: ExactPackageNode): ExactPackageManifest;
}
```

Initial support should load the npm lockfile format used by this repository. Later providers should cover pnpm, Yarn Plug'n'Play or lockfiles, and Bun. An installed-tree traversal is the fallback when no supported package graph is available. Direct build-root dependencies are the final conservative fallback.

Physical hoisting must not determine authority. Discovery follows logical dependency edges from the package graph so a root-hoisted marker still identifies the adapter packages that declared it.

### Discovery lifecycle

1. Locate the build root and package-manager identity.
2. Load or reuse the package graph.
3. Find direct reverse dependents of the marker package.
4. Read and validate each candidate's `exact.reactCompatibility` metadata.
5. Apply the build root's `ignoreAdapters` policy.
6. Resolve adapter replacement subpaths from the declaring package instance.
7. Validate protocol versions, source package variants, public exports, and
   conflicts against resolved source package instances.
8. Freeze a normalized resolved-instance substitution table for the build.

Cache discovery by build root, package-manager identity, root manifest signature, lockfile signature, and protocol major. Watch the root manifest, lockfile, and active adapter manifests in development.

## Shared implementation boundary

React-specific discovery and rewriting belong publicly to `@exact/react-compat/plugin`. Generic AST, binding, edit, and source-map primitives remain in `@exact/compiler` or `@exact/expressions` so the dependency direction remains:

```text
@exact/react-compat/plugin
        -> generic compiler rewriting utilities
```

The compiler must not import React compatibility or know about individual ecosystem packages. If build-only dependencies make the runtime `@exact/react-compat` package materially heavier when published, split the build surface into `@exact/react-compat-build` without changing the protocol.

The common build API should normalize host inputs and outputs:

```ts
interface ReactCompatibilityBuildEngine {
	transformModule(input: {
		id: string;
		source: string;
		format: 'module' | 'commonjs';
		target: 'client' | 'server';
	}): ReactCompatibilityTransformResult;

	invalidate(file: string): void;
}
```

The result should contain transformed code, source map, changed status, watch files, dependency IDs, and structured diagnostics. Node, Vite, and ahead-of-time builds must call the same engine initially. Later host integrations must consume that engine rather than introduce independent substitution behavior.

## Transformation pipeline

### Fast path

Most dependencies are irrelevant. Before parsing, scan for public React module specifiers and source module specifiers present in the active substitution table. Return unchanged immediately when none are present.

### Core React imports

Rewrite public React imports directly to target-specific compatibility entrypoints:

```text
react                         -> @exact/react-compat/react18|react19
react/jsx-runtime             -> @exact/react-compat/jsx-runtime18|jsx-runtime19
react/jsx-dev-runtime         -> @exact/react-compat/jsx-dev-runtime18|jsx-dev-runtime19
react/compiler-runtime        -> @exact/react-compat/compiler-runtime
react-dom                     -> @exact/react-dom-compat/react18|react19
react-dom/client              -> @exact/react-dom-compat/client18|client19
react-dom/server*             -> matching server compatibility entrypoint
react-dom/static*             -> matching React 19 static entrypoint
```

Resolver aliases remain as a transitional fallback for dynamic imports, generated modules that bypass transformation, and unsupported static forms. Direct source rewriting is the primary path and should permit eventual alias removal where coverage is complete.

### Authored eXact source

When an imported binding is used as JSX and matches a substitution, replace that JSX use with a direct import of the native adapter export. Remove the original import specifier when it has no remaining uses. Preserve and, when necessary, split the original import for ordinary value uses.

### Prepackaged React modules

Run a narrow dependency transform over JavaScript modules that mention an active source package. Do not run the full eXact component compiler over `node_modules`.

Support these static forms in order:

- ESM named and default imports.
- Aliased imports.
- Namespace member JSX and compiled JSX calls.
- Static re-exports and barrels.
- `react/jsx-runtime` and `react/jsx-dev-runtime` calls.
- `React.createElement` calls.
- Statically recognizable CommonJS `require` and destructuring.

For a precompiled React call that creates an adapted native component, rewrite the construction site to an explicit React-to-eXact boundary helper rather than performing a runtime registry lookup. The helper must place a native eXact VNode into the compatibility-owned tree while preserving keys, refs, children, ownership, errors, suspension, and cleanup.

If an imported binding escapes through opaque dynamic code, keep the original path and report compatibility fallback in diagnostic/debug output. If a package has inlined the provider implementation and no module/export identity remains, it is not substitutable by this protocol.

### Tree-shaking requirements

- Metadata discovery must never import adapter runtime modules.
- Generated code imports only replacement subpaths actually used by a transformed module.
- Native adapter roots and provider subpaths must not import React, React DOM, React compatibility, or the source React binding.
- Adapter packages should expose direct leaf export-map entries and avoid barrels that re-export optional React bridges.
- A used replacement is retained by the generated direct import of its exported function.
- Merely installing or discovering an adapter contributes no client or server runtime code.

## Context and service sharing

Native adapters must provide one service instance that can be consumed from native eXact and remaining React compatibility components. The registry shares context identity, never current service values. Values remain descendant-scoped and request/root-local.

Add a public bridge contract that can associate an eXact context token with a React-compatible context and let compatibility-owned components read an eXact context. The current compatibility runtime already backs its React contexts with internal eXact context tokens; the new API must expose this intentionally without exposing private fields.

Required behaviors:

- An eXact provider is visible to nested compatibility-owned React components.
- A bridged React provider is visible to nested native eXact components.
- Alternating eXact -> React -> eXact -> React ancestry preserves nearest-provider semantics.
- Nested overrides update only their descendants.
- Separate roots and concurrent SSR requests never share service values accidentally.
- Genuine independent React renderers or roots use an explicit boundary provider.
- Hydration restores or reuses the intended client/store instance without duplicating caches or subscriptions.

Candidate public primitives are:

```ts
defineInteropContext<T>(id: string): ContextToken<T>;
bridgeReactContext<T>(token: ContextToken<T>, defaultValue: T): ReactContext<T>;
useExactContext<T>(token: ContextToken<T>): T;
```

Names are provisional; behavior and ownership are the compatibility requirement.

## Host integrations

### Initial support boundary

The first production implementation supports:

- Vite development, production, and SSR transforms.
- Node module loading for server execution and tests.
- Ahead-of-time transformation through the eXact compiler or CLI where a Node loader is undesirable.

Node and Vite provide enough coverage to validate the package protocol, transitive discovery, ESM rewriting, prepackaged dependency handling, context bridging, SSR, hydration, development invalidation, production tree shaking, and source maps. Webpack and Bun are intentionally deferred until these semantics and the shared engine API are stable.

### Vite

- Use normal `resolveId`, `load`, and `transform` hooks.
- Transform relevant prepackaged modules during development and production.
- Watch root, lockfile, and active adapter manifests.
- Invalidate the shared package graph and substitution table on metadata changes.
- Preserve SSR/client target separation and Vite source-map conventions.

### Webpack

- Deferred until the Node/Vite implementation and common engine contract are stable.
- Keep source rewriting in a pre-loader that delegates to the common engine.
- Use the plugin for conditions, resolver behavior, package discovery, watch dependencies, and cache keys.
- Apply the narrow dependency transform to matching JavaScript in `node_modules` without enabling the full JSX compiler there.
- Support `javascript/esm`, `javascript/auto`, and the targeted CommonJS forms.
- Report adapter manifests and lockfiles through loader watch dependencies.

### Bun

- Deferred until the Node/Vite implementation and common engine contract are stable.
- Use `onResolve` for `.exact` artifacts and remaining fallback resolutions.
- Use `onLoad` for the common transform and return the appropriate Bun loader.
- Initialize discovery once per build target and clear shared caches through `onStart`.
- Preserve Bun client, server, and runtime plugin differences without duplicating substitution logic.

### Node

- Provide a preloadable loader using Node module customization hooks.
- Register hooks before application imports, preferably through `node --import`.
- Delegate ESM source loading and rewriting to the common engine.
- Define the supported Node versions and CommonJS limitations explicitly.
- Offer ahead-of-time server compilation as the preferred production path when loader startup or compatibility is undesirable.
- Node performs no tree shaking, but it must still avoid loading the original React binding when a direct replacement is sufficient.

### Ahead-of-time builds

Expose the same engine through the eXact compiler/CLI so server packages, tests, and unsupported bundlers can pre-transform a dependency graph. Generated artifacts must use the same substitution table and diagnostics as live host integrations.

## Native adapter package shape

Use leaf entrypoints so native paths remain independent of React:

```text
@exact/tanstack-query
|- .                  native query APIs using @tanstack/query-core
|- ./provider         native eXact providers declared in metadata
|- ./react            optional React-facing bridge helpers
`- package.json       substitution metadata
```

The root and provider entrypoints may depend on the framework-neutral library core, `@exact/core`, and `@exact/reactive`. They must not depend on the React binding. An optional React bridge must live in an isolated leaf entrypoint or, if package-manager behavior requires stronger isolation, a separate package.

## Initial adapter roadmap

1. **External-source reactive primitive**
   - Add lazy `{ getSnapshot, subscribe }` integration, selectors, equality, batching, SSR snapshots, and effect-scope disposal to `@exact/reactive` or a small native interop package.
2. **TanStack Query**
   - Build on `@tanstack/query-core`.
   - Cover query, infinite query, mutation, cancellation, batching, cache lifecycle, dehydration, and hydration.
   - Replace `QueryClientProvider` first as the end-to-end protocol proof.
3. **Zustand**
   - Build on `zustand/vanilla`.
   - Preserve stores, middleware, persistence, selectors, and equality without `useSyncExternalStore` on native paths.
4. **Convex**
   - Build on `convex/browser` subscriptions, mutations, actions, auth, connection state, and SSR seeding without `convex/react` on native paths.
5. **Redux**
   - Consume the Redux store directly.
   - Prove complex provider subscription semantics, server state, selector equality, dispatch, nested providers, and optional React Redux custom-context bridging.
6. **Jotai and other stores**
   - Reuse the external-source primitive where their framework-neutral APIs provide stable snapshot/subscription contracts.
7. **React Router**
   - Expand `@exact/router` into the single renderer-neutral routing authority.
   - Add resolved-package-instance adapter variants before supporting multiple
     installed React Router majors.
   - Provide separate v5 and v6/v7 semantic facades, with v6 before 6.4
     distinguished from data-router-capable releases.
   - Follow the dedicated
     [React Router compatibility plan](react-router-compatibility-plan.md).

## Implementation phases

### Phase 1: Protocol and validation

- Create `@exact/react-compat-adapter-api`.
- Define and document schema version 1.
- Add strict package metadata parsing and normalized IR types.
- Enforce own-package targets, public export subpaths, source ranges, reserved namespaces, and explicit exports.
- Add build-root `ignoreAdapters` parsing.
- Test malformed metadata, ignored adapters, conflicts, and duplicate versions.

**Gate:** Package fixtures validate deterministically without loading adapter runtime modules.

### Phase 2: Package graph discovery

- Define the common package-graph interface.
- Implement npm lockfile reverse-dependency discovery.
- Add installed-tree and direct-dependency fallbacks.
- Cache by root and lockfile signatures.
- Produce a structured discovery report.

**Gate:** An adapter nested beneath a multi-level organization framework is discovered automatically, and uninstalling or ignoring it removes the mapping on the next build.

### Phase 3: Common React module transformer

- Move React import substitution policy behind `@exact/react-compat/plugin`.
- Implement generic binding-aware import/re-export rewrite helpers.
- Rewrite core React/React DOM imports directly.
- Implement adapter substitution for authored eXact source.
- Preserve mixed-use imports and source maps.
- Retain aliases only as measured fallback coverage.

**Gate:** Static React imports and adapted components bundle without the original modules when no remaining use requires them.

### Phase 4: Prepackaged dependency rewriting

- Implement the narrow ESM transform for compiled JSX runtime calls and `createElement`.
- Add alias, namespace, barrel, and static re-export support.
- Add targeted CommonJS support.
- Implement the explicit React-to-eXact construction helper.
- Add fallback diagnostics for dynamic or inlined cases.

**Gate:** A prebuilt package using a registered provider renders the native replacement without being passed through the full eXact compiler.

### Phase 5: Context bridge

- Publish supported context identity and access APIs.
- Provide native-to-compatibility and compatibility-to-native propagation.
- Add alternating-layer, nested override, portal, error, suspension, SSR, hydration, and multi-root tests.
- Document the explicit boundary required for independent React renderers.

**Gate:** One store/client instance is observed from alternating native and compatibility-owned descendants with deterministic cleanup and request isolation.

### Phase 6: Host integration

- Introduce the common build engine and refactor Vite transform selection into it.
- Add Vite metadata watch, SSR/client separation, and cache invalidation.
- Add the Node preload loader and ahead-of-time CLI path.
- Run identical golden transformation fixtures through Vite, Node loading, and ahead-of-time compilation.

**Gate:** Vite dev/build/SSR, the Node loader, and ahead-of-time output agree on substitutions and diagnostics.

### Phase 7: TanStack Query proof

- Implement the external-source primitive and TanStack Query native package.
- Publish provider metadata.
- Add native, mixed-tree, React-only fallback, SSR, hydration, cancellation, cache-sharing, and tree-shaking fixtures.
- Measure native versus compatibility bundle size and update/render overhead.

**Gate:** A mixed application can migrate queries component by component while retaining one `QueryClient`; a fully migrated fixture contains neither React Query nor React compatibility code.

### Phase 8: Additional adapters and hardening

- Implement Zustand, Convex, Redux, and Jotai in roadmap order.
- Add package-level conformance fixtures and semver matrices.
- Add pnpm, Yarn, and Bun package-graph providers as demand requires.
- Remove resolver aliases whose fallback coverage is proven unnecessary.
- Publish adapter-author guidance and a validation command.

**Gate:** Each adapter passes native-only, mixed-layer, SSR/hydration where applicable, cleanup, version mismatch, conflict, ignore-policy, and bundle-retention tests.

### Phase 9: Additional build hosts

- Add Webpack using a thin plugin plus pre-loader over the common engine.
- Add Bun using `onResolve`, `onLoad`, and `onStart` over the common engine.
- Add shared golden fixtures that compare each new host with Node/Vite reference output.
- Document only unavoidable host limitations; do not fork substitution semantics.

**Gate:** Webpack and Bun agree with the Node/Vite reference fixtures for discovery, rewriting, diagnostics, context behavior, and runtime results.

## Test matrix

Every substitution engine and host must cover:

- Direct, aliased, namespace, default, and re-exported ESM bindings.
- Compiled `jsx`, `jsxs`, `jsxDEV`, and `createElement` calls.
- Supported CommonJS forms.
- Bindings used only as JSX, only as ordinary values, and as both.
- Client and server export conditions.
- Development and production source maps.
- Adapter discovery through direct and deeply transitive dependencies.
- Hoisted and nested marker package layouts.
- Root ignore policy and conflict resolution by exclusion.
- Unsupported source and protocol versions.
- Duplicate adapter versions.
- No runtime imports for discovered-but-unused adapters.
- No source React binding after complete migration.
- Stable context through portals, Suspense, error boundaries, hydration, and cleanup.
- Multiple roots and concurrent SSR requests.
- Vite, Node loader, and ahead-of-time output parity for the initial release.
- Webpack and Bun parity when their deferred host integrations are added.

## Performance and observability

- Build the package graph once and cache it by lockfile signature.
- Freeze and hash the normalized substitution table; include the hash in module transform cache keys.
- Fast-scan module text before parsing dependencies.
- Parse only modules containing active source specifiers or core React specifiers.
- Expose a debug report listing discovered, ignored, active, conflicting, and unused adapters.
- Record why a module remained on React compatibility: ordinary React use, dynamic escape, unsupported CommonJS, bundled/inlined implementation, or version mismatch.
- Add build benchmarks for cold discovery, warm discovery, relevant dependency transforms, and irrelevant dependency fast paths.
- Add runtime and bundle benchmarks comparing compatibility-only, mixed, and fully native applications.

## Documentation and tooling

- Document the metadata protocol for adapter authors.
- Provide a validator command that checks metadata, marker dependency, source ranges, export maps, reserved sources, and replacement type declarations.
- Document application ignore policy and discovery diagnostics.
- Publish migration guides showing provider-first and consumer-by-consumer migration.
- Add a compatibility report command that prints the effective substitution table for a build root.
- Keep the existing React compatibility certification catalog distinct: certification proves an unchanged React package works; adapter metadata provides a native migration path.

## Completion criteria

The project is complete when:

- Adapter installation and removal require no Vite, Node, or application source configuration changes in the initial release.
- Deferred Webpack and Bun integrations preserve the same zero-configuration adapter lifecycle when added.
- Transitive adapters under an organization framework are discovered through the marker dependency graph.
- The application can suppress any discovered adapter through its root package metadata.
- All replacement targets are public exports of their declaring packages and conflicts fail deterministically.
- Core React imports and registered component exports are rewritten consistently across supported hosts.
- Eligible prepackaged components receive the same substitutions as authored source.
- Native and compatibility-owned components share one descendant-scoped service instance.
- A fully migrated TanStack Query application bundles neither `@tanstack/react-query` nor React compatibility code.
- The initial Vite, Node, and ahead-of-time integrations share one discovery and transformation engine and pass the same conformance fixtures.
- Later Webpack and Bun integrations consume the same engine and match the established Node/Vite reference behavior.
