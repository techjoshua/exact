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

The compiler imports the programmatic TypeScript API and therefore depends on
`typescript` aliased to Microsoft's `@typescript/typescript6` compatibility package. TypeScript
7.0 intentionally ships without a programmatic API, so it cannot replace that dependency.

Applications may still use TypeScript 7 for editor support and command-line type-checking. npm
keeps the application's TypeScript 7 executable alongside eXact's private TypeScript 6 API
dependency. This separation will remain until the new programmatic API planned for TypeScript 7.1
is available and eXact has adopted it.

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
