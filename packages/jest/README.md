# @exactjs/jest

Jest integration for eXact component tests. It provides the same mounting APIs, accessible
queries, events, and matchers as `@exactjs/vitest`, plus a Jest transformer for eXact TypeScript
and TSX.

## Setup

```js
import { exactJest } from '@exactjs/jest';

export default {
	...exactJest()
};
```

Run ESM tests with Jest's VM modules support:

```json
{
	"scripts": {
		"test": "node --experimental-vm-modules ./node_modules/jest/bin/jest.js"
	}
}
```

The generated configuration uses `jest-environment-jsdom`, installs the shared eXact matchers
after environment setup, and transforms `.ts` and `.tsx` files through the eXact compiler before
TypeScript transpilation. Import `@exactjs/jest/setup` directly when composing a fully custom Jest
configuration.
