# @exactjs/compiler

The eXact TypeScript and TSX compiler. It analyzes component setup, reactive reads and writes,
tasks, bindings, server/client placement, assets, and server-component boundaries, then emits
renderer-ready target artifacts with private runtime contracts.

Most applications should consume the compiler through `@exactjs/vite-plugin`,
`@exactjs/webpack-plugin`, or `@exactjs/bun-plugin`. Direct consumers can use `transformSource`,
compiler sessions, artifact planning, diagnostics, final client-artifact isolation, optional
continuation explanations, and the CLI.

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
