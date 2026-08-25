# React ecosystem adapters

eXact adapters let compatibility-owned React packages and native eXact code
share one store/client while selected public exports are rewritten to native
implementations. Vite discovers adapters automatically from the application
dependency graph. Node uses the same engine through:

```sh
node --import @exactjs/react-compat/register app.js
```

For ahead-of-time output, use `exact-reactc`. Inspect a build with
`exact-react-compat report <app-root>` and validate an adapter with
`exact-react-compat validate <adapter-root>`.

## Application policy

Only the build-root package can suppress a transitive adapter:

```json
{
	"exact": {
		"reactCompatibility": {
			"ignoreAdapters": ["@exactjs/redux"]
		}
	}
}
```

Changing the root manifest, lockfile, or an active adapter manifest invalidates
Vite's shared registry. Conflicts and incompatible reachable versions fail the
build instead of choosing an order-dependent winner.

The compatibility build engine snapshots that registry for one build generation. Build-tool
integrations using the engine directly must watch its reported `watchFiles` and pass their changes
to `invalidate()`. Modules that do not lexically reference React or a discovered adapter source
skip importer-specific graph selection and source parsing.

## Provider-first migration

Install the native adapter beside the existing React binding. Existing imports
continue to work, but registered providers/hooks are rewritten to adapter leaf
exports. Move consumers to native APIs incrementally; the context bridge keeps
the service descendant-scoped across alternating React/eXact layers.

- `@exactjs/tanstack-query`: `ExactQueryClientProvider`, `createComponentQuery`,
  `createInfiniteQuerySource`, `createMutationSource`, `dehydrate`, and `hydrate`.
- `@exactjs/zustand`: vanilla `createStore`, `createZustandSource`, and
  `createComponentStore`; vanilla middleware and persistence remain attached to
  the same store object.
- `@exactjs/convex`: native query watches, SSR seeds, mutation/action helpers,
  auth configuration, and connection-state sources.
- `@exactjs/redux`: native store providers/selectors, server snapshots, dispatch,
  nested subscriptions, and compatibility custom-context support.
- `@exactjs/jotai`: vanilla atoms/stores and native atom sources.

Native root entrypoints do not import React, React DOM, React compatibility, or
the source React binding. Compatibility wrappers are isolated under `./react`.
Independent React renderers or roots must mount an explicit bridged provider;
context identity is shared, but values are never stored globally.

## Static limitations

The transformer handles named/default/namespace ESM, aliases, re-exports,
compiled JSX calls, `createElement`, and targeted CommonJS forms. Dynamic export
selection, rest destructuring, and bundled/inlined provider implementations stay
on compatibility and appear in structured diagnostics. Node's live hook is for
ESM; precompile CommonJS production graphs with `exact-reactc`.
