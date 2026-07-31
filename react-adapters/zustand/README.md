# @exactjs/zustand

eXact integration and compatible store utilities for Zustand.

## When to use it

Use `createStore`, `createZustandSource`, or `createComponentStore` when eXact components need
to observe an existing Zustand-style store. Selectors and equality functions control which changes
notify each component.

Store ownership remains separate from component subscription ownership. The package also declares
supported React package substitutions where applicable.

See [React ecosystem adapters](../../docs/react-ecosystem-adapters.md).
