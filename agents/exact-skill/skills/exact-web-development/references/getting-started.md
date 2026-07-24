# Getting started

## Create a new project

Prefer the official scaffolder when starting in an empty directory:

```sh
npm create exact-app@latest
```

Choose the build integration, runtime platform, and test runner that match the requested
deployment. Accept the Agent Skill option unless the repository already carries equivalent,
current eXact instructions. The scaffolder supports noninteractive flags for automation; inspect
`npm create exact-app@latest -- --help` or the installed package README before inventing a custom
template.

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

The plugin configures Vite 8's Oxc JSX import source automatically. Do not duplicate that
configuration unless the project intentionally overrides the JSX pipeline.

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

## TypeScript versions

Use TypeScript 7 for a new application's editor and command-line type-checking. Current eXact
compiler packages intentionally depend on `typescript` aliased to
`@typescript/typescript6`, because TypeScript 7.0 does not provide the programmatic compiler API
used by eXact's transforms and language tooling. Do not replace, override, or deduplicate that
aliased dependency with TypeScript 7.

Seeing TypeScript 6 and TypeScript 7 in the same dependency tree is expected. TypeScript 7 checks
the application; the private TypeScript 6 dependency powers eXact's compiler integrations.
