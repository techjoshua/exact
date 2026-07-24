# @exactjs/zustand

eXact adapter and compatible store utilities for Zustand.

The package exposes `createStore`, `createZustandSource`, and `createComponentStore` so component
instances can observe selected slices through eXact's external-source lifecycle. It also declares
compatible React package substitutions where supported.

Choose selectors and equality behavior deliberately to avoid unnecessary notifications. Store
ownership remains separate from component subscription ownership.
