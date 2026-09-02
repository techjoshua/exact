# @exactjs/ssr

Server rendering and server-runtime composition for eXact applications.

## Usage

```tsx
import { renderToStringAsync } from '@exactjs/ssr';

const html = await renderToStringAsync(<App />);
```

## Rendering modes

The package supports synchronous and asynchronous strings, streaming and progressive documents,
hydratable output, refresh-boundary diffing, and server-runtime creation. Choose the smallest mode
that fits the response.

String results retain request-owned chunks internally and join lazily when their public HTML is
read. Request response helpers pass those chunks directly to capable Node adapters; exact UTF-8
output limits are charged incrementally without constructing an encoded validation copy. Fetch-native
adapters can claim the same chunks as a platform-encoded Blob, so Bun does not pass SSR output
through Node compatibility streams.

Plain SSR can remain script-free. Pair hydratable output with `@exactjs/hydrate` and the matching
compiler-generated client artifacts. Component inputs included in hydration must be deterministic
and serializable.

For a component root whose request data arrives through props, set `publishRootProps: true` and
read those props with `readPublishedRootProps()` from `@exactjs/hydrate/root` before constructing
the client root, passing the compiled root component as the first argument. Finite nested prop
shapes may use a component-bound positional payload; structurally open or mismatched values retain
the named-object format. Compiler-proven state initialized directly from those props is then
published only once; derived or subsequently changed state remains in its component resumption
record.

Generated server entries pass their bundle-local enhancement catalog through render
options. Available declarations run as ordinary server components; absent optional capabilities
leave authored output unchanged and warn once per identity.

Generated task handlers, component identities, resumption records, and registry selections are
opaque contracts shared with the client runtime.

`createExactServerRuntime()` accepts the complete server policy as one flat options object. It
normalizes context, rendering, authorization, decoding, partition, retained-build, gateway, and
limit settings to their owning runtimes. Request cancellation always remains authoritative: an
optional render signal can cancel work earlier but cannot detach it from the request lifetime.

See [SSR and hydration](../../docs/ssr-hydration.md), [tasks](../../docs/tasks.md), and
[component registries](../../docs/component-registries.md).
