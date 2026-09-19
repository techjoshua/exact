# Child composition and document shells

See the [component adoption review](child-composition-adoption.md) for current uses and migration decisions.

`@exactjs/core/children` provides immediate-child composition without mounting components or
exposing renderer-private receipts. `partitionChildren(children, selectors)` matches intrinsic
tag strings, compiler-branded component functions, and `childKinds.text` (strings and numbers).
A selector can be an array of these selectors. Each child enters the first matching named
partition; unmatched children enter `remaining`. Every partition preserves source order.
Arrays flatten, empty values disappear, and explicit fragments stay opaque. Selection never
executes a component to inspect its output. The name `remaining` is reserved.

Author structural elements directly as component children when they need composition. These
declarations remain inspectable when the compiler optimizes their rendering. Unrelated precompiled
output and explicit fragments stay opaque; the helpers do not reverse-engineer render programs
into an element tree or evaluate dynamic rendering ranges to discover their contents.

`childrenOf(element)` reads an intrinsic's immediate children. `withChildren(element, children)`
derives an intrinsic with replacement children while preserving its attribute bindings, refs,
enhancements, key, and component domain. It does not mutate the input or promise relocation of
an already-mounted instance. These functions read reactive inputs in their caller's scope.
Component identity is compiler-owned; authored function names are not identities.

```tsx
import { partitionChildren } from '@exactjs/core/children';

function Dialog(props: { children?: Child }) {
	const parts = partitionChildren(props.children, {
		title: DialogTitle,
		actions: DialogActions
	});
	return () => (
		<section role="dialog">
			<header>{parts.title}</header>
			<main>{parts.remaining}</main>
			<footer>{parts.actions}</footer>
		</section>
	);
}
```

## Completing a document

`Document` from `@exactjs/core/document` is compiler-owned structural composition. It adds no
component instance. It recognizes an immediate `html`, then immediate `head` and `body` elements,
and fills missing structure. Supplied attributes and bindings remain owned by their author.
Without an authored root it uses `lang="en"`. It supplies UTF-8 metadata and a fallback title
only when the corresponding immediate head declarations are absent. Loose content becomes
body content, following an authored body's contents. An authored html cannot have sibling
content, and duplicate document sections are rejected. Fragments and component implementations
are not searched for document declarations.

```tsx
import { Document } from '@exactjs/core/document';

return () => (
	<Document>
		<html lang={this.state.locale}>
			<head>
				<title>{this.state.title}</title>
			</head>
			<body className:dark={this.state.dark}>
				<App />
			</body>
		</html>
	</Document>
);
```

`Document` authors `doctype()` before its html element. It defaults to `<!doctype html>`;
its optional `doctype` prop accepts `{ name, publicId, systemId }`. A replacement shell can
import `doctype` from `@exactjs/core/document` and render it before its own html element:

```tsx
return () => (
	<>
		{doctype()}
		<html>
			<head />
			<body>{props.children}</body>
		</html>
	</>
);
```

Declarations describe the response document and are not reactive browser state. They must precede
the root and occur once. Names and external identifiers are validated
as declaration syntax. Existing shells without an explicit declaration retain automatic HTML5
output. Hydration preserves the declaration parsed by the browser.

Use the document-owning component as the hydration root for
reactive document fields. The existing `documentShell(application)` option remains appropriate
when the shell is server-only; it must render the supplied application exactly once.

## Framework output slots

`documentOutput.styles`, `headScripts`, `hydrationData`, and `bootstrap` are opaque renderable
markers exported from `@exactjs/core/document`. `Document` supplies them automatically, after
authored head content and at the body tail. Custom document composers can place them explicitly.
Head markers must be immediate head children. Hydration and bootstrap markers belong at the body
tail, in that order. A request may consume each marker once.

SSR accepts `documentAssets: { styles, headScripts, bootstrap, nonce }`. Styles are stylesheet
URLs; scripts have `src`, optional `type` (`module` by default or `classic` with defer), optional
`integrity`, and optional `crossOrigin`. Build integrations or application entry points supply
these request-local assets. Markers retain no request data. Ordinary browser mounting does not
fetch assets through them, and hydration retains the renderer-owned asset ranges.

Hydration serialization retains the existing validation, escaping, and size limits. The renderer
resolves its deferred slot after component state capture completes and before bootstrap scripts.
Progressive output retains the slot and following tail while allowing the completed head and
preceding body to stream. Plain string rendering leaves that slot empty. Existing authored
documents without markers retain automatic hydration insertion.

## Compiler and runtime ownership

Intrinsic children crossing component boundaries retain composable receipts. Fixed declarations
can keep an optimized render program with a lazy structural view. Rendering does not redeem that
view; explicit child inspection materializes it once in the original creation domain, without
constructing component instances. Deriving children produces an ordinary intrinsic receipt.
Dynamic declarations, keyed elements, and specialized document or text-host roots retain their
eager structural representation. Component bodies can remain reactive in either representation.

Partition iteration is linear in examined children times selectors and never walks an application's
mounted tree. The first inspection of an optimized intrinsic additionally materializes its
compiler-owned structural description; later inspections reuse it. That cost includes receipt and
array allocations for the described subtree, without executing component bodies. Text-only hosts
coalesce reactive text
without structural comment markers so SSR parsing and browser adoption agree.

The implementation must preserve request isolation, domain and enhancement ownership, cancellation,
doctype framing, resource order, early head delivery, and focused client updates. Released ABI
fixtures remain unchanged; newly emitted document helpers require matching runtime packages.
