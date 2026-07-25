# React compatibility

Status: implemented compatibility targets for React 18.3 and React 19.2, with
the explicit fidelity limits below.

React compatibility is an adoption boundary for React-owned code. Native eXact
components retain eXact's setup-once, inspectable-state, fine-grained model.

## Build selection

Vite, Webpack, and Bun integrations can detect an installed React 18 or 19 and
select the matching compatibility target. React-owned source is identified by:

- an explicit `@jsxImportSource react` directive;
- configured source filters; or
- imports/package metadata that establish React ownership.

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
translated into native eXact component semantics.

## Native interop

`ReactHost` mounts a React component type beneath an eXact owner.
`exposeExactComponent()` makes a native component explicit at a React-owned JSX
boundary. `defineInteropContext()` provides paired React/eXact tokens with one
logical descendant value.

Interop boundaries preserve component ownership, context, refs, cleanup, and
tree shaking. Native application code should not import React Hooks merely to
communicate with a hosted React package.

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
