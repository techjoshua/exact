# @exactjs/ssr

Server rendering and server-runtime composition for eXact applications.

## Usage

```tsx
import { renderToString } from '@exactjs/ssr';

const html = await renderToString(<App />);
```

## Rendering modes

`renderToString()` and `renderToHydratableString()` return promises. Both use the same rendering
engine as streaming and progressive documents. Available component work runs immediately; rendering
waits only when required tasks or child output are pending. Await the result before reading its HTML.

Node hosts use `createNodeHandler()` for custom pages or `createExactNodeHandler()` for framework
endpoints. Those adapter handlers automatically trial scheduling under load and keep quiet requests
immediate. Custom hosts can supply `scheduleRender(signal)` to defer initial rendering before
resources are created; returning void proceeds immediately. Avoid adding this second gate inside
an automatically scheduled Node handler. Native Bun retains independent immediate admission.

Progressive HTML rendering supports `publishRootProps` too. An authored full document sends its
rendered head and body content before hydration data, allowing earlier resource discovery. Hydration
and closing tags follow together. A completed document head can arrive while descendant body tasks
are pending. Body output then streams incrementally. Set `streamBufferSize` to a positive byte
threshold (default 8192); complete spans may exceed it. Compiler-proven static heads can precede
document-owned tasks; other document views wait. Whole-document output transformations retain collection.
The Web Stream queues up to four thresholds of read-ahead, plus any final complete span that
crosses that budget, before applying backpressure. Awaiting reader cancellation waits for cleanup.

String results retain request-owned chunks internally and join lazily when their public HTML is
read. Request response helpers pass those chunks directly to capable Node adapters; exact UTF-8
output limits are checked without constructing an encoded validation copy. Fetch-native
adapters can claim the same chunks as a platform-encoded Blob, so Bun does not pass SSR output
through Node compatibility streams.

Plain SSR can remain script-free. Pair hydratable output with `@exactjs/hydrate` and the matching
compiler-generated client artifacts. Component inputs included in hydration must be deterministic
and serializable.

To keep an enclosing document server-only, pass `documentShell` while rendering the application:

```tsx
import { renderToHydratableString } from '@exactjs/ssr';

const result = await renderToHydratableString(<App />, {
	documentShell: (application) => <Document>{application}</Document>
});
```

`Document` is an ordinary component that renders `html`, `head`, and `body` and forwards its
children exactly once. Hydrate `App` in its matching container inside the body. Shell props and
state are excluded from hydration; contexts and task cleanup retain their normal server ownership.
Render `<Document />` as the requested root instead when the document itself needs client reactivity.

For a component root whose request data arrives through props, set `publishRootProps: true` and
read those props with `readPublishedRootProps()` from `@exactjs/hydrate/root` before constructing
the client root, passing the compiled root component as the first argument. Finite nested prop
shapes may use a component-bound positional payload; structurally open or mismatched values retain
the named-object format. Compiler-proven state initialized directly from those props is then
published only once; derived or subsequently changed state remains in its component resumption
record. Positional publication reads each compiler-declared field once with ordinary JavaScript
property semantics, so serializable input getters must be deterministic and free of side effects.

Generated server entries pass their bundle-local enhancement catalog through render
options. Available declarations run as ordinary server components; absent optional capabilities
leave authored output unchanged and warn once per identity.

Generated task handlers, component identities, resumptions, and registry selections are opaque contracts.

`createExactServerRuntime()` accepts the complete server policy as one flat options object. It
normalizes context, rendering, authorization, decoding, partition, retained-build, gateway, and
limit settings to their owning runtimes. Request cancellation always remains authoritative: an
optional render signal can cancel work earlier but cannot detach it from the request lifetime.

See [SSR and hydration](../../docs/ssr-hydration.md), [tasks](../../docs/tasks.md), and
[component registries](../../docs/component-registries.md).
