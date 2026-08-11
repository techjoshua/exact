# Using `@exactjs/webpack-plugin`

See the [README](./README.md) for configuration examples. Use this plugin to compile eXact
applications in Webpack.

- Add one plugin instance to the relevant compiler configuration.
- Let the plugin manage compilation, watch updates, and generated inspection assets.
- Let the same plugin create microfrontend exposure entries; do not add a second federation runtime.
- Put component-library trust policy in `exact.config.*`; do not create loader-local allowlists.
- Enable inspection output only for environments where DevTools data is intended to be available.
