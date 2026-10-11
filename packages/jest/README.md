# @exactjs/jest

Jest integration for eXact component and server tests.

## Setup

```js
import { exactJest } from '@exactjs/jest';

export default {
	...exactJest()
};
```

The generated configuration uses jsdom, compiles TypeScript and TSX through eXact, and installs
the matchers and testing APIs from `@exactjs/testing`. Pass compiler options to `exactJest()`
when server components or React compatibility are required.
For components defined beside their tests, use
`exactJest({ compiler: { compileTestModules: true } })`. Native definitions in `.test`, `.spec`,
and `.jest` TSX files compile normally, and test registration remains owned by Jest.

Before workers start, global setup statically preflights compiler-recorded server component
requests through the shared component-library policy. The resolver consumes that immutable
authorization cache, the transformer fences changed source hashes, and teardown removes the
generation. Candidate implementation modules are not imported during preflight.

Import `@exactjs/jest/setup` directly when composing a custom Jest configuration. ESM projects
should run Jest with Node's VM modules support.

[Documentation](https://techjoshua.github.io/exact/#/guides/testing) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/packages/jest)

For a paired SSR test, keep JSX render helpers in a fixture module that imports a generated
`.exact.server.js` artifact. Helper modules with server-owned exports and no component definitions
or client-owned exports receive the server projection. Client component fixtures in the same
suite retain their client projection. Separate mixed component/helper modules or select their
target explicitly.
