# React Router Adversarial Remediation

Status: implemented and repository-wide verification complete.

This document records how the findings in
`react-router-adversarial-review.md` were addressed. The review remains a
historical description of the frozen implementation it examined.

## Finding dispositions

### AR-01 — resolved

Every authoritative initialize, navigation, submission, and revalidation
operation now owns an identity that must still be current before it can commit.
Independent revalidation has its own cancellation channel. Fetcher work can
run alongside navigation, while a fetcher-triggered revalidation cannot
overwrite a newer navigation.

Tests deliberately use handlers that ignore abort signals so correctness does
not depend on cooperative cancellation.

### AR-02 — resolved

The low-level modern `Router` synchronizes changed `location` and
`navigationType` props into its controller. The v5 facade subscribes to the
provided history object and exposes a stable navigator over its current
location. Controlled rerenders and external `history.push()` are covered.

### AR-03 — resolved

The router snapshot retains successful and thrown `Response` status and
headers. Static queries expose `statusCode`, `loaderHeaders`, and
`actionHeaders`, and returned or thrown redirects follow the same redirect
path.

### AR-04 — resolved

Route data errors are supplied directly to the selected ancestor boundary,
while unfailed ancestor layouts remain mounted. A renderer-owned boundary also
catches component render failures and selects the route's error UI.

### AR-05 — resolved

Hydration uses a versioned envelope bound to a hydration key, public location,
and ordered matched route IDs. Browser and hash routers reject a mismatched
envelope and execute initial loaders. Keyed element IDs support independent
router roots in one document.

The route list is used as the route-graph binding because it captures the
ordered route IDs selected for the serialized URL without serializing
executable route definitions.

### AR-06 — resolved for current-package compilation

Loader and action results are compiler-observable hydration transfer sinks.
Server-kept or secret-derived returned data produces a hydration-boundary
diagnostic. Direct method syntax, property callbacks, shorthand properties,
and referenced local handlers are recognized.

This follows the package-local policy model: each source package compiles and
checks its own route handlers. No cross-package parameter/return summary was
added to manifests.

### AR-07 — resolved

The link click handler only intercepts routable same-origin HTTP(S) URLs.
Cross-origin and non-router protocols retain ordinary browser behavior.

### AR-08 — resolved by implementation or fail-closed removal

- `Routes location` and `useRoutes(routes, location)` publish an overridden
  route snapshot to descendant hooks.
- `navigationType` initializes controlled routers correctly.
- `HydrateFallback` and `hydrateFallbackElement` render during uninitialized
  data-router state.
- scroll positions are stored per router.
- `Await`, `useAsyncValue`, and `useAsyncError` implement fulfilled and
  rejected promise behavior.
- `defer` and `useViewTransitionState` were removed from the substitution map
  and facade exports. Importing either now fails closed instead of selecting a
  placeholder.

### AR-09 — resolved

V5 `StaticRouter` publishes a static context that `Redirect` updates
synchronously while rendering. Client redirects continue to navigate through
the effect lifecycle.

### AR-10 — resolved

Lazy route materialization accepts renderer-owned fields including
`Component`, `element`, error boundaries, and hydration fallbacks, in addition
to core loader/action fields.

### AR-11 — materially expanded; broad certification remains evidence-driven

The differential suite now compares pinned v5, pre-data v6, final v6, and v7
for their relevant path behavior. Final v6 and v7 are paired with eXact for
memory navigation/loaders, mutation action data and loader revalidation, lazy
loader materialization, and public path utilities.

Focused facade/controller tests cover the remaining remediated behaviors:
external history, controlled routing, external links, blockers, stale
operations, fetcher concurrency, route errors, SSR response metadata,
hydration adoption/rejection, separate hydration roots, rendering fallbacks,
lazy components, and awaited values.

Compatibility reports now separate:

- `substitutions`: the complete discovered adapter inventory and version
  ranges; and
- `selections`: actual importer-specific substituted or rejected exports,
  including resolved source location, installed source version, selected
  facade/export, adapter version, and rejection reason.

This closes the multiple-installation reporting design question. It does not
claim that every mapped export has a paired DOM trace; compatibility claims
remain bounded by the documented tests and intentional boundaries.

## Intentional boundaries after remediation

- React Router framework-mode route generation, middleware, development
  servers, and deployment adapters remain outside the library compatibility
  scope.
- React Router v8 remains unsupported and fails closed.
- `defer` and view-transition state are unsupported rather than emulated with
  placeholders.
- Route hydration policy is enforced within the package being compiled; no
  manifest-level inter-package function summaries are required.
- A configurable URL-policy plugin is not part of this router work.

## Verification

The final verification passed:

- repository build and production/test typechecks;
- all 1,086 package tests;
- server-component and shipping sample tests;
- package-content and platform-boundary checks;
- native, data, and v5 router production bundle gates; and
- Kanban and Workbench production builds.
