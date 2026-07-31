# @exactjs/jsx

Automatic JSX runtime and TypeScript JSX declarations for eXact.

## Configuration

```json
{
	"compilerOptions": {
		"jsx": "preserve",
		"jsxImportSource": "@exactjs/jsx"
	}
}
```

Applications normally receive this configuration from an eXact build integration. TSX must still
pass through the eXact compiler; this package supplies the automatic JSX entry points and
application-facing intrinsic element types.

The runtime exports `jsx`, `jsxs`, `jsxDEV`, `Fragment`, and the keyed-fragment marker. DOM
event props preserve eXact interaction typing, and finite registry members remain ordinary JSX
component values.
