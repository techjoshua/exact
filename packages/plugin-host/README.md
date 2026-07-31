# @exactjs/plugin-host

Discovery, validation, ordering, and lifecycle execution for eXact framework plugins.

The host loads application configuration, discovers installed plugin manifests, validates
dependencies and capabilities, builds a deterministic graph, and prepares mode-specific
projections for compiler, server, render, client, or testing.

Use the browser-safe main entrypoint for shared contracts and `@exactjs/plugin-host/node` for
filesystem-backed discovery. Hosts should invalidate prepared registries when configuration,
manifests, or discovered package inputs change.

Prepared registries retain the validated top-level eXact config so build adapters can derive
`debug.catalog` and `debug.runtime` without reloading configuration. That config is server/build
input; do not project authorization policy, catalogs, source text, credentials, or secret values
into browser code.
