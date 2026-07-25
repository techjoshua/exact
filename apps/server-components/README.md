# eXact Server Components Sample

This sample shows compiler-distributed component execution without tying it to
Express, Hapi, Vite, Webpack, or Bun.

Think of a component with server work as two cooperating compiler-generated
state machines. The browser owns the durable component instance, reactive
state, DOM, and lifecycle. The server owns stateless allowlisted transitions.
SSR is their first transition; later client activity invokes opaque generated
operations.

The component source lives in `src/ProfilePage.tsx`. A build can emit split artifacts with:

```sh
npx exactc --rootDir apps/server-components/src --outDir apps/server-components/.exact --artifacts --serverComponents apps/server-components/src
```

`src/server.ts` demonstrates the runtime shape:

- read private contracts attached to generated server artifacts
- compose an allowlisted executor contract and matching hydration config
- create a contract-scoped runtime context with `createExactServerRuntime`
- stream a hydratable initial document through `renderProfilePageResponse`
- dispatch requests through `handleExactRequest`

The runtime accepts app-provided functions, but it exposes only operations
declared by the composed contract. The client never selects a module or
function.

`src/IdentityProvider.tsx` demonstrates the server data boundary:

- application and request context values remain server-owned;
- `@exact shared` authorizes only the plain return values intended to cross;
- server tasks project those values into client-visible state; and
- hydration reconstructs descendant component context without serializing the
  server authorization or brand services.

A database client, Apollo Client, TanStack Query, GraphQL parser, or similar
dependency used through those server contexts stays in the server artifact.
Only its explicitly shared plain-data result can enter the client protocol and
browser bundle.
