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

Async component source may assign one awaited task result directly to state:

```tsx
async function Options(this: Component<State>) {
	this.state.options = await this.task(() => getOptions(this.state.destination));
	return () => <OptionsList options={this.state.options} />;
}
```

The compiler emits a synchronous component setup plus a repeatable blocking continuation, inferred
dependencies, cancellation, and staged state publication. Arbitrary component-level awaits,
derived targets, multiple sequential awaited tasks, and statements after the awaited assignment
are diagnosed until their restart semantics can be preserved.

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
