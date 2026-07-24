# @exactjs/plugin-host

Discovery, validation, ordering, and lifecycle execution for eXact framework plugins.

The host loads application configuration, discovers installed plugin manifests, validates
dependencies and capabilities, builds a deterministic graph, and prepares mode-specific
projections for compiler, server, render, client, or testing.

Use the browser-safe main entrypoint for shared contracts and `@exactjs/plugin-host/node` for
filesystem-backed discovery. Hosts should invalidate prepared registries when configuration,
manifests, or discovered package inputs change.
