# Repository-wide adversarial code review

Date: 2026-07-25  
Baseline: `35a3f0bd` plus the current uncommitted direct-React-JSX work  
Scope: every repository-owned TypeScript, TSX, JavaScript, JSX, MTS, CTS, MJS, and CJS file

## Executive assessment

The review's clear correctness and hardening fixes have been applied. The repaired areas include
DOM event delivery, transactional construction and subtree mounting, incremental request-size
enforcement, adapter cancellation and cleanup, React refs and mixed children, runtime component
branding at compatibility boundaries, release and scaffolding validation, and stale or unbounded
application state.

The remaining finding is an optional tooling consolidation whose cost is not yet justified by a
demonstrated failure. It is summarized below with the viable options. The original finding
descriptions remain in this document as the audit trail.

This is a review record, not proof that unmentioned code is defect-free.

## Remediation status

### Resolved

- **CR-01 through CR-11:** direct React refs now use one normalized boundary;
  non-bubbling DOM events install direct listeners; failed construction and mounting roll back
  owned resources; Node request bodies are limited while streaming; React re-exports, aliases,
  finite selections, and supported wrappers pass through one compatibility adapter unless they are
  positively local eXact declarations; compiled and plain-`tsc` eXact libraries emit the shared
  native component marker; native children receive React element semantics; React 18/19
  type facades reject conflicting targets and admit branded native components in React-owned JSX;
  and Jest preserves React JSX ownership in test modules.
- **AD-01 through AD-04:** Express delegates to the canonical server adapter, Koa and Fastify
  propagate disconnect cancellation, static React resume owns a working abort lifetime, and public
  URL construction uses only an application-owned origin policy rather than forwarded headers.
- **CR-12:** native `iframe.srcdoc` now requires an `unsafeHtml()` value plus the existing root
  opt-in and audit callback consistently across DOM rendering, SSR, and hydration.
- **TL-01 through TL-03, TL-05, and TL-06:** path identity respects filesystem case semantics, malformed
  manifests fail release planning, create-app validates and directly spawns package managers, and
  empty-string JSX keys remain keyed. React scenarios capture their expected diagnostics and fail
  when new warning or error output appears.
- **APP-01 through APP-05:** the shipping sample publishes transport failures instead of retaining
  stale results, its quote cache is bounded, docs timers are lifecycle-safe, and successful remote
  module caching is bounded. Generated hidden-root coverage now verifies opaque server-task
  exchanges, client/build/root selection, state application, and cancellation.
- **RX-01 through RX-07:** compatibility roots are
  consistent, build engines are retained, ownership heuristics no longer decide native JSX
  lowering, Jest fingerprints compatibility inputs, a generated boundary is exercised through
  compilation, mount, update, SSR, hydration, and unmount, documentation matches the
  implementation, and explicit native-component ref properties survive adaptation.
- **Optional form context observation:** `Component.hasContext()` now permits a precise presence
  check, and `Field` no longer catches and discards every context lookup failure.

### Set aside pending a demonstrated need

- **TL-04:** each integration now owns a stable, invalidatable engine for its natural session.
  Introducing a single host-independent snapshot abstraction remains possible, but there is no
  demonstrated correctness defect that justifies that additional abstraction today.

## Coverage and method

The inventory contains 1,041 code files:

| Area                  | Files |
| --------------------- | ----: |
| `packages`            |   705 |
| `apps`                |   141 |
| `scripts`             |    46 |
| `framework-adapters`  |    46 |
| `component-libraries` |    40 |
| `plugins`             |    31 |
| `react-adapters`      |    20 |
| `fixtures`            |     9 |
| root configuration    |     3 |

Of these, 234 are test files. The large files under `packages/react-dom-compat/fixtures` are
generated package bundles. They were assessed through their generator, pinned inputs, package
corpus, and conformance checks rather than treated as maintainable handwritten source.

Every inventoried file was included in:

- formatting and ESLint analysis;
- TypeScript project analysis where the file belongs to a TS project;
- source-architecture, platform-boundary, JSDoc, publication, package-content, and README gates
  where applicable;
- scans for suppressed diagnostics, unfinished markers, empty catches, unsafe HTML and URL sinks,
  global caches, timers, event listeners, abort handling, subprocesses, and filesystem boundaries;
  and
- a subsystem review of compiler, expressions, reactivity, component lifetime, DOM, hydration,
  SSR, server protocol, adapters, plugins, React compatibility, testing, scaffolding, applications,
  fixtures, and repository scripts.

Manual review was deepest at compiler/runtime, lifecycle, serialization, server/client, and
security boundaries, following the repository's seat-belt rule. Static declarations and obvious
forwarding facades received proportionally lighter review.

## Confirmed framework and package findings

### CR-01 — Critical — Compiler-generated React refs are lost

The JSX compiler wraps the component type but leaves `ref` as an ordinary eXact prop
(`packages/compiler/src/transform/jsx/element-emission.ts:50` and `:120`). The React function and
class adapters instead consume `__exactReactCompatibilityRef`
(`packages/react-compat/src/runtime/function-adapter.ts:48` and
`packages/react-compat/src/runtime/class-support.ts:43`).

That private channel is populated when a React element passes through `toExactNode()`, not when the
compiler directly substitutes `adaptReactComponent()`. A directly rendered `forwardRef` receives
`null`, and class refs are not assigned. The teardown guard prevents a crash but does not make the
ref work.

Add one supported ref-normalization operation and compiled-boundary tests for function,
`forwardRef`, class, replacement, and unmount behavior.

### CR-02 — High — Non-bubbling DOM events are delegated and never reach handlers

The JSX surface advertises a broad DOM event list in
`packages/jsx-runtime/src/jsx-runtime.ts:137`. `packages/dom/src/props.ts:219` installs only a small
set directly; all other non-capture handlers are delegated to the root.

Several advertised events do not bubble, including `pointerenter`, `pointerleave`, `invalid`,
`cancel`, `close`, `toggle`, and many media lifecycle events. Their ordinary `onX` handlers cannot
reach the root listener. Capture variants work because capture handlers are installed directly,
which can obscure the defect.

Event placement should use an explicit event-semantics table, with DOM dispatch coverage for every
advertised non-bubbling family.

### CR-03 — High — Failed construction and subtree mounting are not transactional

`packages/core/src/component/construction.ts:4` stops scopes and tasks after setup throws but does
not run registered unmount handlers. A component that acquires a resource, registers its release
with `this.onUnmount()`, and later throws leaks that resource.

Both loops in `packages/dom/src/renderer/mounting/children.ts:20` and `:64` also accumulate mounted
children without disposing earlier children if a later mount fails. Stopping the shared reactive
scope does not invoke component unmount handlers, clear element props, remove a partial portal, or
release renderer ownership.

Mounting should prepare a provisional subtree and dispose it in reverse order on failure.
Construction cleanup should use the normal lifecycle contract while retaining the construction
error as primary.

### CR-04 — High — The Node adapter applies request limits after unbounded buffering

`framework-adapters/node-adapter/src/handler.ts:23` starts `readNodeRequestBody()`. That function
appends every chunk to an array at line 48. Only after the complete body is assembled does
`@exactjs/server` apply `maxRequestBytes`.

An unauthenticated client can force memory growth beyond the configured limit. Count bytes while
reading, reject and stop consuming at the limit, use `content-length` only as an early rejection,
and remove listeners on every settlement path.

### CR-05 — High — Local React re-exports can be guessed as native eXact

`packages/react-compat/src/build/engine.ts:424` treats an unresolved relative import as eXact and
does not follow the selected symbol through local static re-exports. A barrel that re-exports a
React package can cause the React component to be invoked as an eXact setup function.

Resolve selected export chains. An unresolved chain must become `unknown` and produce the promised
diagnostic, never a native ownership guess.

### CR-06 — High — Aliased and derived React component values bypass classification

The compiler calls the ownership classifier only when the JSX tag's current binding has
`importedFrom` (`packages/compiler/src/expression/jsx.ts:74`). Local aliases, finite conditionals,
and wrapped values such as `memo(DatePicker)` can bypass classification and lower as
native/dynamic eXact components.

Follow safe binding provenance to terminal component identities: all React may adapt, all eXact
stay native, and mixed or opaque terminals require an explicit boundary.

### CR-07 — High — React ownership can remain stale in Vite watch mode

The cache omits declaration content/source version, and local declarations consulted during
classification are not added to the watch set
(`packages/react-compat/src/build/engine.ts:304` and `:309`). Changing an annotation, declaration,
or re-export target can retain its previous ownership.

Record each consulted declaration and invalidate by dependency or include its content/version in
the cache key.

### CR-08 — High — Native children passed into React are raw eXact VNodes

`packages/dom/src/children.ts:114` supplies normalized eXact VNodes as `children` to a generated
React adapter. React code sees them before `toExactNode()` can translate anything.
`React.Children`, `isValidElement`, `cloneElement`, key inspection, and child wrappers therefore do
not receive React element semantics.

Native children need an explicit React-owned boundary representation preserving key, ref, context,
and cleanup identity.

### CR-09 — High — React-owned TSX cannot type native eXact children

The runtime recognizes compiler-attached eXact contracts, but a native `ComponentFunction` is not
a React `JSXElementConstructor`. React-owned source can fail typechecking before the runtime bridge.

Resolved with target-specific React type facades plus a runtime native-component marker. Compiled
components receive the marker automatically, while framework libraries built with plain `tsc`
apply it explicitly. React-owned `createElement` and JSX therefore preserve a marked component as
native eXact; an unmarked callable remains owned by the one enabled compatibility layer.

### CR-10 — High — React 18/19 facades do not enforce the configured target

`packages/react-compat/src/types18.ts` and `types19.ts` are effectively identical global
augmentations. Both can load, neither verifies the installed declaration major, and neither is
tied to the bundler target.

Use a single generated target marker that rejects dual/mismatched facades, with TS6/TS7 fixtures
for both majors.

### CR-11 — High — Jest emits test-local React JSX through the eXact JSX runtime

`packages/jest/src/transformer.ts:40` excludes test modules from ownership transformation, then
transpiles JSX with `@exactjs/jsx` at line 68. An inline Hook component or React fixture in a test
module is emitted with native eXact JSX semantics.

Skipping component analysis and skipping JSX ownership are separate decisions. React-owned test
modules still require the React JSX transform.

### CR-12 — High hardening — `srcdoc` bypasses the unsafe-HTML capability

Native eXact rejects `dangerouslySetInnerHTML` and gates `unsafeHtml()`, but intrinsic props are
forwarded by `packages/dom/src/props.ts`. Therefore:

```tsx
<iframe srcdoc={untrustedHtml} />
```

crosses an HTML execution sink without the compiler capability, render option, or audit callback.
SSR escaping does not remove the issue; the browser decodes the attribute and parses the iframe
document.

If `srcdoc` is an intentional platform escape hatch, document that exception explicitly.
Otherwise route it through unsafe-HTML policy in compiler, DOM, SSR, and hydration.

## Adapter and runtime hardening

### AD-01 — Medium — The standalone Express adapter regresses server semantics

`framework-adapters/express-adapter/src/index.ts` duplicates the fuller implementation in
`packages/server/src/adapters.ts` but omits disconnect cancellation, writable backpressure,
reader-lock cleanup, cleanup-preserving error handling, and a safe terminal error path.

At line 58, the no-`next` branch throws inside a detached Promise rejection callback. The middleware
has returned, so this becomes an unobserved rejected Promise.

Delegate to one shared implementation or deliberately implement the same transport contract.

### AD-02 — Medium — Koa and Fastify do not propagate disconnect cancellation

`framework-adapters/koa-adapter/src/index.ts:25` and
`framework-adapters/fastify-adapter/src/index.ts:23` invoke the runtime without a signal. Long work
continues after disconnect, and request-scoped resources do not receive the transport lifetime
provided by Node, Fetch, Bun, Deno, Cloudflare, and Hapi.

Derive signals from each platform's raw request/response lifecycle and clean up listeners on every
completion path.

### AD-03 — Medium — React static resume exposes a no-op abort

`packages/react-dom-compat/src/static-node.ts:36` rerenders for
`resumeToPipeableStream()`, but its returned `abort()` at line 56 does nothing. The documented lack
of postponed Fiber state does not justify ignoring cancellation of the replacement render.

Own an `AbortController`, combine it with the supplied signal, and abort the async eXact render.

### AD-04 — Medium — Request URL construction trusts forwarded protocol globally

`packages/request/src/value.ts` uses `x-forwarded-proto` and `host` directly to construct the public
URL. Forwarded-header trust is a deployment/adapter decision. An untrusted client can influence
absolute URLs and relative redirect destinations when a proxy has not stripped those headers.

Adapters or server configuration should supply a trusted public origin after applying proxy
policy.

## Compiler, tooling, and release findings

### TL-01 — Medium — Expression rewrite paths collide on case-sensitive systems

`packages/expressions/src/module/program.ts:71` lowercases every filename. A case-sensitive system
may contain both `Foo.ts` and `foo.ts`; they then share one rewrite-program cache and compiler-host
identity.

Other expression paths already use `ts.sys.useCaseSensitiveFileNames`. This helper should too.

### TL-02 — Medium — Malformed workspace manifests are silently omitted from affected releases

`scripts/release-affected.mjs:106` catches every read/parse error. A malformed or unreadable
workspace disappears from the dependency graph, allowing the affected-release profile to skip the
package whose metadata is broken.

Only an intentionally absent manifest may be skipped. Parse and permission failures should name
the path and fail planning.

### TL-03 — Medium security — `create-exact-app` invokes an unchecked shell command

`packages/create-exact-app/src/project-generation.ts:374` passes the public API's `packageManager`
value to `spawnSync(..., { shell: true })`. A TypeScript union is not runtime validation for
JavaScript callers, and shell execution turns an invalid value into command injection.

Validate at the API boundary and spawn a known executable without a shell.

### TL-04 — Medium — Compatibility caches lack one lifecycle/fingerprint contract

- Webpack and Bun recreate the ownership engine per transformed file.
- Jest serializes `RegExp` configuration as `{}` and omits registry/declaration dependencies.
- compatibility root selection differs by host;
- the plugin registry process cache depends on caller-driven invalidation.

A build session needs one owned, invalidatable compatibility snapshot and stable fingerprint shared
by Vite, Webpack, Bun, CLI, Vitest, Jest, and Bun test.

### TL-05 — Low — The automatic JSX runtime loses `key=""`

`packages/jsx-runtime/src/jsx-runtime.ts:87` checks `normalizedKey` by truthiness before giving it to
`createVNode()`. An empty string is a valid explicit key but becomes unkeyed. Check for
`undefined`, matching `createVNode()` normalization.

### TL-06 — Low — React conformance passes with uncontrolled warning noise

The reconciler/R3F gate passes but emits numerous React `act(...)` warnings, an expected error
boundary report, and dependency deprecation warnings. Expected console output is not captured and
asserted, so a new warning can disappear into existing noise without changing the exit status.

Capture expected diagnostics around each scenario and fail on unexpected console output.

## Application and example findings

### APP-01 — Medium — Shipping transport failures leave stale UI

`apps/shipping-calculator/src/components/workspace.tsx:65` and `:78` discard rejected route and
provider operations. Loading clears, but no error is published and previous data remains visible
as if current.

This belongs in the application: distinguish stale/current results and expose error/retry state.

### APP-02 — Medium — Shipping quote cache never removes expired entries

`apps/shipping-calculator/src/providers/registry.ts:18` owns a process-global cache keyed by the
complete request. Reads ignore expired entries, but nothing deletes them and there is no size
bound. Use bounded LRU/TTL eviction or an application-scoped cache service.

### APP-03 — Low — Docs copy feedback writes after unmount

`apps/docs/src/CodeBlock.tsx:24` schedules a state write 1.4 seconds later without lifecycle
cancellation. Use an abort-scoped task/timer so the example models idiomatic eXact ownership.

### APP-04 — Low — Remote module successes remain cached forever by URL

`plugins/microfrontends/src/client.ts:32` retains every successful remote URL. Recovery URLs are
cache-busted, so deployment churn grows the map for a long-running shell. Bound it or release
obsolete generations when no remote uses them.

### APP-05 — Medium coverage gap — Hidden-root server dispatch remains a todo

`apps/microfrontend-portal/sample.test.ts:221` leaves compiled `this.task.server()` dispatch through
each hidden root as `it.todo`. This boundary must prove that each remote uses its own client, build
key, execution root, and cancellation lifetime.

## Additional direct-React-JSX findings

- **RX-01 — Medium:** `ReactCompatibilityOptions.cwd` is not honored consistently across hosts.
- **RX-02 — Medium:** Webpack and Bun create an ownership engine per file, not per build.
- **RX-03 — Medium:** whole-signature/file `ReactNode` heuristics can falsely mark explicitly native
  components ambiguous.
- **RX-04 — Medium:** Jest's cache key omits regex source/flags, registry fingerprint, declaration
  dependencies, and resolved root.
- **RX-05 — Medium:** no executable test compiles direct React JSX and then mounts, updates,
  hydrates, and unmounts the generated boundary.
- **RX-06 — Medium:** docs claim mixed-child and ref guarantees contradicted by CR-01, CR-08, and
  CR-09.
- **RX-07 — Low:** `adaptReactComponent(exposeExactComponent(...))` drops a custom `exactRefProp`.

## Lower-severity observations

- `component-libraries/forms/src/form/field.ts:27` treats every context lookup failure as “no
  surrounding form.” A non-throwing optional-context API would express the intent without masking
  future context errors.
- Nine production modules exceed 400 lines and 108 exceed 250. Size alone is not a defect. The
  clearest ownership candidates are the React ownership engine and Webpack plugin, which mix
  discovery, classification, caching, transformation, diagnostics, and host lifecycle.
- Vite 8's production checks flag the `exact` plugin as a significant build-time contributor for
  Kanban, Workbench, microfrontends, and both docs targets. This is a profiling lead, not a
  correctness finding; measure the transform phases before choosing an optimization.
- The React package corpus inventories 106 packages, but executable event, hydration, and SSR
  evidence covers only a subset. Claims should remain bounded by the capability inventory and
  paired conformance traces.

## Verification evidence

Passed on the reviewed tree:

- `npm test`: 1,490 package tests, four server-component tests, and 19 shipping tests;
- `npm run test:bun`;
- TypeScript 6, TypeScript 7, and test typechecking;
- style, source-architecture, JSDoc, publish, and platform-boundary checks;
- the React package corpus, phase 1–6 paired traces, reconciler checks, R3F checks, Ink, and
  React-PDF checks; and
- automatic React 18 and React 19 compiler-output bundle checks; and
- the documentation production client, SSR, standalone build, and all 21 documented routes.

React compatibility scenarios now capture and validate expected warning/error output; unexpected
diagnostics fail the gate.

## Recommended remediation order

1. Introduce a cross-host snapshot abstraction under TL-04 only if concrete configuration drift
   appears.
2. Profile Vite transform phases before undertaking performance work, and expand executable React
   package coverage according to observed usage and risk.
