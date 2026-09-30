# Using `@exactjs/ssr`

See the [README](./README.md) for rendering examples. Use this package for string,
streaming, or hydratable eXact server rendering. Await string results before reading their HTML.

- Choose the smallest render API that fits the response.
- Forward the host request signal to SSR for cancellation and inherited adaptive scheduling.
- Keep component inputs deterministic and serializable.
- Add hydration data only when the browser needs eXact-owned behavior.
- Use `Document` from `@exactjs/core/document` to complete authored document sections. Supply
  request assets through `documentAssets`. Keep explicit hydration output before bootstrap scripts.
  Bootstrap loading waits for window load by default. Choose `bootstrapLoading: "normal"` for
  earlier activation or external-script-only CSP. The default inline loader needs an allowed nonce
  or CSP hash when inline scripts are restricted.
- Use `documentShell` to wrap an application in a server-only document, forwarding its child once.
  Hydrate the requested application in its matching container; render the document as the root
  when the document itself needs client reactivity.
