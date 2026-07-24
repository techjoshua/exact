# @exactjs/request

Request and response context propagation shared by eXact SSR, server actions, routers, and runtime
adapters.

The package defines explicit context values plus ambient helpers. On Node, install the
`@exactjs/request/node` storage once before relying on ambient request access across asynchronous
work.

Prefer explicit propagation at framework boundaries. Ambient context is a convenience for code
already executing inside a correctly installed request scope, not a replacement for runtime
adapter wiring.
