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
before instantiating the root component state machine.

Plain supplied context values remain externally owned. Closing a scope with no
factory-owned values skips dependency traversal, but still closes its lifetime
and clears its resolved-value lookup. Factory
initialization remains eager and deterministic; owned resources retain dependency
ordering, cancellation, and reverse-order cleanup. This optimization does not
change context residency or the compiled-component ABI.

The application may configure a trusted `publicOrigin` on its server context.
eXact combines that origin with the incoming path and query, but never infers
public authority from `Host` or `X-Forwarded-Proto`. A resolver may consult the
adapter-owned platform request for multi-tenant or trusted-proxy deployments;
that resolver is an explicit deployment trust boundary and must validate any
host it accepts. Without a configured origin, request URLs use the reserved
`http://exact.invalid` authority and relative redirects remain relative.

## Supplying caller information to continuations

Declare a request-scoped service and explicitly qualify only its public result:

```ts
import { createContext } from '@exactjs/core';

interface CallerService {
	/** @exact shared */
	readDisplayName(): string;
}
export const Caller = createContext<CallerService>('app.caller', {
	scope: 'request',
	reactive: false
});
```

Configure providers when creating the server runtime, using the adapter's platform request:

```ts
import { createExactServerRuntime } from '@exactjs/ssr';
import { Caller } from './caller.js';
import { requireVerifiedSession } from './authentication.js';

const runtime = createExactServerRuntime({
	contract,
	requestContexts: async ({ platformRequest }) => {
		const session = await requireVerifiedSession(platformRequest);
		return [[Caller, { value: { readDisplayName: () => session.publicDisplayName } }]];
	}
});
```

Here `contract` is the application's generated executor contract. `requireVerifiedSession` is the
application's server authentication function: it validates the adapter request and credentials and
returns a deliberately public display name. It must not trust a caller identity supplied as a client
task argument or accept forwarding headers without a configured trusted proxy boundary. Node's
adapter already supplies its incoming request as `platformRequest`.

A component-owned server task reads the service through its durable owner:

```ts
function readCaller(task: TaskContext = TaskContext.server()) {
	return this.getContext(Caller).readDisplayName();
}
```

Declare that function inside the component. The service and credentials stay server-side; only the
qualified display-name result may return to the browser. Each SSR or invocation request gets its own
request context, including concurrent callers. There is no ambient storage API to install. A later
invocation is a new request, not a continuation of the original SSR request's context lifetime.

`requestContexts` is a top-level creation option, not a nested `context` option. Adding it to the
returned runtime object does not reconfigure that runtime. An unregistered context fails explicitly
when read. Supplied values retain their existing owner; use factory-backed contexts when request
cleanup must release resources, as described above.

## Placement and residency

Ordinary task placement is inferred from the APIs and values it uses.
`TaskContext.server()` and `TaskContext.client()` policy defaults are validated
escape hatches when intent must be explicit.

Server residency is transitive through direct use. Reading a server-only
context makes the consuming operation server-only. The client sends only
compiler-selected, transport-safe dependencies; the server resolves its own
contexts instead of accepting capability objects from the browser.

A defaulted task parameter is resolved on the originating host before
dispatch. Its captured value must therefore be shared and transport-safe;
client-kept, server-kept, and secret values cannot cross into a server task
through a captured default. Keep server-resident capabilities in server
context and resolve them inside the continuation instead.

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
framework-controlled state, hydration, invocation, refresh, or patch payloads.

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

The Node adapter owns reporting for failures it handles while accepting an endpoint request or
writing its response. `createExactNodeHandler()` passes the configured runtime logger into response
writing; direct `writeNodeResponse()` calls accept an optional fourth logger argument. Events use
framework scope `node-adapter` and categories `request`, `response`, or `cleanup`, preserving the
original thrown value. Without a logger, errors go to the server console. Logger failures fall back
to the console and do not suppress the original error or interrupt cleanup. The handler observes
both dispatch rejection and rejection from writing an otherwise successful response. Normal
disconnect cancellation is identified by the request signal's exact abort reason, not by suppressing
every failure that occurs after a disconnect. Custom owners of `writeNodeResponseBody()` must handle
and report its rejections themselves. This does not install a process-wide uncaught-error handler.

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
