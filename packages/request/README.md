# @exactjs/request

Request and response context shared by eXact SSR, server operations, routers, and runtime adapters.

## Usage

Create request context at the platform boundary and pass it through the server runtime. On Node,
install `@exactjs/request/node` once when application code needs ambient request access across
asynchronous work.

Prefer explicit propagation for framework integration. Ambient access is a convenience inside an
already established request scope.

## Public URLs

Supply a trusted `publicOrigin` when application code needs absolute public URLs. The package does
not treat `Host` or forwarded headers as authority automatically; proxy and host validation belong
to the surrounding server.
