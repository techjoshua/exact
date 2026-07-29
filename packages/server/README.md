# @exactjs/server

Transport-neutral server protocol runtime for eXact actions, refreshes, patches, and
server-component requests.

`handleExactRequest` validates the configured endpoint, request envelope, action and boundary
allowlists, authorization, CSRF policy, payload limits, batching, cancellation, and response
shape. Runtime adapters translate platform requests into this central contract.

Most applications create a complete runtime through `@exactjs/ssr` and pass it to a platform
adapter. Do not reimplement protocol validation inside Express, Hapi, Fetch, or serverless routes.

Set `publicOrigin` on the server context when components need an externally visible absolute URL.
A resolver can consult `platformRequest` after the application or host framework applies its
trusted-proxy and host-allowlist policy. The server never treats `Host` or forwarded headers as
authority automatically.

Generated continuation handlers resolve application and request resources from trusted server
context rather than client payloads. `onContextAccess` can report the authored token and opaque
operation identity for tests and diagnostics; resolved context values are never included.
Action continuations accept only compiler-declared argument slots, receive request cancellation
and invocation generation through their runtime context, and return the authored result only
inside the validated continuation envelope.

See [Actions, interactions, optimistic state, and forms](../../docs/actions-and-forms.md).

## Server-cooperative inspection

`allowDebug` enables bounded read-only queries at the existing eXact endpoint. It accepts a boolean
or asynchronous per-capability resolver and defaults unavailable in production. Use
`debugSessionIdentity` to bind an opened session to the authenticated operator identity selected by
the application. All requests remain subject to the endpoint's origin, CSRF, request-limit, and
adapter policies.

The debug runtime is lazy: ordinary invocation traffic does not decode catalogs, allocate sessions
or event buffers, or install observation ownership. It is created only after the shared endpoint
has parsed a valid `debug` message.

Pass server-owned compiler catalogs through `inspectionCatalogs`. Dynamic retained builds use
`registerExactInspectionCatalog()` and dispose the returned handle when the build retires; lookup
requires the exact build and execution root. `createExactBindingGateway()` routes registered remote
roots through their existing endpoints, strips browser credentials, and requires independent
remote authorization.

See [Server-cooperative full-stack DevTools](../../docs/devtools.md).
