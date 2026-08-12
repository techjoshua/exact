# Function-defined tasks and structured task trees

eXact has one authored unit of coordinated work: the task. In source, a task
begins as an ordinary TypeScript function. The compiler promotes it to a
stable, owner-bound task definition when its effects, activation host,
placement, capabilities, or transitive calls require framework coordination.
A pure helper remains ordinary JavaScript.

Each reason the definition runs is an activation. Each scheduled run is a
generation with its own cancellation, status, result, effects, structural
children, resources, and cleanup. The scheduler places that generation in a
lane determined by its durable owner, definition, optional key, concurrency
policy, priority, and readiness. Reactive work, direct invocation, events,
forms, navigation, and lifecycle hosts differ by activation metadata; they do
not require separate task and action registration APIs.

## Authoring contract

Begin with an ordinary function and call it normally:

```ts
function persistDraft(serialized: string) {
	localStorage.setItem('draft', serialized);
}

persistDraft(JSON.stringify(this.state.draft));
```

Function syntax does not determine task semantics. A task may be a function
declaration, function expression, or arrow; it may be synchronous or `async`
and may use ordinary TypeScript parameters, including destructuring, optional,
rest, and defaulted parameters:

```ts
const refresh = async (force = false, task: TaskContext = TaskContext.server().latest()) => {
	this.state.result = await load({ force, signal: task.signal });
};

refresh();
```

The compiler sees the client storage effect and classifies `persistDraft` as a
task. Its setup call declares initial and reactive activation, with
`this.state.draft` as an input dependency. A new draft creates a superseding
generation. The compiler supplies the task definition, component ownership,
dependency subscription, scheduling, and cleanup machinery.

Every generation has an `AbortSignal`. The compiler supplies it automatically
to calls whose visible TypeScript signature accepts an optional direct
`AbortSignal` or an options value with `signal?: AbortSignal`. It recognizes
platform calls such as `fetch()` and `addEventListener()` directly and combines
the generation signal with an authored signal or event options rather than
discarding either.

The compiler also gives discoverable resources generation ownership. Known
timers, animation and idle callbacks, observers, sockets, workers,
subscription results with callable or named disposal, and local `Disposable`
or `AsyncDisposable` values are released on settlement or cancellation. A
resource must remain local and expose a known, typed, or annotated disposal
contract. An escape is a diagnostic rather than an inferred longer lifetime.
Use explicit `task.signal`, `task.cleanup()`, or `task.own()` when a wrapper or
third-party boundary hides those contracts.

Add `TaskContext` only when policy must be explicit or the body needs a
generation capability:

```ts
async function saveDocument(
	documentId: string,
	document: Document,
	task: TaskContext = TaskContext.server().latest().key(documentId)
) {
	task.optimistic(() => {
		this.state.documents.set(documentId, document);
	});
	await documents.save(documentId, document, task.signal);
}
```

The final declaration has two roles. `task` is the real per-generation runtime
context used by the body. The default expression rooted at the imported
`TaskContext` value is declarative compiler syntax: the compiler validates the
chain, records its policy, erases the builder, and supplies a fresh context
when a generation starts. Application calls omit the final argument, and
lookalike values do not receive this treatment. Recognized policy facets are:

- placement: `client()` or `server()`;
- invoked concurrency: `parallel()`, `latest()`, or `queue()`, optionally
  partitioned by `key(value)`;
- priority: `immediate()`, `normal()`, or `deferred()`;
- readiness: `blocking()` or `nonblocking()`; and
- lifetime: attached by default or explicitly `detached()`.

In the component body, a call to a classified function declares initialization
and reactive activation. Its argument expressions are observed inputs. A call
from an event or other active host creates an invoked generation. A call under
an active task attaches a child frame; after an `await`, compiler output uses
the retained context and the public task ABI to restore the same relationship.
Synchronous initialization activations through normal priority settle before the first
render so their state output is available to the component and its children.

For compiled components, initialization activation is backed by an availability-aware dependency watcher.
It distinguishes an available `undefined` from an unresolved predecessor slot, snapshots all
inputs atomically, and coalesces several publications from one reactive transaction. A successful
generation publishes its declared state outputs to downstream watchers; replacement, failure,
cancellation, and owner disposal use the existing task generation and structural lifetime rules.
The same path applies to client-only asynchronous tasks. An interaction task appears in the local
execution contract for placement and output validation but still requires its authored event or
explicit invocation before it can run.

An initialization expression that consumes a call's value synchronously remains ordinary
initialization. Factory calls, context lookups, and other helpers used to
initialize local values must return their JavaScript value directly; inferred
task activation cannot provide that value synchronously. An awaited call can
still be task work, and a final authored `TaskContext` remains an explicit
request for task semantics.

Reactive bindings invalidated by one synchronous task transition share one lightweight consequence
owner and a single completion lease on the parent frame. This preserves an open producer for
independently meaningful nested work without allocating a separate controller, public context, or
complete task settlement chain for a short DOM flush. Work started by a reaction—such as a presence
leave frame—remains its own cancelable child. When runtime inspection is attached, eXact
materializes the complete consequence frame so DevTools retains the full structural view. An
interactive DOM wave drains while its interaction producer remains open, so it reuses that producer
without allocating the intermediate consequence lifetime.

`async`, `await`, and readiness are separate concepts. `async` supplies normal
JavaScript promise syntax and does not select Suspense behavior. An `await`
inside task work is a compiler-lowered suspension point that retains task
ownership, cancellation, and stale-continuation fencing. The nearest Suspense
boundary waits only when the generation is `blocking`; `nonblocking` work may
remain pending without holding readiness. An uncontended continuation restores
its frame in the promise-resolution job; overlapping resumptions remain serialized.
An async component that awaits a
value into `this.state` is the shorthand case the compiler infers as blocking
setup work.

## Captured task parameters

A defaulted non-context task parameter is a generation-stable captured input:

```ts
async function refreshRates(
	revision: number,
	draft: ShipmentDraft = this.state.draft,
	task: TaskContext = TaskContext.client().latest()
) {
	await loadRates(revision, draft, task.signal);
}

refreshRates(this.state.revision);
```

The setup argument makes `revision` an activation dependency. When each
generation starts, the compiler evaluates the omitted `draft` default once
without subscribing to its reactive reads and passes the result as an ordinary
argument. Changing `draft` alone does not reactivate the task; another
activation captures its latest value. An explicitly supplied argument keeps
ordinary call-site dependency behavior and wins over the default, including
JavaScript's rule that an explicit `undefined` selects the default.

Defaults are evaluated from left to right and may reference earlier
parameters. For server work, capture happens on the originating host before
dispatch and the value must satisfy normal serialization, residency, and
secret-flow checks. Compiler inspection reports captured inputs separately
from dependencies. Use `task.peek()` for conditional or mid-body snapshots
that are not naturally function inputs.

## Context capabilities

Each generation receives a fresh `TaskContext`:

- `signal` cancels with supersession, its structural parent, or durable owner;
- `generation` is monotonic for the owner and task definition;
- `activation` identifies initialization, reactive, interaction, invoked, or
  lifecycle activation;
- `peek(read)` excludes a read from this task's reactive dependencies;
- `optimistic(work)` records synchronous state mutation for commit or rollback;
- `cleanup(callback)` registers awaited LIFO cleanup; and
- `own(resource)` registers `Disposable` or `AsyncDisposable` ownership.

Task functions return data normally. Returning a function is data, not cleanup.

## Owners, lanes, and status

Concurrency is isolated by durable owner, stable task definition, and optional
key. Component instances are owners. Compilerless code can create an explicit
owner for a session or adapter lifetime. Disposing an owner cancels every
queued and active generation and awaits structural cleanup.

Concurrency policy applies to invoked generations: `parallel` overlaps,
`latest` supersedes, and `queue` preserves order. Reactive activation always
supersedes the previous generation for its activation site. Priority
(`immediate`, `normal`, or `deferred`) determines when eligible work runs;
readiness (`blocking` or `nonblocking`) independently determines whether
Suspense waits.

When source observes task status, the compiler materializes an owner-bound
callable facade. It exposes `pending`, `pendingCount`, `generation`, `result`,
`error`, and `cancel()`. Foreground pending is separate from structural
settlement: nonblocking descendants remain owned and inspectable without
keeping controls visibly pending.

The callable facade aggregates every concurrency lane for that task definition
and owner. For keyed concurrency, `task.pending` means at least one foreground
keyed lane is pending, `pendingCount` is the total across lanes, and `cancel()`
cancels every represented lane. `generation`, `result`, and `error` describe
the greatest accepted generation across the aggregate; there is no implicit
"current key."

Use `taskStatus(task, { key })` during durable setup for a view scoped to one
lane. Its status and cancellation operations represent only that key. The view
captures the key when it is created; it is not a reactive key selector. For
dynamic keyed UI collections, prefer placing the task in the keyed child
component when per-row ownership and status are the real requirement. Reserve
one-owner keyed lanes for work that genuinely needs shared coordination across
several durable keys.

## Structural settlement and failure

A frame settles only after its body, attached descendants, framework
contributions, resources, and cleanup settle. Awaiting a returned invocation
observes both the result and the attached subtree. An unawaited child still
extends structural lifetime.

Effects and results are independent edges. Effects are the work a generation
performs or publishes, including state, context, and DOM changes, optimistic
writes, external I/O, and resource ownership or cleanup. The result is the
fulfillment value or rejection exposed by its invocation. Ignoring the result
does not cancel the generation, discard its effects, or detach it from its
structural parent. Returning a function is result data, not cleanup.

Result observation follows normal JavaScript:

- `await child()` routes a rejection through the caller's `try`/`catch`;
- `void child()` leaves rejection structurally unobserved and fails the parent;
- `void child().catch(recover)` observes and recovers the result edge; and
- `detached()` removes structural parentage but retains durable ownership and
  causal inspection.

Awaiting a result does not determine Suspense readiness. The task's
`blocking` or `nonblocking` policy does that independently. Compiler-staged
framework effects from a failed, cancelled, or stale generation do not publish.
External effects cannot be rolled back automatically and must cooperate with
`task.signal`, cleanup, or owned disposal as appropriate.

Cancellation travels parent-to-child. Cleanup runs child-first, then LIFO
within each frame. Owner disposal also cancels detached generations.

Prefer attached child task functions over hand-built Promise callback graphs
when concurrent branches publish component state. Await each external result
inside its child so compiler-lowered continuation checks and staged writes
fence superseded work. Do not add component revision comparisons or
`task.signal.aborted` checks after compiler-lowered `await` expressions; a
cancelled or stale generation cannot publish its staged writes.

Keep compiler-known resources such as timers local to their task expression.
Register opaque subscription callbacks with `task.cleanup()` and disposable
objects with `task.own()`. Promise adapters that hide a timer or other resource
must accept the task signal and settle when cancellation releases that
resource.

Cleanup is generation-scoped. A synchronous task that registers cleanup and
then returns runs that cleanup immediately when its generation settles; it
does not turn the callback into component-lifetime storage. Keep the task
pending for the resource's intended lifetime. When a repeatable effect can be
expressed from reactive activation inputs, prefer that model over manually
subscribing to the same source.

## Versioned library ABI

Compilerless libraries import `@exactjs/core/tasks/v1`. The main operations
are `defineTask`, `activateTask`, `invokeTask`, `bindTask`, `taskStatus`, `createTaskOwner`,
`runTaskContinuation`, `trackTaskReads`, `bindTaskCallback`, and
`reserveTaskCallback`.

`TaskInvocation` is a standards-compatible thenable, not a native Promise
brand. It works with `await` and promise assimilation; code that requires a
native Promise uses `Promise.resolve(invocation)`.

Framework packages coordinate renderer, router, form, and adapter work through
`@exactjs/core/framework/task-frames`. That SPI exposes opaque frame tokens,
atomic reservations, cancelable scoped execution, and foreground/structural
hooks. Cancelling an execution aborts its frame and attached descendants, then
waits for cooperative cleanup before reporting a `cancelled` structural
outcome. A structural finalizer remains part of the parent's settlement, and
runtime inspection preserves both its semantic `kind` and optional human
label. The SPI does not expose mutable frame records or settlement counters.

Compilerless code must state policy and capabilities that the compiler cannot
infer. It does not receive source partitioning, static capture or secret-flow
validation, generated remote continuations, or automatic disposable escape
analysis.
