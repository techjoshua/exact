# @exactjs/react-compat

React API compatibility runtime and build support for running selected React packages and
components through eXact.

The package exposes React-compatible element creation, components, contexts, hooks, lazy and
Suspense behavior, children utilities, transitions, and adapter-aware package substitution. Use
the dedicated `./build`, `./plugin`, `./transform`, and `./exact` entrypoints only from tooling or
integration code.

This is a compatibility layer, not the native eXact component model. New eXact components should
use `this.state`, lifecycle methods, tasks, and compiled JSX rather than React hooks.

## Native eXact JSX

When a build integration enables `reactCompatibility`, supported React components can be imported
and rendered directly from native eXact JSX. The compiler inserts a cached compatibility adapter
for every imported or runtime-selected component value.
Compiler-branded eXact components pass through unchanged. The brand key is
`Symbol.for('@exactjs/component')` and its string value is the canonical opaque component ID;
unbranded values are owned by the one enabled compatibility layer. Dependency implementations in
`node_modules` are not eXact-compiled.

```tsx
import { DatePicker } from 'react-date-picker';

return () => <DatePicker value={this.state.date} onChange={(date) => (this.state.date = date)} />;
```

Add the facade matching the configured target to `compilerOptions.types`:

```json
{ "compilerOptions": { "types": ["@exactjs/react-compat/types19"] } }
```

Use `ReactHost` or `adaptReactComponent()` from `@exactjs/react-compat/exact` for imperative code
outside compiler-owned native JSX. Dynamic component values in native JSX use the same automatic
runtime brand check.

The compatibility runtime leaves the original React function unbranded and gives its cached
internal native adapter a separate runtime identity. This preserves ownership without pretending
the React source was compiled as eXact.

React-owned source may also render a compiled eXact component directly when the matching
`types18` or `types19` facade is active. The facade admits eXact render results to the compatible
React renderer, and the runtime checks the native component brand before mounting the component
natively. `exposeExactComponent()` remains the explicit bridge for stock React toolchains outside
eXact compatibility and for custom ref-property projection.

React `Suspense` uses eXact readiness ranges for lazy and `use()` thenables. React 19 `Activity`
maps visible/hidden behavior onto retained native ranges and reconnects effects and external-store
subscriptions when shown again. Transition and deferred-value updates enter eXact's deferred
scheduler lane.
