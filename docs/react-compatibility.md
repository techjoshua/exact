# React Compatibility

React compatibility is an automatically detected runtime layer. When the Vite, Webpack, or Bun adapter finds an installed React 18 or 19, it enables the matching compatibility target. Published React packages remain compiled and resolve their public `react`, JSX runtime, and React DOM imports to eXact compatibility entrypoints. Third-party packages do not require the eXact compiler.

## Baselines

The initial stable baselines are React 18.3 and React 19.2. `@exactjs/react-compatibility` contains the machine-readable API disposition and phase assignment for both baselines. Runtime reference traces are produced under `.tmp/react-conformance/` by:

```sh
npm run check:react-compat
```

The check runs the same element, server-render, state, event, layout-effect, passive-effect, and cleanup scenario against real React 18 and React 19 installations. It also fails when an installed public runtime export has no capability disposition.

It also runs genuine secondary-renderer scenarios:

```sh
npm run check:react-reconciler
npm run check:r3f-browser
```

The browser gate requires the pinned Playwright engines (`npx playwright install chromium firefox webkit`) and is part of `release:check`.

This bundles each fixture so every `react` import resolves to one target-specific eXact compatibility singleton while `react-reconciler` and `scheduler` remain genuine and version matched. Results are emitted as machine-readable JSON.

## Generic react-reconciler interoperability

eXact remains the DOM renderer. A package using `react-reconciler` keeps its own Fiber tree, scheduler, host configuration, portals, boundaries, and cleanup. Compatibility provides only the shared React singleton, target-specific private dispatcher fields, React context fields, and a bounded owner/context frame used by cross-renderer context bridges.

Public hooks resolve through the active dispatcher. During an eXact-hosted React component render, eXact installs its dispatcher and restores the previous dispatcher, transition, runtime, and owner state in `finally`. During an external renderer render, the genuine reconciler installs its dispatcher and receives the same public hook calls directly; those calls do not enter eXact `HookHost`.

The bounded owner frame contains component ancestry, child/sibling relationships, hook memoized values, and the class state node. It intentionally contains no lanes, alternates, flags, update queues, scheduling state, or DevTools mutation hooks. This is sufficient for `its-fine` to discover eXact-hosted React context providers and bridge their live values into an R3F root.

Pinned generic lines currently passing are:

| React target | react-reconciler | scheduler | Status     |
| ------------ | ---------------- | --------- | ---------- |
| 18.3.1       | 0.29.2           | 0.23.2    | compatible |
| 19.2.0       | 0.33.0           | 0.27.0    | compatible |

Renderer candidates passing their current Node/mock-host scenarios are R3F 8.18.0 on React 18, R3F 9.6.1 on React 19, Ink 7.1.0, and React PDF 4.5.1. R3F 9.6.1 also passes maintained `<Canvas>`, context-bridge, Three object update, continuous/manual frame, pointer-raycast, WebGL loss/restoration, and independent five-cycle cleanup scenarios in Chromium, Firefox, and WebKit. Chromium's precise-memory gate runs forced collection and enforces a 64 MB retained-heap ceiling. The selected Drei 10.7.7 texture, GLTF, controls, environment, and HTML-overlay scenarios pass. These packages remain `compatible`, not certified, until every remaining certification gate in `packages/react-compatibility/renderer-certification.json` is maintained and passing.

When Vite, Webpack, or Bun resolves a discoverable direct `react-reconciler` import, it validates the reconciler's full semver React peer range against the selected compatibility target and reports the target, reconciler version, React peer range, and scheduler range on mismatch. The reconciler import itself is not aliased.

Reference rendering performance can be sampled independently:

```sh
npm run benchmark:react-compat
```

## Compatibility policy

- Compatibility means documented, observable public behavior. Private Fiber state and undocumented scheduling details are not compatibility targets.
- Every runtime export is `planned`, `approximate`, or `unsupported` for each baseline where it exists.
- A planned API is not considered supported until its phase implementation and differential tests pass.
- Compatibility must preserve explicitly eXact-owned JSX and must not change native eXact behavior when disabled with `reactCompatibility: false`.
- Unsupported APIs fail explicitly in strict development mode instead of silently approximating behavior.
- Third-party certification fixtures are phased from presentational components through hooks, portals, Suspense, classes, and error boundaries. Their catalog is stored in `packages/react-compatibility/package-fixtures.json`.

## Phase 0 baseline

Before the compatibility foundation was added, the repository build, 750 package/adapter tests, and two server-component tests passed. The full release command reached the existing shipping-calculator test and failed while the sandbox denied esbuild access when loading that app's Vitest configuration; the same 15 shipping tests pass when run outside that filesystem sandbox. A separate test typecheck exposes one pre-existing `ExactResponseLike` mismatch in the in-progress Node adapter test. The machine-readable record is `packages/react-compatibility/phase-0-baseline.json`.

These existing conditions are the comparison baseline for Phase 0. Compatibility work must introduce no additional failures before the phase can complete.

## Phase 1: elements and shallow hooks

Phase 1 is implemented as `@exactjs/react-compat` and `@exactjs/react-dom-compat`. It supports function components, fragments, the automatic and development JSX runtimes, `Children`, element creation/cloning/validation, `createRoot`, and shallow custom hooks composed from `useState`, `useReducer`, `useRef`, `useMemo`, `useCallback`, and `useDebugValue`.

The compatibility path is runtime-first: already-published packages in `node_modules` do not need to pass through the eXact compiler. Vite, Webpack, and Bun integrations automatically locate the nearest installed React package and select major 18 or 19. `reactCompatibility` can override the target, provide an import-free source filter, or disable the behavior:

```ts
exact({
	reactCompatibility: {
		target: 19,
		source: /[\\/]src[\\/]react[\\/]/
	}
});
```

React-owned source can be identified by the `source` filter or `@jsxImportSource react`. It is routed through the compiler's React JSX lowering rather than the native eXact JSX transformer. Strict mode rejects a source file that claims both React and eXact JSX ownership. With compatibility disabled, plugin resolution and compilation behavior is unchanged.

React ownership is also inferred semantically when a TSX/JSX file references a value binding imported from a public `react` or `react-dom` entrypoint. Type-only imports and unused value imports do not claim ownership. Explicit `@jsxImportSource react` and `@jsxImportSource @exactjs/jsx` directives take precedence, with the eXact directive protecting a mixed file from automatic inference.

React-owned source is lowered by the shared compiler using the automatic JSX runtime. Generated modules directly import the selected `@exactjs/react-compat/jsx-runtime18` or `jsx-runtime19`, and authored public React imports are rewritten to their target-specific compatibility entrypoints. Resolver aliases remain installed because already-compiled dependencies in `node_modules` still contain their original React specifiers. Import-free automatic-runtime components cannot be distinguished from eXact JSX by syntax alone, so they still need a React import, an explicit directive, or a configured `source` filter.

The emitted imports are verified as real bundle inputs for both targets with `npm run check:react-auto-bundle`.

Phase 1 does not yet provide effects, context, DOM refs, portals, Suspense, classes, hydration, or server rendering. Those exports either fail with a phase-specific message or remain assigned to their later compatibility phase. The conformance command now compares Phase 1 element and shallow-hook traces against both real React baselines.

The published-package fixture pins `lucide-react@0.468.0`, whose icon components exercise the Phase 1 function-component and `forwardRef` surface. Newer lucide-react releases use context and therefore move to the Phase 2 compatibility profile rather than being silently treated as Phase 1-compatible.

## Phase 2: lifecycle, context, refs, and external stores

Phase 2 adds reactive context providers and consumers, `createRef`, DOM and callback refs, `forwardRef`, `memo`, `useContext`, `useImperativeHandle`, `useEffectEvent`, and ReactDOM batching/flush behavior. It also provides compatible dependency and cleanup behavior for insertion, layout, and passive effects; stable unique `useId` values; and subscription/snapshot behavior for `useSyncExternalStore`.

The following behaviors are intentionally recorded as approximations in the capability manifest:

- `StrictMode` is a structural wrapper and does not double-invoke development renders and effects.
- Insertion and layout effect updates run in a post-DOM microtask because eXact does not expose React's synchronous Fiber commit boundary. Initial effects still run through component mount ownership, and cleanup remains deterministic.
- `useId` values are stable and unique, but do not reproduce React's identifier encoding, streaming allocation, or `identifierPrefix` behavior.
- `useSyncExternalStore` implements snapshot comparison, resubscription, missed-update detection, and unmount cleanup without React's concurrent-render tearing checks.

The Phase 2 differential trace covers provider updates through memoized consumers, insertion/layout/passive setup and cleanup, DOM and imperative refs, stable IDs, external-store updates, batching, and unmount disposal. Its observable trace agrees with both React 18.3.1 and React 19.2.0.

Published-package fixtures are pinned and bundled with the same exact-specifier alias map used by the build plugins:

- `lucide-react@1.24.0` for context, memo, and `forwardRef`.
- `react-hook-form@7.81.0` for composed hooks, refs, state, and effects.
- `zustand@5.0.14` for `useSyncExternalStore` and subscription cleanup.

The checked-in fixture bundle can be regenerated after building the compatibility packages:

```sh
node packages/react-dom-compat/scripts/build-package-fixtures.mjs
```

Class components, error boundaries, hydration, and React server rendering remain assigned to later phases.

## Phase 3: portals, async boundaries, and transitions

Phase 3 adds renderer-owned portals that preserve logical component ownership, context, refs, lifecycle cleanup, and event behavior while placing DOM in another `Element` or `DocumentFragment`. Suspense boundaries catch promises thrown by descendant renders, show their fallback, and retry after settlement. This supports `React.lazy`, React 19 `use`, and suspense-enabled data libraries without compiling package code.

The following behavior is supported directly:

- `createPortal`, including context propagation and deterministic target cleanup.
- `lazy` module loading and rejected/fulfilled resource state.
- React 19 `use` for contexts and promise-like values.
- React Compiler memo-cache slots through `react/compiler-runtime`.
- `requestFormReset` for mounted HTML forms.

Scheduling and request-scoped APIs are intentionally approximate because eXact does not implement React Fiber lanes or React server cache lifetimes:

- Suspense implements fallback and retry semantics, but not concurrent reveal ordering, Suspense streaming, or hydration coordination.
- `startTransition`, `useTransition`, and `useDeferredValue` preserve the public state/action contract using synchronous actions and microtask deferral rather than concurrent priority lanes.
- `useActionState` and `useOptimistic` provide async pending state and optimistic reduction without native form-transition coordination or lane-based rollback.
- `Activity` provides visible/hidden structural behavior without preserving a hidden subtree's effects and state.
- `cache` memoizes by argument identity for the process, while `cacheSignal` is stable and non-aborting; neither has a server-request lifetime until Phase 5.
- ReactDOM resource hints create deduplicated client document resources without server resource coordination. `useFormStatus` reports a stable non-pending status outside the unsupported native form-action pipeline.

The Phase 3 differential trace covers portals with context, lazy Suspense fallback/retry, transition completion, deferred values, and unmount cleanup. Its final observable states agree with React 18.3.1 and React 19.2.0.

Published-package fixtures are pinned at:

- `@radix-ui/react-dialog@1.1.19` for portals, context, composed refs, events, and cleanup.
- `@emotion/react@11.14.0` for context and insertion effects.
- `@tanstack/react-query@5.101.2` for external stores, async resources, and Suspense retry.

The Phase 3 boundary does not include class components, `PureComponent`, React error boundaries, `Profiler`, hydration, or React server rendering. Those remain explicit later-phase capabilities rather than silent fallbacks.

## Phase 4: class components and error boundaries

Phase 4 gives each mounted React class component a persistent public instance owned by its eXact adapter. Constructor state, functional and object `setState`, callbacks, `forceUpdate`, class refs, `static contextType`, `defaultProps`, `getDerivedStateFromProps`, `shouldComponentUpdate`, and `PureComponent` shallow comparison participate in normal eXact reconciliation.

Supported lifecycle coverage includes the modern commit sequence (`componentDidMount`, `getSnapshotBeforeUpdate`, `componentDidUpdate`, and `componentWillUnmount`) and the legacy/`UNSAFE_` pre-render lifecycle names used by older packages. State callbacks and post-update lifecycles run at eXact's post-DOM microtask boundary, and lifecycle failures route through the nearest parent error boundary.

Class error boundaries support both `static getDerivedStateFromError` and `componentDidCatch`. Descendant render, construction, and lifecycle failures reach the nearest boundary, while errors thrown by the boundary itself continue to an ancestor boundary. The component stack contains eXact's available owner name rather than a Fiber-derived source stack.

`Profiler` reports stable `mount` and `update` phases and adapter render duration. Fiber subtree duration, base-duration accounting, and React scheduler priority are not available, so its timing fields are approximate. Compatibility `act` flushes eXact scheduling plus promise microtasks rather than React's private test queue.

For React 18 compatibility, the deprecated main-entrypoint `createRoot`, `render`, and `unmountComponentAtNode` APIs bridge to the same compatibility root. Deprecated `hydrate` currently renders through that root; actual DOM adoption remains part of Phase 5 with `hydrateRoot`.

The Phase 4 differential trace verifies class identity, state and prop updates, context, refs, snapshots, update callbacks, `PureComponent`, descendant error capture, Profiler phases, and unmount cleanup against React 18.3.1 and React 19.2.0. The published fixture pins `react-error-boundary@6.1.2` and verifies fallback rendering plus reset-key recovery.

Hydration, ReactDOM server rendering, streaming Suspense integration, and request-scoped cache lifetimes are addressed by Phase 5 below.

## Phase 5: hydration and server rendering

Phase 5 adds `hydrateRoot` and upgrades React 18's deprecated `hydrate` bridge to adopt matching server DOM. React-compatible server output intentionally omits eXact boundary comments; hydration infers nested component ranges and installs invisible text anchors, preserving matching element identity, form state, refs, events, and renderer ownership. A mismatch is reported through `onRecoverableError`, then replaced with a clean client render. Selective/event-replay hydration and Fiber-derived component stacks are not reproduced.

The compatibility resolver now aliases `react-dom/server`, its browser and Node targets, and React 19's `react-dom/static` targets. String rendering covers React's common HTML attribute casing, boolean attributes, numeric style units, raw HTML, and the different adjacent-text behavior of `renderToString` and `renderToStaticMarkup`. Target-specific React 18/19 attribute casing is selected by the compatibility baseline.

Node pipeable streams, Web readable streams, React 18's deprecated Node streams, and React 19 prerender/resume entrypoints expose their documented output shapes. They currently emit an all-ready render: Suspense fallbacks work for synchronous string rendering and async resources are awaited for async streams, but boundaries are not progressively revealed and postponed React Fiber state cannot be serialized or resumed. Resume APIs therefore rerender the supplied tree.

React 19 `cache` entries and `cacheSignal` now inherit a server-render context. Repeated calls within one request share entries; a later request receives a fresh cache, and its signal aborts when the request-owned component tree is disposed. Calls made outside compatibility server rendering retain the client/process fallback.

The Phase 5 differential trace compares React 18.3.1 and React 19.2.0 server strings, static markup, pipeable output, markerless DOM identity, state updates, and unmount cleanup. Server fixtures additionally exercise `@emotion/react@11.14.0` context and a seeded `@tanstack/react-query@5.101.2` request.

The remaining production-hardening envelope is full specialized host-element normalization, incremental Suspense streaming/selective hydration, genuine postponed-state resume, React server resource coordination, and Fiber scheduler/error-stack behavior.

## Phase 6: production hardening and certification

Phase 6 closes the production-hardening work that can be implemented without recreating Fiber. Root-scoped `useId` allocation now honors `identifierPrefix` deterministically across server rendering and hydration. Compatibility roots route handled class-boundary failures to `onCaughtError`, uncaught root failures to `onUncaughtError`, and recoverable hydration mismatches to `onRecoverableError`. Component stacks contain eXact owner names rather than React source locations.

React server serialization now applies target-specific React 18/19 rules for form controls, SVG names, custom elements, vendor styles, void elements, raw script/style text, image preloads, bootstrap scripts/modules, and React 19 resource hints. Resource hints are request-scoped, deduplicated, and emitted in React-compatible priority order for the certified matrix. This covers the common production host surface but is not a claim that every private React DOM host-config edge case is reproduced.

Async compatibility streams wait for thrown Suspense resources to settle, expose all-ready behavior, and propagate abort signals and task deadlines instead of converting interruptions into component fallbacks. Hydration replacement preserves dirty input, textarea, select, and editable state when a control can be matched by a unique explicit ID or form name plus control signature. Incremental boundary reveal, selective hydration, event replay, and serialized postponed Fiber state remain outside this runtime's architecture.

The Phase 6 differential trace runs a deterministic combinatorial host-serialization matrix plus identifier, bootstrap, and resource scenarios against React 18.3.1 and React 19.2.0. The package certification suite composes current pinned builds of `lucide-react`, `@emotion/react`, `@tanstack/react-query`, and `react-error-boundary` through the runtime aliases and server renderer.

The final compatibility boundary is explicit:

- Function and class components, custom hooks built from implemented hooks, context, refs, effects, external stores, portals, error boundaries, all-ready Suspense, markerless hydration, and common React DOM server output are supported or documented approximations.
- Fiber scheduler lanes, development Strict Mode replay, exact Fiber ID/source-stack encoding, progressive Suspense wire protocols, selective hydration/event replay, genuine postponed-state resume, and React Server Components wire protocols are not reproduced.
- Existing packages require resolution aliases for public React entrypoints, not compilation. The eXact compiler may accept React JSX as an ergonomic feature, but it is not required for compatibility packages already published in `node_modules`.
