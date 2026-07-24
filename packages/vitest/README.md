# @exactjs/vitest

First-class Vitest integration for eXact applications. It combines the eXact compiler plugin,
Vite 5–8 JSX configuration, component-testing utilities, and eXact-specific matchers.

## Setup

```ts
import { exactVitest } from '@exactjs/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [exactVitest()],
	test: { environment: 'jsdom' }
});
```

`exactVitest()` installs the matchers automatically and delegates application TSX to
`@exactjs/vite-plugin`. On Vite 8 the plugin supplies `oxc.jsx.importSource: "@exactjs/jsx"`, so
tests do not silently fall back to React's development JSX runtime.

Pass `{ matchers: false }` when matcher setup is managed elsewhere. Pass compiler options through
`{ compiler: { ... } }`; `configureJsxRuntime: false` is available for an intentionally custom JSX
pipeline.

The package re-exports `@exactjs/testing`, including `testComponent`, `mountTest`, accessible
queries, server component snapshots, paired client/server tests, protocol recording, and the
shared matcher declarations. Server tests should import the compiled `.exact.server` artifact;
paired tests can use the application's real request handler and inspect observed operations
without coupling to generated IDs.
