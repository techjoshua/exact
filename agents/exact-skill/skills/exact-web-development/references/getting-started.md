# Getting started

## Create a new project

Prefer the official scaffolder when starting in an empty directory:

```sh
npm create @exactjs/exact-app@latest
```

Choose the build integration, runtime platform, and test runner that match the requested
deployment. Accept the Agent Skill option unless the repository already carries equivalent,
current eXact instructions. The scaffolder supports noninteractive flags for automation; inspect
`npm create @exactjs/exact-app@latest -- --help` or the installed package README before inventing a custom
template. A fully noninteractive browser starter is
`npm create --yes @exactjs/exact-app@latest my-app -- --yes`; add `--no-install` to defer installation.

## Minimal browser application

Use the packages appropriate to the existing workspace. A basic Vite browser application normally
needs:

```sh
npm install @exactjs/core @exactjs/dom @exactjs/jsx
npm install --save-dev @exactjs/compiler @exactjs/vite-plugin vite typescript
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

Use TypeScript 7 for a new application's editor and command-line type-checking. eXact component
compilation runs in the npm-selected native `exactc` host and does not use the
application's TypeScript package as a compiler API.

Do not add compiler implementation packages or a backend option to generated applications. Some
optional build-time compatibility features may bring their own TypeScript 6 API for a bounded
transform, but that package is not the eXact compiler and should not replace the application's
TypeScript 7 dependency.

## Compiler-aware editor support

The eXact VS Code extension runs `@exactjs/language-server` beside VS Code's
ordinary TypeScript support. TypeScript continues to own completion, rename,
navigation, formatting, and general type errors; the eXact server owns
framework regions, inference reasons, diagnostics, and task refactors.

Enable semantic compiler execution only in a trusted workspace. The language
service is local and no-emit: it overlays unsaved text in memory and does not
write generated project files.

## Add packages for an application need

Reuse installed packages and compatible versions. A new feature does not require every package
in this list. Read the selected package's installed guidance before adding configuration or imports.

| Application need | Package choice and boundary |
| --- | --- |
| Local state, derived values, tasks, contexts, or recovery | `@exactjs/core` already owns these. A task does not require a separate task package. |
| Client rendering, SSR, or hydration | Choose the matching renderer and host integration from [rendering-modes.md](rendering-modes.md) and [runtime-configuration.md](runtime-configuration.md). |
| URL-driven pages and nested layouts | `@exactjs/router` supplies native navigation and route composition. A single static view can omit it. |
| Reusable labeled fields and validation | `@exactjs/forms` composes field behavior. A simple native control can use core bindings. |
| Shared themes or nested appearance | `@exactjs/theme` supplies semantic styling and inherited scopes. Read its setup before using enhancements. |
| Translation catalogs and locale-sensitive presentation | `@exactjs/intl` supplies messages and formatting. Follow installed catalog and unit-policy guidance. |
| Charts with accessible labels and data tables | `@exactjs/charts` composes chart registrations with theme and intl. |
| Shared components or enhancement libraries | `@exactjs/component-library` declares the library contract. The installed compiler's `exactc build-library` command builds distributable artifacts when supported. |
| Behavior tests | Select one of `@exactjs/vitest`, `@exactjs/jest`, or `@exactjs/bun-test` for the existing runner. Each exposes the shared testing APIs. |
| Understanding source or a running component | Language Tools explains compiler decisions. `@exactjs/devtools-agent` offers optional read-only runtime inspection. See [diagnostics-and-inspection.md](diagnostics-and-inspection.md). |

Existing APIs, GraphQL clients, and state-library integrations remain optional application choices.
They can be called from component-owned tasks. Check an integration package's installed guidance
when using one, and keep server-only clients and credentials in server context.
