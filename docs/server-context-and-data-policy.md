# Server context and data policy

Status: implemented foundation and current contract.

eXact treats execution placement, data residency, lifetime, transferability,
and secrecy as related but independent properties. Compiler analysis and
runtime validation enforce the boundary; application code should not reproduce
it with local serialization or bundler workarounds.

## Context lifetimes

`createContext()` may declare component, request, or application scope.

- Component context follows the logical component tree and is disposed with
  its provider.
- Request context is created once for an incoming server request and is
  isolated from concurrent requests.
- Application context lives for the server application lifetime and may be
  shared across requests when its resource is designed for that use.

Application and request contexts default to server residency. Database pools,
API clients, sessions, request objects, and credential-bearing SDKs belong
there. A component can read those capabilities on the server, but
`this.setContext()` publishes only a component-scoped descendant value; it
cannot promote a value into request or application lifetime.

The portable `RequestContext` exposes normalized URL, method, headers, abort
signal, response status/headers, and redirect control. Adapters establish it
before root component setup.

The application may configure a trusted `publicOrigin` on its server context.
eXact combines that origin with the incoming path and query, but never infers
public authority from `Host` or `X-Forwarded-Proto`. A resolver may consult the
adapter-owned platform request for multi-tenant or trusted-proxy deployments;
that resolver is an explicit deployment trust boundary and must validate any
host it accepts. Without a configured origin, request URLs use the reserved
`http://exact.invalid` authority and relative redirects remain relative.

## Placement and residency

Ordinary task placement is inferred from the APIs and values it uses.
`this.task.server(...)` and `this.task.client(...)` are validated escape
hatches when intent must be explicit.

Server residency is transitive through direct use. Reading a server-only
context makes the consuming operation server-only. The client sends only
compiler-selected, transport-safe dependencies; the server resolves its own
contexts instead of accepting capability objects from the browser.

## Shared results

A server capability may deliberately expose a public result:

```ts
interface ProductRepository {
	/** @exact shared */
	find(id: string): Promise<{ id: string; name: string }>;
}
```

`@exact shared` applies to the result contract. It does not make the receiver,
credentials, other methods, or intermediate values transferable. Returned
data must still pass JSON-safety, size, state-contract, and secret checks.

Without an allowed public projection, server-derived data may participate in
server-rendered HTML but cannot be captured in client code or returned through
framework-controlled state, hydration, action, refresh, or patch payloads.

## Secrets

`@exactjs/secrets` supplies providers, references, runtime resolution, the
`Secret<T>` qualification, and explicit `consume()` boundaries. Core compiler
policy owns disclosure prevention.

Secret qualification dominates sharing and placement:

- secret values and secret-derived values remain server-only;
- `@exact shared` cannot release a secret;
- an unconsumed secret crosses a call boundary only through an explicit
  `Secret<T>` parameter;
- `consume()` belongs to the caller and is audited;
- dependency packages need an application allowlist entry to consume secrets;
  and
- secrets are forbidden from client artifacts, hydration, server responses,
  patches, diagnostics, logs, profiling data, and public source maps.

The application owns its trust decision. Package allowlists are guardrails,
not dependency sandboxing.

## Rendering safety

Structured JSX is the normal rendering boundary. Native SSR centralizes URL
sanitization and blocks `javascript:` URLs. Opaque markup requires
`unsafeHtml()` plus explicit root policy opt-in and is denied to dependency
packages without a non-transitive grant. The same capability and root opt-in
are required when opaque markup is supplied through native `iframe.srcdoc`.

Root-document rendering preserves authored `html`, `head`, and `body`
structure while inserting only reserved framework hydration and streaming
nodes. Patch application validates target ownership and falls back to an
authoritative boundary replacement when a finer update cannot be proven.

See [native-ssr-production-guide.md](native-ssr-production-guide.md) for
response commitment, limits, CSP, authorization, and deployment requirements.
