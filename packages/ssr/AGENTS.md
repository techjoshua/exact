# Using `@exactjs/ssr`

See the [README](./README.md) for rendering examples. Use this package for string,
streaming, or hydratable eXact server rendering. Await string results before reading their HTML.

- Choose the smallest render API that fits the response.
- Forward the host request signal to SSR for cancellation and inherited adaptive scheduling.
- Keep component inputs deterministic and serializable.
- Add hydration data only when the browser needs eXact-owned behavior.
- Use `documentShell` to wrap an application in a server-only document, forwarding its child once.
  Hydrate the requested application in its matching container; render the document as the root
  when the document itself needs client reactivity.
