# @exactjs/jsx

Automatic JSX runtime and TypeScript JSX declarations for eXact.

Configure TypeScript with:

```json
{
	"compilerOptions": {
		"jsx": "preserve",
		"jsxImportSource": "@exactjs/jsx"
	}
}
```

The package exports `jsx`, `jsxs`, `jsxDEV`, `Fragment`, and the keyed-fragment `_` marker.
Application TSX should still pass through the eXact compiler; the runtime entrypoints provide the
standard automatic-JSX contract and support tooling and uncompiled structural cases.

Intrinsic event props use the core `InteractionHandler` contract. This lets the compiler recognize
DOM callbacks as component-owned interactions without changing ordinary function syntax. Static
members and finite indexed values from `createComponentRegistry()` remain normal JSX component
expressions with their exact key and props types.

See [Task interactions and forms](../../docs/actions-and-forms.md) and
[finite component registries](../../docs/component-registries.md).
