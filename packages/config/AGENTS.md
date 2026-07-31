# Using @exactjs/config

Read this package's README and exported declarations before changing application configuration.
Keep `debug.catalog` and `debug.runtime` independent: catalogs are rich server-owned build output,
while runtime instrumentation is compact client correlation. Use `'auto'` for development and
explicit booleans for production or hardened builds.

Do not place `allowDebug`, credentials, secret values, source text, or server resources in
`exact.config.ts`. Runtime authorization belongs to `@exactjs/server`; debug redactions contain
selectors and names only.
