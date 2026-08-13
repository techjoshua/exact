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

## Supported families

- React Router and React Router DOM 5.3-compatible APIs.
- React Router 6 before and after the 6.4 data-router boundary.
- React Router 7 library and data-router APIs.
- Browser, hash, memory, and static/request-backed routing.
- Nested routes, outlets, params, links, redirects, loaders, actions,
  submissions, fetchers, revalidation, blockers, lazy routes, errors, and
  hydration data within the certified facade.

Package substitution is selected from the actual resolved package instance and
version. Multiple installed majors may coexist. The build does not guess a
router version from runtime props.

## Concurrency and errors

Navigation, initialization, submission, fetcher, and revalidation operations
carry transition identity. Stale work cannot commit even when user handlers
ignore abort signals. Fetchers can run beside navigation without sharing a
single cancellation channel.

Returned and thrown `Response` objects retain status and headers. Route data
errors select the nearest route error UI while successful ancestor layouts
remain mounted. Component render failures use the renderer-owned route
boundary.

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
