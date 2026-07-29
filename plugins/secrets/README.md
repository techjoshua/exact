# @exactjs/secrets

Runtime-scoped secret resolution for eXact framework plugins and applications.

The plugin defines secret references, provider contracts, configuration, lifecycle management,
and bounded resolution. Providers are ordered through the eXact plugin graph and can be selected
per runtime.

Secret values must remain server-only. Do not serialize them into compiler manifests, client
configuration, diagnostics, profiling attributes, or hydration payloads.

Inspection may expose compiler-qualified secret key names or presence only. Those names become
redaction selectors and are applied before any value traversal; value length, shape, provider
metadata, and error text remain private. Debug responses, events, source excerpts, audits, and
exports must never contain a secret value. See
[Server-cooperative full-stack DevTools](../../docs/devtools.md).
