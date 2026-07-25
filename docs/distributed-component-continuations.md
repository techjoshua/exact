# Distributed component continuations

Status: implemented foundation with remaining compiler and protocol
generalization work.

## Architectural model

eXact components are compiler-lowered state machines. A component containing
server-executed work has two cooperating machines:

- a durable client machine that owns the interactive component instance,
  reactive state, DOM bindings, and lifecycle; and
- a stateless server machine that executes an allowlisted continuation selected
  by the client.

SSR is the initial transition between those machines. The server creates an
ephemeral render instance with the component inputs, client-visible state, and
server-resolved context needed to produce the initial HTML. It then emits both
the HTML and a minimized client-resumption record. The browser reconstructs the
durable client instance from that record and adopts the existing DOM rather
than treating hydration as an unrelated second render.

The client advances the server machine by invoking an opaque operation. Because
the server machine is stateless between requests, the request carries the
serialized activation record needed by that continuation. The server returns
its observable result, affected DOM boundaries, and client-visible state
changes. Applying that response advances the client machine.

This is the same kind of authored-code simplification that C# provides for an
`async` function: ordinary source is compiled into explicit continuation and
state-management machinery. eXact distributes that machinery across two
runtimes rather than requiring application authors to write requests,
operation registries, state transfer, patch application, cancellation, and
cleanup themselves.

The current concepts map to the state-machine model as follows:

| State-machine concept                    | eXact representation                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| Initial machine transition               | SSR render followed by client hydration                                |
| Server render activation record          | Props, initial state, placement metadata, and server-resolved context  |
| Client resumption record                 | Client-visible props, state, public context, identity, and DOM markers |
| Continuation selector or program counter | Opaque operation identifier                                            |
| Client activation record                 | Captured reactive dependencies, state, payload, and permitted context  |
| Server `MoveNext()` segment              | Registered server operation handler                                    |
| Continuation output                      | Result and affected boundary patches                                   |
| Updated activation state                 | Client-visible state returned by the server                            |
| Resume client machine                    | Validate the response, apply patches, and commit state                 |

The opaque operation identifier selects a continuation; it is not an
application-facing action name. A JavaScript `await` within one server
invocation remains an ordinary server-side asynchronous suspension. A
continuation spanning separate requests must carry everything needed to resume
in the later request.

## What exists today

eXact already implements the core exchange:

- task dependency analysis finds compiler-observed state, prop, context, and
  derived reads;
- task emission rewrites captured reads into dependency parameters, preserving
  the value observed when work was scheduled;
- compiler output describes operation identifiers, state contracts, context
  effects, and affected boundaries;
- the client sends the state paths required by an operation;
- the server validates and executes an allowlisted operation;
- the server can return state, HTML, and boundary patches;
- the client validates and applies the response; and
- the component test harness records request, response, patch, and lifecycle
  exchanges without requiring tests to know generated identifiers.

The SSR runtime also creates component instances for rendering, emits hydration
markers, serializes hydration state and contracts, and serializes client-island
props. These are the existing ingredients of client resumption. The remaining
work is to make the compiler describe the complete SSR-to-client continuation
explicitly and prove that the serialized record is sufficient without exposing
server-owned values.

Target-specific artifact emission already removes server task bodies and their
imports from client artifacts in compiler-covered cases. The stronger
repository-wide guarantee still needs to be defined and verified: a server-only
dependency and its transitive module graph must be unreachable from every
client entry, runtime chunk, and emitted runtime asset. Source maps are
developer artifacts: private maps may retain authored source for debugging,
while maps deliberately published to clients require a separate disclosure
audit or must omit server-only source content.

This plan does not introduce a parallel distributed-closure system. It
formalizes the existing design, removes accidental dependencies on its current
manifest representation, and completes the missing placement and disclosure
contracts.

## Authored and lowered examples

Application code should remain direct:

```ts
this.task.server(async () => {
	const response = await search(this.state.query);
	this.state.results = response.items;
});
```

The compiler can conceptually lower it into cooperating continuations:

```ts
// Conceptual client artifact, not authored source.
const query = this.reactive(() => this.state.query);

query.task(async (querySnapshot, { signal }) => {
	const response = await invoke(serverOperationId, {
		state: { query: querySnapshot },
		signal
	});

	applyBoundaryPatches(response.patches);
	commitReturnedState(response.state);
});
```

```ts
// Conceptual server artifact, not authored source.
serverOperations.register(serverOperationId, async ({ state }, { signal }) => {
	const results = await search(state.query, { signal });

	return {
		state: { results: results.items },
		patches: renderAffectedBoundaries(results.items)
	};
});
```

The precise generated representation may differ. The important contracts are
that `query` is a scheduled snapshot, only required values cross the boundary,
and returned state is applied only after the response has been validated and
confirmed to be current.

## SSR and client resumption

SSR is not merely an HTML optimization. It establishes the initial observable
state of the client component machine. The rendered DOM, serialized state, and
client reconstruction must describe the same logical component transition.

The compiler should derive two records for an SSR-capable client component:

1. **SSR render record:** everything the server needs while producing HTML. It
   may include references to server-only contexts and resources because it
   never leaves the server process.
2. **Client-resumption record:** the minimum transport-safe, client-visible
   values required to recreate the durable client instance and attach its
   reactive graph to the emitted DOM.

The SSR render record may contain more authority than the client-resumption
record. Producing HTML from a server-only value does not authorize serializing
that value. Only its deliberately public projection, if the client needs it
after hydration, belongs in the resumption record.

### Data needed for client resumption

Depending on the compiled component, the client-resumption record may contain:

- the component and boundary identity within the matching client build;
- serializable props required to construct the client instance;
- client-owned or shared initial state after server initialization;
- explicitly public context values or projections consumed by client code;
- keys, slot identity, and hydration markers needed to associate reactive
  expressions with the existing DOM;
- settled server results that client expressions must continue to observe; and
- opaque references to compiler-generated operation contracts already present
  in the matching client artifact.

The resumption record should not serialize executable framework machinery.
Closures, reactive subscriptions, event listeners, task ownership,
`AbortController` instances, and generated functions are reconstructed from the
client artifact. Server-only contexts and resources remain on the server.

For example:

```ts
type ProductPageState = {
	product: PublicProduct | null;
};

function ProductPage(
	this: Component<ProductPageState>,
	props: { productId: string }
) {
	this.state.product = null;

	this.task.server(async () => {
		const database = this.getContext(DatabaseContext);
		const product = await database.products.find(props.productId);

		/** @exact shared */
		const publicProduct: PublicProduct = {
			id: product.id,
			name: product.name,
			price: product.price
		};
		this.state.product = publicProduct;
	});

	return () => <ProductView product={this.state.product} />;
}
```

Conceptually, SSR may use `DatabaseContext` to obtain the product and render
`ProductView`. The document's client-resumption record contains `productId`,
the public `product` state, and the DOM identity needed for adoption. It never
contains `DatabaseContext`, its database client, the unprojected database
record, or its credentials.

If a value influences only static HTML and no client expression, event,
subsequent server invocation, or hydration consistency check needs it, the
compiler should not serialize it. If client code must continue observing the
value, application code must provide an explicitly client-visible
representation.

### SSR equivalence

The first browser-observable client state must be semantically equivalent to
the state used to produce the SSR HTML. Hydration must not:

- recreate a component with different initial state;
- rerun server-only initialization in the browser;
- rerun one-time work merely to rediscover state already established by SSR;
- silently replace adopted DOM because required resumption data was omitted;
  or
- expose server-only values to avoid a hydration mismatch.

When the compiler cannot construct a sufficient and permitted resumption
record, it should report which client-visible value is unavailable. The
framework must not fall back to serializing the surrounding server object or
executing server-only code on the client.

Streaming SSR adds ordered checkpoints to the same model. Each streamed
boundary must carry enough identity and client-visible state for the browser to
apply it to the correct logical component instance, while late or superseded
chunks must not regress that instance.

### Server resources stay on the server

A server continuation should obtain infrastructure through server context:

```ts
this.task.server(async () => {
	const database = this.getContext(DatabaseContext);
	const order = await database.orders.find(this.state.orderId);

	/** @exact shared */
	const publicSummary = {
		id: order.id,
		status: order.status
	};
	this.state.orderSummary = publicSummary;
});
```

`DatabaseContext` contains a server-owned database client. It is neither part
of the request nor the response. The compiler-generated server continuation
resolves it from the server execution context. The same rule applies to
credentialed API clients, secret stores, file handles, request objects, and
other host resources.

A public configuration value is different, but it must be intentionally
declared or projected as client-visible:

```ts
// Conceptual provider configuration; final public API remains to be designed.
provideContext(PublicApplicationConfig, {
	placement: 'shared',
	value: {
		publicAppDomain: applicationConfig.publicAppDomain
	}
});
```

The client may receive `publicAppDomain`; it must not receive the entire
application configuration object from which that value came.

## Artifact and dependency isolation

Distributed continuations divide both execution and dependency graphs. A
package used exclusively by server continuations belongs only in server
artifacts, even when the component using it also has client behavior.

This follows naturally from the authored execution boundary. It does not
require a server wrapper module, a framework-specific import API, package
classification, or bundle configuration:

```ts
import type { Component } from '@exactjs/core';
import { gql } from '@apollo/client/core';
import { ApolloContext } from './application-context.js';

function ProductSearch(
	this: Component<{ query: string; products: PublicProduct[] }>
) {
	this.state.query = '';
	this.state.products = [];

	this.task.server(async () => {
		const apollo = this.getContext(ApolloContext);
		const result = await apollo.query({
			query: gql`
				query Products($query: String!) {
					products(query: $query) {
						id
						name
						price
					}
				}
			`,
			variables: { query: this.state.query }
		});

		/** @exact shared */
		const products: PublicProduct[] = result.data.products.map(product => ({
			id: product.id,
			name: product.name,
			price: product.price
		}));
		this.state.products = products;
	});

	return () => (
		<section>
			<input value:input={this.state.query} />
			<ProductList products={this.state.products} />
		</section>
	);
}
```

The server artifact may contain Apollo Client, its GraphQL parser, cache
implementation, and their transitive dependencies. The client artifact needs
only the generated continuation stub, the input interaction, `ProductList`,
and the public product data returned by the server. Apollo Client must not be
present in the browser graph.

TanStack Query, database SDKs, server validation packages, search clients, and
similar infrastructure follow the same rule. Their useful result crosses the
boundary; their implementation does not.

Context solves resource ownership and reuse; it is not required to make the
bundle split work. Application code should normally resolve reusable clients
from server context rather than constructing one for every component task:

```ts
this.task.server(async () => {
	const queryClient = this.getContext(QueryClientContext);
	this.state.products = await queryClient.fetchProducts(this.state.query);
});
```

The context token may be known to the compiler, but its server-owned value and
implementation graph remain server-only.

### Dependency isolation invariant

After target-specific compilation:

- a client artifact has no runtime import, re-export, dynamic import, or
  generated registry edge to a server-only module;
- a client chunk cannot acquire a server-only package through a barrel, helper,
  plugin transform, package conditional export, or shared chunk;
- type-only imports may remain because TypeScript erases them before runtime;
- source maps published to clients must not embed removed server source or
  server-only `sourcesContent`; private development maps may remain complete
  and should not be copied into the public deployment;
- server-only CSS, WASM, workers, schemas, and other assets are not emitted as
  client assets unless a separate client consumer requires them; and
- the invariant is checked against the final bundler graph, not inferred from
  an apparently unused import in generated source.

Tree-shaking remains useful for ordinary optimization, but it is not the
boundary. eXact should remove or redirect server edges before the browser
bundler constructs its graph and then verify the final graph as a defense in
depth. This verification is framework and build-tool work. It must not require
application authors to restate placement that the component already makes
clear.

This isolation produces several direct benefits:

- substantially smaller JavaScript downloads, parse work, and retained browser
  memory;
- no browser initialization cost for server data frameworks;
- fewer client-side version conflicts and polyfills;
- less code exposed for inspection or browser-side attack;
- no need to reproduce a server cache and request client in every browser tab;
  and
- freedom to select server libraries for server capability without making
  their browser weight part of the UI architecture.

## Benefits

### Ordinary component source

Application authors express state reads, server work, and state writes in
TypeScript. The compiler owns transport plumbing and generated continuation
parameters.

### Minimal data transfer

Compiler demand analysis can send only values actually read by the destination
continuation and return only values needed by the client. This reduces payload
size and prevents unrelated component state from becoming part of the protocol.

### Smaller client dependency graphs

Server-only work brings none of its runtime dependencies into the client
bundle. A component can use Apollo Client, TanStack Query, a database SDK, or a
large server integration while the browser receives only the interactive code
and public data it needs.

### SSR without a second application model

The same component definition supplies the initial server render and the
resumed client machine. Compiler-generated resumption data preserves the
initial state without requiring authors to maintain a separate hydration DTO,
repeat data loading in the browser, or manually coordinate SSR markup with
client initialization.

### Safer server boundaries

Placement and disclosure are checked before execution. Server resources remain
server-resolved, operation dispatch remains allowlisted, and protocol values
are validated in both directions.

### Deterministic asynchronous behavior

Captured inputs have snapshot semantics, stale responses can be rejected, an
`AbortSignal` follows component ownership, and unmounting releases outstanding
work.

### Inspectable behavior

Tests can assert which values crossed the boundary, which state changed, which
patches were applied, and whether work completed, failed, became stale, or was
cancelled without coupling to generated operation names.

### Runtime-independent adapters

HTTP adapters authenticate requests and supply server context, while the
compiler/runtime continuation contract stays consistent across Node, Bun, and
other supported servers.

## Adopted design decisions and implementation questions

The following questions must be answered before the continuation model is
treated as complete. The recommendations favor ordinary TypeScript at the
authoring layer and precise, measurable work in generated artifacts and
runtimes.

These are compiler and runtime design questions, not concepts every application
author should have to manage. The default successful path remains: import a
library, use it in naturally placed component code, read and write ordinary
typed state, and let the compiler produce the split. A proposed solution that
requires routine transport DTOs, package allowlists, placement files, cache
keys, generated action names, or hydration bookkeeping in component source has
failed the framework's usability goal. Explicit APIs are reserved for genuinely
ambiguous placement, public disclosure, resource lifetime, or behavior whose
intent TypeScript alone cannot express.

### How should placement be selected?

**Problem:** Requiring annotations on every function would replace transport
ceremony with placement ceremony. Pure inference, however, cannot safely
classify opaque calls or modules with unknown side effects.

**Decision:** Infer placement from compiler-visible effects, consumers,
imports, globals, context policy, and state flow. Preserve
`this.task.server()` and `this.task.client()` as explicit escape hatches for
architectural intent. Report a diagnostic with the effect path when inference
is ambiguous; do not silently duplicate questionable work into both artifacts.

### Which contexts default to server residency?

**Problem:** Treating an application- or request-provisioned service as
implicitly shared risks transporting infrastructure objects. Treating every
component context as server-only would make ordinary theme, form, and UI
contexts awkward.

**Decision:** Contexts provisioned by the server runtime with
`scope: 'application'` or `scope: 'request'` default to server residency.
Reading one places the read and calls through the resulting service on the
server. Component-scoped contexts retain compiler-inferred placement. Public
application configuration must opt into a shared context or expose a narrow
shared projection. Token global identity does not imply shared residency.

### When may server-resident data become HTML?

**Problem:** Server rendering necessarily turns some server values into
client-visible HTML, but treating all server residency as secrecy would make
ordinary SSR impossible. Treating all rendered values as safe would expose
credentials.

**Decision:** Permit non-secret server-resident values to influence
server-owned VNode output. Do not serialize their structured values into
hydration state or client captures. Reject every secret-qualified direct or
implicit flow into HTML, attributes, output shape, patches, and other public
sinks. The compiler determines server-owned versus client-owned use from the
consumer graph; authors do not select a “static HTML mode.”

### What authority does `@exact shared` grant?

**Problem:** A shared annotation is necessarily a trust assertion because the
compiler cannot know whether arbitrary database columns are public. If it also
cleared secret tracking, one annotation could expose credentials.

**Decision:** Let `@exact shared` release only server residency for the
annotated projection or resolved return. It never changes execution placement,
shares the receiver, or clears `Secret<T>`. Require all return paths and
fulfilled values to satisfy the shared contract. Reject shared contracts whose
declared type remains secret-qualified, record contracts in compiler policy IR,
and surface dependency-provided contracts in the optional audit report.

Application-owned annotations are trusted disclosure decisions. Packages may
publish the same contract through their declaration metadata, but eXact should
retain its provenance so applications can audit which dependency authorized a
transfer. A future stricter application policy may deny dependency-provided
shared contracts without changing the ordinary default workflow.

### What constitutes a server-only package?

**Problem:** Node built-ins are clearly server-only, but packages such as
Apollo Client can technically execute in a browser even when an application
intends to use them only on the server.

**Decision:** Placement follows reachability from placed code rather than
a global package blacklist or author-supplied package list. If the only runtime
use of an imported binding is inside a server continuation or server provider,
the compiler retains that import only in the server artifact and the package is
naturally absent from the client graph. Optional application policy may forbid
a package from client output as an additional safety assertion, but it is not
needed for ordinary splitting.

### How are transitive and dynamic imports handled?

**Problem:** A direct import can disappear while a barrel, generated registry,
shared helper, or `import()` leaves a transitive path into a client chunk.

**Decision:** Build distinct client and server module graphs from
compiler artifact entry points. Propagate placement through re-exports and
dynamic imports. Verify final bundler metadata and fail the build when a
server-only module is reachable from a client output. Add final-artifact tests
using representative deep dependency graphs, not only transformed source
assertions.

### What happens to module initialization and side effects?

**Problem:** Splitting a function that closes over a module-scoped singleton is
safe only when the singleton stays in the correct runtime. Duplicating
side-effectful module initialization can change behavior.

**Decision:** Duplicate compiler-proven constants and pure helpers when
both artifacts need them. Retain runtime resources in one placed module or
context provider. Reject ambiguous top-level side effects that would have to be
split. Do not hide the problem with browser shims or by executing server setup
in the client.

### Where should server data clients live?

**Problem:** Constructing Apollo, TanStack Query, database, or API clients for
each reactive operation wastes connection, cache, and initialization work.
Global singletons can instead leak authentication or tenant state.

**Decision:** Define server context lifetimes explicitly:

- application scope for immutable configuration and safely shared,
  tenant-neutral clients;
- request scope for authentication, locale, tenant, request caches, and
  tracing;
- invocation or component scope for resources that require deterministic
  disposal.

Components consume those clients with `this.getContext()`. Adapters construct
request context after authentication; generated continuations never accept a
client-submitted infrastructure object.

### How does SSR avoid duplicate data work?

**Problem:** A server task may fetch during SSR and then immediately fetch again
when the client machine starts.

**Decision:** Record which isomorphic or server continuation reached a
settled state during SSR and include its permitted client-visible result in the
resumption record. Hydration reconstructs subscriptions and future triggers
but does not repeat the completed initial transition. A dependency change after
hydration schedules a new generation normally.

### How much state should SSR serialize?

**Problem:** Serializing the whole component instance is simple but increases
HTML size, leaks unrelated values, and couples hydration to implementation
details. Serializing too little causes mismatches or repeated work.

**Decision:** Compute a client-resumption liveness set. Include values
needed by client expressions, event handlers, later transported captures,
public contexts, and hydration identity. Exclude server-only values and values
used only to produce static HTML. Explain every retained field in compiler
diagnostics or optional build analysis so payload growth is inspectable.

### How are server results represented?

**Problem:** Data libraries commonly return class instances, proxies, cache
records, rich errors, or graphs containing internal metadata. These should not
become component protocol values.

**Decision:** Require results crossing the boundary to be supported
transport values or explicit public projections. Start with the current strict
plain-data protocol. Add codecs only as declared, independently testable
contracts with bounded encodings; do not invoke arbitrary `toJSON()` methods or
infer that a class instance is public.

### How are concurrent generations reconciled?

**Problem:** Two dependency changes can produce overlapping server requests.
An older response may contain valid data but no longer represent the current
client activation state.

**Decision:** Associate every invocation and streamed checkpoint with a
component generation and expected write contract. Apply a response only when
its generation is current, unless the generated operation explicitly defines a
commutative merge. Cancellation should stop unnecessary work, but correctness
must not depend on cancellation arriving in time.

### How are caches and deduplication coordinated?

**Problem:** Fine-grained reactive server operations can become chatty, while
automatic deduplication can incorrectly merge operations whose context or
authorization differs.

**Decision:** Keep transport batching and request scheduling in the
runtime. Perform data caching through server context using keys that include
the relevant request, tenant, and authorization scope. Only deduplicate
continuations when the compiler/runtime can prove identical operation,
snapshot, context identity, and visibility policy. Prefer observable profiling
over invisible heuristics.

### What may appear in HTML, errors, and source maps?

**Problem:** Preventing hydration serialization is insufficient if a secret is
rendered into HTML, included in a public error, or embedded in a browser source
map.

**Decision:** Treat HTML, attributes, patches, public errors, hydration
data, client JavaScript, assets, and source maps as client disclosure sinks.
Propagate secret and residency policy to all of them. Server logs may retain
private diagnostic correlation under application policy; public errors should
use bounded codes and messages without stacks or server object inspection.

### How should build and deployment skew behave?

**Problem:** Cached HTML can reference continuation or component descriptors
from an older client/server build.

**Decision:** Bind SSR output, resumption records, client chunks, and
server descriptors to an immutable build identity. Retain compatible server
artifacts for in-flight clients where the deployment model permits it.
Otherwise reject the operation with a reload-safe response. Never execute an
opaque identifier against a different build's registry.

### How should streaming SSR resume?

**Problem:** A late streamed result may target a boundary that hydrated,
unmounted, or advanced while the server was working.

**Decision:** Give each stream checkpoint a build identity, component
identity, boundary identity, and generation. The browser validates all four
before applying it. Hydration and streaming share one ownership table so they
cannot independently claim or replace the same DOM range.

### How should performance be evaluated?

**Problem:** Moving dependencies off the client can increase server bundle
size, cold-start time, memory, or per-request work. A single bundle-size number
conceals the trade.

**Decision:** Report client transfer size, decompressed JavaScript,
client parse/evaluation work, hydration/resumption bytes, server artifact size,
server cold start, SSR latency, continuation latency, and retained context
memory separately. Track representative applications over time. Use hard
limits for correctness and security boundaries; use visible baselines and
intentional review for performance changes rather than arbitrary universal
budgets.

### How can developers understand the generated split?

**Problem:** Automatic lowering becomes difficult to trust when developers
cannot tell why code or data appears in an artifact.

**Decision:** Provide an optional compiler report organized by authored
component:

- inferred and explicit placement;
- client and server dependency roots;
- values captured in each direction;
- SSR resumption fields and why each is live;
- server contexts resolved without transport;
- returned state and affected boundaries; and
- client/server size contributions when bundler metadata is available.

Normal builds remain quiet. Diagnostics explain only actionable ambiguity or
contract violations, while the report supports debugging and performance work.

## Placement, transport, and disclosure

Placement, encodability, and disclosure are separate questions:

1. **Placement:** where is the value available and owned?
2. **Transport:** can the protocol encode and reconstruct it?
3. **Disclosure:** is this particular value allowed to cross this trust
   boundary?

A value being JSON-compatible answers only the second question. It does not
make the value public.

Every captured or returned value must be classified as one of:

- **client-local:** never sent to the server;
- **server-local:** resolved by the server continuation and never sent to the
  client;
- **client-to-server:** an explicitly required, serializable snapshot;
- **server-to-client:** an explicitly permitted, serializable result, state
  write, or public context projection; or
- **shared public configuration:** explicitly declared safe in both runtimes.

Ambiguous placement is a compile-time error. Server context is server-only by
default. Nothing becomes transportable merely because a continuation reads a
context value or because its current object happens to serialize.

### Values allowed from server to client

The server may return only values that are both required by a client-visible
consumer and permitted by an explicit compiler-known contract:

- action or task result data intended for client code;
- writes to client-owned or shared component state;
- compiler-generated DOM patches or rendered HTML;
- deliberately public context projections; and
- bounded, public structured error information.

Under the current JSON protocol, ordinary transport values are `null`,
booleans, finite numbers, strings, arrays, and plain objects composed of those
values. Values requiring richer semantics, such as a `Date`, should cross as an
explicit public representation such as an ISO string unless a future declared
codec defines their reconstruction.

Both the server encoder and client decoder must enforce protocol shape, depth,
node-count, byte, and patch-count limits. The client must reject malformed,
unexpected, stale, or mismatched responses before mutating component state or
the DOM.

### Values forbidden from server to client

The following are server-only unless application code explicitly extracts a
separate public data-transfer value:

- database, cache, queue, mail, and credentialed API clients;
- secrets, credentials, private keys, tokens, cookies, and session internals;
- HTTP request/response objects and adapter runtime objects;
- functions, closures, class instances, proxies, streams, sockets, handles,
  symbols, and host objects;
- mutable server singletons and module-local infrastructure;
- ORM entities or application configuration objects that may contain private
  fields; and
- cyclic object graphs or values with unsupported prototypes.

Compiler demand analysis must never infer that one of these values is safe to
disclose. A database record, for example, should be projected into a dedicated
client-visible object containing only the required fields.

### Context rules

Context providers need an explicit placement contract:

- **server context** is the default for server-provisioned application and
  request infrastructure and is resolved independently for every server
  invocation;
- **client context** exists only in the client component tree;
- **shared public context** has an explicitly declared transport shape; and
- **projected context** exposes a declared public subset or serializer output
  while retaining the source context on the server.

A server operation's context contract should identify which server contexts it
may resolve. That contract authorizes lookup; it does not authorize
serialization. A distinct shared/public declaration is required before any
context-derived value may be emitted to the client.

Server context locality propagates through ordinary use. An alias of the
context value, a property read, a method reference, a closure capturing it, and
a call through it remain server-placed. A call's result is server-resident by
default even when its TypeScript shape is plain data; only an explicit shared
projection or return contract changes that result's residency.

Authentication and request policy remain adapter responsibilities. Adapters
populate server context after authenticating the request; clients do not submit
database clients, authenticated principals, or credential-bearing context
objects as trusted context values.

### Residency and secrecy are independent

The compiler needs two independent policy axes:

- **residency** answers where a value may exist: server, client, or shared; and
- **secrecy** answers whether a value may influence any client-observable
  output.

A server-only value is not necessarily secret. A product record may remain
server-resident as structured data while still being safe to render as public
HTML. Conversely, a secret is always server-resident and must not influence
HTML, attributes, patches, hydration data, public errors, client code, or even
the shape of client-visible output.

| Policy             | Server execution                                 | Server-generated public HTML | Structured transfer to client      |
| ------------------ | ------------------------------------------------ | ---------------------------- | ---------------------------------- |
| Server, non-secret | Allowed                                          | Allowed                      | Rejected                           |
| Shared, non-secret | Allowed                                          | Allowed                      | Allowed when serializable and live |
| Server, secret     | Allowed only in trusted server work              | Rejected                     | Rejected                           |
| Client             | Not a server input unless explicitly transported | Not available for SSR        | Already client-owned               |

This distinction permits both outcomes for server query data without another
component API:

```ts
this.task.server(async () => {
	const database = this.getContext(DatabaseContext);
	this.state.rows = await database.queryProducts();
});

return () => <ProductTable rows={this.state.rows} />;
```

If `rows` is server-resident and used only by a server-rendered boundary, eXact
may render the table and send its HTML. The structured rows are not included in
the client-resumption record and client code cannot capture them. The boundary
is server-owned: a later server refresh may replace or patch its HTML without
giving the browser the underlying row objects.

If a client expression, event handler, form binding, client task, or later
client-to-server continuation needs the structured rows, those values must be
shared. Without a shared return or data contract, the compiler reports the
specific flow that attempted to move server-resident data into client-owned
state or code.

If the rows are secret-qualified, neither path is permitted. Rendering secret
data into “static” HTML is still disclosure, so the compiler rejects it.

### Shared projection and return contracts

Calling a method on a server context executes on the server and produces a
server-resident result by default. A narrow JSDoc contract may explicitly mark
an application-owned public projection:

```ts
const record = await database.products.find(id);

/** @exact shared */
const product: PublicProduct = {
	id: record.id,
	name: record.name,
	price: record.price
};
```

When an API always returns an already-projected public value, the contract may
instead declare that method's resolved return value to be shared:

```ts
interface ProductRepository {
	/**
	 * Returns the public product projection.
	 *
	 * @exact shared
	 */
	findPublicProducts(query: string): Promise<PublicProduct[]>;
}
```

On a callable, `@exact shared` applies to the resolved return value, including
the fulfilled value of a `Promise`. On a declaration, it applies only to that
declared projection. It does not make the receiver, function implementation,
arguments, source record, or dependency graph shared. The repository, database
client, query library, cache, and credentials remain server-only.

The annotation is a disclosure contract, not a serializer. The returned value
must still satisfy the generated transport shape and protocol limits. It is
also not an execution-placement annotation: `findPublicProducts()` continues
to execute only on the server.

The current policy IR uses `isomorphic` for unrestricted data residency. That
name is misleading for this contract because a shared result does not imply
that the producing code can execute in both runtimes. The data-policy vocabulary
should use `shared`; `isomorphic` remains an execution-placement term. Manifest
migration may temporarily decode the old residency name, but new compiler IR
and diagnostics should keep code placement and data residency distinct.

Prefer annotating narrow application or repository methods that already return
public projections. A broad annotation on a generic `query()` method asserts
that every possible query result is public and is therefore usually too
powerful:

```ts
interface ProductRepository {
	/** @exact shared */
	findPublicProducts(query: string): Promise<PublicProduct[]>;

	findCustomerCredentials(customerId: string): Promise<CustomerCredentials>;
}
```

The first result may cross when client code requires it. The second remains
server-resident and cannot enter client state. If `CustomerCredentials` is
secret-qualified, it also cannot influence rendered HTML.

Application contexts that intentionally carry public configuration may use the
same shared policy explicitly. Server-provisioned application and request
contexts remain server-only when no such declaration exists. Component-scoped
contexts continue to follow their provider and consumer placement because they
are often ordinary UI values rather than server infrastructure.

### Interaction with the secrets plugin

A database client and its credentials have different policies:

- the connection string, token, or private key is `Secret<T>`;
- constructing the database client is an audited secret-consumption boundary;
  and
- the resulting database client is a server-only capability supplied through
  server context.

The client object should not remain secret-tainted merely because a credential
was used internally to construct it. Doing so would incorrectly make every
query result secret. Instead, `consume()` records the deliberate use of the
credential in trusted server initialization, while server context residency
prevents the resulting capability from crossing the boundary.

A shared return contract may release the **residency** of a method result. It
must not erase **secret** qualification carried by the returned value, an
argument, or compiler-visible control flow. Secret policy always wins:

```ts
interface AccountRepository {
	/** @exact shared */
	findPublicProfile(id: string): Promise<PublicProfile>;

	/** Invalid: Secret<T> cannot be made public by @exact shared. */
	/** @exact shared */
	readResetToken(id: string): Promise<Secret<string>>;
}
```

The compiler should diagnose the contradictory second contract. Ending secret
tracking remains a separate, audited `consume()` operation available only to
trusted server code; `@exact shared` must never act as a synonym for
`consume()`.

The compiler cannot determine whether arbitrary database columns are
conceptually private. The author of a shared return contract is asserting that
the method returns an intentional public projection. Compiler reports should
list those disclosure contracts and their client sinks so that broad or
dependency-supplied assertions are reviewable.

Sensitive database fields should retain secret qualification in schema or
repository types:

```ts
interface AccountRecord {
	id: string;
	displayName: string;
	passwordHash: Secret<string>;
	resetToken: Secret<string>;
}
```

That qualification prevents the fields from entering shared projections or
server-generated HTML. The secrets plugin or future data-library integrations
may help attach these policies to generated types, but eXact must not guess
secrecy from column names. Unknown database data remains server-resident by
default, which prevents structured transfer but cannot by itself prove that
rendering a particular field is safe.

## Required invariants

### No durable manifest dependency

The current manifest-backed registrations are an implementation detail being
removed, not the durable contract. The compiler should emit private operation
descriptors directly into matching client and server artifacts. Runtime
registries may index those descriptors internally, but application code and
tests must not depend on generated identifiers.

### Snapshot semantics

The server continuation receives a snapshot of each transported input. It must
not re-read mutable client state after an asynchronous suspension. This matches
the dependency-parameter rewriting already used by inferred `this.task()`
calls.

Server context is different: it is resolved by the server at invocation time
and remains owned by that invocation. It is not a snapshot supplied by the
client.

### SSR resumption sufficiency

For every hydratable component, the compiler must be able to account for each
value required to:

- produce the initial HTML;
- reconstruct the durable client component instance;
- adopt reactive DOM bindings without changing their observable output; and
- execute later client or server continuations.

The emitted client-resumption record contains only the client-visible subset.
Server-only render inputs may affect HTML, but they may not enter the
resumption record unless application code explicitly projects them into an
authorized client-visible value.

Component identity and resumption metadata must refer to the same immutable
client build that produced the server artifact. A mismatched build must fail
safely rather than adopting DOM with incompatible continuation descriptors.

### Observable protocol

Tests inspect ordered exchanges rather than generated operation names. Records
should expose:

- direction, operation kind, and lifecycle phase;
- serialized request and response values;
- applied or rejected state changes and patches;
- success, failure, staleness, or cancellation;
- the component instance that initiated the exchange; and
- public context values that crossed the boundary plus server-context tokens
  resolved during execution, without recording their secret values.

Opaque identifiers may be retained for correlation, but assertions should not
require a particular generated identifier.

### Ownership and cancellation

Generated operations belong to the component lifecycle that scheduled them.
Unmounting the owner cancels outstanding work and releases retained captures.
Nested components and contexts must not accidentally extend that lifetime.

### Least authority in both directions

The request contains only compiler-approved client values required by the
selected operation. The response contains only compiler-approved
client-visible values required to advance the client. The server does not trust
client-submitted context as proof of identity or authorization, and the client
does not trust server output until it passes the generated response contract.

## Compiler model

The compiler should represent each cross-runtime continuation with private IR
that:

1. resolves free values to state, props, context, immutable locals, or supported
   module bindings;
2. records read dependencies, write effects, affected boundaries, ownership,
   and cancellation;
3. classifies each value's residency, secret qualification, transport shape,
   and disclosure policy as independent properties;
4. records shared projection and resolved-return contracts with their source
   provenance;
5. distinguishes server-context lookup from transported captures and applies
   server defaults to application- and request-scoped context;
6. records target-specific static imports, dynamic imports, re-exports, and
   emitted asset edges;
7. rejects unsupported aliases, host values, cycles, secret disclosures, and
   undeclared disclosures;
8. emits matching private descriptors into client and server artifacts; and
9. rewrites the call site to pass concrete snapshots and commit validated
   results.

Generated names need to be stable only within a matching pair of immutable
build artifacts.

## Runtime contract

The shared runtime protocol must:

- render the initial component transition with server-resolved context;
- emit bounded HTML, hydration markers, and a validated client-resumption
  record;
- reconstruct the client instance and adopt the matching SSR DOM;
- invoke an opaque continuation with a validated serialized activation record;
- resolve server-only context from the authenticated server execution;
- propagate cancellation through an `AbortSignal`;
- validate returned state, patches, public data, and structured errors;
- prevent stale results from mutating the client machine;
- record exchanges for test inspection; and
- retain bounded payload and resource limits.

Adapters supply transport, authentication, request policy, and server context.
They must not need to reproduce compiler-generated continuation logic.

## Remaining implementation plan

1. **Document the existing lowering.** Treat the two-machine model and the
   SSR/resumption/request/response invariants above as the canonical
   architecture.
2. **Complete the residency and disclosure lattice.** Make
   server-provisioned application and request contexts server-only by default.
   Add `@exact shared` for narrow local projections and resolved callable
   returns, preserve its provenance in policy IR, and ensure it can release
   residency without clearing secret qualification. Rename unrestricted data
   residency from `isomorphic` to `shared` while retaining `isomorphic` for
   execution placement. Distinguish server-owned public HTML from structured
   client transfer in sink analysis.
3. **Preserve and verify natural artifact isolation.** Build target-specific
   module graphs from compiler-placed code, propagate reachability through
   direct, transitive, re-exported, and dynamic edges, and verify final client
   chunks, maps, and assets contain no server-only reachability. This requires
   no package declarations or application configuration. Cover representative
   Apollo/TanStack-style dependency fixtures.
4. **Define the SSR resumption contract.** Derive separate server render and
   client-resumption records, identify the minimum values needed for DOM
   adoption and later continuations, and diagnose missing or forbidden values.
5. **Introduce unified continuation IR.** Consolidate existing task
   dependencies, state contracts, context effects, operation registrations,
   SSR inputs, hydration identity, module-graph edges, boundary effects,
   ownership, and cancellation into one compiler-owned representation.
6. **Remove manifest coupling.** Emit matching private continuation descriptors
   into client and server artifacts while keeping operation identifiers opaque.
7. **Generate precise response contracts.** Use compiler-known write and
   boundary effects to validate and commit only permitted client-visible
   changes rather than accepting an unconstrained state object.
8. **Complete context handling.** Resolve server resources exclusively on the
   server, define application/request/invocation lifetimes, and add an explicit
   mechanism for intentionally public context values or projections.
9. **Extend protocol observation and build analysis.** Record SSR inputs by
   placement, emitted resumption data, DOM adoption, transported public context, and
   server-context token usage without leaking server-owned values. Add an
   optional explanation report for placement, captures, and final artifact
   contributions.
10. **Verify every transition.** Add focused compiler, final-bundle,
    SSR/hydration, loopback, adapter, and adversarial tests for dependency
    isolation, resumption sufficiency, build mismatch, capture snapshots,
    server-owned HTML, shared projections, secret precedence, context defaults,
    disclosure rejection, streaming order, stale responses, cancellation,
    concurrency, teardown, malformed values, and payload limits.
11. **Establish performance baselines.** Track client and server costs
    separately using representative applications, including one with a heavy
    server data dependency that must contribute zero runtime modules to the
    client graph.

Unsupported cross-runtime captures must remain compiler errors. The framework
must not silently serialize a broader object, expose a server context, or
change snapshot semantics merely to make authored code compile.
