# @exactjs/dom

Fine-grained browser DOM renderer for eXact virtual nodes.

```tsx
import { render } from '@exactjs/dom';

const root = render(<App />, document.getElementById('app')!);
root.unmount();
```

The renderer mounts, adopts, patches, and disposes component trees without a virtual-DOM
rerender loop. It owns DOM properties, events, refs, namespaces, portals, keyed reconciliation,
hydration markers, server slots, and compiled reactive cells. Use `@exactjs/testing` rather than
depending on renderer internals in tests.

During component construction, normal-priority synchronous setup activations settle before the
first render and before child mounting. This guarantees that compiler-derived state initialization
can safely supply required child props without exposing a transient uninitialized value.

Direct and delegated events begin component interactions, preserving synchronous batching while
coordinating asynchronous settlement and error ownership. Registry entry facades use the registry
key as subtree identity, so same-key updates retain instances and different keys replace only the
selected component range; stale lazy candidates are disposed before they can commit.

Hydration adoption compares compiler contract identity in component markers before authorizing
SSR state resumption. A mismatched nested component is mounted fresh inside its owned range while
compatible ancestors and siblings retain their adopted DOM.

Function-valued native VNodes must carry the compiler-owned component identity brand. The renderer
does not infer eXact ownership from a function's shape; foreign functions must cross an explicit
compatibility adapter.

Native `Suspense` keeps committed content visible while a blocking update prepares and publishes
candidate state and DOM together. Native `Activity` detaches complete logical ranges—including
portal output—without losing component, node, ref, handler, or form-control identity.

See [Task interactions and forms](../../docs/actions-and-forms.md) and
[finite component registries](../../docs/component-registries.md).

Instrumented builds maintain a weak active-root registry for late DevTools attachment.
`createExactDomInspectionHost()` projects logical components, execution roots, element ownership,
Activity/Suspense status, and owned elements without returning renderer internals. Disposed roots
are removed immediately, compiled root cells transparently carry their inspection domain into the
authored component tree, and disconnecting inspection does not affect rendering. See
[Server-cooperative full-stack DevTools](../../docs/devtools.md).
