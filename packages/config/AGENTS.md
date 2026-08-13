# Using `@exactjs/config`

See the [README](./README.md) for the configuration shape. Use this package to define or load a
typed eXact project configuration.

- Use `defineConfig()` in application configuration files.
- Use `scope: 'package'` on an attributed enhancement namespace export when its namespace and language
  assistance should apply to every compiled component in the package.
- Configure server component-library trust once through `componentLibraries`; do not duplicate it
  in individual bundler options.
- Keep server-only values out of client-visible configuration.
- Enable build-time inspection and server debug access independently for the intended environment.
