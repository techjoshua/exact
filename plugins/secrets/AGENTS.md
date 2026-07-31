# Using `@exactjs/secrets`

See the [README](./README.md) for provider setup. Use this package to resolve named secrets in
server-owned eXact work.

- Never place secret values in client state, hydration, catalogs, logs, errors, or DevTools data.
- Expose only names or presence when inspection policy permits it.
- Configure redaction selectors before inspecting values that may contain secrets.
