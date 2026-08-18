# Server component execution

eXact uses one component model for client rendering, SSR, hydration, and
compiler-separated server execution. A component with server work is lowered
into two cooperating state machines:

- the durable client machine owns the live component instance, reactive state,
  DOM bindings, and lifecycle;
- the stateless server machine executes allowlisted continuations selected by
  opaque generated operation IDs; and
- SSR is the initial transition, producing HTML plus the minimum public record
  needed to resume the client machine.

This is similar to the syntactic sugar C# applies to an `async` method. Authored
linear code becomes explicit continuation and state-management machinery.
eXact distributes that generated machinery across the browser and server.

Each SSR component instance owns every reactive cell allocated while materializing its compiled
view. Eligible server render programs emit their nested cell and dynamic hydration markers
directly; an unsupported or malformed program alone materializes its marker-compatible fallback
inside that owner. Completing or cancelling the request stops the scope before the instance
becomes unreachable, so component graphs do not accumulate across requests. Process RSS may remain
above live heap after a burst because the JavaScript engine and native allocator retain reusable
pages.

For the full architecture and disclosure model, see
[distributed-component-continuations.md](distributed-component-continuations.md).
For production runtime and adapter concerns, see
[native-ssr-production-guide.md](native-ssr-production-guide.md).

## Authoring

Prefer ordinary component code and let placement follow environment usage:

```tsx
interface ProductRepository {
	/** @exact shared */
	find(id: string): Promise<{ id: string; name: string }>;
}

const Products = createContext<ProductRepository>('products', {
	scope: 'request',
	reactive: false
});

export async function ProductPage(
	this: Component<{ product?: { id: string; name: string } }>,
	props: { id: string }
) {
	const products = this.getContext(Products);
	this.state.product = await products.find(props.id);

	return () => <h1>{this.state.product?.name}</h1>;
}
```

The compiler sees that the awaited operation uses a request-scoped server
context, lowers it into a blocking server continuation, and captures
`props.id` for that transition. `Products` is resolved from trusted request
context on the server and is never accepted from the client. The result
contract deliberately permits the plain product value to cross.

Use `TaskContext.server()` or `TaskContext.client()` on a task function's final
parameter when the work is an external effect, needs manual
scheduling/readiness policy, placement itself expresses architecture, or an
opaque dependency prevents inference. Explicit placement cannot contradict
known effects: a server task cannot read `window`, and a client task cannot
import a server-only module.

Dispatched server work runs in the same task-frame model as local work. The
server supplies a fresh trusted `TaskContext`, so `signal`, `generation`,
`cleanup()`, `own()`, `peek()`, and structural child settlement remain
available without serializing task authority from the browser.

## Residency and disclosure

Placement, serialization, and permission to disclose are different questions.
A JSON-compatible value is not automatically public.

- Application and request contexts supplied by the server runtime are
  server-resident by default.
- `@exact shared` may authorize a narrow local value or function result to
  cross the boundary.
- The annotation changes the result policy, not the residency of the receiver,
  credentials, or neighboring values.
- Secret qualification always wins. Secret data cannot become shared, affect
  public HTML, enter hydration data, or appear in a public error.
- Non-serializable and undeclared captures remain compiler errors.

Server-owned non-secret data may produce public HTML without becoming
structured client state. If the live browser machine must continue observing
that data, project an explicitly shared plain-data result.

## Artifact isolation

Target-specific compilation emits `.exact.client`, `.exact.server`, and when
appropriate `.exact.shared` artifacts. Generated component contracts are
attached privately to the artifacts that own them. Runtime composition reads
those contracts; applications do not invent generated operation IDs.

Each attached contract also carries that component's compact execution subgraph: indexed value
ports, setup or interaction transitions, placement, readiness, concurrency, and reactive-allocation
decisions. The compiler derives client and server projections from one target-neutral analysis and
removes opposite-environment transitions before emission. A module may still contain and export
several components, and ordinary named barrel exports remain tree-shakeable because there is no
eager process-wide dispatch registration.

Imports used exclusively by server continuations remain unreachable from
client runtime output. This includes transitive dependencies, re-exports,
dynamic imports, CSS, workers, schemas, and WASM assets. A component can use
Apollo Client, TanStack Query, a database SDK, or a GraphQL parser on the server
without adding those packages or their dependency graphs to the browser
bundle.

The host-neutral final artifact verifier checks client chunks and assets after
bundling. Vite runs it automatically for client builds. Private development
source maps may retain authored server source for debugging; they ordinarily
are not published. Public map disclosure is a separate deployment decision.

## Build artifacts

The compiler CLI can emit split artifacts:

```sh
npx exactc --rootDir src --outDir .exact --artifacts --serverComponents src
```

Build integrations select `client` or `server` targets and preserve matching
package export conditions. Do not import a server artifact into browser code or
make runtime adapters reproduce compiler placement logic.

Compilation retains project analysis only in its owning session. Application
runtime wiring uses the target-local contracts attached to generated component
exports; installed dependencies are executable inputs, not analysis inputs.

## Runtime composition

Compose executable authority from generated server artifacts:

```ts
import { readExactComponentContract } from '@exactjs/core';
import {
	composeExactExecutorContract,
	createExactHydrationConfig,
	handleExactRequest
} from '@exactjs/server';
import { createExactServerRuntime } from '@exactjs/ssr';
import { ProductPage } from '../.exact/ProductPage.exact.server.js';

const contract = readExactComponentContract(ProductPage);
if (!contract) throw new Error('Missing generated ProductPage contract');

const executor = composeExactExecutorContract([ProductPage], {
	endpoint: '/__exact'
});
const runtime = createExactServerRuntime({ contract: executor });

export const hydration = createExactHydrationConfig(executor);
export const handle = (request: ExactRequestLike) => handleExactRequest(request, runtime);
```

Pass `{ state, publicContexts }` as the second argument when the document carries browser-visible
state or context. When the client entry imports the compiler-generated hydration registration, use
`includeContinuations: false`; this keeps the authoritative continuation contracts in that client
registration instead of transmitting a duplicate copy in the HTML.

Hydration metadata uses compact defaults on the wire. Schema-defined empty arrays and objects are
omitted and restored as shared immutable empty values by the hydration runtime. Empty arrays and
objects inside authored state, props, or context values are data and are never removed.

Adapters translate Fetch, Node, Express, Hapi, Bun, or other host requests into
the runtime-neutral request shape. Authentication and authorization remain
server configuration. The generated continuation never treats client context
as proof of identity.

## Context lifetimes

`createExactServerRuntime()` accepts application and request context
registrations. Application factories live until runtime disposal. Request
factories live through the response or stream and receive the request abort
signal. Dependencies resolve through asynchronous `get(token)` calls, and
runtime-owned values dispose in dependency-safe reverse order.

`this.setContext()` creates component-tree context for descendants. It does not
promote a value to application or request lifetime. Shared component-context
writes may return to the client only when the compiler contract names them;
server-resident context writes remain server-only.

## SSR and hydration

Use request-aware SSR entrypoints when rendering with server contexts. SSR can
settle server tasks, capture the permitted state and shared context needed by
the browser, and mark those continuations as settled.

Instantiating a compiled component state machine installs dependency watchers before task activation. Constants and live
values are immediately available; predecessor outputs are generation-bound slots. A dependent
continuation receives one complete snapshot only after every slot is available. Starting a newer
producer generation makes its current output pending, and stale, failed, or cancelled settlement
cannot publish into downstream work. Interaction-only outputs retain their current visible value
until the interaction actually begins.
When one child prop aggregates several planned state outputs, the compiler carries every
contributing path on that single reactive value. SSR exposes the aggregate to child setup only
after all of those outputs settle, then samples the complete expression once; it cannot initialize
the child from a partially populated object merely because the prop is not a direct state read.

Async SSR invokes reachable compiled children before draining compiler-planned parent work. Each
child therefore wires and offers its independent ready continuations to the same request-owned
bounded scheduler without a startup graph-flattening pass. Conditional, keyed, registry, lazy, and
recursive children continue to use normal render-program reachability, so inactive alternatives do
not execute merely because their component contracts exist.

Within that async render, finite intrinsic branches with no component, structural, enhancement, or
server boundary use the synchronous walker. Compiler-proven module collections also keep ordinary
per-render mapping semantics while omitting reactive wrappers around item values that cannot
invalidate. Output remains as bounded engine ropes until its final adapter encoding, avoiding a
flat string copy at every nested element.

SSR caches the immutable preparation work by the selected root function. Component contracts,
transition and port indexes, output paths, and setup-prop selection are reused across requests;
dynamic components join the root blueprint only when reached. Entries are weakly keyed and checked
against the current compiler identity and attached contract, while values, ownership, watchers,
generations, cancellation, and request contexts remain per render. This removes repeated validation
and graph-index construction without turning the cache into shared application state.

Hydration then:

1. validates the emitted activation against the generated client contract;
2. reconstructs the durable component state and shared component context;
3. adopts matching SSR DOM instead of mounting a duplicate tree; and
4. arms settled tasks without immediately repeating the server query.

Later dependency changes send fresh compiler-selected snapshots to the server.
The response can update only declared state paths, shared context names, and
owned DOM boundaries.

## Protocol and security

The endpoint accepts allowlisted invocation, refresh, and batch operations. The
runtime validates request shape, dependency arity, state reads, public context,
response state, context writes, patches, payload limits, build identity, and
staleness before mutating the client machine.

The client does not send module paths, function bodies, export names, server
context values, database clients, credentials, or arbitrary component names.
Unknown operation and boundary IDs are rejected.

Manual operations that accept a payload must register an operation-specific decoder. Decoding runs
after transport limits and before authorization, so authorization and business logic receive the
same validated value. The protocol allowlist and structural checks do not validate business rules.
Compiler-generated operations carry their framework-owned contract automatically.

Authored HTML patches require `unsafeExactHtml()`. Ordinary strings are rejected before transport;
SSR/compiler handlers are branded internally after framework escaping. Treat the unsafe constructor
as a review boundary: never pass unvalidated user content to it.

## Testing and explainability

`@exactjs/testing` supports both halves without requiring tests to know
generated operation names:

- `testServerComponent()` imports a generated server artifact, configures
  application/request/component context, and exposes settled state, HTML,
  provided context, and emitted `view.resumptions`;
- `mountClientServerTest()` hydrates generated client artifacts against a real
  in-memory handler and records ordered protocol exchanges;
- `view.hydration` reports whether roots or islands adopted, mounted, or
  updated DOM; and
- `ExactProtocolRecorder.serverContextAccesses()` reports authored context
  token use without recording server-owned values when wired to the runtime's
  `onContextAccess` callback.

Compiler callers may set `explain: true` on a transform to receive a stable
component-organized report of placement, client-to-server captures,
server-resident context tokens, returned effects, and SSR resumption liveness.
Normal builds remain quiet.

See [the server-components sample](../apps/server-components/README.md) for
generated artifact composition, hydratable rendering, server context
projection, authorization, and client/server tests.
