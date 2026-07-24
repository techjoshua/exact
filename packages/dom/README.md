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
