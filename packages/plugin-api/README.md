# @exactjs/plugin-api

Stable contracts for authoring eXact framework plugins.

## What it provides

Plugins use this package to declare configuration, dependencies, capabilities, ordering, and
build, server, renderer, client, or testing projections. It contains types and manifest helpers.
Plugin discovery and lifecycle execution live in `@exactjs/plugin-host`.

Keep manifests deterministic and JSON-safe so a host can validate the complete plugin graph before
application work begins. Parsed metadata retains TypeScript readonly views and ordinary
independent JavaScript records. Validation checks the captured selectors and forwarding choices
that the host will consume.

See [framework plugins](https://github.com/techjoshua/exact/blob/main/docs/framework-plugins.md).

[Documentation](https://techjoshua.github.io/exact/#/plugins) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/packages/plugin-api)
