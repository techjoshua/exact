# @exactjs/jsx

JSX declarations and host entrypoints for native eXact components.

Use this package with an eXact build integration. The integration compiles component definitions,
including their intrinsic elements, fragments, enhancements, and reactive bindings.

## Configuration

```json
{
	"compilerOptions": {
		"jsx": "preserve",
		"jsxImportSource": "@exactjs/jsx"
	}
}
```

Applications normally receive this configuration from their integration. Use `exactc --check`
for compiler-supported source syntax such as component value/callback bindings.

## Instantiate a compiled component from a helper

An ordinary TSX helper outside a component definition can use the host's automatic JSX transform
to instantiate an already-compiled eXact component:

```tsx
import { renderToString } from '@exactjs/ssr';
import { Page } from './page.js';

export async function localHtml() {
	return (await renderToString(<Page label="Hello" />)).html;
}
```

Compile `Page` with the matching server target before this helper executes. The Webpack integration
selects the `@exactjs/jsx` automatic transform for native-selected output while retaining its existing
React and ordinary-host routing. Other hosts can select their normal automatic JSX transform with
`@exactjs/jsx` as the import source; that transform does not compile component definitions.

The runtime accepts only a current compiled component. Its existing provider checks retain target,
ABI, key, prop, and child handling. Props and children are eager host values; creating the input does
not invoke the component body or a supplied callback. Intrinsics, fragments, `_target`, enhancements,
and uncompiled functions still require native component lowering. An ordinary host JSX call for
those types fails instead of creating a general element tree.

The native helper-preservation path currently applies to `.tsx` callables outside selected
component definitions, including callables nested in those helpers. `.jsx` files retain their prior
native lowering. Ordinary callables within a selected component definition also retain their existing
compiler treatment. Neither path is claimed as complete ordinary-helper preservation.

## JSX surface

The automatic `jsx`, `jsxs`, and development `jsxDEV` entrypoints share that compiled-component
admission. The package-root `createElement` export exists for the host's key-after-spread JSX
convention and admits the same compiled components; author JSX instead of calling it as a general
renderer. Host key order is retained, and `key` is not delivered as an ordinary component prop.

JSX accepts regular, direct-view, and async authored component definitions for the compiler.
DOM event props carry eXact interaction typing. Finite registry members remain ordinary JSX
component values. Inside components, use self-closing `_target` for one supplied logical child and
an explicit fragment for several independently supplied children.

[Documentation](https://techjoshua.github.io/exact/#/learn/compiler-tour) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/packages/jsx-runtime)
