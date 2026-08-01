# @exactjs/convex

eXact integration for Convex clients and React compatibility.

## When to use it

Use the native provider and query sources to share a Convex client through eXact context and expose
query results as component-owned reactive values. Subscriptions are released with their component.

The package also publishes compatibility metadata for supported Convex React exports, allowing an
eXact build to substitute the adapter when package versions match.

See [React ecosystem adapters](../../docs/react-ecosystem-adapters.md).
