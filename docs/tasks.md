# Function-defined tasks and structured task trees

eXact has one authored unit of coordinated work: an ordinary TypeScript
function. Reactive work, direct invocation, events, forms, navigation, and
lifecycle hosts differ by activation metadata; they do not require separate
task and action registration APIs.

## Authoring contract

A function is classified as a task when compiler-visible effects, a known
activation host, placement, a task capability, or a final `TaskContext`
parameter requires coordinated work. A pure helper remains ordinary
JavaScript.

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

The final parameter is compiler-supplied. Application calls omit it. Its
default is declarative compiler syntax and is erased from emitted code.
Recognized facets are:

- placement: `client()` or `server()`;
- invoked concurrency: `parallel()`, `latest()`, or `queue()`, optionally
  partitioned by `key(value)`;
- priority: `immediate()`, `normal()`, or `deferred()`;
- readiness: `blocking()` or `nonblocking()`; and
- lifetime: attached by default or explicitly `detached()`.

At component setup, a call to a classified function declares initialization
and reactive activation. Its argument expressions are observed inputs. A call
from an event or other active host creates an invoked generation. A call under
an active task attaches a child frame; after an `await`, compiler output uses
the retained context and the public task ABI to restore the same relationship.

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

When source observes task status, the compiler materializes an owner-bound
callable facade. It exposes `pending`, `pendingCount`, `generation`, `result`,
`error`, and `cancel()`. Foreground pending is separate from structural
settlement: nonblocking descendants remain owned and inspectable without
keeping controls visibly pending.

## Structural settlement and failure

A frame settles only after its body, attached descendants, framework
contributions, resources, and cleanup settle. Awaiting a returned invocation
observes both the result and the attached subtree. An unawaited child still
extends structural lifetime.

Result observation follows normal JavaScript:

- `await child()` routes a rejection through the caller's `try`/`catch`;
- `void child()` leaves rejection structurally unobserved and fails the parent;
- `void child().catch(recover)` observes and recovers the result edge; and
- `detached()` removes structural parentage but retains durable ownership and
  causal inspection.

Cancellation travels parent-to-child. Cleanup runs child-first, then LIFO
within each frame. Owner disposal also cancels detached generations.

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
atomic reservations, scoped execution, and foreground/structural hooks. It
does not expose mutable frame records or settlement counters.

Compilerless code must state policy and capabilities that the compiler cannot
infer. It does not receive source partitioning, static capture or secret-flow
validation, generated remote continuations, or automatic disposable escape
analysis.
