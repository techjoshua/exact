# Using `@exactjs/jsx`

See the [README](./README.md) for TypeScript configuration. Applications normally select this
automatic JSX runtime through their eXact tooling rather than importing it directly.

- Pass application TSX through the eXact compiler.
- Use ordinary DOM event callbacks; `InteractionHandler` typing carries interaction ownership.
- Keep registry-selected components as ordinary JSX component values.
