# React Router Compatibility Adversarial Review

Status: final findings from the post-implementation adversarial pass.

This document preserves the findings against the frozen review baseline. The
subsequent disposition and verification evidence are tracked in
`react-router-adversarial-remediation.md`.

Review baseline: pre-execution plan commit
`0fc11e9976f28bfe6f050839b87604cc32a8db78`.

Implementation reviewed through commit
`c7e671a` (`docs(router): reconcile compatibility plan with implementation`).
The implementation was frozen before this review. These findings were
documented without changing the reviewed code.

## Verification completed before the review

- Repository build and production/test typechecks passed.
- All 1,067 package tests passed.
- Server-component and shipping sample tests passed.
- Package-content and platform-boundary checks passed.
- Kanban and workbench production builds passed.
- Native, data, and v5 router production tree-shaking gates passed.

Those results establish that the repository is internally green. They do not
establish the broader React Router behavioral contract; several gaps below are
outside the scenarios exercised by the current tests.

## Findings

### AR-01 — High: stale initialization, action, and revalidation work can commit

The plan requires every authoritative navigation result to belong to the
current transition identity. Only `navigate()` performs that check.
`initialize()`, `submit()`, and `revalidate()` can commit after a newer
operation has superseded and aborted them if user code does not cooperate with
the abort signal. `submit()` allocates `currentTransition` but never checks it.

`revalidate()` also aborts the shared `activeAbort`. A fetcher mutation that
calls revalidation can therefore abort an unrelated navigation, contrary to the
planned requirement that fetchers run alongside navigation.

Evidence:

- `component-libraries/router/src/core.ts:237`
- `component-libraries/router/src/core.ts:255`
- `component-libraries/router/src/core.ts:263`
- `component-libraries/router/src/core.ts:292`
- `component-libraries/router/src/core.ts:297`
- `component-libraries/router/src/core.ts:316`

Example:

```ts
const router = createMemoryRouter([
	{
		id: 'account',
		path: 'account/:id',
		action: async () => {
			await slowServiceThatIgnoresAbort();
			return { saved: 'old request' };
		}
	}
]);

const oldSubmit = router.submit('/account/1', { method: 'POST' });
await router.navigate('/account/2');
await oldSubmit;

// The old action/revalidation is still allowed to overwrite current state.
```

This is a controller correctness issue, not merely a React compatibility
difference.

### AR-02 — High: controlled `Router` and v5 external history locations are

captured once

The modern low-level `Router` converts `props.location` into a local string,
then creates its controller in a `useMemo` whose only dependency is
`props.navigator`. The location source closes over that first string. A later
location prop update or an external history listener notification rebuilds a
snapshot from the original location.

The v5 `Router history={history}>` facade delegates to this implementation, so
the documented external-history integration does not reliably observe history
location changes.

Evidence:

- `component-libraries/router/src/modern.ts:129`
- `component-libraries/router/src/modern.ts:142`
- `component-libraries/router/src/modern.ts:143`
- `component-libraries/router/src/v5.ts:72`

Example:

```ts
function App({ location }: { location: string }) {
  return (
    <Router location={location} navigator={navigator}>
      <LocationReader />
    </Router>
  );
}

// Re-rendering App with location="/next" retains the controller's first
// location unless the navigator object identity also changes.
```

This misses an explicit v5 exit criterion from the pre-execution plan.

### AR-03 — High: static data routing drops response metadata and some redirects

`createStaticHandler()` always returns empty `loaderHeaders` and
`actionHeaders`. Successful loader/action `Response` status and headers are
consumed into body data but are not retained for the SSR response. Thrown
redirect responses from actions are caught as route errors rather than
processed as redirects; loaders handle thrown redirects through a separate
path.

Evidence:

- `component-libraries/router/src/modern.ts:574`
- `component-libraries/router/src/modern.ts:602`
- `component-libraries/router/src/modern.ts:603`
- `component-libraries/router/src/core.ts:270`
- `component-libraries/router/src/core.ts:284`
- `component-libraries/router/src/core.ts:532`

Example:

```ts
const routes = [
	{
		id: 'download',
		path: 'download',
		loader: () =>
			new Response('ready', {
				status: 202,
				headers: { 'Cache-Control': 'private', 'X-Route': 'download' }
			})
	}
];

// query() returns body data, but loaderHeaders is {} and statusCode remains
// 200, so the root SSR response cannot reproduce the route response.
```

This deviates from the planned RequestContext/response-control integration and
the SSR status/header/redirect certification scenario.

### AR-04 — High: ancestor route error boundaries cannot read the child error

When a child loader/action fails, `renderRouteMatches()` finds an ancestor
boundary but publishes the ancestor route ID through `RouteIdContext`.
`useRouteError()` then reads `snapshot.errors[ancestorId]`, while the error is
stored under the failing child ID. The boundary receives `undefined`.

The renderer also returns the selected boundary directly instead of rebuilding
unfailed ancestor layout elements above it. Rendering exceptions are not
wrapped by a route-owned React error boundary here; the `ErrorBoundary` field
is used only when the controller already contains a route-data error.

Evidence:

- `component-libraries/router/src/modern.ts:392`
- `component-libraries/router/src/modern.ts:779`
- `component-libraries/router/src/modern.ts:786`
- `component-libraries/router/src/modern.ts:799`

Example:

```ts
const routes = [{
  id: "root",
  ErrorBoundary: function Boundary() {
    const error = useRouteError(); // undefined for the child failure
    return <p>{String(error)}</p>;
  },
  children: [{
    id: "child",
    path: "child",
    loader: () => { throw new Error("child failed"); }
  }]
}];
```

This is a common data-router behavior and an explicit planned differential
scenario.

### AR-05 — High: hydration data is not bound to a router, route graph, or URL

The serialized hydration shape contains only loader data, action data, and
errors. It has no controller protocol version, location, basename, router
identity, or route-graph identity. The browser reads a single document-global
element ID, removes it, and gives it to whichever browser/hash router is
created first.

A payload from another router root or URL can therefore suppress initial
loaders and be adopted solely because route IDs happen to match. Multiple
router roots cannot independently consume their own payloads.

Evidence:

- `component-libraries/router/src/core.ts:55`
- `component-libraries/router/src/core.ts:481`
- `component-libraries/router/src/modern.ts:650`
- `component-libraries/router/src/modern.ts:658`
- `component-libraries/router/src/modern.ts:894`

Example:

```html
<script id="__exact_router_hydration" type="application/json">
	{ "loaderData": { "account": { "name": "Tenant A" } } }
</script>
```

```ts
// If this is now /tenant-b/account and its route also has id "account",
// createBrowserRouter() adopts Tenant A's data and skips initial loading.
const router = createBrowserRouter(routes);
```

This differs from the plan's protocol-version requirement and its separate-root
and hydration-adoption requirements.

### AR-06 — High: route hydration is JSON-checked but not a compiler data-policy

sink

`hydrationDataFromSnapshot()` validates JSON shape, depth, node count, and byte
size. No compiler or manifest integration marks loader/action return values as
route-transfer sinks, and the serializer has no policy metadata with which to
reject `keep=server` or secret-derived values. JSON safety is not equivalent to
the planned server-kept/secret transfer policy.

Evidence:

- `component-libraries/router/src/core.ts:481`
- `component-libraries/router/src/core.ts:491`
- No compiler reference to `hydrationDataFromSnapshot`, route loader data, or
  the router hydration element exists outside `@exact/router`.

Example:

```ts
/** @exact server */
async function loader() {
	const internal = await loadServerOwnedAccountData();
	return { internal }; // JSON-safe is sufficient for the current serializer.
}

// The route-transfer boundary has no policy check comparable to an island or
// VNode transfer sink.
```

This is a direct deviation from the pre-execution data-routing plan. It should
not be represented as solved by the resource-limit checks.

### AR-07 — High: cross-origin `Link` clicks are intercepted

The planned browser behavior distinguishes same-origin router navigation from
external URLs. `Link` uses `shouldHandleClick()`, which checks buttons,
modifiers, target, and download but not origin or protocol. A normal click on
`to="https://other.example/"` is passed to controller navigation; a browser
history source then attempts `pushState` with a cross-origin URL, which throws
instead of allowing normal document navigation.

Evidence:

- `component-libraries/router/src/modern.ts:339`
- `component-libraries/router/src/modern.ts:355`
- `component-libraries/router/src/modern.ts:831`

Example:

```tsx
<Link to="https://docs.example.com/">Documentation</Link>
// Expected: ordinary browser navigation.
// Current path: preventDefault(), then router.navigate(externalUrl).
```

This is likely to appear in ordinary component-library and application usage.

### AR-08 — Medium: several mapped modern APIs are ignored or placeholder-only

The adapter metadata exposes these APIs as supported, but important behavior is
missing:

- `Routes location` and `useRoutes(routes, location)` accept but ignore the
  location override.
- Low-level `Router navigationType` is accepted but not used to initialize the
  controller observation.
- `HydrateFallback` and `hydrateFallbackElement` are never selected by route
  rendering.
- `useViewTransitionState()` always returns `false`.
- `defer()` is an identity function and does not implement deferred lifecycle
  semantics.
- `ScrollRestoration` uses one module-global memory map rather than a
  router/root-owned restoration store.

Evidence:

- `component-libraries/router/src/modern.ts:129`
- `component-libraries/router/src/modern.ts:175`
- `component-libraries/router/src/modern.ts:201`
- `component-libraries/router/src/modern.ts:46`
- `component-libraries/router/src/modern.ts:477`
- `component-libraries/router/src/modern.ts:489`
- `component-libraries/router/src/modern.ts:679`
- `component-libraries/router/src/modern.ts:702`

Because the router source policy fails closed for unmapped exports, mapping a
placeholder gives consumers a stronger compatibility signal than the
implementation currently warrants.

### AR-09 — Medium: v5 `Redirect` cannot perform a static-render redirect

The v5 `Redirect` performs navigation only in `useEffect()`. Effects do not run
during SSR, so placing it under the v5 `StaticRouter` does not populate the
static context during rendering. The `StaticRouter` has code to record
navigation, but `Redirect` never calls it on the server.

Evidence:

- `component-libraries/router/src/v5.ts:88`
- `component-libraries/router/src/v5.ts:141`
- `component-libraries/router/src/v5.ts:152`

Example:

```tsx
const context = {};
renderToString(
	<StaticRouter location="/old" context={context}>
		<Redirect to="/new" />
	</StaticRouter>
);

// context does not receive the redirect because the effect never runs.
```

This conflicts with the planned statement that a v5 redirect maps to an SSR
response redirect.

### AR-10 — Medium: lazy routes cannot supply renderer-owned route fields

The renderer-neutral `ExactLazyRoute` type only permits `loader`, `action`,
`shouldRevalidate`, and `handle`. Modern route-object lazy functions therefore
cannot provide `Component`, `element`, `ErrorBoundary`, `errorElement`, or
hydration fallback fields. `materializeLazy()` mutates only the core route
record and the public type prevents the common renderer-owned lazy contract.

Evidence:

- `component-libraries/router/src/core.ts:50`
- `component-libraries/router/src/core.ts:389`
- `component-libraries/router/src/modern.ts:38`

This falls short of the planned route-level lazy chunks and modern data-router
route-object support.

### AR-11 — Medium: conformance evidence and compatibility reporting are much

narrower than the mapped surface

The pinned differential suite contains seven tests. It compares v5 matching,
modern path helpers, and a simple memory-router loader/navigation scenario. It
does not perform the plan's paired real-versus-eXact comparisons for DOM route
rendering, external history, actions, fetchers, blockers, cancellation, errors,
SSR headers/status, hydration, or lazy routes.

The compatibility report lists registry replacement ranges, not the exact
resolved source instance/version and importer/export actually selected during
each transformation. `sourceLocation` is present for unsupported versions but
not for successful substitution records. This does not yet support auditing a
graph with multiple installations of the same version as designed.

Evidence:

- `component-libraries/router/src/differential.test.ts`
- `packages/react-compat/src/build.ts:104`
- `packages/react-compat/src/build.ts:222`
- `packages/react-compat/src/build.ts:231`
- `docs/react-router-compatibility-plan.md:753`

The implementation is meaningfully tested, but the current evidence cannot
justify broad claims of behavioral compatibility for every export in the
metadata maps.

## Plan comparison summary

The implementation follows the plan's central architectural decision:
`@exact/router` is the single routing authority, version selection is based on
resolved package instances, v5 and modern semantics are separated, unsupported
versions fail closed, and compatibility families tree-shake from their own
subpaths.

The largest deviations are in behavioral completeness rather than package
architecture:

- Transition ownership is complete only for ordinary navigation.
- SSR response controls and route transfer policy are not integrated end to
  end.
- Error, hydration, external-history, and external-link behavior have adoption
  blockers.
- Several advertised modern APIs are partial placeholders.
- Certification is substantially narrower than the public substitution map.

No fixes were made during the review itself. Subsequent fixes do not rewrite
these historical findings; see the remediation record linked above.
