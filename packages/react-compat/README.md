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
integration outside compiled JSX. Both names select the package's fixed precompiled client island;
they do not create an adapter component for each React value. Native children crossing React
ownership remain opaque compiled contributions rather than React-readable native VNodes.

See [React compatibility](https://github.com/techjoshua/exact/blob/main/docs/react-compatibility.md).

Precompiled Node applications can install the import adapter with
`node --import @exactjs/react-compat/register`. It uses synchronous Node module hooks when
available, with the asynchronous registration fallback retained for older hosts.

[Documentation](https://techjoshua.github.io/exact/#/guides/react-compatibility) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/packages/react-compat)
