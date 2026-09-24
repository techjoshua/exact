# @exactjs/vitest

Vitest integration for eXact applications.

## Setup

```ts
import { exactVitest } from '@exactjs/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [exactVitest()],
	test: { environment: 'jsdom' }
});
```

The plugin compiles application TSX, configures the eXact JSX runtime, installs shared matchers,
keeps installed eXact dependencies in the same Vite runtime as compiled test components,
and re-exports the component and server testing APIs from `@exactjs/testing`. Published JavaScript
source maps embed the original sources, so debugging setup does not require the repository checkout.

Pass compiler options through `{ compiler: { ... } }`. Use `matchers: false` or
`configureJsxRuntime: false` only when those concerns are configured elsewhere.

Server-targeted tests use the same pre-evaluation component-library policy as Vite production
builds and report the `server-test` authorization reason. Client-only jsdom tests remain outside
that server execution gate.

[Documentation](https://techjoshua.github.io/exact/#/guides/testing) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/packages/vitest)
