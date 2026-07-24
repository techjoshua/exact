# @exactjs/expressions

Semantic expression analysis used by the eXact compiler and language tooling.

The package models scopes, bindings, reads, writes, calls, effects, provenance, reactive
dependencies, and placement constraints over TypeScript source. It is intended for compiler,
plugin, and tooling authors rather than ordinary application runtime code.

Consumers should build a project-backed analysis and preserve source identity when caching
results. Application authors normally interact with these capabilities through compiler
diagnostics.
