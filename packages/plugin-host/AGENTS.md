# Using @exactjs/plugin-host

Read this package's README and exported declarations before loading application configuration or
plugins. Prepare one registry per application root, retain the validated top-level eXact config,
and dispose or invalidate it with the owning compiler/build session.

Build adapters may read the prepared `debug` config to derive compiler catalog and runtime controls.
Never evaluate configuration in a browser bundle or copy server catalogs, authorization policy,
credentials, source text, or secret values into a client projection.
