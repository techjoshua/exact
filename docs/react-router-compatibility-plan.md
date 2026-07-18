# React Router Compatibility Plan

Status: proposed; no implementation in this document.

## Purpose

eXact should not operate an independent React Router beside `@exact/router`.
The framework should provide one renderer-neutral routing controller through
`@exact/router`, then expose that controller through:

- Native eXact router components and context.
- A React Router v5 compatibility surface.
- A React Router v6/v7 compatibility surface.

React and eXact descendants must observe the same location, matches, navigation
state, route data, errors, blockers, and history. Compatibility must not copy
router snapshots between two independently authoritative routers.

This plan covers React Router library and data-router interoperability. It does
not initially reproduce React Router's framework-mode build system, file-route
generation, development server, or deployment runtime.

## Adoption Basis

Current npm download data does not provide exact installed-major market share,
but the published version distribution establishes that v5, v6, and v7 are all
material:

- React Router v6 is the strongest initial compatibility target.
- React Router v7 has substantial current adoption.
- React Router v5 remains common in established applications and is especially
  relevant to incremental migration.
- React Router v8 is new enough that it should be evaluated after the v6/v7
  contract is stable.

The first certification matrix therefore targets:

- `react-router` and `react-router-dom` 5.3.x.
- React Router 6 before the 6.4 data-router additions.
- React Router 6.4 through the final v6 release.
- React Router 7 library and data-router modes.

Compatibility metadata covers the public source modules used by those
versions, including `react-router`, `react-router-dom`, and documented server
and DOM subpaths. All mappings for one resolved installation select the same
semantic facade.

Version ranges in released adapters must be narrower than the versions covered
by executable conformance fixtures.

## Goals

- Make `@exact/router` the single routing authority across alternating native
  eXact and React compatibility subtrees.
- Extract matching, history, navigation, data loading, and transition state
  from the current native `Router` component into a renderer-neutral
  controller.
- Preserve the current native router API while the controller is introduced.
- Add the missing data-router capabilities needed for a strong native eXact
  router independently of React compatibility.
- Replace commonly used React Router components, hooks, and helpers with
  React-compatible facades backed by the eXact controller.
- Support the distinct v5 and v6/v7 public models without runtime prop guessing.
- Select adapter variants from the actual resolved source package instance and
  version, including graphs that contain more than one React Router major.
- Preserve descendant scope, nested routers, separate roots, concurrent SSR
  requests, cancellation, and disposal.
- Provide SSR, hydration, redirect, error, and route-data behavior consistent
  with eXact request, response, streaming, and data-policy contracts.
- Diagnose every unsupported React Router export or semantic fallback without
  silently starting a second router.

## Non-goals

- Depending on `react-router` or `react-router-dom` from native
  `@exact/router`.
- Reusing private React Router contexts or internal implementation modules.
- Shipping React or React compatibility code from the native `@exact/router`
  entrypoint.
- Reproducing undocumented implementation accidents when an equivalent public
  behavior can be provided.
- Making React Router v5 route definitions participate in v6 data APIs that did
  not exist in v5.
- Supporting React Router framework-mode route generation, its development
  server, or its deployment adapters in the first release.
- Supporting v8 until its relevant public library APIs have a pinned
  conformance matrix.
- Translating an inlined or bundled private copy of React Router whose package
  and export identity no longer exists.
- Treating client route context as trusted server authorization.

## Current Repository Baseline

`@exact/router` currently provides:

- History, hash, memory, and request-backed location sources.
- Nested component-reference routes and outlets.
- Static, dynamic, index, wildcard, and case-sensitive matching.
- Basenames and relative URL resolution.
- `Router`, `Route`, `Outlet`, `Link`, `NavLink`, and `Navigate`.
- Location, params, matches, search parameters, and navigation context.
- Request-context SSR lookup and response redirect recording.

The implementation currently keeps route collection, branch matching,
navigation, subscription, and route rendering inside the native `Router`
component. That coupling must be removed before a React facade can share the
same authority cleanly.

The React adapter system currently:

- Discovers inert package metadata through
  `@exact/react-compat-adapter-api`.
- Uses one source version range and replacement map per module.
- Normalizes replacements by source module and export name.
- Replaces provider components through explicit React-to-eXact boundaries.
- Shares intentional context identity between React compatibility and eXact.

It does not yet select different replacements for distinct installed instances
of the same source package. Router work must not weaken that limitation with a
router-specific runtime workaround.

## Settled Architecture

### Package boundaries

Use two packages:

```text
@exact/router
|- renderer-neutral controller, route model, matching, history, and data APIs
|- native eXact components and context
`- no React or React Router dependency

@exact/react-router
|- v5 React compatibility facade
|- v6 declarative facade
|- v6.4+ data-router facade
|- v7 library/data-router facade
`- inert version-conditioned substitution metadata
```

The adapter may have optional peer dependencies on the supported React Router
packages for type compatibility and conformance tests. Runtime adapter modules
must implement behavior through `@exact/router`; they must not delegate
authority to a second React Router.

### One controller

Every router provider creates, receives, or adapts one `ExactRouter` instance.
The nearest provider publishes the same instance through the bridged router
context token. Native and React compatibility consumers subscribe to that
instance using their own renderer's reactive primitives.

```text
Location source / request
          |
    ExactRouter controller
      /              \
native eXact       React-compatible
components         facades/hooks
```

Values remain root-, request-, and descendant-scoped. There is no global
current router.

### Renderer-neutral route records

The controller owns route behavior, not renderer objects. A common route record
contains fields such as:

```ts
interface ExactRouteDefinition {
  id: string;
  path?: string;
  index?: boolean;
  caseSensitive?: boolean;
  children?: readonly ExactRouteDefinition[];
  loader?: ExactRouteLoader;
  action?: ExactRouteAction;
  shouldRevalidate?: ExactShouldRevalidate;
  lazy?: ExactLazyRoute;
  handle?: unknown;
}
```

Native and React facades keep renderer-owned fields in their own projections:

- Native: component references, props, error components, pending components,
  and hydration fallbacks.
- React: `element`, `Component`, `ErrorBoundary`, `errorElement`,
  `HydrateFallback`, and the corresponding v5 render forms.

The controller returns match identities and route state. The active renderer
constructs the corresponding component branch.

### Controller contract

The exact names remain an implementation detail until Phase 2, but the core
capability should resemble:

```ts
interface ExactRouter {
  getSnapshot(): ExactRouterSnapshot;
  subscribe(listener: () => void): () => void;

  createHref(to: ExactTo): string;
  encodeLocation(to: ExactTo): RouteLocation;
  navigate(to: ExactTo | number, options?: NavigationOptions): Promise<void>;
  submit(target: FormData | URLSearchParams | object, options: SubmitOptions): Promise<void>;
  fetch(key: string, routeId: string, target: ExactTo, options?: FetchOptions): Promise<void>;
  revalidate(): Promise<void>;
  dispose(): Promise<void>;
}
```

The snapshot includes:

- Current location and history action.
- Matched route identities, params, pathname, and pathname base.
- Loader and action data.
- Route errors.
- Navigation and revalidation state.
- Fetcher state keyed by fetcher identity.
- Active blockers.
- Hydration and initialization state.

Snapshots are immutable observations. Navigation uses monotonic transition
identities and abort signals so stale loaders, actions, and fetchers cannot
commit into a newer navigation.

## Routing Core Work

### Location and history

Retain the current `LocationSource` concept while making its contract sufficient
for both API families:

- `PUSH`, `REPLACE`, and `POP` history actions.
- Delta navigation for v5 `go`, `goBack`, `goForward` and modern
  `navigate(number)`.
- Location keys and user state.
- Browser, hash, memory, static request, and externally supplied history
  sources.
- Subscription before the first render where a host requires it.
- Deterministic disposal.

React Router v5's `Router history={history}` accepts an existing history
instance. The v5 facade should adapt its documented public history interface
into an eXact location source. It should not replace the `history` package.

### Matching and resolution

Add and certify:

- Static, dynamic, optional, splat, index, and pathless layout routes.
- Nested route ranking.
- Absolute and relative child paths.
- Relative navigation by route hierarchy and pathname.
- Basename behavior.
- Trailing slash and percent-decoding behavior.
- Case sensitivity.
- Location overrides.
- `matchPath`, `generatePath`, and resolved-path helpers.

Compatibility-specific matching differences remain in the facade when they do
not belong in the native route model. In particular, a v5 `Switch` may appear
locally anywhere in a compatibility tree. It should use common matching
utilities against the shared controller location rather than forcing every v5
`Route` into one global data-route graph.

### Data routing

Add a native data model based on explicit capabilities rather than React
objects:

- Route loaders and actions.
- Request method, URL, headers, body, params, abort signal, and configured
  application/request context access.
- Redirect and response controls integrated with `RequestContext`.
- Action completion followed by bounded loader revalidation.
- Concurrent loader execution where dependencies permit.
- Fetchers independent of navigation.
- `shouldRevalidate`.
- Lazy route behavior and cancellation.
- Route error association and nearest-boundary selection.
- Initial SSR loading and hydration data.

Loader and action outputs selected for client hydration are framework transfer
sinks. They must use the existing JSON/resource limits and generic data-policy
checks. Secret-qualified or server-kept data cannot become route hydration
data. Client route state never authorizes a server action; server actions and
route actions re-read trusted request/application context.

### Navigation lifecycle

Define one state machine for both facades:

```text
idle
  -> submitting
  -> loading
  -> idle
```

It must additionally represent:

- Loader-only navigation.
- Mutation submission and subsequent revalidation.
- Redirect chains with a maximum depth.
- Aborted and superseded transitions.
- Blocked navigation.
- Fetchers running alongside navigation.
- Errors before and after response commitment.

An authoritative navigation may commit only results belonging to its current
transition identity.

### Browser integration

Provide:

- Same-origin link interception.
- Modified click, target, download, reload-document, and external URL behavior.
- Form submission encoding and methods.
- Scroll restoration with stable location keys.
- Navigation blockers.
- Optional view-transition integration.
- Focus and accessibility behavior where the router owns it.

Browser-only features must stay out of server artifacts.

## React Router v5 Facade

### Supported components

Initial v5 coverage:

- `Router`
- `BrowserRouter`
- `HashRouter`
- `MemoryRouter`
- `StaticRouter`
- `Switch`
- `Route`
- `Redirect`
- `Link`
- `NavLink`
- `Prompt`

### Supported hooks and helpers

- `useHistory`
- `useLocation`
- `useParams`
- `useRouteMatch`
- `withRouter`
- `matchPath`
- `generatePath`

The history object exposed to compatibility consumers is a stable facade backed
by the shared controller. Its `push`, `replace`, `go`, `goBack`, `goForward`,
`listen`, `block`, `location`, and `action` observations must remain coherent
with native navigation.

### Route rendering

Support v5's documented route rendering forms:

- `component`
- `render`
- Function and ordinary `children`

`Switch` preserves first-match behavior in declaration order. A v5 `Redirect`
maps to controller navigation or an SSR response redirect. `Prompt` maps to the
shared blocker contract.

V5 route trees do not acquire loaders, actions, fetchers, or v6 error-boundary
semantics implicitly.

## React Router v6/v7 Facade

### Declarative mode

Cover:

- `BrowserRouter`, `HashRouter`, `MemoryRouter`, and low-level `Router`.
- `Routes`, `Route`, `Outlet`, and `Navigate`.
- `Link` and `NavLink`.
- `useRoutes` and `createRoutesFromElements`.
- Location, navigation, params, matches, resolved path, match, search params,
  outlet, and outlet-context hooks.

React Router 6.0 through 6.3 receives declarative coverage only for exports that
exist in those versions.

### Data-router mode

For React Router 6.4+ and v7, cover:

- `createBrowserRouter`
- `createHashRouter`
- `createMemoryRouter`
- `RouterProvider`
- Route-object loaders, actions, lazy routes, handles, error elements, and
  hydration fallbacks.
- `Form`
- `useLoaderData`
- `useActionData`
- `useNavigation`
- `useRevalidator`
- `useFetcher` and `useFetchers`
- `useRouteError`
- `useAsyncValue` and documented deferred behavior when supported by the
  controller.
- `createStaticHandler`, `createStaticRouter`, `StaticRouterProvider`, and other
  documented static APIs required for library-mode SSR in the selected version.

V7 library and data-router behavior should reuse the modern implementation with
version-specific export maps and semantic shims. V7 framework-mode route
generation, middleware conventions, and deployment tooling remain deferred.

### React rendering ownership

React route elements remain compatibility-owned React nodes. Native route
components remain eXact-owned. An explicit boundary handles transitions between
them; neither renderer invokes the other renderer's component function
directly.

The shared controller owns behavioral state. The active route renderer owns
element construction, error rendering, suspension, refs, and renderer cleanup.

## Version-aware Adapter Protocol

### Required metadata extension

The adapter protocol must support ordered, non-overlapping variants per source
module:

```json
{
  "exact": {
    "reactCompatibility": {
      "schemaVersion": 1,
      "substitutions": {
        "react-router-dom": {
          "variants": [
            {
              "version": ">=5 <6",
              "exports": {
                "Switch": { "subpath": "./v5", "export": "Switch" },
                "Route": { "subpath": "./v5", "export": "Route" }
              }
            },
            {
              "version": ">=6 <6.4",
              "exports": {
                "Routes": { "subpath": "./modern", "export": "Routes" },
                "Route": { "subpath": "./modern", "export": "Route" }
              }
            },
            {
              "version": ">=6.4 <8",
              "exports": {
                "RouterProvider": {
                  "subpath": "./data",
                  "export": "RouterProvider"
                }
              }
            }
          ]
        }
      }
    }
  }
}
```

The shown exports are illustrative, not the final complete maps.
Equivalent version-conditioned mappings are required for `react-router` and
documented DOM/server subpaths. They resolve to the same facade family selected
for the corresponding `react-router-dom` installation.

The repository is prepublish, so this extension updates adapter schema version
1 rather than retaining an unused historical shape. After publication, an
incompatible schema change increments the schema version.

Variant ranges for one source module must not overlap. A source version matching
no variant is not substituted and produces a structured unsupported-version
diagnostic when its exports are used.

### Resolution identity

Replacement selection is keyed by:

```text
(resolved source package instance, source subpath, source export)
```

It is not keyed only by:

```text
(source module string, source export)
```

A resolved package instance includes canonical package root, resolved
provenance, package name, and installed version. Symlinked/workspace provenance
must follow the same canonicalization rules used elsewhere in the compiler.

### Import resolution

For each eligible import or require:

1. Resolve the source package instance from the importer using the active host's
   normal package resolution.
2. Read the installed source version from that exact instance.
3. Select the one matching adapter variant.
4. Select replacements only for imports from that resolved instance.
5. Resolve the replacement from the declaring adapter package instance.
6. Include source and adapter instance identities in cache keys and
   diagnostics.

The common build engine owns this behavior. Vite, Node, Webpack, Bun, and
ahead-of-time compilation may provide resolution primitives but may not
implement different variant-selection semantics.

### Multiple installed majors

A graph containing root React Router v7 and a nested dependency using v5 is
valid when:

- Both source instances are resolvable from their respective importers.
- One active adapter provides non-overlapping matching variants.
- Each transformed import is associated with its resolved source instance.

Conflicts fail only when two adapters claim the same resolved source instance,
subpath, and export. Distinct source package instances do not conflict merely
because their bare module strings match.

### Components, hooks, and value exports

Router compatibility requires substituting more than JSX component uses.
Metadata and transformation must distinguish:

- Component exports used as JSX, compiled JSX, or `createElement`.
- Hook and helper imports whose ordinary call sites must be replaced.
- Factory and constructor-like values such as `createBrowserRouter`.
- Re-exports and namespace members.

The transformer must preserve an original import only for bindings or exports
that are not substituted. A substituted hook or factory must not remain bound
to the original React Router implementation.

Unsupported dynamic property selection, rest destructuring, or opaque binding
escape remains on compatibility only when doing so cannot create a second
router. If it would mix authorities, compilation fails with an actionable
diagnostic rather than silently falling back.

## SSR, Hydration, and Server Components

### Request ownership

Server routing uses the configured `RequestContext` and the same request scope
as SSR, actions, refreshes, and streams. Route loaders and actions may consume
developer application/request contexts but cannot create or promote those
lifetimes.

### Response controls

Route redirects, status, and headers use the existing response-control contract:

- They settle before response commitment when they affect the authored head or
  response metadata.
- Mutation after commitment fails.
- Redirect locations and statuses use the existing validation.
- Cancellation disposes loader/action work and provider resources.

### Hydration

Hydration data contains only bounded, JSON-safe, transferable route data.
Serialized state identifies route IDs and controller protocol version without
serializing component functions or React elements.

The client reconstructs one controller and adopts the server snapshot before
either native or React route consumers render. It must not run initial loaders
twice unless the route explicitly requires client revalidation.

### Server components

A server-owned route may render native or compatibility-owned descendants. A
client route boundary receives only validated route data and public location
state. Trusted request objects, authorization providers, secrets, response
controls, and server-only loader values remain server-owned.

## Diagnostics and Compatibility Reporting

The compatibility report should include:

- Resolved React Router package instance and version.
- Selected adapter variant and replacement entrypoint.
- Imported and substituted exports.
- Unsupported exports or import forms.
- Whether the route runs in declarative or data-router mode.
- Any compatibility fallback that retains original React Router code.
- Any detected risk of two router authorities.
- SSR/hydration capability used by the route graph.

Build failures must identify the importer, source package root/version,
requested export, supported ranges, and adapter package/version.

## Implementation Phases

### Phase 1: Resolved-instance adapter variants

- Extend adapter schema version 1 with non-overlapping source variants.
- Resolve source package instances per importer.
- Key replacements and conflicts by resolved instance, subpath, and export.
- Extend transformation to hooks, helpers, factories, namespace members, and
  re-exports.
- Add duplicate-major package graph fixtures.

Exit criteria:

- One application graph can transform root v7 and nested v5 imports to
  different adapter entrypoints deterministically.
- Existing adapters retain their behavior after metadata migration.
- No transform selects a variant from an unrelated hoisted package instance.

### Phase 2: Extract and stabilize the router core

- Extract location, matching, navigation, and subscription logic from the native
  `Router`.
- Introduce immutable snapshots, transition identities, abort ownership, and
  disposal.
- Keep current native APIs and tests passing without semantic regression.
- Add history actions, delta navigation, location keys, optional/pathless
  matching, and complete relative resolution.

Exit criteria:

- The existing native router is a renderer over the controller.
- Controller tests run without DOM, React, or native component rendering.
- Browser, hash, memory, and request-backed behavior remains certified.

### Phase 3: Modern declarative compatibility

- Add `@exact/react-router` modern entrypoints and metadata.
- Implement v6/v7 declarative components, hooks, helpers, and route objects.
- Bridge router context across alternating eXact and React ownership.
- Support v6 pre-6.4 separately from data-router-capable versions.

Exit criteria:

- Representative unchanged v6 and v7 declarative applications run through
  React compatibility while sharing one controller with native descendants.
- Native navigation updates React hooks and React navigation updates native
  context.

### Phase 4: Native data router and modern data compatibility

- Add loaders, actions, fetchers, revalidation, errors, lazy routes, blockers,
  and navigation state to the core.
- Implement modern data-router factories, provider, hooks, forms, and static SSR
  APIs.
- Integrate request context, response controls, serialization policy, hydration,
  cancellation, and limits.

Exit criteria:

- An unchanged representative React Router 6.4+/v7 data-router application runs
  over the eXact controller.
- A native eXact application can use the same data-router capabilities without
  React packages.
- SSR and hydration do not duplicate loader execution or leak server-only data.

### Phase 5: React Router v5 compatibility

- Implement v5 routers, `Switch`, route rendering forms, redirects, history,
  hooks, HOC, helpers, and prompts.
- Adapt external documented history objects.
- Preserve local `Switch` declaration-order semantics.
- Add mixed v5 compatibility/native ancestry fixtures.

Exit criteria:

- A representative unchanged v5 application runs through the shared controller.
- V5 and modern source instances can coexist in one dependency graph without
  replacement conflicts.
- V5 support adds no data-router claims or modern semantics not present in v5.

### Phase 6: Hardening and adoption certification

- Add differential conformance fixtures against the corresponding real React
  Router versions.
- Cover Vite, Node, ahead-of-time, Webpack, and Bun hosts through the common
  engine.
- Certify package contents, conditional exports, tree shaking, lazy routes,
  source maps, watch invalidation, and production bundles.
- Publish a compatibility matrix and structured report examples.
- Evaluate v8 and add a variant only after conformance evidence.

Exit criteria:

- Supported imports either match documented observable behavior or produce a
  named, documented divergence.
- Installing the adapter without using React Router adds no runtime bundle code.
- Native router entrypoints contain no React or React Router dependency.
- Production SSR/client builds use one controller and one selected variant per
  source package instance.

## Test and Certification Matrix

### Pinned source versions

- React Router DOM 5.3.x and its documented history integration.
- React Router DOM 6.0-6.3 declarative mode.
- Final React Router DOM v6 declarative and data-router modes.
- Current supported React Router v7 library/data-router mode.
- Root modern plus nested v5 duplicate-major graph.
- Unsupported v8 fixture that fails closed until explicitly enabled.

### Import forms

- Named, aliased, default, and namespace ESM imports.
- Static re-exports and barrels.
- Compiled JSX runtime calls and `createElement`.
- Supported CommonJS destructuring and member access.
- Hooks, helpers, factories, HOCs, and component values.
- Dynamic and opaque forms with explicit diagnostics.

### Behavioral scenarios

- Nested/pathless/index/optional/splat routes and basenames.
- Relative navigation and relative links.
- Browser, hash, memory, static, and external history sources.
- Navigation supersession and abort.
- Loader/action redirects, errors, and revalidation.
- Concurrent fetchers.
- Blockers and scroll restoration.
- SSR status/headers/redirects.
- Hydration adoption and no duplicate initial loading.
- Native -> React -> native and React -> native -> React route consumers.
- Separate roots and concurrent requests.
- Route-level lazy chunks and error boundaries.

### Differential fixtures

For each supported major family, run the same public scenario twice:

1. With the pinned real React Router and React renderer.
2. With transformed imports, React compatibility, and the eXact controller.

Compare documented observable behavior:

- DOM output.
- Hook observations.
- History entries/actions.
- Navigation state transitions.
- Loader/action call order and cancellation.
- Redirects and errors.
- SSR and hydration results.

Internal object identity and undocumented private fields are not conformance
targets.

### Performance and bundle gates

- No duplicate routing engine in a fully substituted application.
- Unused v5 or modern facade is tree-shaken.
- Native-only applications do not contain React Router or React compatibility.
- Navigation notification is batched once per authoritative transition stage.
- Loader/fetcher concurrency and resource limits remain bounded.
- Large route graphs have explicit matching and initialization budgets.

## Adoption Guidance

Applications may migrate incrementally:

1. Install the React Router adapter without changing React Router imports.
2. Confirm the compatibility report selects the expected resolved version.
3. Introduce native eXact descendants beneath the existing router.
4. Move shared consumers from React hooks to native `RouteContext` or native
   router APIs.
5. Convert route renderers incrementally while keeping one controller.
6. Replace compatibility route declarations with native route declarations when
   desired.
7. Remove React Router only after no compatibility imports remain.

The adapter is an interoperability path, not a requirement to rewrite route
definitions immediately.

## Risks

- React Router exposes a large surface whose behavior changed significantly
  between v5 and v6.
- V6 itself has a material boundary at 6.4 when data routers were introduced.
- React Router framework mode may tempt accidental scope expansion beyond
  library compatibility.
- Loaders and actions expand the amount of data that can become hydration
  state; they must participate in eXact policy and resource limits.
- A package graph may contain multiple copies of one major as well as multiple
  majors; instance-aware resolution is therefore correctness-critical.
- V5 HOCs and render callbacks exercise compatibility ownership paths that
  provider-only adapters do not.
- Differential tests must avoid treating undocumented implementation details as
  requirements.

## Open Design Questions

- Final native names and signatures for route loaders, actions, fetchers, and
  static SSR helpers.
- Whether the adapter exposes React Router-compatible TypeScript types by
  depending on the installed peer declarations or maintains versioned local
  declarations.
- Exact supported behavior for deferred data across the selected v6/v7
  versions.
- Whether v5 `Prompt` uses only synchronous browser confirmation initially or
  exposes the full shared blocker continuation contract.
- How compatibility reporting presents one importer graph that reaches several
  source package instances of the same version.
- Which v7 framework-mode APIs, if any, are sufficiently independent of its
  build system to include later.
- Whether a compatible v8 range can reuse the modern facade or requires its own
  entrypoint.

## Settled Decisions

- `@exact/router` is authoritative; React Router is a compatibility API over it.
- V5 and v6/v7 are separate semantic facades over one controller.
- V6 before 6.4 is distinguished from data-router-capable v6.
- Selection is based on the resolved source package instance and version.
- Multiple installed majors are supported rather than rejected globally.
- Runtime version or prop guessing is not the selection mechanism.
- Native `@exact/router` does not depend on React Router.
- Client route context is not server authorization.
- V7 framework-mode build and deployment tooling is outside the initial scope.
- V8 support follows evidence rather than an optimistic semver range.

## References

- [React Router documentation](https://reactrouter.com/)
- [React Router API reference](https://api.reactrouter.com/v7/)
- [React Router changelog](https://reactrouter.com/home/changelog)
- [react-router npm versions](https://www.npmjs.com/package/react-router?activeTab=versions)
- [react-router-dom npm versions](https://www.npmjs.com/package/react-router-dom?activeTab=versions)
