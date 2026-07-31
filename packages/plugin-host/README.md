# @exactjs/plugin-host

Discovery and lifecycle host for eXact framework plugins.

## Usage model

Use the browser-safe main entry point for shared contracts and
`@exactjs/plugin-host/node` for filesystem-backed discovery. A host loads application
configuration, discovers manifests, validates dependencies and capabilities, orders plugins, and
prepares the projection needed by a compiler, server, renderer, client, or test runner.

Prepare one registry per application root and dispose or invalidate it with the owning build or
runtime session. Configuration and server projections must not be copied into browser output.

See [framework plugins](../../docs/framework-plugins.md).
