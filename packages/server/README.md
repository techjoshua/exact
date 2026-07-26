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
