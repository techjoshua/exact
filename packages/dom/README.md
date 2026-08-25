# @exactjs/dom

Browser DOM renderer for compiled eXact components.

## Usage

```tsx
import { render } from '@exactjs/dom';

const root = render(<App />, document.getElementById('app')!);

// Later:
root.unmount();
```

## What it provides

The renderer mounts and disposes durable component trees, updates compiler-owned reactive regions,
and handles DOM properties, events, bindings, refs, namespaces, portals, keyed lists, Suspense,
and hydration markers.

Application components should be compiled before they reach the renderer. Use
`@exactjs/testing` for component tests and `@exactjs/hydrate` when adopting server-rendered HTML.

Generated application bootstraps may import `render` from `@exactjs/dom/root`. That entry makes the
compiler-selected capability boundary explicit while retaining the same compiled-component
behavior as the main entry.

Compiler-resolved enhancements automatically load their DOM integration beside the component that
uses them, including from lazy chunks and microfrontends. An integration that manually constructs
enhancement markers and catalogs must import `render` from `@exactjs/dom/enhanced`; the ordinary
entry intentionally leaves the optional enhancement host out of enhancement-free bundles.

The compiler applies the same bundle-local selection to native modal bindings, target
contributions, `unsafeHtml()`, and the coordinated Activity/Suspense renderer. Compiled modules
carry the capability imports required by their output; raw runtime construction of those internal
VNode forms is not an alternative component mode.
