# Using `@exactjs/plugin-host`

See the [README](./README.md) for host setup. Use this package in trusted build or server tooling to
load eXact configuration and plugins.

- Prepare one plugin registry per application root.
- Dispose the registry with its compiler or build session.
- Never evaluate configuration or expose server-only plugin data in a browser bundle.
