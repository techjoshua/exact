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
there. Residency follows the resolved core factory through named import aliases, namespace access,
and immutable factory aliases. Literal option keys and immutable option objects retain their lifetime
policy. Unrelated functions named `createContext` do not establish framework residency.
A component can read those capabilities on the server, but
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
context, a qualified local binding, or a secret-bearing callable result makes the consuming task
server-only. Explicit client placement is rejected even while checking a server artifact. Nested
task bodies have independent execution requirements. The client sends only
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
policy owns disclosure prevention. Ordinary type aliases and readonly mapped views retain
the qualification. The compiler follows resolved type declarations and qualification properties,
so naming an ordinary type `Secret` does not qualify it. Complete records and indexed
collections containing qualified secrets remain protected from disclosure. Selecting an ordinary
public sibling field does not disclose the secret field. This remains true through ordinary
record aliases and static destructuring, including literal computed property names. Explicit kept-value annotations continue
to protect their entire value.

Standalone helpers and callable properties retain their declared result policy through imports
and aliases. Generic helpers and members use the instantiated value or result type. Overloaded
helpers use the selected signature's result qualification. Unrelated
methods with the same name do not share a result policy. Accessors retain the type policy of
their value, including imported declarations and inferred getters. Constructor calls and tagged
templates use the same result and secret-parameter contracts as ordinary calls. Tag substitutions
follow the synthetic template-array parameter in the native signature.

Secret receipt uses the declared parameter contract before generic inference. An unconstrained
`helper<T>(value: T)` does not gain secret authority from its argument. Explicit `Secret<T>`
parameters and secret constraints retain that authority. Rest and spread arguments must satisfy
every possible receiving position. A spread with unknown length requires a qualified rest
contract. Native `call`, `apply`, and `bind` consult the underlying helper's declarations, including literal
computed access such as `helper['call'](...)`.
Custom methods with those names follow their own contracts. Ambiguous forwarding contracts
are rejected when the compiler cannot prove receipt authority.

Contextual callback parameters and destructured secret leaves retain their qualification.
A direct static object binding from a typed record can select an ordinary public sibling.
Defaults, rest bindings and uncertain selections retain the aggregate protection. Public
return values do not authorize client execution against a secret-bearing receiver or arguments.

Assignments of unconsumed secrets require qualified destination storage. This applies to ordinary
writes, compound assignments, destructuring destinations and existing iteration destinations.
A secret in a pattern default or computed selection key remains an input even when the
right-hand container is public. This applies to nested patterns, typed declarations and parameter
bindings. Explicit ordinary destination types cannot gain receipt authority through inferred secrecy.
Native inferred secret iteration bindings retain qualification. Secret-controlled writes and outputs
remain protected across conditions, loops, switch selection and short-circuit branches. Helper and
accessor results retain the policy of secret-controlled return paths, including a bare return
selected by a secret condition. Returning public literals does not authorize that derived result.
Available imported helper bodies retain this inferred result policy even when the native TypeScript
return type contains only ordinary literals. A direct
public object field can be selected without releasing a sibling secret. Private indexed collections
remain protected, including observations of their iteration and keys. Explicit server-owned
`consume()` is the application trust boundary for deliberately public results.

Native console calls are disclosure sinks, including immutable receiver and method aliases,
`node:console` imports, constructed Node consoles and tagged calls. Secret-controlled logging
remains protected even when its message is public. A parameter or application object named
`console` follows its own declared parameter contract.

Containment is established before delivery. The compiler rejects secret-bearing client
artifacts and transfer contracts, and server execution projects framework payloads through
those contracts before serialization. A browser-side error cannot restore containment once
HTML, hydration data, or an operation response contains a secret. `Secret<T>` is a type
qualification, not a runtime wrapper. A generic JSON serializer cannot infer that an ordinary
string is secret after type erasure. Explicit `consume()` boundaries therefore remain a
server-side trust decision.

Secret consumption inside a component-owned server task is audited as server execution. Its
client projection contains an invocation capability rather than the secret-consuming body. The
task result must still satisfy the public transfer contract. Ordinary helper bodies that remain
in a client artifact cannot consume secrets. Captured parameter defaults run on the originating
host, so secret resolution belongs inside the server task body.

Secret qualification dominates sharing and placement:

- secret values and secret-derived values remain server-only;
- `@exact shared` and client placement annotations cannot release a secret, including a typed
  declaration without an initializer. Server placement also retains the secret qualification.
- an unconsumed secret crosses a call boundary only through an explicit
  `Secret<T>` parameter or a type alias retaining that qualification;
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
sanitization and blocks `javascript:` URLs. For stringable values, publication retains the
conversion that passed this check. Opaque markup requires
`unsafeHtml()` plus explicit root policy opt-in and is denied to dependency
packages without a non-transitive grant. The same capability and root opt-in
are required when opaque markup is supplied through native `iframe.srcdoc`.

Root-document rendering preserves authored `html`, `head`, and `body`
structure while inserting only reserved framework hydration and streaming
nodes. Patch application validates target ownership and falls back to an
authoritative boundary replacement when a finer update cannot be proven.

See [native-ssr-production-guide.md](native-ssr-production-guide.md) for
response commitment, limits, CSP, authorization, and deployment requirements.
