# @exactjs/react-compat

React API compatibility for running supported React components and packages inside eXact.

## Native eXact usage

Enable `reactCompatibility` in the application's build integration, then render supported React
components directly from compiled eXact JSX:

```tsx
import { DatePicker } from 'react-date-picker';

return () => <DatePicker value={this.state.date} onChange={(date) => (this.state.date = date)} />;
```

Add `@exactjs/react-compat/types18` or `types19` to TypeScript's `types` list to match the
configured React target.

## Compatibility boundary

This package implements React elements, contexts, hooks, lazy loading, Suspense, classes,
transitions, and adapter-aware package substitution on eXact runtimes. It is an interoperability
layer, not the native component model. New eXact components should use direct state, lifecycle,
and task APIs rather than React hooks.

Use `ReactHost` or `adaptReactComponent()` from `@exactjs/react-compat/exact` for imperative
integration outside compiled JSX.

See [React compatibility](../../docs/react-compatibility.md).
