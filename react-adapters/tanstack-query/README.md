# @exactjs/tanstack-query

Native eXact integration for TanStack Query.

## When to use it

`ExactQueryClientProvider` shares a `QueryClient` through eXact context, while query helpers
adapt `QueryObserver` results into component-owned reactive values. The native entry point depends
on `@tanstack/query-core`, not React.

Use the `./react` compatibility entry point only for packages authored against
`@tanstack/react-query`.

See [React ecosystem adapters](../../docs/react-ecosystem-adapters.md).
