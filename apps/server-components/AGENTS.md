# Maintaining the server-components sample

Keep server work in ordinary component-local functions with explicit `TaskContext.server()`
placement. The browser owns the durable component instance; the server executes allowlisted,
stateless transitions and returns only compiler-approved public state.

Treat that placement as the intentional environment boundary. Let setup activation, default
concurrency, cancellation, and ordinary state effects remain inferred; do not add redundant task
policy merely to make generated behavior visible in source.

Private authorization and brand services remain in server contexts. Project only explicitly
shared plain data into client-visible state, reconstruct public descendant contexts during
hydration, and never expose operation identifiers or acquire an `ExactClient` from component
source.

Run `npm run test:server-components` and `npm run build:server-components` after component or
boundary changes.
