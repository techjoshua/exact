# Using @exactjs/vite-plugin

Read this package's `README.md`, exported declarations, and the installed compiler guidance before
editing Vite configuration. Use one `exact()` integration and enable only the rendering or
server-component capabilities the application needs.

Let the plugin own compiler watch invalidation, generated artifacts, client/server isolation, and
development endpoint wiring. Do not add application-local file watchers or edit `.exact` output.

Preserve generated action continuations and finite component-registry artifact targets through the
final Rollup graph. Client isolation must reject server action bodies, server-only captures, and
server-only lazy registry entries; do not replace final-graph verification with source-name
conventions.

Derive `emitInspection` and `instrumentInspection` independently from the prepared `debug` config.
Emit one catalog asset only in the server graph; inject the optional browser runtime before client
entries and keep its payload limited to opaque correlation and redaction selectors. Production
client and server builds must use the same immutable build/root identity. Hardened output must
contain neither the catalog nor the runtime bootstrap.
