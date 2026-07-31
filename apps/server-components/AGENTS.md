# Maintaining the server-components sample

Keep server work in ordinary component-local functions with explicit `TaskContext.server()`
placement. The browser owns the durable component instance; the server executes allowlisted,
stateless transitions and returns only compiler-approved public state.

Private authorization and brand services remain in server contexts. Project only explicitly
shared plain data into client-visible state, reconstruct public descendant contexts during
hydration, and never expose operation identifiers or acquire an `ExactClient` from component
source.

Run `npm run test:server-components` and `npm run build:server-components` after component or
boundary changes.
