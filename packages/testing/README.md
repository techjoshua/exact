# @exactjs/testing

Runner-neutral component testing for eXact.

```ts
import { testComponent } from '@exactjs/testing';

const view = await testComponent(Counter).props({ step: 2 }).mount();
await view.getByRole('button').click();
view.unmount();
```

The package provides component mounting, context and props setup, accessible role/text queries,
settled user events, snapshots, plugin projections, and matchers for component state, props,
context, text, attributes, values, focus, checked state, disabled state, and mount status.

Most applications should use `@exactjs/vitest` or `@exactjs/jest`, which install the shared
matchers and runner configuration automatically. The `./vitest` and `./jest` entrypoints remain
available for manual integration.
