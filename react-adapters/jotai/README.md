# @exactjs/jotai

The React-facing provider crosses an explicit compatibility boundary backed by a stable,
framework-owned native eXact provider identity.

eXact adapter for Jotai stores and atoms.

It exposes component-aware reactive bindings to Jotai state and compatibility metadata for
supported React package substitutions. Reads participate in eXact dependency tracking; owned
subscriptions are released with the component.

Use this adapter when migrating or sharing an existing Jotai model. Prefer ordinary component
state or `@exactjs/reactive` for new state that does not need Jotai interoperability.
