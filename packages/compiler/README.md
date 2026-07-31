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
diagnostics, referenced JSX component placement and boundaries, and
version-bound task refactor plans. The service never writes JavaScript,
manifests, maps, or catalogs:

Source inspection exposes only `EXACT`-namespaced framework diagnostics.
Ordinary TypeScript diagnostics remain in the native build response but are
left to the editor's TypeScript service for interactive presentation.

Each direct setup state assignment reports whether it is one-time
initialization or a deferred reactive calculation. That authored classification
survives computation normalization, including assignments driven by destructured
props, so editor clients can annotate the specific write instead of the whole
component initializer.

Native UTF-8 byte spans are normalized to the public UTF-16 source-range
contract before inspection data is returned.
Task `selectionRange` values isolate the authored function identifier, allowing
LSP clients to preserve ordinary function syntax and coloring. Explicit-policy
classifications expose authored activation arguments as dependencies.
Inferred-task dependencies retain their authored state paths or local
destructured binding names across the native process boundary.

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
Task diagnostics use the function-defined model: fixes name local task functions and final
`TaskContext` policy rather than removed `this.task()` registration APIs. Legacy syntax remains
recognizable for migration, but its errors identify it as legacy.
On server continuations, that authored final `TaskContext` is also the runtime
execution context; generated artifacts do not append or require a second
synthetic context argument.

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

Ordinary derived declarations in component setup normally lower to lazy,
component-owned cells so several DOM, prop, list, or task consumers share one
result. The returned view contains only its view expression; declarations and
imperative control flow belong in component setup, while conditional JSX and
keyed-item callbacks retain precise region ownership. The view function does
not rerun as an update loop. When a safe inferred setup calculation has
exactly one eager view consumer and produces a scalar or forwards an existing
identity, the compiler elides its standalone cell and fuses the calculation
into that consumer. Shared bindings, fresh identity allocations, event or task
consumers, and explicit `this.reactive()` values retain durable cells.
Within one generated reactive callback, repeated reads of a retained derived
cell are sampled once. This preserves ordinary TypeScript control-flow
narrowing for nullable or union-valued setup declarations and avoids redundant
cell reads during the update.

State-owned `Map` and `Set` mutations are also recognized. The compiler lowers
`Map.set/delete/clear` and `Set.add/delete/clear` with native return semantics and records them as
precise continuation effects. Server continuations transport effective mutations as ordered
deltas; transported Map keys are limited to `null`, booleans, finite numbers, and strings.

The returned render function is synchronous and establishes the compiled view.
Its body may only return the view expression. Keep declarations and imperative
control flow in setup; use JSX conditions and keyed callbacks for tree-local
control. State writes, lifecycle or task registration, scheduling, and known
DOM or storage effects are compile errors. A local expression-bodied arrow is
the normal form. A shared regular function is also supported and receives the
component instance as `this`; a shared arrow cannot be returned directly.

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
finally blocks. Discoverable direct or options-object `AbortSignal` parameters receive the
generation signal automatically, and local known or typed disposable resources receive
generation ownership. Existing signals and event options are preserved and combined. Use a final
`TaskContext` policy parameter when an opaque external effect needs an explicit signal, cleanup,
or owned resource, or for placement, scheduling policy, and deliberately nonblocking work.
Calls whose values are consumed synchronously during component setup remain ordinary initialization
unless an authored final `TaskContext` explicitly requests task semantics; inferred activation
cannot replace the immediate return contract of a factory or context helper.

Defaulted non-context task parameters are compiler-captured inputs. Their
initializers are evaluated once per generation without becoming activation
dependencies, then erased from task work and supplied as ordinary arguments.
Explicit call arguments remain tracked. Captures are reported separately in
analysis and are materialized before server dispatch so transport and data
policy validation applies to their resolved values.

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

Direct calls to function-defined tasks use the same continuation model with
invocation arguments, concurrency, opaque operation identity, cancellation
fencing, and compiler-owned optimistic client preludes for server work.
Parameterless invoked tasks still emit an empty invocation-argument array;
policy such as `TaskContext.latest()` does not require an artificial application
argument or placement modifier.
Authored server-task result types survive the generated client dispatch stub,
while server-only body imports and implementations remain in the server
artifact. Applications call the authored function and never name or dispatch
an operation identifier themselves. Finite `createComponentRegistry()` declarations
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

Current guides: [task interactions and forms](../../docs/actions-and-forms.md) and
[finite component registries](../../docs/component-registries.md). Language
service contracts and editor behavior are documented in
[compiler-aware language tools](../../docs/language-tools.md).

Source inspection retains symbol-resolved use ranges for compiler-derived
reactive bindings. Function-defined tasks expose their authored identifier as
the selection range, and awaits inside that function remain suspension points
of the owning task rather than separate inferred-task entities. Presentation
calls source with a recognized final `TaskContext` parameter a “task with
authored policy”; the retained `explicit` origin discriminator is compatibility
vocabulary, not a second task mechanism.

## Runtime inspection artifacts

`emitInspection` retains the compiler's rich source model for a server-owned catalog, while
`instrumentInspection` independently appends compact client correlation. Artifact compilation
aggregates module inspection into one deterministic build/root catalog under `.exact-inspection`;
instrumented task functions carry their canonical source entity ID directly, so runtime
consumers never reconstruct compiler ordering. Server transforms retain the callback marker but
never receive client source-registration code. Use
`createExactInspectionRedactions()` for qualified selectors without values and
`assertExactClientArtifactIsolation()` to reject catalog reachability from a public graph.

Hardened builds disable both controls. See
[Server-cooperative full-stack DevTools](../../docs/devtools.md).
