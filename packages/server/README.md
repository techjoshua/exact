# @exactjs/server

Transport-neutral server protocol runtime for eXact actions, refreshes, patches, and
server-component requests.

`handleExactRequest` validates the manifest endpoint, request envelope, action and boundary
allowlists, authorization, CSRF policy, payload limits, batching, cancellation, and response
shape. Runtime adapters translate platform requests into this central contract.

Most applications create a complete runtime through `@exactjs/ssr` and pass it to a platform
adapter. Do not reimplement protocol validation inside Express, Hapi, Fetch, or serverless routes.
