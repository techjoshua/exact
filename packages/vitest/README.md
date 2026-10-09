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
keeps installed eXact dependencies and declared component libraries in the same Vite runtime as compiled test components,
and re-exports the component and server testing APIs from `@exactjs/testing`. Published JavaScript
source maps embed the original sources, so debugging setup does not require the repository checkout.

Pass compiler options through `{ compiler: { ... } }`. Use `matchers: false` or
`configureJsxRuntime: false` only when those concerns are configured elsewhere.
To define a small host component beside its test, enable
`compiler: { compileTestModules: true }`. Components in `.test`, `.spec`, and `.jest` TSX modules
then use normal eXact compilation while the runner retains its test registration.

Server-targeted tests use the same pre-evaluation component-library policy as Vite production
builds and report the `server-test` authorization reason. Client-only jsdom tests remain outside
that server execution gate.

For a paired SSR test, keep JSX render helpers in a fixture module that imports a generated
`.exact.server.js` artifact. Helper modules with server-owned exports and no component definitions
or client-owned exports receive the server projection. Client component fixtures in the same
suite retain their client projection. Separate mixed component/helper modules or select their
target explicitly.

Generated server artifacts and their library dependencies use server exports in Node and jsdom.
A Node test environment alone does not change the default client compilation target. For authored
source SSR tests, configure a separate suite with `compiler: { target: 'server' }`, or import the
generated server artifact. `@exact server` declares placement and does not select the test target.

[Documentation](https://techjoshua.github.io/exact/#/guides/testing) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/packages/vitest)
