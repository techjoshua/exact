# Rendering modes

Choose the mode from product requirements and the existing application. Do not add SSR, hydration,
or server components merely because eXact supports them.

| Mode              | Server output                              | Browser entry                           | Typical packages                                                          |
| ----------------- | ------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------- |
| Client-only       | Static host shell                          | `render(<App />, root)`                 | `@exactjs/dom`                                                            |
| SSR only          | Rendered HTML                              | None required                           | `@exactjs/ssr`                                                            |
| Hydratable SSR    | Rendered HTML plus hydration data          | `hydrate(<App />, root)`                | `@exactjs/ssr`, `@exactjs/hydrate`                                        |
| Server components | Server HTML, manifests, endpoints, patches | Hydration client and registered islands | Compiler artifacts, `@exactjs/server`, `@exactjs/ssr`, `@exactjs/hydrate` |

## Client-only rendering

Use the normal compiler integration and mount in the browser:

```tsx
import { render } from '@exactjs/dom';

render(<App />, document.getElementById('app')!);
```

Use this for browser applications that do not need server-generated application HTML. A
client-only app may still call ordinary HTTP APIs. Do not introduce the eXact server-component
protocol solely for data fetching.

## SSR without hydration

Render HTML on the server with the synchronous or asynchronous API supported by the installed
`@exactjs/ssr` version:

```tsx
import { renderToStringAsync } from '@exactjs/ssr';

const rendered = await renderToStringAsync(<App />);
const html = rendered.html;
```

Use this for HTML responses that do not need eXact-owned browser interaction after delivery.
Verify the exact return type and document-shell helpers in the installed package.

## Hydratable SSR

Render hydratable HTML on the server and hydrate the same application in the browser:

```tsx
// server
import { renderToHydratableString } from '@exactjs/ssr';

const rendered = renderToHydratableString(<App />);
const html = rendered.htmlWithHydration;
```

```tsx
// client
import { hydrate } from '@exactjs/hydrate';

hydrate(<App />, document.getElementById('app')!, {
	onMismatch: 'replace'
});
```

Keep server and client component inputs deterministic. Treat hydration mismatch handling as a
recovery policy, not permission to render unrelated trees.

## Server-component mode

Choose this only when the application needs compiler-separated client/server components, secure
server actions, refreshable server boundaries, or generated client islands.

1. Enable `serverComponents: true` during artifact-aware client and server compilation.
2. Produce or load compiler manifests; do not hand-invent component, action, or boundary IDs.
3. Create the allowlisted server manifest and server runtime using installed eXact APIs.
4. Render hydratable server output with the corresponding manifest configuration.
5. Expose the eXact endpoint through the deployment runtime's adapter.
6. Configure the hydration client with the same endpoint and register generated client islands.

Inspect existing generated `.exact.*` artifacts and nearby sample applications before modifying
this flow. Keep endpoint routes, manifest metadata, state contracts, and action boundary hints
aligned. Do not model this after React Server Components or dispatch client-provided module names.

Server-component capabilities are version-sensitive. Inspect the installed `@exactjs/compiler`,
`@exactjs/server`, `@exactjs/ssr`, and `@exactjs/hydrate` exports before writing integration code.

## Placement is not rendering mode

`this.task.client()` and `this.task.server()` control where component-owned work remains in a split
build. They do not create browser/server entrypoints, choose a renderer, enable hydration, produce
manifests, or expose an endpoint. Let environment usage infer placement when possible and make the
application rendering decision separately.
