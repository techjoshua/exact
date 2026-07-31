# @exactjs/request

Request and response context propagation shared by eXact SSR, server actions, routers, and runtime
adapters.

The package defines explicit context values plus ambient helpers. On Node, install the
`@exactjs/request/node` storage once before relying on ambient request access across asynchronous
work.

Prefer explicit propagation at framework boundaries. Ambient context is a convenience for code
already executing inside a correctly installed request scope, not a replacement for runtime
adapter wiring.

`createRequestContextValue()` accepts a trusted `publicOrigin`. It never infers public authority
from `Host` or forwarded headers. Without an explicit origin, normalized URLs use
`http://exact.invalid`, and relative redirects remain relative in the response `Location` header.

`RequestProvider` is a compilerless framework component and carries the stable native identity
`@exactjs/request:RequestProvider`; renderers do not infer its ownership from function shape.
