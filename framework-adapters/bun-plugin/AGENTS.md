# Using `@exactjs/bun-plugin`

See the [README](./README.md) for configuration examples. Use this plugin when Bun builds an eXact
application.

- Configure one plugin instance for each build.
- Use `exactBuild()` instead of direct `Bun.build()` when the configuration exposes microfrontend roots.
- Let the plugin compile eXact source and emit the required runtime artifacts.
- Put component-library policy in `exact.config.*`; use watch rather than server `--hot`.
- Enable inspection output only for environments where DevTools data is intended to be available.
