# @exactjs/tanstack-query

Native eXact integration for TanStack Query.

`ExactQueryClientProvider` shares a `QueryClient` through eXact context, while component query
helpers bridge `QueryObserver` results into reactive values with component-owned disposal. The
`./react` entrypoint supplies supported React Query compatibility substitutions.

The native entry depends on `@tanstack/query-core`, not React. Use it for new eXact components and
reserve the compatibility entrypoint for packages authored against `@tanstack/react-query`.
