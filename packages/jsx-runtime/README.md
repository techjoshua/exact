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

JSX accepts regular, direct-view, and async authored component functions. The compiler normalizes
durable components to the synchronous setup-plus-view runtime contract and lowers setup-local
micro-component tags to lexical view calls.

The runtime exports `jsx`, `jsxs`, `jsxDEV`, `Fragment`, and the keyed-fragment marker. DOM
event props preserve eXact interaction typing, and finite registry members remain ordinary JSX
component values. Namespaced attributes are accepted as compiler-owned source syntax. Use
`exactc --check` rather than raw `tsc --noEmit` when an application uses syntax such as component
value/callback bindings; the compiler validates the finite pair and checks its lowered TypeScript
representation.
