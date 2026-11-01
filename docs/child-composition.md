# Child composition and document shells

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
			{parts.title.length > 0 && <header>{parts.title}</header>}
			<main>{parts.remaining}</main>
			{parts.actions.length > 0 && <footer>{parts.actions}</footer>}
		</section>
	);
}
```

## Child ownership and server slots

A supplied rendered child retains its original component owner, reactive bindings and cleanup.
Place that value once in the active tree. Rendering the same owned value in two places is rejected.
To repeat content, author separate JSX children or call a JSX helper separately for each placement.

Within one sibling list, keeping the same single supplied operation retains its mounted owner when
other unkeyed siblings are inserted, removed, or moved. An authored key still controls keyed identity.
Removing that operation disposes its owner, so adding it again creates a fresh mounted instance.
This does not relocate an already-mounted owner between different parents.

Child expressions that depend on their receiving component keep a private compiler-owned input
reader. The renderer acquires it for an actual receiving occurrence, with that occurrence's scope.
Forwarding a raw child recipe through a selector does not create a receiving occurrence by itself.
An unselected recipe is not acquired simply because it appears in `props.children`. Reusing a recipe
at two actual receiving occurrences gives each occurrence its own preparation. This does not permit
two active placements of the same already-owned supplied value.

When an update changes supplied placement through an opaque component, ordinary prop delivery
reveals its actual output before the affected placements commit. The renderer validates those
outputs together before parking, transferring or publishing their supplied ranges. Ordinary property
updates and authored receive effects may already have occurred if validation fails. This is not a
rollback guarantee for authored effects or the whole DOM. Mixed prop and child observers settle
through the existing reactive batch, without a promise of exactly one receive callback.

On the server, an empty child recipe delegates to `props.children`. If that property is a getter,
the renderer samples it once per accepted execution occurrence and retains the exact returned value,
including `undefined`, for construction and publication. Explicit recipe children take precedence.
Other prop accessors keep their original prepared-props receiver. An authored accessor that reads
`this.children` performs an ordinary read of the original bag, outside the framework acquisition.
Direct children reads through the execution view still use the captured value. Callable data values
remain unbound and retain identity. Copies within the same execution reuse its children value, while a
fresh final streaming pass acquires its own value and pairs it with that pass's output and state.
This changes children-getter timing and read counts under the breaking component-input contract.
It does not assume getters are pure, unwrap an authored reactive payload or invoke an authored
callable during input capture.

Children crossing into a client island can be server-rendered elements, ranges or scalar content.
They do not need to be exactly one server element. The compiler publishes server slots that let
hydration retain that content and its ownership while activating the client boundary. Hiding a
receiver's region with the native `hidden` attribute keeps its children mounted. Successful
adoption retains the existing nodes. If permitted mismatch recovery replaces the receiver's
shell, valid referenced server content remains available without promising shell node identity. A client-only
component marked `@exact client` has no server implementation, so its placeholder cannot provide
that component's own server HTML.

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

SSR accepts `documentAssets: { styles, headScripts, bootstrap, bootstrapLoading, nonce }`. Styles are stylesheet
URLs; scripts have `src`, optional `type` (`module` by default or `classic` with defer), optional
`integrity`, and optional `crossOrigin`. Build integrations or application entry points supply
these request-local assets. Markers retain no request data. Ordinary browser mounting does not
fetch assets through them, and hydration retains the renderer-owned asset ranges.

Bootstrap assets default to `bootstrapLoading: 'after-load'`. The browser waits for the window
load event before requesting them, leaving the server-rendered page and styles available first.
If load has already finished, the loader starts immediately. Module scripts use dynamic import.
Classic scripts and modules with integrity or credential requirements use native script elements,
preserving those checks. Bootstrap descriptors execute in order. A failed script reports an error
and prevents the remaining descriptors from starting. Head scripts and explicitly authored script
elements keep their normal loading behavior. No JavaScript preload hints are added.

When earlier activation is more important, `bootstrapLoading: 'normal'` emits ordinary module or
deferred classic script tags. The after-load bootstrap is an inline loader. With a Content Security
Policy, supply the request's allowed `nonce` or authorize the generated inline code with a CSP hash.
If the policy permits only external scripts, the normal loading option avoids the inline loader.
Waiting for load also means waiting for load-blocking images, stylesheets, and other resources.
After-load loading is intended for server-rendered pages, not an empty client-rendered shell.

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

## Choosing composition or coordination

Use `partitionChildren` when a component owns separate output regions and recognizes direct child
roles. Chart uses this for immediate `ChartTitle` and `ChartDescription` children, placing them under
the figure rather than inside the axis/series declaration region. Labels remain reactive and render
once; chart context, registration, and cleanup keep their existing owners.

Use `childrenOf` to inspect an authored intrinsic's contents and `withChildren` to retain its bindings
and ownership metadata. Document composition is the representative use. These helpers do not inspect
component instances, expose component props, search opaque wrappers, or create durable participation
identities. Partition positions are not lifecycle identities.

Keep named props when they already describe a small, explicit set of slots. Forms registration,
motion presence/layout coordination, and mounted accessibility navigation still need their own
lifecycle or DOM knowledge. Native child composition does not replace React-owned child handling.
A similarly named private normalization helper is not necessarily interchangeable with these APIs.

Possible direct-child participation capabilities and the remaining shipping-document migration are
tracked in [future work](proposals/future-work.md#direct-child-participation).
