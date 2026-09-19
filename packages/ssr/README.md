# @exactjs/ssr

Server rendering and server-runtime composition for eXact applications.

## Usage

```tsx
import { renderToString } from '@exactjs/ssr';

const html = await renderToString(<App />);
```

## Rendering modes

`renderToString()` and `renderToHydratableString()` return promises. Both use the same rendering engine as streaming and progressive documents. Available component work runs immediately; rendering waits only when required tasks or child output are pending. Await the result before reading its HTML.

Node hosts use `createNodeHandler()` for custom pages or `createExactNodeHandler()` for framework
endpoints. Native Bun hosts use the Bun adapter. These handlers automatically trial scheduling
under load and keep quiet requests immediate. Forward the handler's request signal to SSR so
render entry and pending component data reuse the same adaptive policy. Ready components and
transport drains do not add checkpoints.

Custom hosts can provide `scheduleRender(signal)`: return void to continue immediately or a
promise to defer rendering. The hook also runs after pending component data settles. It overrides
the inherited render policy; use `{ adaptive: false }` on the adapter when replacing its entire
scheduling policy.

Progressive HTML rendering supports `publishRootProps` too. An authored full document sends its
rendered head and body content before hydration data, allowing earlier resource discovery. Hydration
and closing tags follow together. A completed document head can arrive while descendant body tasks
are pending. Body output then streams incrementally. Set `streamBufferSize` to a positive byte
threshold (default 8192); complete spans may exceed it. Compiler-proven static heads can precede
document-owned tasks; other document views wait. Whole-document output transformations retain collection.
The Web Stream queues up to four thresholds of read-ahead, plus any final complete span that
crosses that budget, before applying backpressure. Awaiting reader cancellation waits for cleanup.

String results join their request-owned chunks lazily. Response helpers pass chunks directly to
capable Node adapters or use a platform-encoded Blob on Fetch hosts, avoiding extra output copies.

Plain SSR can remain script-free. Pair hydratable output with `@exactjs/hydrate` and matching client
artifacts. Component inputs included in hydration must be deterministic and serializable.

`Document` from `@exactjs/core/document` completes partial document JSX and places framework output.
Pass `documentAssets` with stylesheet URLs and head/bootstrap script descriptors to render assets
at those slots. Hydration precedes bootstrap; shells author declarations with `doctype()`.
See [document composition](https://github.com/techjoshua/exact/blob/main/docs/child-composition.md).

To keep an enclosing document server-only, pass `documentShell` while rendering the application:

```tsx
import { renderToHydratableString } from '@exactjs/ssr';
import { Document } from '@exactjs/core/document';

const result = await renderToHydratableString(<App />, {
	documentShell: (application) => <Document>{application}</Document>
});
```

`Document` completes html, head, and body structure and forwards application children once.
Hydrate `App` in its body container. Server-only shell state is excluded from hydration.
Render a document-owning component as the requested root when document fields need client reactivity.

For a component root whose request data arrives through props, set `publishRootProps: true` and
read those props with `readPublishedRootProps()` from `@exactjs/hydrate/root` before constructing
the client root, passing the compiled root component as the first argument. Compiler-proven state
initialized from props is published once. Serializable inputs must be deterministic and free of side effects.

Generated server entries pass their bundle-local enhancement catalog through render
options. Available declarations run as ordinary server components; absent optional capabilities
leave authored output unchanged and warn once per identity.

`createExactServerRuntime()` accepts the complete server policy as one flat options object. It
normalizes context, rendering, authorization, decoding, partition, retained-build, gateway, and
limit settings to their owning runtimes. Request cancellation always remains authoritative: an
optional render signal can cancel work earlier but cannot detach it from the request lifetime.

See [SSR and hydration](https://github.com/techjoshua/exact/blob/main/docs/ssr-hydration.md), [tasks](https://github.com/techjoshua/exact/blob/main/docs/tasks.md), and
[component registries](https://github.com/techjoshua/exact/blob/main/docs/component-registries.md).

[Documentation](https://techjoshua.github.io/exact/#/learn/server-execution) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/packages/ssr)
