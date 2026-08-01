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
and re-exports the component and server testing APIs from `@exactjs/testing`.

Pass compiler options through `{ compiler: { ... } }`. Use `matchers: false` or
`configureJsxRuntime: false` only when those concerns are configured elsewhere.
