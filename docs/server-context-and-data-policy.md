# Server context and data policy

Status: implemented foundation and current contract.

eXact treats execution placement, data residency, lifetime, transferability,
and secrecy as related but independent properties. Compiler analysis and
runtime validation enforce the boundary; application code should not reproduce
it with local serialization or bundler workarounds.

Request byte caps are application-owned. Set `limits.maxRequestBytes` to reject bodies above
the chosen byte count during streaming reads and before dispatch. Without a configured cap,
bodies over 4 MiB emit one `request-size` warning and continue. This applies to decoded bodies,
text, bytes, streamed requests, and raw gateway forwarding. Client requests use the same warning
policy before sending single or batched envelopes. Set client `streamLimits.maxRequestBytes`
to enforce a cap before transport. JSON shape validation and separately
configured incoming graph and batch limits retain their own contracts.

Continuation output uses warning thresholds when resource settings are omitted.
Positive safe-integer response caps fail with an error and stop output. Server logs
identify the setting, scope, units, threshold, and measured amount. Each owner logs
once per setting. Client-only caps report through the client logger. Graph validity,
dispatch and state authority, and cancellation remain mandatory. See the
[production limits reference](native-ssr-production-guide.md#limits) for settings,
measurement units, snapshot thresholds, and stream totals.

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

Request context views preserve inherited and nonenumerable server configuration. Request-owned
overrides remain local even when the supplied configuration is frozen. If capturing configuration
fails after a request scope opens, the framework closes that scope and preserves the original
failure even when cleanup also throws.

Plain supplied context values remain externally owned. Closing a scope with no
factory-owned values skips dependency traversal, but still closes its lifetime
and clears its resolved-value lookup. Factory
initialization remains eager and deterministic; owned resources retain dependency
ordering, cancellation, and reverse-order cleanup. This optimization does not
change context residency or the compiled-component ABI. Disposal failures remain failures for
all thrown values, including `undefined`. When stream cancellation and scope cleanup both fail,
the cancellation failure remains primary and scope cleanup still completes. Request initialization,
request-body reads, and retained or produced response bodies preserve the signal's exact abort reason, including null,
while canceling owned work and releasing request resources. A produced body forwards the same reason
to its producer, blocked writes, and retained scope cleanup. Express response drain waits preserve
that reason too. Batch cancellation prevents dependent operations from starting and retains
the same reason. Canceling task-progress output before its queued producer starts prevents
that producer from running after resource disposal. Already-started factory work
remains observed if its factory cancels the request before returning a promise, so a late
rejection does not escape as an unhandled failure.

The application may configure a trusted `publicOrigin` on its server context.
eXact combines that origin with the incoming path and query, but never infers
public authority from `Host` or `X-Forwarded-Proto`. Leading double slashes in the
parsed pathname remain path data and cannot replace that origin. A resolver may consult the
adapter-owned platform request for multi-tenant or trusted-proxy deployments;
that resolver is an explicit deployment trust boundary and must validate any
host it accepts. Without a configured origin, request URLs use the reserved
`http://exact.invalid` authority and relative redirects remain relative. `RequestContext.redirect()`
validates its status, URL and Location header before publishing response controls. A rejected
redirect leaves the previous status, redirect and headers unchanged, allowing the caller to
recover with a valid redirect before response commitment.

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

Secret provider handles and returned name dictionaries retain ordinary TypeScript readonly
semantics without runtime freezing. Environment-file identifiers are retained exactly, including
names shared with JavaScript object properties. Resolver initialization captures its source signal
when queued and captures application metadata before provider loading. Each provider receives its
own context object. Caller aliases cannot redirect an in-flight initialization's cancellation or
leave its original signal subscribed after completion. Environment-file loads likewise retain their
original signal and abort reason. Generation fencing and server-only secret qualification remain
independent of these ordinary public values.

Secret resolver initialization shares pending provider work and publishes values only after all
providers and required-name checks succeed. A failed attempt leaves no partial snapshot. Disposal
clears values, cancels pending provider work, and prevents late results from republishing them.
A later initialization starts a new isolated generation. Custom providers should observe their
context's signal, which combines startup cancellation with resolver disposal. Empty strings remain
configured values. Applications enforce credential-specific non-empty requirements themselves.
Environment-file loading honors startup cancellation through the filesystem API. File providers
require filesystem access. Hosts with secret bindings or a secret service can supply a custom provider.

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

Field qualification applies to whole records even when a field's ordinary TypeScript type is
`string`. It includes inherited and mapped declaration contracts and deferred constructor results.
Selecting a public sibling does not authorize delivery of a retained secret field initializer.
If its definition remains in client code and cannot be removed safely, compilation reports
EXACT3022 and supplies neither code nor a source map. Dead pure definitions and server-owned task
bodies can be projected away. Stored record contracts retain field qualification through aliases
and native payload containers. Native payloads and authored augmentation members retain separate
qualification obligations. An unrelated public collection extension does not make its payload
secret, and it does not release a secret payload or an annotated augmentation field. Standard
library API members are not recursively treated as stored payloads. A constructor's synthetic instance prototype and deferred callable
results are separate from its stored data. Direct `eval`, including erased type wrappers, prevents
dead-definition pruning in delivered code. Client source maps omit embedded authored source for files containing
private definitions so that removed server code is not delivered through the map.

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
in a client artifact cannot consume secrets. For a resolved ordinary imported helper called
from component code, the consuming compile audits consumption in that helper and its stable identifier-bound
ordinary function callees only
when the original Call survives target lowering and final pruning. A server-task body
replaced by a client continuation does not retain that Call. Qualification and audit
receipt locations remain owned by the helper source; the diagnostic points to the
consuming component edge. Pending-helper lowering retains the original edge on its
exact generated invocation; projection still decides whether that invocation survives.
The final audit also validates the original function passed to the helper selector.
A retained member route without that function identity refuses coverage rather than
borrowing authority from its receiver/key. Callee-owned normal-node inventories preserve
eager evaluations without invoking dormant nested bodies. Repeated calls and cycles are
deduplicated by original declaration and consume identity. Task/component boundaries and
unresolved higher-order calls do not inherit the root's retention authority. Inline authored callbacks of standard Array.map are
included only through the original acquired native callback Effects association
published with the existing call edge. Authored lookalike methods and stored
callback values do not obtain that association. This MAY-effects handoff carries
no callback completion, selected value or normal-execution permission. Captured parameter defaults run on the originating
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
