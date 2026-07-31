# Using @exactjs/server

Read this package's `README.md` and exported declarations before exposing an eXact endpoint.
Use compiler-generated opaque operation contracts and the platform adapter appropriate to the
host. Never dispatch client-provided module names or expose private captures.

Let server continuations return compiler-approved state effects. `Map` changes travel as keyed
deltas and `Set` changes as membership deltas; do not serialize whole collections manually.

Task operation continuations accept only compiler-declared argument slots. Execute them through
the framework task-frame SPI so their trusted `TaskContext` owns cancellation, generation,
cleanup, disposables, and attached children. Return the authored value inside the validated
envelope, and keep authored labels, task contexts, services, secrets, and raw DOM or form objects
out of the transport contract.
Preserve that validated `value` in both ordinary and NDJSON responses.
Streaming may emit other effects separately, but its terminal operation result
must retain the value and its operation index.
Treat captured task-parameter defaults as already-resolved originating-host arguments. Validate
their compiler-declared slots normally; never reevaluate a client capture on the server or accept
an authored capture expression through the protocol.

For DevTools, keep `allowDebug` separate from build output and default it unavailable in production.
Use `debugSessionIdentity` for restricted operator sessions, exact build/root catalog lookup, and
the existing eXact endpoint and binding gateway. Never treat debug IDs as invocation selectors,
forward browser credentials to component hosts, or include values in audit records. Dispose
dynamic catalog registrations and child sessions with their retained build/page session.
Keep debug ownership lazy: ordinary operation, refresh, continuation, and batch traffic must not
construct the debug runtime or decode inspection catalogs.
