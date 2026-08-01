# @exactjs/redux

eXact integration for Redux stores and React Redux compatibility.

## When to use it

Use the native provider and selector sources when eXact components need an existing Redux store.
Selectors participate in fine-grained updates, dispatch remains ordinary Redux dispatch, and
component subscriptions are released on unmount.

The Redux store remains application-owned. The package also declares substitutions for supported
React Redux exports.

See [React ecosystem adapters](../../docs/react-ecosystem-adapters.md).
