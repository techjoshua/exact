# React Router compatibility

Status: implemented for React Router 5, 6, and 7 library and data-router
surfaces. React Router framework mode and version 8 are not supported.

`@exactjs/router` remains the single authoritative routing controller. Native
eXact components and React Router compatibility components observe the same
location, matches, navigation state, route data, errors, blockers, history,
fetchers, and hydration record. The compatibility layer does not run an
independent React Router beside the native router.

The controller publishes every accepted location as a reactive route-context snapshot. Persistent
native consumers, including `NavLink`, update their active presentation and `aria-current` from
that snapshot without requiring the surrounding route layout to remount.

Router handles and location observations follow ordinary TypeScript assignment rules. Cleanup
methods can be decorated, and location fields remain writable. Changing an observation does not
perform navigation. Use the router navigation methods to change the location source.

## Supported families

- React Router and React Router DOM 5.3-compatible APIs.
- React Router 6 before and after the 6.4 data-router boundary.
- React Router 7 library and data-router APIs.
- Browser, hash, memory, and static/request-backed routing.
- Nested routes, outlets, params, links, redirects, loaders, actions,
  submissions, fetchers, revalidation, blockers, lazy routes, errors, and
  hydration data within the certified facade.

Compatibility `matchRoutes()` requires a complete basename path prefix and returns null for
locations outside it. Empty and root basenames cover the whole route path.
A path-contributing parent can match its own URL without an index child. Child transitions retain
its mounted host. Optional named parameters may be omitted before later literal or child segments,
so `/:language?/about` matches `/about` and `/en/about`. Omitted parameters do not add specificity,
and equal scores retain declaration order. The matcher plans optional omissions against the complete
branch with polynomial bounds rather than enumerating every combination. Splat range bases use
original URL segment positions, so an encoded slash inside a captured value cannot move the base.

Package substitution is selected from the actual resolved package instance and
version. Multiple installed majors may coexist. The build does not guess a
router version from runtime props.

`HistoryRouter` observes the supplied history through its `listen()` subscription.
External pushes and replacements update route matching, location, and navigation type;
in-place location updates are supported, and unmounting releases the subscription.
Numeric navigation deltas must be safe integers. Invalid values fail before the native controller
forwards them to a location source. Memory sources require an integer initial index within their
entries and preserve the current location when rejecting an invalid delta.

Relative destinations in modern compatibility code resolve against the route that owns the
component. For example, at a route with the path `projects/:id/edit`, a child destination such
as `details` appends to that route's matched pathname. The default `..` selects the parent route,
skipping pathless layouts and index routes. With `{ relative: 'path' }`, `..` removes one URL
segment instead. Navigation, submission, `Link`, `NavLink`, `Form`, `useHref()`, `useResolvedPath()`, and
`useFormAction()` honor the same choice. Query-only and
fragment-only destinations retain the current location's pathname, including active child routes.
`useResolvedPath()` returns the route pathname, search, and hash before browser URL encoding or
basename and hash-router formatting. `useHref()` adds that formatting for an anchor.
Destination hooks observe route changes even inside memoized compatibility components.
Absolute URL schemes and network-relative destinations such as `//example.com/guide` retain
their destination without basename or hash-mode prefixes. Cross-origin links use browser navigation.

## Concurrency and errors

Navigation, initialization, submission, fetcher, and revalidation operations
carry transition identity. Stale work cannot commit even when user handlers
ignore abort signals. Fetchers can run beside navigation without sharing a
single cancellation channel. `useFetcher()` releases its snapshot and cancels active work when its
owning component unmounts. Framework-neutral callers of `router.fetch()` pair that ownership with
`router.releaseFetcher(key)`, which is safe after router disposal. For a form that should update
its own data while keeping the current page, render the `Form` returned by `useFetcher()`.
It retains its inputs through pending and completed updates. The standalone `Form` uses navigation.
Both honor prevented submissions. GET submissions place form fields in the query, replace an
existing query, and preserve the action's fragment. Fetcher GET requests have no body.
File fields contribute their filenames. GET fetchers retain index selection while replacing query
fields, without changing caller-provided URLSearchParams or FormData values.
Lazy materialization checks cancellation before starting a resolved
loader or action. Failed lazy loads can retry on later navigation. Response-body decoding and
delayed navigation publication also recheck ownership before changing route data or history.

An omitted form action targets the owning route and retains its current query values. A default
index action carries one naked `?index` selection, preserving nonempty index query values.
An explicit `.` targets the same route without retaining unrelated query values.
`useFormAction()` returns a plain action path with the basename, including in hash mode.
Retained `useSubmit()` callbacks resolve against their owning route at invocation time.
Mutation submissions use URL-encoded fields by default. Choose `multipart/form-data` to include
file contents, `text/plain` for line-separated fields, or `application/json` for a JSON field object.
JSON field objects retain the last value for repeated names. Form, direct-submit and fetcher paths
share that encoding behavior. Unsupported encodings reject before dispatch.

Fetcher and submission destinations select their own loaders and actions, independently of the component that
owns the fetcher. Relative destinations resolve from that component's route. At a URL shared by
a parent and index route, a naked `?index` selects the index handler. Otherwise, the deepest
path-contributing route handles the request. A missing handler does not fall back to an ancestor.
Framework-neutral `router.fetch(key, routeId, target)` preserves explicit matching route IDs.
Pass `undefined` as `routeId` when the target URL should select the data route.
Fetcher ownership is established before publishing pending state. Synchronous release, disposal
or replacement during notification prevents old lazy work and handlers from starting. Work begun
by an older abort callback retains its newer ownership. Failed pending-state notification releases
only its own operation and preserves the original thrown value through cleanup.
Navigation, initialization, submission and revalidation also establish identity before invoking
old abort callbacks. Newer work started by those callbacks retains execution and publication rights.
Revalidation cancellation retires its old token before invoking callbacks that may start fresh work.

Failed redirect or publication work rejects its navigation or submission promise and settles
the owning navigation state. A stale failure cannot cancel a newer transition. Prepared loader
data, headers and status stay private until the history commit. A rejected history write restores
the prior route data. An error after a completed commit preserves the accepted location and data.

For server page rendering, `query()` loads the matched route tree and returns its static context.
For a single route's data, `queryRoute()` selects only that handler. A matching explicit `routeId`
overrides URL selection. Without it, a naked `?index` selects the index route, while ordinary URLs
select the deepest path-contributing route. Invalid selection rejects before handlers run.
`queryRoute()` preserves returned Response objects and rejects with the exact thrown value, including
Response objects and undefined. It returns redirects directly without loading their destinations.
Both query methods release their request-owned work on success and rejection. Loader and action signals are canceled after data
or a redirect is selected and when request processing fails.
An initially canceled request rejects before handlers start. Pending cancellation rejects with
the incoming request's reason without waiting for handlers that ignore cancellation. No late result
is published. Handler Request signals carry owned operation cancellation.
Static loaders receive incoming headers and preserve GET or HEAD semantics. Loaders revalidated
after an action use GET while retaining the incoming headers. Native request-backed Router
instances supply this metadata automatically. A framework-neutral `createExactRouter()` integration
can supply `request: { method, headers }` when its location source represents an incoming request.

For direct `router.submit()` and `router.fetch()` calls, `RequestInit.signal` owns the caller's
lifetime. Initial cancellation rejects before dispatch. Pending cancellation rejects with the
exact reason, cancels the handler signal, and prevents late publication without waiting for a
handler that ignores cancellation. Abort callbacks may start newer work, which retains ownership.
The caller lifetime follows action redirects, fetcher mutation revalidation, and revalidation
redirects. Completed calls release the caller listener.

Returned and thrown `Response` objects retain status and headers. Route data
errors select the nearest route error UI while successful ancestor layouts
remain mounted. Component render failures use the renderer-owned route
boundary.

JSON-safe loader data may share sibling references. Publication serializes each occurrence as
a copy, while ancestor cycles and configured graph or byte budget excesses remain invalid.
Validation rejects accessors and serialization hooks without invoking them. Array cells, including
holes and non-enumerable indices, count against the graph budget. Ordinary holes serialize as null.
Route IDs and parameter names are dictionary keys. Names such as `__proto__`, `constructor` and
`toString` retain their own values, and inherited properties do not supply missing data or parameters.
Error boundaries select published error entries by presence, including an explicitly thrown undefined.

Hydration data uses a versioned envelope bound to the hydration key, public
location, and ordered route IDs. Mismatches fail closed instead of attaching
data to a different route tree.

## Deliberate limits

- React Router framework-mode compilation, file routes, development server,
  and deployment runtime are outside this compatibility surface.
- The `defer` protocol and framework-mode streaming wire formats are not
  reproduced. Ordinary promises are supported through `Await`.
- React Router 8 is rejected until its public contract has been evaluated and
  certified.
- Client route state is not server authorization. Server handlers must use the
  application HTTP and request-context security boundary.

Run `npm run check:router-bundles` to verify the native and compatibility
facades retain their tree-shaking boundaries.
