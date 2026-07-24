# Getting started

## Minimal browser application

Use the packages appropriate to the existing workspace. A basic Vite browser application normally
needs:

```sh
npm install @exactjs/core @exactjs/dom @exactjs/jsx
npm install --save-dev @exactjs/vite-plugin vite typescript
```

Configure TypeScript:

```json
{
	"compilerOptions": {
		"lib": ["ES2022", "DOM"],
		"jsx": "preserve",
		"jsxImportSource": "@exactjs/jsx"
	}
}
```

Configure Vite:

```ts
import { exact } from '@exactjs/vite-plugin';

export default {
	plugins: [exact()]
};
```

Mount a component:

```tsx
import type { Component } from '@exactjs/core';
import { render } from '@exactjs/dom';

function Counter(this: Component<{ count: number }>) {
	this.state.count = 0;

	return () => <button onClick={() => this.state.count++}>Count: {this.state.count}</button>;
}

render(<Counter />, document.getElementById('app')!);
```

## Configuration rules

- Keep the eXact compiler plugin active for every application TSX file.
- Use `@jsxImportSource @exactjs/jsx` when a mixed JSX file needs to force eXact ownership.
- Inspect the installed build adapter before adding options. Vite, Webpack, and Bun integrations
  may expose target-specific client/server compilation.
- Do not import React to make eXact JSX work. React imports can intentionally select compatibility
  behavior in mixed applications.
- Do not use `workspace:*` outside a monorepo that actually owns the referenced workspaces.
