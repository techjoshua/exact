# @exactjs/jotai

eXact integration for existing Jotai stores and atoms.

## When to use it

Use the native provider and atom sources when eXact components need to share a Jotai model. Reads
participate in eXact dependency tracking, and component-owned subscriptions are released on
unmount. `ExactJotaiProvider` accepts an existing store and otherwise uses Jotai's default singleton,
resolved when the adapter loads. Supply a request-owned store for isolated SSR data.

Prefer direct component state or `@exactjs/reactive` for new models that do not require Jotai
interoperability. The package also supplies compatibility metadata for supported React exports.

See [React ecosystem adapters](https://github.com/techjoshua/exact/blob/main/docs/react-ecosystem-adapters.md).

[Documentation](https://techjoshua.github.io/exact/#/guides/react-compatibility) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/react-adapters/jotai)
