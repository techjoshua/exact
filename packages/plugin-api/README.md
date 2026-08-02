# @exactjs/plugin-api

Stable contracts for authoring eXact framework plugins.

## What it provides

Plugins use this package to declare configuration, dependencies, capabilities, ordering, and
build, server, renderer, client, or testing projections. It contains types and manifest helpers;
plugin discovery and lifecycle execution live in `@exactjs/plugin-host`.

Keep manifests deterministic and JSON-safe so a host can validate the complete plugin graph before
application work begins.

See [framework plugins](../../docs/framework-plugins.md).
