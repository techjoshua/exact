# Distributed component continuations

Status: implemented across the compiler, component contracts, SSR, hydration,
server dispatch, testing, and final client-artifact verification.

## Model

An eXact component containing server work is compiled into two cooperating
state machines:

- a durable client machine that owns the live component instance, reactive
  state, DOM bindings, contexts, tasks, and lifecycle; and
- a stateless server machine that executes one allowlisted continuation using
  request/application context supplied by the server host.

The client initiates a server transition. Its request contains only
compiler-selected public dependencies and state snapshots. The response
contains only validated public state/context effects and render patches.
Generated operation identifiers are opaque and have no application-level
meaning.

This is analogous to C# async lowering: authored linear control flow becomes a
state machine, except eXact can distribute the generated states across client
and server runtimes.

## Authoring

Prefer ordinary TypeScript whose results flow into component state:

```tsx
async function ProductPage(this: Component<{ product?: Product }>, props: { productId: string }) {
	const products = this.getContext(ProductRepositoryContext);
	this.state.product = await products.find(props.productId);

	return () => <ProductDetails product={this.state.product} />;
}
```

If `ProductRepositoryContext` is request-scoped and server-resident, the
compiler places the dependent continuation on the server. The repository is
resolved from server context for SSR and later transitions; it is never
serialized from the browser.

Use explicit task facets when policy is part of the source:

```ts
this.task.server.deferred.blocking(async ({ signal }) => {
	this.state.product = await products.find(props.productId, { signal });
});
```

Ordinary awaited component setup is preferred for direct value flow. Explicit
`this.task()` remains useful for external effects, cleanup, nonblocking work,
manual dependencies, forced placement, readiness, or priority.

## Compiler lowering

For each cross-runtime continuation, the compiler records:

- placement and task policy;
- public props, state, and local captures read by the operation;
- server context tokens resolved by the host;
- public state/context writes returned to the client;
- cancellation and generation ownership;
- SSR resumption liveness; and
- reachable client, render, and executor artifacts.

Async setup becomes synchronous component construction plus restartable owned
work. Sequential awaits preserve source order. State writes are staged and
publish together after the generation and its `finally` block complete.
Failed, cancelled, or superseded generations discard their writes.

Recognized asynchronous APIs receive the task signal automatically. Generated
checks after awaits prevent an obsolete continuation from advancing.
Framework cancellation bypasses authored catches while still running
`finally`; ordinary application failures may be handled by authored
`try`/`catch`.

## SSR and resumption

SSR is the first transition between the machines. The server:

1. constructs an ephemeral render instance;
2. resolves server contexts;
3. settles relevant blocking work;
4. emits the initial HTML and deterministic ownership markers; and
5. emits the minimum public resumption record needed by the browser.

Hydration reconstructs the durable client instance, adopts the existing DOM,
restores public component state/context, and arms future task generations.
Settled SSR work is not repeated merely to rediscover the same initial data.

The resumption record contains plain public data and continuation identity. It
does not contain functions, task objects, database clients, request objects,
AbortControllers, subscriptions, or server context resources.

## Data boundary

Application and request contexts default to server residency. Database pools,
Apollo clients, TanStack Query clients, SDKs, schema assets, and credential
providers remain in server artifacts when reachable only from server work.

A capability may declare a public return projection:

```ts
interface ProductRepository {
	/** @exact shared */
	find(id: string): Promise<{ id: string; name: string }>;
}
```

`@exact shared` authorizes that result contract to cross after normal
serialization and policy checks. It does not make the receiver, its
credentials, its other methods, or its intermediate values public.

Allowed transport values are JSON-safe plain data: null, booleans, finite
numbers, strings, arrays, and plain records recursively containing allowed
values. Rich values cross through an explicit public representation, such as
an ISO string instead of `Date`.

The following never cross through framework-controlled client payloads:

- functions and closures;
- DOM, request, response, stream, and abort objects;
- class instances and capability clients;
- `Map`, `Set`, `Date`, cycles, and unsupported prototypes;
- undeclared captures or context resources; and
- secret-qualified values or values derived from them.

Secret qualification dominates sharing. `@exact shared` cannot release a
secret. See
[server-context-and-data-policy.md](server-context-and-data-policy.md).

## Artifact isolation

Client, render, and executor targets are separate reachable graphs.
Server-only dependencies do not become client dependencies merely because
their public result updates client-visible state.

The final client-artifact verifier examines emitted runtime chunks, dynamic
imports, and assets. It rejects server artifacts and host-discovered
server-only modules reachable from the client. Private development source maps
may remain complete; separately published maps can be submitted to disclosure
audit.

Component functions carry target-local private contracts used by hydration,
rendering, and server registration. The current compiler still uses planning
manifest sidecars in parts of project analysis. Runtime application code must
not depend on their schema, file names, or generated operation IDs. Their
remaining uses are inventoried in
[manifest-usage-inventory.md](manifest-usage-inventory.md).

## Protocol and concurrency

The server registers only compiler/application-authorized operations. Unknown
IDs, endpoint mismatches, malformed payloads, state-contract mismatches,
unauthorized requests, invalid CSRF, oversized messages, and non-JSON-safe
results fail closed.

Every client generation carries cancellation and stale-response identity.
Newer dependencies can abort unnecessary work, but correctness does not depend
on cooperative cancellation: a stale response cannot commit.

Same-tick operations may be batched. Independent operations can settle
concurrently; an explicit `dependsOn` edge orders dependent work. Tests inspect
recorded exchanges and state/context effects without relying on generated
operation names.

## HTML and patching

Server data may produce HTML when it stays within a server-owned render path.
That does not authorize the underlying value to enter client state.

Refresh responses prefer proven fine-grained patches: text, properties, styles,
keyed lists, state, stable compiler-owned dynamic ranges, and independent
nested elements. An authoritative boundary replacement remains the correctness
fallback.

## Current limits

- More complicated server-child subgraphs still need broader compiler
  splitting coverage.
- Additional structural cases can fall back to boundary replacement.
- Progressive SSR resumes within the active request; it does not serialize
  postponed renderer state for a later request.
- Compiler planning manifest files have not yet been fully removed.
- Deployment pinning and heterogeneous remote execution beyond the documented
  microfrontend path remain host/platform responsibilities.

For authoring and build wiring, see [server-components.md](server-components.md).
For production operation, see
[native-ssr-production-guide.md](native-ssr-production-guide.md).
