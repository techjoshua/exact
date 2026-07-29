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

Direct and delegated events begin component interactions, preserving synchronous batching while
coordinating asynchronous settlement and error ownership. Registry entry facades use the registry
key as subtree identity, so same-key updates retain instances and different keys replace only the
selected component range; stale lazy candidates are disposed before they can commit.

Native `Suspense` keeps committed content visible while a blocking update prepares and publishes
candidate state and DOM together. Native `Activity` detaches complete logical ranges—including
portal output—without losing component, node, ref, handler, or form-control identity.

See [Actions and forms](../../docs/actions-and-forms.md) and
[finite component registries](../../docs/component-registries.md).
