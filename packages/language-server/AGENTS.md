# Using `@exactjs/language-server`

See the [README](./README.md) for startup and integration options. Use this package to provide
compiler-backed eXact diagnostics and language features to an LSP client.

- Prefer standard LSP capabilities and structured compiler results.
- Tie responses to the current document version and discard stale results.
- Do not analyze an untrusted workspace or execute workspace-provided tooling without consent.
