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

Import `@exactjs/jest/setup` directly when composing a custom Jest configuration. ESM projects
should run Jest with Node's VM modules support.
