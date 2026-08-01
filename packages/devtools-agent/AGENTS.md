# Using `@exactjs/devtools-agent`

See the [README](./README.md) for connection and query examples. Use this package when an automated
tool needs read-only access to eXact inspection data through Chrome DevTools Protocol (CDP).

- Prefer structured inspection queries over evaluating arbitrary JavaScript in the page.
- Connect only to runtimes that explicitly expose the DevTools bridge.
- Treat returned state and source information according to the application's debug policy.
