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
