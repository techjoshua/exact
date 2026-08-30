# React compatibility

Status: implemented compatibility targets for React 18.3 and React 19.2, with
the explicit fidelity limits below.

React compatibility is an adoption boundary for React-owned code. Native eXact
components retain eXact's durable, inspectable reactive-state-machine model.

## Build selection

Vite, Webpack, and Bun integrations can detect an installed React 18 or 19 and
select the matching compatibility target. React-owned source is identified by:

- an explicit `@jsxImportSource react` directive;
- configured source filters; or
- imports/package metadata that establish React ownership.

An explicit foreign JSX directive is a compiler ownership boundary, not a
corpus exclusion. The native compiler retains the module in its configured
TypeScript project and release corpus while passing its source through without
eXact component diagnostics or JSX lowering. The selected React compatibility
pipeline then owns its transformation.

Generated React-owned modules import target-specific
`@exactjs/react-compat` JSX/runtime entrypoints. Public `react`, JSX runtime,
React DOM client/server/static, and supported scheduler imports resolve to the
matching eXact compatibility packages. Already-compiled dependencies do not
need the eXact compiler.

Import-free automatic-runtime source is ambiguous by syntax alone. It needs an
explicit directive, React import, or configured source filter.

## Implemented component behavior

The compatibility runtime supports the certified React-shaped surface for:

- elements, fragments, children helpers, JSX runtimes, and refs;
- function components and core Hooks;
- context, external stores, insertion/layout/passive effects, and cleanup;
- portals with logical context and deterministic target disposal;
- `lazy`, React 19 `use`, Suspense, transitions, and deferred values;
- React 19 Activity with retained state/DOM and effect disconnection;
- class components, state, update lifecycles, snapshots, refs, and
  `PureComponent`;
- class error boundaries and root error callbacks;
- compatible roots, hydration, server strings, static markup, and all-ready
  stream shapes;
- request-scoped React server cache lifetime and resource hint emission; and
- React Compiler memo-cache slots.

React-owned components still rerender according to React semantics. Hook order,
effect timing, class lifecycle, Suspense retries, and error propagation are not
translated into native eXact component semantics. The compatibility renderer may
retain its own React-private element and renderer state, but no native eXact
component—including the precompiled island boundary—produces eXact VNodes. Island
attachment enters the React renderer directly rather than returning a tree to the
native renderer.

## Native interop

With compatibility enabled, a native eXact component can render a statically
referenced component directly:

```tsx
import { DatePicker } from 'react-date-picker';

function BookingForm(this: Component<{ date: Date | null }>) {
	return () => <DatePicker value={this.state.date} onChange={(date) => (this.state.date = date)} />;
}
```

Compiled eXact component functions carry an opaque identity string under
`Symbol.for('@exactjs/component')`. Executable metadata lives separately under
`Symbol.for('@exactjs/component-contract')` and does not duplicate the top-level component ID. For
a foreign component imported into native JSX, the compiler calls one precompiled React-island
artifact and passes the React component value as an opaque prop. It does not brand that value,
create an adapter component for it, or choose a component execution lane at runtime.

Reactive props remain eXact expression cells. Updating `this.state.date`
therefore updates the hosted component without rerunning `BookingForm`.

Already-compiled dependency implementations in `node_modules` are not passed
through the eXact compiler. Bundler aliases redirect their React runtime imports
to the selected compatibility target.

Applications should reference `@exactjs/react-compat/types18` or
`@exactjs/react-compat/types19` from `compilerOptions.types`, matching the
configured runtime target.

Runtime-selected foreign values can also be passed to that fixed island when React compatibility
is enabled. `ReactHost` and `adaptReactComponent()` remain explicit names for the same precompiled
client island in imperative code outside compiler-owned native JSX; calling them does not create a
new artifact.
When the matching React type facade is active, React-owned source compiled by
an eXact integration can also render a compiled native component directly. The
compatible React element pipeline recognizes its native identity brand and
mounts it natively:

```tsx
/** @jsxImportSource react */
import { NativeAccountBadge } from './NativeAccountBadge.js';

export function ReactToolbar() {
	return <NativeAccountBadge />;
}
```

`exposeExactComponent()` remains available for stock React builds that are not
using eXact's compatibility runtime, and for an explicit ref-property bridge.
`defineInteropContext()` provides paired React/eXact tokens with one logical
descendant value.

Interop boundaries preserve component ownership, context, refs, cleanup, and
tree shaking. Native application code should not import React Hooks merely to
communicate with a hosted React package.

When native children pass through a React-owned wrapper, the compiler gives React an ordinary
private React element whose payload is an opaque compiled contribution handle. React may retain,
key, and clone that carrier. Neither React nor the island can inspect whether the contribution
places text, an intrinsic, another native component, a collection, or no output, and the handle has
no VNode materialization operation. Placement invokes the supplier-owned operation, which retains
range identity, updates, Activity state, and disposal. This carrier is an ownership protocol, not
a public child API or a second native rendering model.

The ReactDOM client and server entry points likewise use fixed precompiled root-host artifacts.
React compatibility is installed through separate package entry points, so a native-only bundle
does not reach the React runtime or the optional contribution integrations.

## Scheduling, Suspense, and Activity

The compatibility runtime maps observable behavior onto eXact's scheduler,
readiness ranges, state overlays, and retained mounted ranges:

- `startTransition`, `useTransition`, and `useDeferredValue` use deferred
  priority;
- Suspense owns fallback, committed content, candidate work, cancellation, and
  retry;
- React Activity retains the hidden subtree, disconnects Hook effects and
  external-store subscriptions, and reconnects them when shown; and
- compatibility `act` drains eXact scheduling and promise microtasks.

This does not reproduce Fiber lane entanglement, arbitrary interruption of
Fiber render stacks, or Fiber-derived component stacks. Profiler timing is
approximate because Fiber base-duration accounting is unavailable.

## Server rendering and hydration

React DOM string/static serialization covers the certified React 18/19 host
attribute, style, form-control, SVG, custom-element, raw-text, bootstrap, and
resource-hint matrix.

`hydrateRoot` adopts matching server DOM and preserves matching element
identity, form state, refs, events, and renderer ownership. Mismatches report
through `onRecoverableError` and replace with a clean client render. Dirty form
state is retained when a control has a unique explicit ID or a unique form
name/signature match.

Compatibility streams are all-ready: asynchronous Suspense resources settle
before the completed stream output. They expose the documented API shapes but
do not reproduce React's private incremental Suspense wire protocol.
`prerender`/`resume` entrypoints rerender supplied trees rather than serialize
and resume postponed Fiber state.

Native eXact SSR has its own marker-based progressive Suspense and selective
interaction hydration. Those native wire contracts are not injected into
React-compatible HTML.

## React ecosystem adapters

An eXact ecosystem adapter may replace selected exports of a React-owned
package with a native implementation while sharing one service/context with
compatibility components. This can remove React compatibility code from paths
that have a proven native substitution.

See [react-ecosystem-adapters.md](react-ecosystem-adapters.md). React Router
5/6/7 has a version-aware facade over the native eXact router; see
[react-router-compatibility.md](react-router-compatibility.md).

## Explicit limitations

- Selective/event-replay hydration is native eXact behavior, not reproduced
  for arbitrary React-compatible trees.
- Compatibility streams do not incrementally reveal React Suspense boundaries.
- Postponed Fiber state is not serialized or resumed.
- Complete Fiber scheduling, error stacks, Profiler accounting, and private
  reconciler behavior are not public compatibility promises.
- React native form-action coordination is partial: optimistic/action state is
  supported, while the complete browser form transition pipeline is not.
- Specialized host renderers are certified individually rather than assumed
  compatible from semver alone.
- A package that depends on undocumented Fiber or host-config behavior can be
  rejected even if its public React version is supported.

## Verification

The machine-readable capability inventory in
`@exactjs/react-compatibility` classifies public runtime exports for both
baselines. Repository gates include:

```sh
npm run check:react-compat
npm run check:react-reconciler
npm run check:r3f-browser
```

Differential traces compare the supported observable contracts against real
React 18.3.1 and React 19.2.0. Published-package fixtures cover representative
portals, styling, data, error, icon, reconciler, React Three Fiber, Drei, Ink,
and React PDF paths. Passing a focused fixture means that scenario is
supported; it is not a blanket guarantee for every package using the same
dependency.
