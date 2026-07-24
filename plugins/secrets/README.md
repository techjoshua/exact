# @exactjs/secrets

Runtime-scoped secret resolution for eXact framework plugins and applications.

The plugin defines secret references, provider contracts, configuration, lifecycle management,
and bounded resolution. Providers are ordered through the eXact plugin graph and can be selected
per runtime.

Secret values must remain server-only. Do not serialize them into compiler manifests, client
configuration, diagnostics, profiling attributes, or hydration payloads.
