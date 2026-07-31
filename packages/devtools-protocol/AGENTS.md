# Using `@exactjs/devtools-protocol`

See the [README](./README.md) for protocol concepts. Use this package when implementing an eXact
DevTools client, bridge, or inspection host.

- Use the exported request, response, event, cursor, and validation contracts.
- Keep inspection read-only.
- Apply configured redaction before values cross a process or page boundary.
