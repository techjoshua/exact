# @exactjs/plugin-api

Stable contracts for authoring eXact framework plugins.

Plugins declare configuration, dependencies, capabilities, and projections for compiler, server,
render, client, and testing hosts. The package contains types and manifest helpers only; discovery
and lifecycle execution live in `@exactjs/plugin-host`.

Keep plugin manifests deterministic and JSON-safe. Declare ordering and capability requirements
explicitly so the host can validate the graph before application work begins.
