# React compatibility

Status: implemented compatibility targets for React 18.3 and React 19.2, with
the explicit fidelity limits below.

React compatibility is an adoption boundary for React-owned code. Native eXact
components retain eXact's durable, inspectable reactive-state-machine model.

## Build selection

Vite, Webpack, and Bun integrations can detect an installed React 18 or 19 and
select the matching compatibility target. React-owned source is identified by:

- an explicit `/** @jsxImportSource react */` directive in a leading block comment
- configured source filters
- imports/package metadata that establish React ownership

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

For precompiled Node applications, `node --import @exactjs/react-compat/register` installs
synchronous `module.registerHooks()` when available, covering both ESM and CommonJS module
loads without Node 26's deprecated async registration API. Older Node hosts retain the async
registration fallback. The explicit async `node-loader` hook remains available for existing hosts.

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

React-owned render functions may omit their props parameter when they need no inputs. `memo()`
and `forwardRef()` support that usage and infer declared prop types, keeping required inputs checked.

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
artifact and passes the React component value as an opaque prop. The standalone React renderer
keeps that identity on a private symbol so authored props such as `component` remain intact. It does not brand that value,
create an adapter component for it, or choose a component execution lane at runtime.
The client artifact also imports the selected React DOM renderer capability when that foreign
boundary is emitted. Native-only client modules and server artifacts omit that browser integration.

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
The returned pair follows TypeScript's readonly annotations and remains an ordinary
JavaScript object. Replacing a field through a writable alias does not change the
identities of tokens and context views already held by other consumers.

Interop boundaries preserve component ownership, context, refs, cleanup, and
tree shaking. Native application code should not import React Hooks merely to
communicate with a hosted React package.

React-owned host callbacks use the framework's interaction ownership when they start native work.
Return the promise from asynchronous event work so the renderer can observe its settlement.
Synchronous failures and returned rejections reach the owning error context. Standalone roots
report them through `onUncaughtError`. Released roots and replaced components do not receive late
event failures. Scheduled effect failures also reach the owning error context. A following
render or interaction can establish new effects, and work queued before unmount stays retired.
Matching hydration keeps these bindings on the adopted DOM nodes.

Unmounting and replacing a React-owned range release every descendant and sibling even when a
ref callback throws. Event listeners are removed before ref release. The first cleanup failure
is preserved, and an accepted replacement remains owned so a following update or unmount can
release it. Callback refs may return a cleanup function. Each host, class, or imperative-handle
attachment owns that function independently, even when several attachments share one callback.
Its release calls the returned cleanup once instead of calling the ref with `null`. Object refs
and callbacks without a returned cleanup retain their usual null-on-release behavior. Queued
class-ref changes cannot attach after unmount or supersede a newer assignment. Class teardown
also completes ownership bookkeeping when lifecycle and ref cleanup both fail, reporting the
first failure through the owning error context. Effect and external-store cleanup also preserve
non-object failures, release each lease once, and prepare retained Activity state to reconnect
even after a cleanup failure. Showing the Activity again starts new effect and subscription
leases against the retained component and DOM. Accepted Suspense transition content becomes
owned before superseded content is released. A failed old ref cleanup therefore cannot orphan
the prepared content. Promise retries report failures through the boundary's durable error
context and cannot retry after its disposal.

Failed range preparation releases newly acquired hosts, fragments, components and portals.
It retains ownership of earlier ranges for subsequent rendering and disposal. Nested child
arrays retain their group and empty-slot identities, so matching local keys in separate
groups do not share an instance. Client and server array traversal share an iterative
walker. Native child projection retains sparse cells, getter order and array species.
Authored map overrides keep their own call path. Public `Children` utilities distinguish an
absent root from empty slots in an array. Callback traversal visits those slots as `null` with
their original positions and supports an explicit callback receiver. Mapped arrays flatten,
null results are omitted, and copied element keys retain their original and replacement scopes.
`Children.toArray` leaves source element records and props unchanged. SSR preserves adjacent text boundaries
across nested arrays and children that produce no markup. Hydration retires its text
separators and keeps native-owned range delimiters intact during adoption, updates and disposal.
Matching raw-HTML hosts retain their server DOM and authored comments, while differing markup
uses the existing recoverable rebuild path. Hosts retain their accepted content mode so a later
transfer to child ranges does not reread an obsolete payload getter. Portals place their owned
marker into the adopted parent range and retain target ownership through updates and removal. A synchronous
root-render failure is reported through `onUncaughtError` and rethrown to its caller, preserving
the initiating error when rollback also fails. A failed ref attachment keeps its release path,
and an imperative-handle factory that fails before assigning a ref leaves that ref untouched.

When native children pass through a React-owned wrapper, the compiler gives React an ordinary
private React element whose payload is an opaque compiled contribution handle. React may retain,
key, and clone that carrier. Neither React nor the island can inspect whether the contribution
places text, an intrinsic, another native component, a collection, or no output, and the handle has
no VNode materialization operation. Placement invokes the supplier-owned operation, which retains
range identity, updates, Activity state, and disposal. Native ranges retain the enclosing
React component as their logical parent so bridged provider contexts remain available. This carrier is an ownership protocol, not
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
before the completed stream output. An aborted `signal` rejects pending work with its
exact reason, including `null`. Promise children and Suspense waits share that cancellation
contract. Node pipeable streams retain failures until a destination attaches and honor the
caller signal. Each stream accepts one destination. They expose the documented API shapes but
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
