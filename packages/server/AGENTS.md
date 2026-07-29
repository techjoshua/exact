# Using @exactjs/server

Read this package's `README.md` and exported declarations before exposing an eXact endpoint.
Use compiler-generated opaque operation contracts and the platform adapter appropriate to the
host. Never dispatch client-provided module names or expose private captures.

Let server continuations return compiler-approved state effects. `Map` changes travel as keyed
deltas and `Set` changes as membership deltas; do not serialize whole collections manually.

Action continuations accept only compiler-declared argument slots. Supply cancellation and the
invocation generation through trusted runtime context, return the authored value inside the
validated envelope, and keep authored labels, action contexts, services, secrets, and raw DOM or
form objects out of the transport contract.

For DevTools, keep `allowDebug` separate from build output and default it unavailable in production.
Use `debugSessionIdentity` for restricted operator sessions, exact build/root catalog lookup, and
the existing eXact endpoint and binding gateway. Never treat debug IDs as invocation selectors,
forward browser credentials to component hosts, or include values in audit records. Dispose
dynamic catalog registrations and child sessions with their retained build/page session.
Keep debug ownership lazy: ordinary action, refresh, continuation, and batch traffic must not
construct the debug runtime or decode inspection catalogs.
