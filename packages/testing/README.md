# @exactjs/testing

Runner-neutral tools for testing eXact components and server behavior.

## Component tests

```ts
import { testComponent } from '@exactjs/testing';

const view = await testComponent(Counter).props({ step: 2 }).mount();
await view.getByRole('button').click();

expect(view.root.state()).toMatchObject({ count: 2 });
view.unmount();
```

The mounted view provides accessible role and text queries, settled user events, component state
and context inspection, and DOM-focused matchers.

Tests that exercise compiler-emitted plugin markers can pass the application bundle's local
`enhancementCatalog` through `.configure()` or `mountTest()` options. The mount helper activates
the enhancement renderer only when that option is present, so ordinary component tests retain the
enhancement-free DOM entry point.

## Server and client/server tests

Use `testServerComponent()` with a compiled `.exact.server` artifact to render and inspect server
components. Use `mountClientServerTest()` to hydrate generated client islands against an in-memory
request handler and record protocol exchanges without depending on generated operation IDs.

## Test runners

Most projects should use `@exactjs/vitest`, `@exactjs/jest`, or `@exactjs/bun-test`. These
packages configure compilation, DOM globals, and matchers for their runner.

Low-level framework tests may import `@exactjs/testing/internal/fixtures` to construct raw native
VNodes. Application tests should compile authored components normally.
