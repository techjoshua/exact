# @exactjs/compiler

The eXact TypeScript and TSX compiler. It analyzes component setup, reactive reads and writes,
tasks, bindings, server/client placement, assets, and server-component boundaries, then emits
renderer-ready target artifacts with private runtime contracts.

Most applications should consume the compiler through `@exactjs/vite-plugin`,
`@exactjs/webpack-plugin`, or `@exactjs/bun-plugin`. Direct consumers can use `transformSource`,
compiler sessions, artifact planning, diagnostics, final client-artifact isolation, optional
continuation explanations, and the CLI.

Editor and agent integrations can use `createExactLanguageService()` for a
long-lived, asynchronous, no-emit project. Unsaved overlays produce immutable
generations, compiler-owned component regions and inference reasons, rich eXact
diagnostics, and version-bound task refactor plans. The service never writes
JavaScript, manifests, maps, or catalogs:

```ts
const language = createExactLanguageService({ root, noEmit: true });
await language.synchronize([{ kind: 'upsert', filename, version, source: unsavedText }]);
const inspection = await language.inspect(filename);
await language.dispose();
```

Use `@exactjs/language-server` for LSP lifecycle instead of orchestrating
compiler requests in an editor. Source entity IDs are project-generation
correlation values, not runtime, dispatch, hydration, ABI, or authorization
identities.

```sh
npx exactc --help
```

Compiler diagnostics are part of the programming model: writable bindings, stable list identity,
task placement, and server/client boundaries are validated before runtime.

Synchronous setup assignments can express derived state directly:

```tsx
function Summary(this: Component<State>, props: { taxRate: number }) {
	this.state.subtotal = this.state.quantity * this.state.price;
	[this.state.tax, this.state.total] = calculateTotals(this.state.subtotal, props.taxRate);
	this.state.initialCurrency = peek(() => props.currency);
	return () => <Invoice state={this.state} />;
}
```

Reactive reads on the right become dependencies; state destinations are effects. Destructured
destinations publish as one transaction. `peek()` explicitly retains one-time snapshot semantics.
Inside callbacks, destructuring may mix state and local targets while preserving JavaScript's
right-side evaluation, defaults, rest, target order, partial writes, iterator cleanup, and
assignment result. Chained, compound, logical, and computed-path state assignments retain their
ordinary expression semantics. A dynamic computed write cannot be exported as a server
continuation effect; assign an enclosing statically named state value at that boundary.

State-owned `Map` and `Set` mutations are also recognized. The compiler lowers
`Map.set/delete/clear` and `Set.add/delete/clear` with native return semantics and records them as
precise continuation effects. Server continuations transport effective mutations as ordered
deltas; transported Map keys are limited to `null`, booleans, finite numbers, and strings.

The returned render function is synchronous and rerunnable. Deterministic statements and tree
control are supported, while state writes, lifecycle or task registration, scheduling, and known
DOM or storage effects are compile errors. A local arrow is the normal form. A shared regular
function is also supported and receives the component instance as `this`; a shared arrow cannot
be returned directly.

Static conditional class tokens can use compiler-owned namespaced props:

```tsx
<article
	className="card"
	className:selected={this.state.selected}
	className:is-compact={props.compact}
/>
```

They are combined with ordinary class values in authored order and lowered to one `className`
value. The syntax is limited to intrinsic and custom elements and cannot currently be combined
with a prop spread. Arrays and truthy-key maps remain supported for dynamic token names.

Async component source may await ordinary operations into state:

```tsx
async function Options(this: Component<State>) {
	this.state.options = await getOptions(this.state.destination);
	return () => <OptionsList options={this.state.options} />;
}
```

The compiler emits a synchronous component setup plus a repeatable blocking continuation, inferred
dependencies, cancellation, and staged state publication. Sequential awaits and
`try`/`catch`/`finally` preserve ordinary TypeScript control flow; writes publish only after the
whole generation succeeds. Framework cancellation bypasses authored catches while still executing
finally blocks. Use explicit `this.task()` calls for external effects, cleanup, placement,
scheduling policy, or deliberately nonblocking work.

Set `explain: true` with `transformSource()` to receive a stable,
component-organized account of placement, transported captures, server-only
context tokens, returned effects, and SSR resumption liveness. The explanation
is optional and does not make the compiler's planning manifest a public runtime
contract.

Set `emitInspection: true` to return a separate server-owned static inspection
catalog to a build host, or `false` for a hardened build. `auto` follows the
development default and is disabled in production. Rich catalog descriptions
are returned out of band and are never embedded in generated JavaScript.
Language-service inspection is independent and remains available through its
no-emit session.

Microfrontend producers can call
`selectExactExposureInspectionCatalog()` with an exposure artifact graph to
partition catalogs to components reachable from that producer root. The
selection preserves producer provenance and excludes sibling or page-host
source.

Explicit `this.action()` registrations extend the same continuation model with invocation
arguments, concurrency, opaque operation identity, cancellation fencing, and compiler-owned
optimistic client preludes for server actions. Finite `createComponentRegistry()` declarations
add entry provenance, lazy import/export boundaries, per-entry placement and artifact targets,
and diagnostic/explain metadata. Dynamic registry keys must be proven by
`KeyOf<typeof Registry>` or `hasComponent()`.

Bundler integrations can call `assertExactClientArtifactIsolation()` with
their final output graph. It rejects server artifacts or host-discovered
server-only modules in client runtime chunks and assets. Source map paths are
optional so private development maps can remain complete; a deployment host
may submit public map sources for a separate disclosure audit.

## TypeScript compatibility

The compiler is `exactc-native`, built from a pinned official
TypeScript-Go revision with eXact's analysis and lowering passes in the same Go
process. The tool owns that compiler version independently of the application's
declared TypeScript dependency. TypeScript 6 repositories remain supported
because emitted source is constrained to the TypeScript 6 compatibility
contract.

npm installs only the matching optional platform package for macOS, Linux, or
Windows on ARM64 or x64. Application developers do not need Go installed. Set
`EXACT_NATIVE_COMPILER` only for a hermetic or development build. The public
compiler package, CLI, and bundler adapters use the native host exclusively;
there is no JavaScript compiler fallback.

## SSR island activation

The compiler classifies extracted intrinsic client islands from their actual client obligations.
An island containing only supported activation events and reactive form bindings receives an inert
SSR fallback and interaction hydration metadata. Refs, unsupported events, initial client work,
and server-only child graphs remain eager. Application source does not declare hydration hooks or
repeat the classification.

The fallback omits handlers and refs but retains the intrinsic element, serializable attributes,
generated element identity, current binding value, and renderable children. The hydration runtime
can therefore adopt the server DOM on first interaction instead of mounting into an empty
placeholder.

Current guides: [actions and forms](../../docs/actions-and-forms.md) and
[finite component registries](../../docs/component-registries.md). Language
service contracts and editor behavior are documented in
[compiler-aware language tools](../../docs/language-tools.md).

## Runtime inspection artifacts

`emitInspection` retains the compiler's rich source model for a server-owned catalog, while
`instrumentInspection` independently appends compact client correlation. Artifact compilation
aggregates module inspection into one deterministic build/root catalog under `.exact-inspection`;
server transforms never receive client registration code. Use
`createExactInspectionRedactions()` for qualified selectors without values and
`assertExactClientArtifactIsolation()` to reject catalog reachability from a public graph.

Hardened builds disable both controls. See
[Server-cooperative full-stack DevTools](../../docs/devtools.md).
