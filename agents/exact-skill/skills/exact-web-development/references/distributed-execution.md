# Distributed component execution

Read an eXact component with server work as two compiler-generated state machines:

- the durable client machine owns the component instance, reactive state, DOM, and lifecycle;
- the stateless server machine executes one allowlisted continuation when the client advances it;
- SSR is the initial transition and emits the minimum public activation needed for hydration.

This resembles C# async lowering: authored linear code becomes explicit continuation machinery.
Do not introduce application-authored request wrappers, action registries, or duplicate client and
server component models when the compiler can own that plumbing.

## Keep server resources local

Application and request contexts supplied by the server runtime are server-resident by default.
Resolve database clients, API clients, Apollo Client, TanStack Query, filesystem services, request
objects, and credentials from server context. Never serialize those values to the browser.

Authorize a narrow public result with `@exact shared` on its return contract:

```ts
interface ProductRepository {
	/** @exact shared */
	find(id: string): Promise<{ id: string; name: string }>;
}
```

The annotation applies to the returned data, not the repository receiver or its other methods.
Secret-qualified data cannot be released by `@exact shared`. If compilation rejects a transfer,
fix the ownership or create an explicit safe projection; do not cast around the diagnostic.

Defaulted task parameters are captured on the originating host before a
server dispatch. Use them only for shared, serializable data. Do not capture a
client-kept, server-kept, secret, service, DOM, or request value into a server
task parameter; resolve server resources from server context inside the task.

## Preserve bundle isolation

Imports reachable only from server continuations must remain absent from client runtime chunks and
assets, including transitive dependencies, re-exports, dynamic imports, workers, schemas, and
WASM. Do not add browser dependencies for Apollo, TanStack Query, or a database SDK merely because
a component uses them on the server.

Private development source maps may contain authored server source for debugging. They ordinarily
are not published. Treat deliberately public maps as a separate deployment disclosure decision.

## Preserve SSR resumption

SSR may settle server work and use server context to produce HTML. Hydration should reconstruct the
client-visible state, adopt matching DOM, and arm already-settled work without repeating the initial
server query. Keep server resources out of resumption records. A later dependency change should
send only compiler-selected snapshots and receive only validated state, shared context, and DOM
effects.

## Test the transition

Use `testServerComponent()` with the generated server artifact to configure application, request,
and component context and inspect settled state, provided context, HTML, and emitted
`view.resumptions`.

Use `mountClientServerTest()` for a real in-memory client/server exchange. Inspect:

- `view.protocol.exchanges` for ordered request, response, and patch disposition;
- `view.hydration` for adopted, mounted, or updated DOM outcomes;
- `view.protocol.serverContextAccesses()` for context token usage without context values; and
- live component state and provided context after the response commits.

Pass a shared `ExactProtocolRecorder` to the paired view and wire the server runtime's
`onContextAccess` callback to `recorder.observeServerContextAccess` when token observations are
needed. Assert behavior and ordered exchanges rather than generated operation names.
