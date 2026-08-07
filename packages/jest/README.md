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

Before workers start, global setup statically preflights compiler-recorded server component
requests through the shared component-library policy. The resolver consumes that immutable
authorization cache, the transformer fences changed source hashes, and teardown removes the
generation. Candidate implementation modules are not imported during preflight.

Import `@exactjs/jest/setup` directly when composing a custom Jest configuration. ESM projects
should run Jest with Node's VM modules support.
