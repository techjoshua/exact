# @exactjs/bun-test

First-class integration between eXact component testing and Bun's built-in test runner. It
provides the shared `@exactjs/testing` APIs, eXact matchers, Happy DOM globals, and runtime
compiler registration for eXact TSX.

## Setup

Add the packaged preload to `bunfig.toml`:

```toml
[test]
preload = ["@exactjs/bun-test/preload"]
```

Then write native Bun tests:

```tsx
import { describe, expect, it } from 'bun:test';
import { testComponent } from '@exactjs/bun-test';
import { Counter } from './Counter.js';

describe('Counter', () => {
	it('increments', async () => {
		const view = await testComponent(Counter).mount();
		await view.getByRole('button').click();
		expect(view.root).toHaveState({ count: 1 });
		view.unmount();
	});
});
```

The default preload registers `@exactjs/bun-plugin`, installs Happy DOM when browser globals are
absent, and extends Bun's `expect` with the eXact matchers. It also supports server snapshots,
paired client/server tests, and protocol recording re-exported from `@exactjs/testing`.

For a custom preload, call `configureExactBunTest()`:

```ts
import { configureExactBunTest } from '@exactjs/bun-test';

configureExactBunTest({
	compiler: { serverComponents: true },
	dom: true,
	matchers: true
});
```

Import `@exactjs/bun-test/setup` instead when compilation and DOM globals are configured elsewhere
and only automatic matcher installation is needed.
