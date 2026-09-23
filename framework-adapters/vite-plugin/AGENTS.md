# Using `@exactjs/vite-plugin`

See the [README](./README.md) for configuration examples. Use `exact()` in Vite applications to
compile eXact modules and connect development and production runtime features.

- Prefer one integration and enable only the rendering or server capabilities the app uses.
- Build separate client/server configs with `buildExactViteApplication()` so they share one compiler
  generation.
- Use `include` and `exclude` to define the complete compiler-owned module set.
- Put component-library trust policy in `exact.config.*`; do not add adapter-local allowlists.
- Treat generated `.exact` artifacts as build output; do not edit or recreate them in application code.

- Resolve component-policy warnings before deploying; denied components reject at execution.

- Use `exactSingleFile()` for one offline browser HTML entry. Import assets through Vite, use hash
  navigation, and keep server operations out of that build.
