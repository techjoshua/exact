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
components. Captures retain settled state, props, context and parent/child relationships after
server cleanup, including stateless components and repeated uses of the same component.
Use `mountClientServerTest()` to hydrate generated client islands against an in-memory
request handler and record protocol exchanges without depending on generated operation IDs. Mount
waits for eager lazy islands to finish loading and adopting before returning; load failures reject
mount. Interaction-deferred islands stay dormant until activated. `hydratedIslands` reflects the
current hydration observations.

Pass the production registration's `islands` to `mountClientServerTest()` and spread the full
registration into `hydrate`, including generated continuation contracts when they are omitted from
SSR HTML. Keep the SSR renderer import in a compiled application or fixture module to retain
optional enhancement integration. For multi-stage tasks, poll for the final page state before
unmounting.

## Test runners

Most projects should use `@exactjs/vitest`, `@exactjs/jest`, or `@exactjs/bun-test`. These
packages configure compilation, DOM globals, and matchers for their runner.

Low-level framework tests may import `@exactjs/testing/internal/fixtures` to construct low-level native
operations. Application tests should compile authored components normally.

[Documentation](https://techjoshua.github.io/exact/#/guides/testing) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/packages/testing)
