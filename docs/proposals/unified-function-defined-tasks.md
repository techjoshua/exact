# Unified function-defined tasks and structured task trees

## Status

Proposed. Nothing in this document is implemented yet.

The current `this.task(...)`, `this.action(...)`, `TaskContext`, `ActionContext`,
interaction, transport, inspection, and language-tool contracts remain
authoritative until the corresponding migration phase is complete. This
proposal intentionally supersedes the separate authored task/action model
described in
[`coordinated-actions-and-forms.md`](coordinated-actions-and-forms.md), while
retaining its concurrency, optimistic-state, form, router, security, and
distributed-execution guarantees.

| Delivery area         | Current state                                             | Proposed state                                                                         |
| --------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Reactive work         | Registered with `this.task(...)`                          | Inferred from ordinary inner functions and their activation sites                      |
| Explicit invocation   | Registered with `this.action(...)`                        | An ordinary function call, attached to the ambient frame or rooted when none exists    |
| Placement and policy  | Fluent component factories and positional arguments       | A compiler-read default value on the final `TaskContext` parameter                     |
| Cancellation          | Task/action contexts and inferred abort signals           | One `TaskContext.signal`, with the existing cancellable-call inference retained        |
| Optimistic state      | `ActionContext.optimistic(...)` only                      | `TaskContext.optimistic(...)` for eligible invoked task generations                    |
| Cleanup and ownership | Returned cleanup, inferred resources, component ownership | `task.cleanup(...)`, `task.own(...)`, and compiler-owned disposables                   |
| Parent/child work     | Interaction settlement plus independent tasks/actions     | An inspectable structured task tree                                                    |
| Server dispatch       | Generated action continuations using `type: "action"`     | Neutral operation invocation; opaque identity and security remain                      |
| DevTools              | Separate task and action views                            | One task tree with activation, placement, policy, ownership, and effects               |
| Motion/presence       | Not implemented                                           | A later package built on automatic descendant attachment and internal frame settlement |

## Decision

eXact will expose one authored unit of coordinated work: an ordinary
TypeScript function.

A function becomes a **task definition** when the compiler finds a task
activation site, task policy, task capability, placement boundary, reactive
dependency, or known framework host. The function may be declared with a
function declaration, assigned function expression, or arrow function. The
compiler must not require an author to wrap it with `this.task()` or
`this.action()`.

The optional final `TaskContext` parameter serves two purposes:

1. its default value declares compile-time policy; and
2. its runtime value exposes the current task generation's capabilities.

```ts
async function quoteProviderOnServer(
	id: ProviderId,
	request: RateRequest,
	task: TaskContext = TaskContext.server().parallel().immediate()
) {
	return quoteProvider(id, request, task.signal);
}
```

The builder expression is declarative source syntax. The compiler validates it,
stores the policy in generated metadata, and removes the builder execution from
production output. A development fallback may throw a focused diagnostic if
uncompiled code tries to execute it.

Application calls use ordinary function syntax:

```ts
const result = await quoteProviderOnServer(id, request);
```

When a compiler-visible call runs under an active task frame, the compiler and
runtime attach the callee automatically. With no ambient frame, the call
creates a root invoked generation. `detached()` is the explicit policy for
component-owned work that must not delay its causal parent. The compiler
supplies a fresh final `TaskContext` for each generated frame; application code
does not thread a parent's context through child calls.

`TaskContext` is deliberately not promise-like and exposes no general join or
scope-management API. Awaiting a returned value is ordinary result
coordination. Structural descendant settlement is automatic even when an
application does not await a child result.

The compiler has no private task capability. It lowers this source to a
supported, versioned JavaScript task ABI that external libraries and adapters
can call directly. Compiler inference removes ceremony and enables static
validation and optimization; it does not create runtime semantics that cannot
be reproduced with exported JavaScript functions.

## Why one concept is better

The current distinction is based mainly on how work is registered:

- tasks rerun because dependencies invalidate them;
- actions run because something invokes them.

That is an activation distinction, not a difference in the work itself. Both
need generations, cancellation, placement, priority, ownership, status,
cleanup, server coordination, and inspection. Treating them as separate
authored resources duplicates compiler analysis and runtime machinery and
makes ordinary functions appear less capable than wrapper-created functions.

The unified model keeps the useful distinction in metadata:

- **initialization** activates during component setup;
- **reactive** activates after an observed input invalidates;
- **interaction** activates from an event, form, or navigation host;
- **invoked** activates from an ordinary direct call;
- **lifecycle** activates from a framework lifecycle host;
- **nested** describes an attached relationship, not a separate root
  activation kind.

An assignment can therefore be described as initialization or a deferred
reactive value without labeling the entire containing function. A function
call can be described as an invoked server task without inventing an “action”
kind.

## Goals

- Make idiomatic local functions the primary task-authoring syntax.
- Infer the common case without a `TaskContext` parameter.
- Preserve an explicit, statically analyzable escape hatch for placement,
  concurrency, priority, readiness, attachment, cancellation, cleanup, and
  optimism.
- Use one generation and ownership model for reactive work, direct
  invocation, events, forms, navigation, and server continuations.
- Preserve direct `this.state` mutation, precise reactive invalidation, opaque
  generated operation identities, and existing server security boundaries.
- Make parent/child settlement, cancellation, errors, and cleanup
  deterministic.
- Give the compiler freedom to hoist, lambda-lift, specialize, or inline inner
  functions without changing source semantics.
- Make every compiler-generated task operation reproducible through a shared
  JavaScript ABI available to externally authored libraries and adapters.
- Make the task tree sufficient infrastructure for a later presence and motion
  package.
- Replace, rather than layer over, the duplicate task/action concepts in the
  compiler, runtime, language tools, protocol, and DevTools.

## Non-goals

- Making every JavaScript function globally inspectable or scheduled.
- Turning `TaskContext` into a Promise, exposing frame-lifetime bookkeeping,
  or requiring an `await` at every nesting level.
- Treating every reactive invalidation as an application “action.” An
  invalidation is a cause; the scheduled work it activates is a task
  generation.
- Inferring optimistic intent from arbitrary writes before an `await`.
- Making arbitrary functions remotely callable.
- Pretending runtime task metadata can partition server code, validate unknown
  captures, or create a secure remote endpoint without an explicit build or
  dual-sided contract.
- Exposing generated continuation names or transport clients to application
  source.
- Changing HTML's `action` attribute, user-interface actions in testing
  vocabulary, or the ordinary-language meaning of “user action.”
- Implementing `@exactjs/motion` as part of this proposal.
- Supporting arbitrary leave animation around an unwrapped conditional in the
  first motion release.

## Intentional changes to current contracts

These are deliberate breaking changes, not incidental refactors:

| Current contract                                                                    | Intentional replacement                                                                                                                    |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Component.task(...)` and placement/priority task facets                            | Setup-scope calls to task-classified functions, with policy on the final `TaskContext` default                                             |
| `Component.action(...)` and `ComponentActionFactory`                                | Direct calls to function-defined tasks                                                                                                     |
| Separate `ActionContext` and task `{ signal }` context                              | One author-facing `TaskContext` with signal, generation, activation, optimism, cleanup, ownership, and dependency control                  |
| A task callback may return a cleanup function                                       | New tasks return data normally and register cleanup with `task.cleanup(...)`                                                               |
| Separate `ComponentAction` callable/status type                                     | Compiler-synthetic task-function status members when a facade is required                                                                  |
| Task pending status conflates active work with host readiness                       | Owner-bound `pending` reports foreground work; deferred structural settlement remains separately inspectable                               |
| Separate action and task runtime state machines                                     | One definition/generation/frame scheduler and ownership model                                                                              |
| Separate internal interaction settlement                                            | Interaction hosts create root task generations                                                                                             |
| eXact compilation required for a function to participate as a task                  | Compiler-authored functions plus `defineTask()` and explicit remote contracts for compilerless libraries                                   |
| `interactive` in some scheduling packages and `immediate` in proposed source syntax | One public `immediate` priority term, normalized internally                                                                                |
| Generated `type: "action"` requests and action manifests                            | Neutral operation requests and task-aware manifests, migrated only with a behaviorally necessary protocol version                          |
| Separate task/action compiler collectors and continuation kinds                     | Activation metadata on one task definition model                                                                                           |
| Separate DevTools action/task snapshots, queries, and panels                        | One authorized task tree                                                                                                                   |
| Raw TypeScript diagnostics treated as authoritative for component source            | `exactc` and the eXact language service own compiler-synthetic source semantics; TypeScript still validates public declarations and output |

Package consequences include:

- `@exactjs/core` removes component registration factories, merges context and
  status contracts, exports the policy-builder marker, and provides a
  framework-facing task-frame coordination subpath plus compilerless library
  task definitions.
- `@exactjs/compiler` and the native compiler replace action/task collectors,
  manifests, lowering, and diagnostics with the unified model.
- `@exactjs/server`, hydration, adapters, and microfrontend packages consume
  neutral operation contracts while preserving all existing authority and
  serialization checks.
- `@exactjs/dom`, `@exactjs/forms`, and the router propagate task frames rather
  than owning a separate interaction lifetime.
- `@exactjs/devtools-protocol`, browser/server agents, and the Chromium
  extension replace separate collections with a tree.
- `@exactjs/language-server` and the VS Code extension treat task functions and
  their synthetic members as native language semantics.
- React compatibility packages preserve the contracts expected by React-owned
  code at that boundary; they do not expose the removed native component
  factories merely to make native eXact resemble React.

The implementation must use normal package deprecation and release notes
during the compatibility phases, then remove obsolete declarations rather
than retaining permanent aliases.

## Terminology and identity

The implementation must keep six identities distinct:

1. A **function implementation** is authored JavaScript/TypeScript code. A
   capture-free implementation may be shared by every component instance.
2. A **task definition** is compiler metadata for one activation role of that
   function: policy, placement, effect summary, source location, and opaque
   operation identity.
3. A **task owner** is a durable component, router, form, request, adapter, or
   explicitly created lifetime that isolates cancellation and concurrency.
4. A **concurrency lane** is one owner, definition, and optional key tuple over
   which `parallel`, `latest`, or `queue` is enforced.
5. A **task generation** is one independently scheduled activation in a lane with
   status, cancellation, optimistic journal, and result.
6. A **task frame** is one execution in a generation's structured tree. A
   compiler-visible call under an ambient frame creates an attached child
   automatically; a call without an ambient frame creates a root generation.

The same implementation may have more than one task definition when it is used
at meaningfully different activation sites. This prevents a reactive host and
a direct invocation from accidentally sharing scheduling policy or status.
The compiler assigns stable opaque definition identities from module identity,
source identity, and activation role. Authored names remain labels, never
network authority.

## Authoring contract

### Fully inferred tasks

An ordinary function needs no context when all capabilities and policy can be
inferred:

```ts
function resolveRouteOnServer(request: RateRequest) {
	return resolveRoute(request.originZip5, request.destinationZip5);
}

async function saveBoard(tasksJson: string) {
	localStorage.setItem(storageKey, tasksJson);
}
```

The compiler discovers task intent from:

- placement-sensitive calls and imported effect summaries;
- known cancellable and resource-producing calls;
- reactive reads used by a known activation site;
- calls from DOM, form, router, lifecycle, and renderer hosts;
- direct calls to a function already classified as a task;
- an explicit final `TaskContext` parameter;
- transitive calls through the compiler's callable-effect graph.

A function that has none of those properties remains an ordinary function.
Inference must never make a helper remotely callable merely because it is
`async`.

At component setup scope, a call to a task-classified local function is also
its activation declaration:

```ts
function persist(tasksJson: string) {
	localStorage.setItem(storageKey, tasksJson);
}

persist(JSON.stringify(this.state.tasks));
```

The compiler evaluates the argument expression as an observed input. It
activates `persist` during initialization and activates a new superseding
reactive generation whenever the resulting dependency changes. The generated
runtime receives the argument value captured for that generation.

A setup-scope call with no reactive input is initialization-only. A call from
inside active task work attaches automatically to that frame; otherwise it
creates a root invoked generation. This rule applies only when the target is
already task-classified by effects, placement, capabilities, or a known host;
ordinary pure setup helpers retain ordinary JavaScript call semantics. The
language service shows the inferred activation and attachment at the call site
and offers an explicit policy parameter when the inference is not what the
author intended.

### Supported function shapes

All idiomatic local definitions are supported:

```ts
function declared(request: Request) {
	return fetchResult(request);
}

const assigned = async (request: Request) => {
	return fetchResult(request);
};

const expressed = async function load(request: Request) {
	return fetchResult(request);
};
```

The compiler follows statically resolvable aliases and object properties. If a
function escapes through an unanalyzable value before its activation contract
is known, the compiler emits a focused diagnostic and suggests a typed
`TaskContext` parameter or a named local binding. It does not silently change
the call into untracked work.

### Explicit policy and capabilities

The proposed public contract is:

```ts
export type TaskActivation =
	| 'initialization'
	| 'reactive'
	| 'interaction'
	| 'invoked'
	| 'lifecycle';

export interface TaskContext {
	readonly signal: AbortSignal;
	readonly generation: number;
	readonly activation: TaskActivation;

	peek<T>(read: () => T): T;
	optimistic(work: () => void): void;
	cleanup(cleanup: () => void | Promise<void>): void;
	own<T extends Disposable | AsyncDisposable>(resource: T): T;
}

export interface TaskContextPolicy extends TaskContext {
	client(): TaskContextPolicy;
	server(): TaskContextPolicy;
	parallel(): TaskContextPolicy;
	latest(): TaskContextPolicy;
	queue(): TaskContextPolicy;
	key<T>(value: T): TaskContextPolicy;
	immediate(): TaskContextPolicy;
	normal(): TaskContextPolicy;
	deferred(): TaskContextPolicy;
	blocking(): TaskContextPolicy;
	nonblocking(): TaskContextPolicy;
	detached(): TaskContextPolicy;
}

export declare const TaskContext: TaskContextPolicy;
```

TypeScript permits the type and value to share the `TaskContext` name. Only a
chain rooted at the imported framework `TaskContext` value is accepted as
policy syntax; lookalike user objects are ordinary defaults.

The final parameter is compiler-supplied. Application calls omit it even when
the caller is another task; passing a parent `TaskContext` manually is a
diagnostic. The generated child receives its own context associated with its
automatically attached runtime frame.

Policy defaults are:

| Facet                | Default                                                                     |
| -------------------- | --------------------------------------------------------------------------- |
| Placement            | Inferred                                                                    |
| Invoked concurrency  | `parallel`                                                                  |
| Reactive concurrency | Latest generation supersedes the prior generation                           |
| Priority             | `normal`                                                                    |
| Readiness            | Inferred from priority, result waits, and the activation host               |
| Attachment           | Attached to the ambient frame; root when none exists; `detached()` opts out |

`immediate` means eligible in the current interactive scheduling turn. It does
not guarantee synchronous completion or a paint. It replaces the current
cross-package ambiguity between “interactive” and “immediate.”

Concurrency facets apply to independently invoked generations. A reactive
activation always uses superseding generations; applying `parallel()` or
`queue()` to a purely reactive definition is a diagnostic. `blocking()` and
`nonblocking()` explicitly override inferred readiness; they do not change
scheduler priority or structural attachment. `detached()` allows work to
outlive its causal parent, but it remains owned by its durable owner and is
cancelled when that owner is disposed.

#### Concurrency ownership and lanes

A stable task definition is not itself a global concurrency boundary.
`parallel`, `latest`, and `queue` operate within a concurrency lane:

```ts
type ConcurrencyLane = {
	owner: TaskOwner;
	definition: TaskDefinition;
	key?: unknown;
};
```

The owner is the nearest durable task owner, not the current activation frame.
For component work it is normally the component instance; router, request,
worker, and other framework hosts provide equivalent durable owners. A
module-level task called by two component instances therefore has two
independent `latest` lanes. Repeated calls from one component share a lane even
when separate interaction roots caused them. Generation numbers increase
monotonically for an owner and definition across all keys; the optional key
selects concurrency peers but does not create a second generation namespace.

`key(value)` divides one definition and owner into independent lanes:

```ts
async function saveDocument(
	documentId: string,
	task: TaskContext = TaskContext.latest().key(documentId)
) {
	await documents.save(documentId, task.signal);
}
```

Calls for the same document supersede each other; calls for different documents
do not. The key expression is the one permitted dynamic policy expression. It
may reference earlier parameters, is evaluated once before activation, must be
pure, and must satisfy the placement boundary's key constraints. The compiler
extracts it from the erased default builder.

`key()` partitions invoked concurrency only. A reactive definition remains one
superseding lane per owner and activation site even when the same implementation
also has an invoked definition. Using `key()` on a purely reactive function is a
diagnostic because changing a reactive argument must supersede the prior work,
not leave the old key running.

An invocation under an existing task inherits its durable owner. An invocation
under a component, router, form, request, or other host uses that host's owner.
A call with neither an ambient task nor a durable host receives a fresh owner,
so module evaluation cannot accidentally create process-global `latest` or
`queue` behavior. Cross-root or application-wide concurrency requires an
explicit async-disposable `TaskOwner` supplied through the JavaScript ABI.

Placement across a remote boundary preserves the authorized logical owner and
lane through opaque runtime correlation metadata. It never serializes a
`TaskOwner` or accepts an application-provided owner identifier. The destination
maps the authenticated correlation to a scoped server owner, allowing a newer
generation from the same client owner and key to fence older server work
without allowing unrelated clients or components to cancel one another.

Contradictory or repeated facets are compile errors:

```ts
// Error: a task cannot be both client- and server-placed.
task: TaskContext = TaskContext.client().server();
```

The parameter may be destructured when the implementation needs only selected
capabilities:

```ts
async function load(url: string, { signal }: TaskContext = TaskContext.server().latest()) {
	return fetch(url, { signal });
}
```

Use a named `task` binding when registering ownership, excluding a read from
the task's dependencies, applying optimistic state, or consuming an explicit
capability such as `signal`. Child task attachment does not require passing
this binding.

### Priority and readiness in the task graph

Priority affects when an eligible frame runs, not whether it belongs to the
structured tree. Every frame records both a declared priority and an effective
priority:

- a root inherits its known host priority unless its definition overrides it;
- an attached child inherits its parent's effective priority by default;
- `immediate()`, `normal()`, or `deferred()` on the child definition makes an
  explicit scheduling request;
- renderer, reactive, router, form, and lifecycle jobs inherit the frame that
  caused them; and
- detached work keeps its declared/inherited priority even though it no longer
  delays its causal parent.

The graph distinguishes a structural attachment edge from a JavaScript result
wait edge. Structural attachment guarantees cancellation, ownership, and
terminal settlement. A result wait means the parent function cannot continue
until the child produces a value:

```ts
const route = await resolveRoute(); // attachment edge and result-wait edge
startDeferredIndexing(); // attachment edge only
```

If an immediate parent is blocked on the result of an explicitly deferred
child, the scheduler temporarily donates the parent's effective priority to
that child and to the result-producing descendants on which it is blocked.
This prevents priority inversion. Merely remaining structurally attached after
the parent body has returned does not donate priority; a deliberately deferred
child may finish later while the root remains in its settling state.

Priority controls scheduling; readiness controls whether work keeps its host or
task facade visibly pending. Structural attachment controls lifetime. These are
three independent properties.

Each frame contributes to two internal completion barriers:

- `foregroundSettled` covers work whose readiness is blocking; and
- `childrenSettled` covers every attached descendant, including nonblocking
  deferred work.

Absent an explicit readiness facet, immediate and normal work is blocking,
deferred work is nonblocking, and a result wait temporarily donates both
effective priority and blocking readiness to the result-producing path. An
activation host may impose blocking readiness for work required to publish SSR,
hydration, navigation, or another host result. Explicit `blocking()` and
`nonblocking()` override the priority-derived default except that an actual
result wait must remain blocking to avoid reporting readiness before the
required value exists.

An open optimistic journal also donates blocking readiness to every attached
descendant whose failure could still roll it back. Authors cannot make a
rollback-capable child nonblocking merely by lowering its scheduling priority;
they must handle its failure before foreground settlement or detach it from the
optimistic outcome. This prevents controls from reporting completion while
visible state is still provisional.

Forms, buttons, navigation indicators, and task-facade `pending` state observe
`foregroundSettled`. Presence, cleanup, cancellation, frame finalization, and
motion observe `childrenSettled`. DevTools exposes both foreground pending and
structural settling so deferred descendants remain inspectable without keeping
unrelated controls disabled.

An author uses `detached()` when work such as best-effort telemetry must not
extend the parent lifetime. Cancellation and cleanup are always scheduled
promptly regardless of the cancelled frame's prior priority so deferred work
cannot retain resources indefinitely. The scheduler must also age deferred
frames to prevent starvation.

DevTools shows declared priority, effective priority, readiness, inheritance,
and active donation separately. Tests must cover immediate-to-deferred waits,
deferred structural children, foreground versus structural settlement,
priority/readiness restoration, starvation prevention, and cancellation
cleanup.

### Function decorators and annotations

Task policy is function metadata, so decorator syntax is conceptually
attractive:

```ts
@task({ placement: 'server', priority: 'immediate', concurrency: 'parallel' })
async function quoteProvider(id: ProviderId, request: RateRequest) {
	// ...
}
```

It is not currently a native JavaScript option for eXact's ordinary inner
functions. The TC39
[decorators proposal](https://github.com/tc39/proposal-decorators) applies to
classes and class elements, while
[decorators for function declarations and expressions](https://github.com/tc39/proposal-function-and-object-literal-element-decorators)
remain a separate Stage 1 proposal. Its current favored semantics also change
decorated function declaration hoisting, which would be a material
JavaScript-level behavior change for eXact source.

The initial implementation therefore keeps the final `TaskContext` default as
the standards-compatible, typed policy surface:

```ts
async function quoteProvider(
	id: ProviderId,
	request: RateRequest,
	task: TaskContext = TaskContext.server().parallel().immediate()
) {
	// ...
}
```

The compiler canonicalizes every syntax frontend to the same `TaskPolicy`
record. If function decorators reach a sufficiently stable standard stage and
are supported by the repository's TypeScript and JavaScript toolchain, eXact
may add a framework-provided decorator as optional sugar. It must not change
runtime semantics, become protocol identity, require class-shaped components,
or replace inference for ordinary tasks.

JSDoc tags, string directives such as `"use server"`, and custom `@` syntax
are not adopted as primary policy declarations. They are respectively
untyped/comment-dependent, too narrow and non-composable, or nonstandard.
Language tools may offer them only for compatibility with external ecosystems,
normalizing them immediately to the canonical policy model.

### Compilerless libraries and adapters

Externally created libraries must be able to participate in the same frame
graph without running the eXact compiler over their source. The compiler emits
ordinary JavaScript calls to the same supported runtime functions available to
those libraries. It must not target an unexported task protocol.

Provide a standards-compatible library ABI from the versioned
`@exactjs/core/tasks/v1` entry point:

```ts
export interface TaskOwner extends AsyncDisposable {
	readonly signal: AbortSignal;
}

export function createTaskOwner(options?: { readonly label?: string }): TaskOwner;

export interface TaskStatus<Result> {
	readonly pending: boolean;
	readonly pendingCount: number;
	readonly generation: number;
	readonly result: Result | undefined;
	readonly error: unknown;
	cancel(reason?: unknown): void;
}

export interface TaskInvocation<Result> extends PromiseLike<Result> {
	then<TResult1 = Result, TResult2 = never>(
		onFulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
		onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
	): TaskInvocation<TResult1 | TResult2>;
	catch<TResult = never>(
		onRejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
	): TaskInvocation<Result | TResult>;
	finally(onFinally?: (() => void) | null): TaskInvocation<Result>;
	readonly [Symbol.toStringTag]: 'TaskInvocation';
}

export interface TaskFunction<Args extends unknown[], Result> {
	(...args: Args): TaskInvocation<Result>;
}

export interface BoundTaskFunction<Args extends unknown[], Result>
	extends TaskFunction<Args, Result>,
		TaskStatus<Result> {}

export interface RuntimeTaskOptions<Args extends unknown[]> {
	readonly label?: string;
	readonly placement?: 'current' | 'client' | 'server';
	readonly priority?: 'immediate' | 'normal' | 'deferred';
	readonly concurrency?: 'parallel' | 'latest' | 'queue';
	readonly concurrencyKey?: (...args: Args) => unknown;
	readonly readiness?: 'blocking' | 'nonblocking';
	readonly detached?: boolean;
	readonly owner?: TaskOwner;
}

export function defineTask<Args extends unknown[], Result>(
	options: RuntimeTaskOptions<Args>,
	implementation: (...args: [...Args, TaskContext]) => Result | Promise<Result>
): TaskFunction<Args, Awaited<Result>>;

export function invokeTask<Args extends unknown[], Result>(
	parent: TaskContext,
	child: TaskFunction<Args, Result>,
	...args: Args
): TaskInvocation<Result>;

export function bindTask<Args extends unknown[], Result>(
	task: TaskFunction<Args, Result>,
	options?: { readonly owner?: TaskOwner }
): BoundTaskFunction<Args, Result>;

export function taskStatus<Args extends unknown[], Result>(
	task: TaskFunction<Args, Result>,
	options?: { readonly owner?: TaskOwner; readonly key?: unknown }
): TaskStatus<Result>;

export function taskStatus<Args extends unknown[], Result>(
	task: (...args: Args) => Result,
	options?: { readonly owner?: TaskOwner; readonly key?: unknown }
): TaskStatus<Awaited<Result>>;

export function runTaskContinuation<T>(task: TaskContext, work: () => T): T;

export function trackTaskReads<T>(task: TaskContext, read: () => T): T;

export function bindTaskCallback<Args extends unknown[], Result>(
	task: TaskContext,
	callback: (...args: Args) => Result
): (...args: Args) => Result;

export interface ReservedTaskCallback<Args extends unknown[], Result> extends Disposable {
	(...args: Args): Result;
	cancel(reason?: unknown): void;
}

export function reserveTaskCallback<Args extends unknown[], Result>(
	task: TaskContext,
	callback: (...args: Args) => Result
): ReservedTaskCallback<Args, Result>;
```

`defineTask()` creates one stable runtime definition, captures the ambient frame
and durable owner on its public entry call, selects a concurrency lane, attaches
or roots a frame through the framework SPI, supplies a fresh context, applies
policy, and returns a `TaskInvocation` that observes full structural settlement.
The definition itself does not expose global mutable status because it may run
under many unrelated owners.

`TaskInvocation` is a standards-compatible thenable rather than a promise-brand
contract. It works with `await`, `Promise.resolve()`, `Promise.all()`, and other
thenable-assimilating APIs, but code must not depend on
`invocation instanceof Promise`. A consumer that requires a native promise
normalizes it with `Promise.resolve(invocation)`.

`bindTask()` creates the actual owner-bound callable facade used when source
observes `save.pending`; calls through the facade use that owner and its status
aggregates every key for that owner.
`taskStatus()` creates a non-callable view over the same owner and can optionally
filter one key. Without an explicit owner, both capture the ambient durable host
during setup and diagnose use where no host exists. An unkeyed view aggregates
`pending` and `pendingCount` over the owner's lanes while `generation`, `result`,
and `error` describe the greatest started generation that has reached an
accepted terminal outcome. `cancel()` cancels every lane represented by the
view.

The wider `taskStatus()` source signature lets standard TypeScript validate an
ordinary function that `exactc` will classify and lower. In emitted JavaScript
the argument is always the corresponding runtime definition. Calling
`taskStatus()` on an uncompiled, unregistered plain function is a targeted
runtime error; compilerless code first uses `defineTask()`.

`createTaskOwner()` is the explicit escape hatch for application-wide,
session-wide, or adapter-defined concurrency. Async disposal cancels every
generation it owns and awaits their structural cleanup. Passing an owner is
therefore a lifecycle commitment, not a convenient global key. Normal libraries
omit it and inherit the invocation host's owner.

`RuntimeTaskOptions.concurrencyKey` is the compilerless equivalent of
`TaskContext.key(value)`. It is called once with the authored arguments before
the lane is selected. A remote task key must pass the same serialization and
trust-boundary validation as its arguments; it never becomes transport
authority.

After an asynchronous suspension, portable library code uses the retained
`TaskContext` with the shared ABI rather than depending on ambient state:

```ts
import { defineTask, invokeTask, trackTaskReads } from '@exactjs/core/tasks/v1';

export const search = defineTask(
	{
		label: 'search catalog',
		priority: 'deferred',
		concurrency: 'latest',
		concurrencyKey: (query) => query
	},
	async (query: string, task: TaskContext) => {
		const index = await openIndex(task.signal);

		return trackTaskReads(task, () => {
			const locale = catalogState.locale;
			return invokeTask(task, searchIndex, index, query, locale);
		});
	}
);
```

The consumer sees an ordinary typed callable and does not pass a context:

```ts
const results = await search(query);
```

The compiler may lower equivalent authored source to the same JavaScript:

```ts
const parent = defineTask(policy, async (query, task) => {
	await prepare(task.signal);
	return invokeTask(task, child, query);
});
```

`invokeTask()` performs automatic child attachment with an explicit retained
parent and therefore works after any number of `await` boundaries.
`runTaskContinuation()` restores the frame's synchronous ambient context for a
manually authored continuation segment. `trackTaskReads()` is the narrower
form for attributing reactive reads without relying on ambient async context.
These operations reject a stale parent rather than silently attaching late
work to an already settled frame.

`bindTaskCallback()` preserves causal origin and durable ownership but never
keeps or later joins the original structural parent. Whenever the callback
runs, it starts a new root; its structure therefore cannot depend on whether
the prior frame happened to settle first. `reserveTaskCallback()` is the
explicit structural form: it atomically reserves an attached child before
handing a callback to an external scheduler, and the callback or an explicit
cancel/dispose must release that reservation exactly once.

These functions are a supported public library/adapter surface, not a return
to component-owned `this.task()` or `this.action()` registration. Compiler
output and external code must produce equivalent frame trees when they call
the same ABI.

Compilerless definitions must state behavior the compiler cannot safely
discover. They use `task.signal`, `task.own()`, `task.cleanup()`, and
`task.peek()` explicitly and use `trackTaskReads()` where dependency
attribution crosses an async boundary. Compilerless code does not receive:

- static signal injection into arbitrary calls;
- disposable escape analysis;
- capture, secret-flow, or serialization analysis;
- client/server source partitioning;
- generated remote continuations;
- compile-time placement diagnostics; or
- hoisting, direct-call lowering, and facade elision.

`placement: "server"` on `defineTask()` is only an assertion for code already
loaded in a server-only entry point. It cannot move an implementation out of a
browser bundle or make it remotely callable.

#### ABI compatibility

The unversioned `@exactjs/core/tasks` entry point may re-export the current ABI
for application convenience. Generated code and published compilerless
libraries import an explicit major such as `@exactjs/core/tasks/v1`. Artifact
metadata records the required ABI major and minimum minor; loading fails early
with a targeted diagnostic when the runtime cannot satisfy it.

Compatibility follows observable task semantics:

- patches fix defects without changing ownership, attachment, result,
  cancellation, readiness, or cleanup behavior;
- minors add capabilities and optional helpers without changing existing frame
  trees or outcomes; and
- majors are required for incompatible changes to lanes, settlement, failure,
  cancellation, ownership, or the meaning of an existing option.

The local JavaScript ABI, framework frame SPI, DevTools protocol, and remote
wire protocol are independently versioned. A source vocabulary change does not
force any of them to rev. Each published ABI major includes a conformance kit
that compiler output and third-party libraries can run. Optimized compiler
lowering is supported only while differential tests prove it equivalent to
direct calls through the corresponding public ABI major.

#### Compilerless remote contracts

Remote compilerless libraries require an explicit shared contract, client
stub, and server implementation:

```ts
// shared entry point
export const searchContract = defineRemoteTaskContract<[query: string], SearchResult[]>({
	name: '@catalog/search',
	input: searchInputSchema,
	output: searchOutputSchema
});
```

```ts
// server-only entry point
export const searchHandler = implementRemoteTask(searchContract, async (query, task) =>
	index.search(query, task.signal)
);
```

```ts
// browser entry point
export const search = createRemoteTask(searchContract);
```

Recommended package conditional exports keep the server implementation out of
the browser graph. The application server explicitly registers and allowlists
`searchHandler`. Registration assigns a deployment-specific opaque operation
capability; the stable library contract name identifies the schema but is not
itself dispatch authority. Hydration or the authorized runtime registry maps
the client stub to that capability without exposing the raw transport client
to application components.

The existing authorization, CSRF, scope, schema validation, result validation,
redaction, cancellation, build compatibility, replay, and stale-generation
rules apply. A missing handler, schema mismatch, browser import of a
server-only implementation, or unallowlisted contract fails closed.

This yields three supported paths:

```text
compiler-authored function
  → inference, erasure, partitioning, and optimization

compilerless local library
  → defineTask(options, implementation)

compilerless remote library
  → shared contract + client stub + allowlisted server implementation
```

Adapters that schedule callbacks use the framework task-frame SPI directly;
adapters that expose callable coordinated work may build their public
functions with `defineTask()`. Both paths produce the same runtime frame,
inspection, cancellation, priority, and settlement semantics as compiled
tasks.

### Inferred dependencies and `task.peek()`

A setup-activated task infers dependencies from reactive reads:

- while evaluating its setup-call arguments;
- in the task implementation;
- through statically resolved helper calls; and
- through prop, context, and derived-value provenance.

Those reads form the candidate dependency set. Runtime observation records the
active subset for the completed generation, so branch-dependent subscriptions
can be added and removed precisely:

```ts
async function refresh() {
	if (this.state.useCustomProvider) {
		await loadProvider(this.state.customProvider);
	}
}

refresh();
```

`refresh` always depends on `useCustomProvider`. It depends on
`customProvider` only after a generation takes that branch. Reads are
canonicalized by reactive source and path, so reading the same value four
times creates one dependency. Tooling may show the individual read locations,
but must not present them as four dependencies.

`task.peek()` reads the current value without adding it to this task's
activation dependencies:

```ts
async function refreshRates(task: TaskContext = TaskContext.client().deferred()) {
	const revision = this.state.revision;
	const draft = task.peek(() => this.state.draft);

	await loadRates(revision, draft);
}

refreshRates();
```

Changing `revision` activates a superseding generation. That generation reads
the latest `draft`, but changing `draft` alone does not activate the task.
`task.peek()` is the documented task-authoring idiom because it states which
task's dependency collection is being suppressed. It suppresses only the
current task frame's collector and must not disable an unrelated nested
reactive scope.

The standalone `peek()` export remains a supported lower-level reactive
primitive for initialization, derived expressions, and code that has no task
context:

```ts
this.state.draft = peek(() => cloneDraft(initial.draft));
```

Inside a task, standalone `peek()` remains valid for general untracked
reactivity, but the language service recommends `task.peek()` when the intent
is specifically to exclude a task dependency. DevTools and compiler
inspection distinguish:

```text
Dependencies
  this.state.revision

Untracked task reads
  this.state.draft — excluded by task.peek()
```

The compiler must preserve source provenance. Given a destructured prop named
`revision`, tooling reports `revision (prop)` rather than inventing a
nonexistent `props` identifier.

### Inferred cancellation remains first class

Authors do not have to accept `TaskContext` just to make known APIs
cancellable:

```ts
async function loadRates(request: RateRequest) {
	const response = await fetch('/rates', {
		method: 'POST',
		body: JSON.stringify(request)
	});
	return response.json();
}
```

The existing compiler effect model continues to inject the active signal into
known cancellable operations when their signature and semantics permit it.
An explicit `task.signal` is required when choosing among signals, passing
through an unknown abstraction, or using an API whose cancellation position
cannot be proven.

### Invocation and attachment

```ts
async function refresh(request: RateRequest, task: TaskContext = TaskContext.client().latest()) {
	const route = await resolveRouteOnServer(request);
	const quotes = await Promise.all(providers.map((id) => quoteProviderOnServer(id, request)));
	this.state.route = route;
	this.state.providers = quotes;
}
```

Calling `refresh(request)` creates a latest-wins invoked generation. Both
server calls run under its ambient frame and become attached children
automatically. `Promise.all()` is used only because `refresh` needs both result
values; it does not construct the structural lifetime. If `refresh` started an
attached child without awaiting its result, the frame still could not settle
before that child.

The compiler supplies each child function's own `TaskContext`. It also carries
the parent frame through transparent synchronous helpers and compiler-known
scheduled callbacks. An explicit `TaskContext` argument is not an application
attachment protocol.

### Observable status

When task status is observed, directly invoked, cancelled, or allowed to
escape, the compiler materializes a per-instance callable facade:

```tsx
async function save(profile: Profile, task: TaskContext = TaskContext.server().latest()) {
	task.optimistic(() => {
		this.state.profile = profile;
	});
	this.state.profile = await profiles.save(profile, task.signal);
}

return () => (
	<button disabled={save.pending} onClick={() => save(this.state.profile)}>
		{save.pending ? 'Saving…' : 'Save'}
	</button>
);
```

Recognized task functions have a compiler-synthetic intersection with the
`BoundTaskFunction` status surface: `pending`, `pendingCount`, `generation`,
`result`, `error`, and `cancel()`. The compiler lowers the materialization to
the shared `bindTask()` ABI, producing an actual owner-bound callable with
runtime getters; it is not inventing status that does not exist in JavaScript
or aggregating unrelated owners.

`pending` and `pendingCount` observe foreground generations, not merely
structurally settling deferred descendants. The remaining status fields follow
the bound-view aggregation rules defined by the ABI. `cancel()` includes
structurally attached background descendants of every represented generation.

Portable standard TypeScript and compilerless libraries use the same runtime
status through `taskStatus()`:

```tsx
const saveStatus = taskStatus(save);

return () => (
	<button disabled={saveStatus.pending} onClick={() => save(this.state.profile)}>
		{saveStatus.pending ? 'Saving…' : 'Save'}
	</button>
);
```

The native checker and language service must provide completion, hover, rename,
and diagnostics for the concise `save.pending` form and a refactor between it
and `taskStatus(save)`. The portable form is canonical in published declarations
that must compile under standard TypeScript.

This is an intentional tooling boundary change. Raw TypeScript does not know
that an unmodified function declaration has compiler-synthesized members.
`exactc` becomes the authoritative type checker for eXact component source,
while TypeScript compatibility jobs continue to validate emitted JavaScript,
generated declarations, and public library types. Repository scripts and
editor setup must not run a second raw-TS diagnostic pass over eXact source
that reports these members as errors.

If status is never observed and the function does not escape, the compiler may
lower calls directly with no facade allocation.

## Structured task lifetime

### Settlement

A task frame settles when:

1. its runtime-created producer scope has been disposed after the function
   returns or throws;
2. every reserved and attached child frame has settled;
3. renderer, router, form, and resource jobs attached to the frame have
   settled;
4. descendant cleanup has completed; and
5. required optimistic commit or rollback work has completed.

This automatic settlement is the reason callers do not have to await at every
layer. Awaiting a task's returned promise observes the whole attached subtree,
not only the immediate function promise. Not awaiting a child result does not
detach it.

Foreground settlement is an earlier readiness milestone, not a second terminal
state. It occurs when every blocking contribution has either completed or
failed: the frame body when the activation itself is blocking, plus blocking
result, renderer, router, form, and descendant work. Nonblocking attached work
may continue afterward. A nonblocking deferred root with no donated result wait
can therefore be structurally active without ever making its bound facade
`pending`. Cancellation, cleanup, final success/failure publication, and the
`TaskInvocation` result still wait for full structural settlement.

### Runtime-owned frame scope

Scope closure and descendant settlement are internal frame mechanics, not
public `TaskContext` capabilities. Lowering is semantically equivalent to:

```ts
async function runTaskFrameInternals(parentFrame: TaskFrame | undefined, args: unknown[]) {
	const frame = runtime.attachTask(parentFrame, definition);
	let outcome;

	try {
		using scope = frame.scope;
		outcome = await implementation(...args, frame.context);
	} catch (error) {
		outcome = runtime.failure(error);
	}

	await frame.childrenSettled;
	await frame.finishCleanupAndCommit();
	return runtime.unwrap(outcome);
}
```

`frame.scope` is a compiler/runtime-owned disposable producer lease. Disposing
it means that invocation has finished directly initiating children; it does
not mean the frame is settled. `frame.childrenSettled` is one stable internal
completion signal for the dynamically discovered subtree, not a
`Promise.all()` snapshot. It fulfills after success, failure, or cancellation
once every reserved descendant is terminal, while semantic failure propagates
through the frame outcome separately.

The runtime reserves a child atomically before queueing its work. A queued
child therefore cannot appear after `childrenSettled` has observed an empty
tree. Descendants may reserve further descendants while their own producer
scopes remain open. Application code cannot dispose a scope, await the wrong
subtree, or deadlock by awaiting its own still-open frame.

### Cancellation, failure, and cleanup

- Cancellation travels from a generation to all attached descendants.
- Component disposal cancels every attached and detached generation it owns.
- A result-observed child failure follows ordinary JavaScript control flow; an
  unobserved attached child failure rejects its nearest attached parent.
- Cleanup runs child-first, then registration-last-in-first-out within a frame.
- Cleanup is awaited before terminal settlement.
- `latest` cancellation fences stale state, DOM, transport, and optimistic
  commits even when an external API ignores its signal.
- Detached failures are reported to the component error/inspection channel;
  they cannot become unhandled process rejections.

`TaskInvocation` is a task-aware promise. Calling its `then`, `catch`, or
`finally` method establishes a result-observation edge; `await` does so through
the standard thenable protocol. Chained continuations remain attached
`TaskInvocation` work, so a handler that throws cannot escape structural
failure tracking.

```ts
try {
	const route = await resolveRoute(); // observed; rejection enters this catch
} catch (error) {
	reportRouteFailure(error);
}

void refreshIndex(); // unobserved; a rejection fails the attached parent

void refreshIndex().catch(reportIndexFailure); // observed and recovered
```

The runtime reserves the structural child immediately. When a result edge is
observed, rejection is delivered through that edge and succeeds or fails the
parent according to the parent's ordinary control flow. When no result edge is
observed before the parent producer closes, rejection becomes a structural
failure. Merely prefixing a call with `void` does not detach or supervise it.
Observation after producer closure cannot retroactively change the settled
failure relationship. The compiler diagnoses an invocation that escapes its
producer without being observed, explicitly detached, or transferred through a
reserved callback/adapter contract.

Each frame retains a structured failure outcome:

```ts
interface TaskFailureOutcome {
	readonly primary: unknown;
	readonly suppressed: readonly unknown[];
}
```

Failure selection is deterministic: an uncaught body/result-edge failure is
primary; otherwise the failed unobserved child or framework contribution with
the lowest stable attachment ordinal is primary. Remaining failures follow
attachment order, followed by cleanup/finalizer failures in their execution
order, and are retained as suppressed inspection data. The same propagated
error is deduplicated across child and body records. Cleanup never replaces the
application failure that caused cleanup to run.

Cancellation is a distinct terminal outcome rather than an application failure
unless authored code explicitly converts it into one. The first committed
terminal cause wins between cancellation and failure: a cancellation request
immediately fences commits and makes later failures suppressed diagnostic data;
a failure committed first remains the public rejection while cancellation
still propagates to unfinished descendants.

The runtime records both a structural parent and a causal origin. Explicitly
detached work has no structural parent that delays settlement, but retains its
causal origin so DevTools can still answer “which interaction invoked this
work?”

### Cleanup and owned resources

Returning data and registering cleanup are separate:

```ts
async function watchSocket(url: string, task: TaskContext = TaskContext.client()) {
	const socket = task.own(new ManagedSocket(url));
	const unsubscribe = subscribe(socket, receiveMessage);
	task.cleanup(unsubscribe);
	return socket.ready;
}
```

`task.own(resource)` and `task.cleanup(callback)` use the same ownership stack:
the former is typed for `Disposable`/`AsyncDisposable`; the latter adapts
callbacks and non-disposable resources.

The compiler automatically owns a value with `Symbol.dispose` or
`Symbol.asyncDispose` when escape analysis proves that it:

- is created within a task frame;
- is not governed by an authored `using` or `await using` declaration;
- does not escape through a return, state/context write, unknown call, or
  detached child; and
- is not already passed to `task.own()`.

Authored `using` retains lexical JavaScript disposal semantics. The compiler
must never double-register it. When ownership cannot be proven, a diagnostic
offers `task.own(...)` rather than guessing.

Returning a cleanup function from legacy `this.task` work remains supported
only by the migration adapter. New function-defined tasks use
`task.cleanup(...)`; an ordinary returned function is ordinary result data.

### Optimistic work

Optimism belongs to an invoked generation rather than to an “action” type:

```ts
async function renameCard(
	id: string,
	title: string,
	task: TaskContext = TaskContext.server().latest()
) {
	task.optimistic(() => {
		this.state.cards.find((card) => card.id === id)!.title = title;
	});
	await cards.rename(id, title, task.signal);
}
```

An attached child shares its root generation's optimistic journal. A call with
no ambient frame creates a root invocation and therefore owns a new journal.
The current path/collection conflict rules, rollback ordering, generation
fences, staged server effects, and parallel-overlay diagnostic remain.
`optimistic()` is rejected in reactive, initialization, lifecycle, and
detached generations unless a later proposal defines a sound commit authority
for those activations.

## Compiler implementation

### 1. Replace parallel task/action models

Introduce common compiler records:

```text
TaskImplementation
TaskDefinition
TaskActivationEdge
TaskPolicy
TaskEffectSummary
TaskTransportContract
```

Remove `Task` versus `Action` branches from collection, classification,
lowering, continuation generation, and inspection output. Activation and
invocation metadata become fields on `TaskDefinition`. Existing action
argument, result, concurrency, placement, and optimistic analysis moves into
the unified path rather than being deleted.

### 2. Discover candidates and activation edges

The analysis pipeline must:

1. index local function declarations, assigned functions, method-like object
   values, imports, and statically resolvable aliases;
2. identify known framework hosts and direct call edges;
3. parse the final `TaskContext` parameter and fluent default policy;
4. run the existing effect/call graph to a fixed point;
5. create one task definition per distinct activation role;
6. classify candidate dependencies, `task.peek()` suppression boundaries,
   captured inputs, state/context reads and writes, placement, resources,
   cancellation, serialization, and optimistic effects; and
7. diagnose unresolved escapes and incompatible multi-role policies.

Generated dependency metadata keeps canonical source identity separate from
read locations and source spelling. At runtime, each generation replaces its
active dependency set with the paths actually observed outside
`task.peek()`. A cancelled or superseded generation must not install a stale
dependency set. A current generation that fails does install the dependencies
it observed before failing, so changing the input that caused the failure can
activate a retry.

Recursive task calls attach new child frames automatically unless the
definition is explicitly detached. The compiler must preserve stack and
tail-call behavior; the task runtime must not flatten recursion into one
frame.

### 3. Parse and erase policy builders

The default builder is accepted only on the final `TaskContext` parameter.
The compiler canonicalizes the chain to policy metadata and removes it from
the lowered function signature. It also removes the framework-supplied context
argument at a remote serialization boundary and reconstructs a local context
on the destination.

The compiler emits diagnostics for dynamic builders, conditional chains,
aliases of the builder value, duplicate facets, unsupported facet/activation
combinations, and attempts to transmit `TaskContext`. The sole dynamic builder
operand is `key(expression)`, whose pure expression is extracted and evaluated
once from authored arguments before concurrency-lane selection.

### 4. Lower to the shared JavaScript task ABI

The compiler expresses task semantics through the exported functions from a
versioned entry point such as `@exactjs/core/tasks/v1` and the framework frame
SPI:

- task definitions lower to `defineTask()` or a semantically equivalent
  definition primitive;
- owner-bound callable status lowers to `bindTask()` and portable status reads
  lower to `taskStatus()`;
- attached calls lower to `invokeTask(parentContext, child, ...args)`;
- resumed async segments that need ambient runtime behavior lower through
  `runTaskContinuation()`;
- dependency-attributed read segments lower through `trackTaskReads()`;
- callbacks lower through `bindTaskCallback()` or
  `reserveTaskCallback()` according to whether they extend settlement; and
- renderer/framework scheduling lowers through frame run and reservation
  operations.

Generated modules import a versioned ABI subpath and record the required ABI
version in their artifact metadata. External libraries may write the same
calls by hand and must produce the same frame tree and observable behavior.

Optimized production output may bypass a public wrapper only when compiler and
runtime conformance tests prove semantic equivalence. A diagnostic/conformance
build mode emits the direct shared-ABI form so generated behavior can be
inspected, tested, and reproduced without reverse-engineering private helpers.

### 5. Preserve ordinary JavaScript and optimize safely

Lowering selects the least expensive representation:

- hoist capture-free implementations to module scope;
- lambda-lift serializable, stable captures when that reduces per-instance
  allocation;
- specialize a shared implementation for multiple activation definitions;
- rewrite non-escaping calls directly through the scheduler;
- allocate a per-instance callable facade only for escaping functions or
  observed status;
- preserve closure identity when JavaScript can observe it; and
- preserve source maps so stack frames and DevTools point to authored
  functions, not generated continuations.

V8 already optimizes inner functions, and an eXact component setup normally
runs once per instance. Hoisting is therefore an optimization, not a semantic
requirement. Compiler benchmarks must reject transformations that increase
startup cost, retained closures, or hot-call overhead without a measured win.

### 6. Unify continuation and artifact generation

Generated continuations use activation metadata rather than an `Action` kind.
The compiler still:

- produces opaque operation identifiers;
- extracts only approved serializable arguments and captures;
- partitions client and server code;
- generates allowlist and authorization metadata;
- validates returned state/context/DOM effects;
- fences generations and builds;
- emits typed client stubs without exposing the transport client; and
- prevents authored code from naming generated continuations.

The recent typed action-result and stub work becomes typed task-aware operation
result generation.

### 7. Extend the native checker

The checker must understand:

- synthetic task-function status members;
- compiler-supplied final context arguments and diagnostics for attempts to
  pass or transmit a parent context manually;
- policy builder validity;
- serializable invoked-task arguments and results;
- activation-specific capability availability;
- disposable ownership and escape diagnostics;
- contextual typing in DOM, form, router, lifecycle, and motion hosts; and
- source-preserving rename/references across distributed continuations.

Compiler inspection output must report assignment-level initialization and
reactive classifications separately from function-level task definitions.
This avoids decorating every expression in a function with its outer task
classification.

## Runtime and library implementation

### `@exactjs/core`

Replace the separate component task and action resources with:

- `TaskDefinitionRuntime`;
- `TaskOwnerRuntime`;
- `TaskConcurrencyLaneRuntime`;
- `TaskGenerationRuntime`;
- `TaskFrameRuntime`;
- runtime-owned disposable producer scopes and foreground/descendant-settlement
  signals;
- one owner-bound callable facade/status implementation;
- one scheduling and concurrency implementation;
- one optimistic journal integration; and
- one resource/cleanup stack.

`Component.task` and `Component.action` are removed from the final public
interface. `TaskContext`, its type contracts, and task-status types become the
public surface. A temporary internal adapter may lower legacy registrations
onto the unified runtime during migration, but new compiler output must not
depend on it.

The current interaction scope becomes a root task-generation creator rather
than a second lifetime system. DOM events, forms, and router navigation keep
their useful semantic source labels while sharing cancellation, settlement,
ownership, and inspection with every other task.

### Framework task-frame coordination SPI

Frame coordination is not an application-authoring API, but it must be a
supported framework-level contract because the renderer, router, forms,
server adapters, and future motion package are separate published packages.
Expose it through an explicitly framework-facing subpath such as:

```ts
import {
	captureTaskFrame,
	reserveTaskFrame,
	runTaskFrame,
	runWithTaskFrame,
	type TaskFrameReservation,
	type TaskFrameToken
} from '@exactjs/core/framework/task-frames';
```

The SPI exposes opaque authority and safe operations, not mutable frame
records, raw producer scopes, child counters, or settlement resolvers:

```ts
declare const taskFrameTokenBrand: unique symbol;

export interface TaskFrameToken {
	readonly [taskFrameTokenBrand]: true;
}

export interface RunTaskFrameOptions {
	readonly parent?: TaskFrameToken;
	readonly kind: string;
	readonly label?: string;
	readonly detached?: boolean;
	readonly priority?: 'immediate' | 'normal' | 'deferred';
	readonly readiness?: 'blocking' | 'nonblocking';
}

export type TaskFrameOutcome<T> =
	| { readonly status: 'fulfilled'; readonly value: T }
	| { readonly status: 'rejected'; readonly error: unknown }
	| { readonly status: 'cancelled'; readonly reason: unknown };

export type TaskForegroundOutcome =
	| { readonly status: 'ready' }
	| { readonly status: 'rejected'; readonly error: unknown }
	| { readonly status: 'cancelled'; readonly reason: unknown };

export interface RunTaskFrameHooks<T> {
	work(context: TaskContext): T | Promise<T>;
	afterForeground?(outcome: TaskForegroundOutcome): void | Promise<void>;
	afterChildren?(outcome: TaskFrameOutcome<T>): void | Promise<void>;
}

export function captureTaskFrame(): TaskFrameToken | undefined;

export function runTaskFrame<T>(
	options: RunTaskFrameOptions,
	hooks: RunTaskFrameHooks<T>
): Promise<T>;

export interface TaskFrameReservation extends Disposable {
	run<T>(work: (context: TaskContext) => T | Promise<T>): Promise<T>;
	cancel(reason?: unknown): void;
}

export function reserveTaskFrame(options: RunTaskFrameOptions): TaskFrameReservation;

export function runWithTaskFrame<T>(frame: TaskFrameToken, work: () => T): T;
```

`runTaskFrame` performs the same attach, producer-scope, descendant-settlement,
cleanup, commit, and outcome sequence as compiler-generated task invocation.
`afterForeground` lets form, router, SSR, and similar hosts publish readiness
after the foreground barrier without exposing `foregroundSettled`.
`afterChildren` supports framework coordinators such as presence removal and
final router settlement without exposing `childrenSettled`. It runs after
descendant settlement for fulfilled, rejected, and cancelled work;
`runTaskFrame` publishes or throws the semantic outcome only after that
structural finalizer completes. `afterForeground` runs exactly once for ready,
rejected, and cancelled foreground outcomes so a host can always clear pending
UI; only `ready` permits successful readiness publication. A later nonblocking
failure is reported through the final structural outcome without reopening the
foreground barrier. The runtime awaits the hook before marking foreground
settled; a hook rejection becomes a framework failure in the structural outcome
but does not cause a second foreground notification.

`reserveTaskFrame` attaches atomically before a package queues work. Running
the reservation opens the frame's producer scope; cancelling or disposing an
unused reservation releases it exactly once. `runWithTaskFrame` establishes
synchronous ambient context for a callback and restores the previous frame in
`finally`; it does not turn an arbitrary future event into a descendant.

The shared task ABI builds on this frame SPI. The compiler uses the task ABI
for authored functions and this lower-level SPI for renderer/framework work;
external libraries and adapters may do the same. Implementations may use more
direct internal calls only after proving equivalence. Framework packages
document this subpath in their README and package-local `AGENTS.md`, but
ordinary application guidance does not recommend it. Opaque branding prevents
fabrication; semver and cross-package acceptance tests protect the contract.

### Current-frame propagation

The browser cannot depend on a process-global async-local variable to preserve
the current frame across concurrent Promise continuations. Frame propagation
must therefore be explicit in generated and scheduled work:

- direct compiler-visible calls lower to `invokeTask()` with the retained
  parent `TaskContext`;
- resumed async segments use `runTaskContinuation()` or narrower explicit ABI
  operations such as `trackTaskReads()` and `invokeTask()`;
- compiler-generated callbacks use `bindTaskCallback()` or
  `reserveTaskCallback()` according to whether they extend settlement;
- reactive, renderer, router, form, and lifecycle queue records store the
  token and reserve their child frame before enqueueing;
- the scheduler pushes the token on a short synchronous runtime stack only
  while invoking code, then restores the previous token in `finally`;
- future independent hosts such as a later DOM event intentionally create a
  new root instead of retaining the frame that installed the handler; and
- remote calls transmit only opaque generation/parent correlation metadata,
  from which the authorized destination runtime creates a remote child frame.

A token is a small runtime identity such as generation and frame IDs. A
`TaskContext` retains an opaque association with its frame so shared ABI
functions can recover that token without exposing it to application code. The
runtime resolves tokens through the owning component and generation registry,
rejects stale attachments, and uses them to establish structural parentage
and causal origin. A server may use `AsyncLocalStorage` as an optimization, but
correctness must remain based on explicit contexts/tokens so compiler output,
external browser libraries, and server packages agree.

TC39's [Async Context proposal](https://github.com/tc39/proposal-async-context)
may eventually provide a native implementation substrate for capturing and
restoring the ambient token. It remains Stage 2 and explicitly does not define
task scheduling, interception, error propagation, reservation, or structured
settlement. eXact can adopt it behind the framework SPI when sufficiently
available, but the frame graph and scheduler contracts cannot depend on it.

### Reactive runtime and DOM renderer

Reactive invalidation itself is recorded as a causal edge. Any derived
computation, binding, reconciliation job, ref callback, portal update,
blocking candidate, or mount/remove lifecycle scheduled as a consequence of a
task frame inherits that frame unless explicitly detached.

This is required for internal `frame.childrenSettled` to include visible
consequences rather than merely function promises. The renderer must propagate
a small frame token through its scheduler, reserve a child job before
queueing, and settle that child only after commit. It must not retain a whole
`TaskContext` in every reactive node.

The existing precise dependency graph remains. A state change does not create
an application task by itself; it schedules the already-classified reactive
definitions and renderer jobs that consume the changed path.

### Forms and router

Known event and form callbacks create interaction-activated root generations.
Pending UI, duplicate-submit suppression, external errors, focus behavior,
and native-form fallback remain package-owned. Pending UI and duplicate-submit
suppression observe the root's foreground barrier rather than awaiting the
`TaskInvocation`, which represents full structural settlement. Final errors,
cleanup, and optimistic commit/rollback observe the structural outcome. This
replaces the separate interaction object without making deferred background
work hold controls disabled.

Router navigation, fetch, submit, redirect, and revalidation attach to the
current task frame when initiated from it. A standalone navigation creates its
own interaction generation. The router may publish foreground readiness while
retaining the structural frame for deferred descendants, presence, cleanup, and
final inspection. Latest-wins navigation and stale response fencing remain.

`InteractionHandler` may remain as a contextual host type because it describes
why a callback runs, not a second runtime resource. Any public action-specific
handler or status types are renamed to task equivalents.

### Server, hydration, and protocol

Task unification does not by itself justify a wire-protocol migration. The
transport concept is a neutral allowlisted operation invocation, not a public
task or action identity:

```ts
type OperationRequest = {
	type: 'invoke';
	operation: OpaqueOperationId;
	generation: number;
	args: SerializedValue[];
	// existing build, scope, CSRF, authorization, and tracing fields
};
```

This is the canonical shape for the next behaviorally necessary protocol
version, not a requirement to rev the current protocol merely to replace the
word `action`. Until another payload, security, compatibility, or dispatch
change requires that version, generated code may continue emitting the current
`type: "action"` discriminator as a legacy transport spelling. The dispatcher
normalizes both spellings immediately to an internal operation request.

Generated manifests expose operation contracts annotated with task semantics,
not authored function names. Low-level `defineExactActionContract`-style APIs
gain neutral operation-contract replacements where they remain necessary, with
the action-named entry points deprecated rather than forcing an unrelated
migration. Application authors still do not construct requests or acquire an
eXact client directly.

Compilerless remote contracts enter the same dispatcher through explicit
server registration. The stable package contract identifies schemas and
compatibility; registration creates the deployment-specific opaque operation
capability used on the wire. The client stub resolves that capability through
the authorized runtime registry. It cannot dispatch an unregistered contract
or use the stable contract name as endpoint authority.

When a behaviorally necessary protocol version adopts `type: "invoke"`, clients
and servers negotiate it through existing build/protocol metadata. Servers
decode the previous `type: "action"` request for the documented rolling
deployment window and normalize it to the same internal operation. Removal of
the compatibility decoder follows the repository's protocol support policy,
not the source API migration schedule. Mixed-build, allowlist, authorization,
CSRF, serialization, redaction, cancellation, replay, and stale-generation
adversarial tests must pass before removal.

SSR and hydration serialize task definitions and resumable generation
metadata using framework-owned opaque identities produced by compiled or
runtime definitions. They never serialize `TaskContext`, cleanup callbacks,
resources, or generated continuation names.

## Developer tooling

### Language server and VS Code

The compiler-aware language service must replace separate task/action
classification with task definition, activation, and frame information.

It must provide:

- completion and hover for synthetic task status members;
- ordinary TypeScript completion and hover for `defineTask()` options,
  implementation context, callable status, shared ABI helpers, callback
  reservation ownership, and remote contract schemas;
- completion and hover for `task.peek()`, including the suppressed dependency
  paths;
- policy-builder completion, validation, and quick fixes;
- “Convert `this.task`/`this.action` to function-defined task” refactors;
- call-site hints distinguishing root, automatically attached, and explicitly
  detached invocation;
- placement, priority, owner/key concurrency lane, readiness, activation,
  dependencies, captured values, resources, cleanup, and optimistic
  information;
- diagnostics for uncancellable unknown calls, escaped disposables,
  invalid optimism, detached leaks, and ambiguous activation roles;
- navigation between a client call and its generated server operation without
  revealing the opaque wire name in source; and
- current-document updates driven by the same immutable compilation snapshot
  as diagnostics, semantic tokens, hover, and inlay hints.

Decorations remain sparse:

- assignment badges appear before the assignment;
- function-call badges appear immediately after the opening parenthesis;
- multiple badges compose activation, placement, priority, and inference;
- a function declaration receives only definition-level metadata;
- inner expressions retain normal TypeScript/TSX semantic highlighting; and
- hover on a JSX component reference describes the referenced component first,
  with containing-component context second.

The suggested badge vocabulary remains usable: `📋` task, `▶` or `⚡`
invocation, `⚙` initialization, `🚨` immediate, `⏳` deferred, `🖥` server,
and `📱` client. Accessible text, theme-safe codicons, and hover explanations
must accompany emoji; raw inserted text must never split a semantic token.

### Browser DevTools and protocol

Replace separate `tasks` and `actions` arrays, event kinds, queries, and panels
with one task graph:

```text
component
└─ task generation: refresh (invoked, latest, client)
   ├─ frame: resolveRouteOnServer (server)
   ├─ frame: quoteProviderOnServer [ups] (server)
   ├─ frame: quoteProviderOnServer [fedex] (server)
   ├─ renderer commit
   └─ owned resources / cleanup
```

Each node shows definition, durable owner, lane key, activation, policy,
generation, parent, causal origin, placement, foreground/structural status,
duration, dependencies, writes, transport, optimistic journal, resources,
cancellation reason, primary error, and suppressed failures. Timeline events
include queue, start, frame enter/exit, foreground settle, remote
dispatch/return, optimistic apply/commit/rollback, resource acquire/release,
renderer commit, cancel, and structural settle.

Definitions identify their source as compiler-authored, compilerless runtime,
or compilerless remote contract. All three use the same generation/frame event
model; tooling must not relegate external libraries to an uninspectable
“other” category.

Protocol query methods become `tasks.list`, `tasks.get`, and
`tasks.getTree`; action-only queries remain aliases only during the
compatibility window. Redaction and authorization apply before tree assembly
so a client cannot infer secret captures from parentage.

The Chrome extension can inspect client-only bundles through the existing
browser runtime bridge. Server child frames appear only when an authorized
server agent is connected; otherwise the tree shows a redacted remote boundary.

### Testing tools

User-facing test helpers may continue to call a click or input an “action.”
Runtime inspection assertions move to task generations and trees. Add
deterministic helpers for:

- waiting for a task subtree to settle;
- advancing queued/latest generations;
- inspecting cancellation and cleanup order;
- resolving or rejecting remote child frames;
- observing optimistic commit/rollback; and
- asserting renderer commits attached to a frame.

## Application migration examples

### Shipping calculator

The current server actions and reactive tasks become named functions:

```ts
export function CalculatorWorkspace(
	this: Component<WorkspaceState>,
	{ initial }: { initial: InitialModel }
) {
	// Initial state assignments remain assignment-level initialization.
	this.state.draft = peek(() => cloneDraft(initial.draft));
	this.state.providers = peek(() => initial.providers);
	this.state.route = peek(() => initial.route);
	this.state.revision = 0;

	function resolveRouteOnServer(request: RateRequest) {
		return resolveRoute(request.originZip5, request.destinationZip5);
	}

	function quoteProviderOnServer(
		id: ProviderId,
		request: RateRequest,
		task: TaskContext = TaskContext.server().parallel().immediate()
	) {
		return quoteProvider(id, request, task.signal);
	}

	function restoreSavedDraft() {
		if (initial.explicitUrlState) return;
		// localStorage work unchanged
	}

	async function refreshRates(
		revision: number,
		task: TaskContext = TaskContext.client().deferred()
	) {
		await delay(450, task.signal);
		const request = normalizeDraft(task.peek(() => this.state.draft));
		const ids = task.peek(() => initial.configuredProviders);
		const route = resolveRouteOnServer(request);
		const quotes = ids.map((id) => quoteProviderOnServer(id, request));
		this.state.route = await route;
		this.state.providers = await Promise.all(quotes);
	}

	// Compiler activation declarations; exact syntax is described below.
	restoreSavedDraft();
	refreshRates(this.state.revision);

	return () => renderWorkspace(this.state, { initial }, inputs);
}
```

The setup-scope call is both readable TypeScript and the reactive activation:
`this.state.revision` is its dependency and the evaluated revision is its
generation argument. No `observe(...)` or registration wrapper is introduced.
The `draft` and configured-provider reads use `task.peek()`, so they are
refreshed when `revision` activates the task without independently triggering
it. If those `task.peek()` calls were removed, the body reads would become
inferred dependencies as well.
Calling `refreshRates(...)` later from inside another function remains an
ordinary invocation. It attaches automatically when the caller runs under a
task frame and creates a root generation otherwise.

The compiler attaches every quote and route request to the ambient refresh
frame without passing `task`. Manual generation comparisons can then be
removed: latest cancellation and commit fencing are runtime guarantees. The
component never imports a transport client or names a continuation.

### Kanban persistence

```ts
function persist(tasksJson: string) {
	localStorage.setItem(storageKey, tasksJson);
}

persist(JSON.stringify(this.state.tasks));
```

DevTools describes the assignment/call as a deferred reactive client task.
It does not decorate `persist`'s entire body or confuse the domain type named
`Task` with framework task metadata.

### Server component setup

```ts
async function prepareProfile(name: string, task: TaskContext = TaskContext.server().blocking()) {
	await profiles.prepare(name, task.signal);
	this.state.status = `Ready for ${name}`;
}

prepareProfile(props.name);
```

Because the call occurs during setup and is blocking, SSR waits for its
generation. The compiler emits the same placement and hydration guarantees as
the current `this.task.server(...)`.

### Form save with optimism

```ts
async function saveProfile(
	profile: Profile,
	task: TaskContext = TaskContext.server().latest().immediate()
) {
	task.optimistic(() => {
		this.state.profile = profile;
	});
	this.state.profile = await profiles.save(profile, task.signal);
}

return () => (
	<Form onValidSubmit={(_event, data) => saveProfile(readProfile(data))}>
		<button disabled={saveProfile.pending}>Save</button>
	</Form>
);
```

The form creates an interaction root, and `saveProfile(...)` attaches
automatically. Its latest-wins policy still fences overlapping save
activations across interaction roots. No handler or application component
passes a context to establish that relationship.

### Explicit resource lifetime

```ts
async function streamUpdates(task: TaskContext = TaskContext.client().detached()) {
	const stream = task.own(await openUpdateStream(task.signal));
	task.cleanup(() => metrics.endSpan('updates'));
	for await (const update of stream) applyUpdate(update);
}
```

Detached does not mean unowned: component disposal still aborts the stream and
runs cleanup.

## Existing applications and packages to migrate

Migration is repository-wide and is not complete until all of these classes
are addressed:

| Area                          | Required change                                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Shipping calculator           | Replace server actions and reactive tasks; remove manual generation fences made redundant by attached latest generations   |
| Kanban                        | Replace persistence registration with a reactive activation                                                                |
| Server-components sample      | Replace server setup task registrations and verify SSR/hydration                                                           |
| Sudoku                        | Migrate timers, generation, persistence, and worker/server work; verify disposal and cancellation                          |
| Workbench/compiler demos      | Show inferred, explicit-policy, attached, detached, optimistic, and server examples                                        |
| Docs application              | Replace every `this.task`/`this.action` example and add a task-tree guide                                                  |
| Core/compiler fixtures        | Recast task/action fixtures around definitions, activations, frames, lanes, readiness, and neutral operation contracts     |
| Forms/router samples          | Preserve pending, duplicate suppression, redirects, and automatic navigation attachment                                    |
| Microfrontend/server samples  | Regenerate operation contracts with task metadata and verify scope/authorization boundaries                                |
| External library fixtures     | Validate hand-authored shared ABI, async continuation attachment, remote conditional exports, and fail-closed registration |
| Chrome and VS Code extensions | Remove action-only UI and consume the unified inspection schema                                                            |

Every affected package README and package-local `AGENTS.md` must explain the
new public contract and safest authoring pattern. Current references that must
change when implementation lands include at least:

- `docs/component-language.md`;
- `docs/actions-and-forms.md` (rename/reorganize around tasks and
  interactions);
- `docs/server-components.md`;
- `docs/distributed-component-continuations.md`;
- `docs/scheduling-suspense-activity.md`;
- `docs/language-tools.md`;
- `docs/devtools.md`;
- `docs/ssr-hydration.md`;
- `docs/native-compiler.md`;
- all corresponding routes, navigation, search terms, and examples in
  `apps/docs`; and
- the repository and affected package README/`AGENTS.md` files required by
  repository policy.

The implemented action proposal should then be reduced to retained historical
rationale or moved under history so it cannot be mistaken for the current API.

## Future `@exactjs/motion` package

The motion package is explicitly deferred, but the task work must leave a
usable contract for it.

### Presence without another public lifetime primitive

A stable component can retain the previous child while leave work runs:

```tsx
<Presence when={this.state.showDetails}>
	<Motion leave={{ opacity: 0, y: -8 }}>
		<Details />
	</Motion>
</Presence>
```

`Presence` owns phase and retained-child state. On removal it:

1. keeps rendering the prior keyed child;
2. asks the runtime to open an attached, internal motion task frame;
3. renders the retained range under that frame while the compiler/runtime
   manages its producer scope;
4. lets descendant motion participants attach automatically;
5. schedules range removal as the frame's post-children continuation;
6. lets the runtime wait on the frame's internal `childrenSettled`;
7. cancels stale leave work if presence returns; and
8. stops rendering only after the subtree settles.

`Motion` registers a participant through ordinary component context.
Animations, observers, and frame callbacks are owned resources; an animation
wrapper can implement `AsyncDisposable`. Cancellation, reduced motion,
component disposal, and rapid enter/leave reversal therefore use task
semantics rather than a second transition token.

A framework-level coordination operation can express the boundary:

```ts
runTaskFrame(
	{
		parent: captureTaskFrame(),
		kind: 'presence-leave',
		priority: 'immediate'
	},
	{
		work: () => renderRetainedLeavingRange(),
		afterChildren: () => removeRetainedRange()
	}
);
```

`runTaskFrame` reserves the frame, wraps `work` with its disposable producer
scope, waits for its internal descendant-settlement signal, and then runs
`afterChildren` under the appropriate still-active parent frame. Neither
`scope` nor `childrenSettled` appears in application or motion component
source. The operation comes from the framework coordination SPI rather than
the application `TaskContext` surface. This works only if renderer
consequences inherit the active frame as required above. No public DOM-commit
token is needed.

### Planned package surface

A later proposal can define:

- `Motion` for enter, leave, and update animations;
- `Presence` for one stable conditional range;
- `MotionList` for keyed collection enter/leave/reorder coordination;
- task-aware `nextAnimationFrame` and Web Animations helpers;
- layout and shared-element measurement;
- router integration and `document.startViewTransition`;
- reduced-motion policy;
- SSR/hydration behavior that never flashes a leave state; and
- inspection events nested under the initiating task.

The first release should require `Presence`/`MotionList` around retained
content. Supporting arbitrary unwrapped conditionals would require a renderer
removal lease that delays range disposal after reconciliation. That is a
separate primitive with identity, hydration, cancellation, portal, and memory
consequences and is intentionally not smuggled into this task proposal.

## Delivery plan

### Phase 0: freeze semantics with executable fixtures

- Add compiler fixtures for every function shape, activation kind, policy
  facet, automatic attachment form, recursion form, resource outcome, and
  placement boundary.
- Preserve fixtures for the current action-spelled transport and add neutral
  invocation fixtures only when another behavioral protocol change requires
  the new version.
- Record current action/task/form/router behavior as black-box compatibility
  tests.
- Benchmark current allocations, setup time, task/action invocation, reactive
  rerun, server dispatch, and DevTools snapshot cost.

Exit gate: examples in this proposal have an unambiguous parse and every
retained current guarantee has a named regression test.

### Phase 1: unified internal runtime behind existing APIs

- Implement definitions, durable owners, keyed concurrency lanes, generations,
  frames, owner-bound status, scheduling, cancellation, cleanup, and inspection
  internally.
- Add the opaque framework task-frame token, run, reservation, and synchronous
  propagation SPI with cross-package contract tests.
- Add `defineTask()` and prove that compilerless local definitions use the same
  generation, status, cancellation, priority, cleanup, and inspection runtime.
- Add `invokeTask()`, task-aware result observation, `bindTask()`/
  `taskStatus()`, continuation/read tracking, callback binding, and callback
  reservation as the versioned JavaScript task ABI.
- Adapt current `this.task` and `this.action` registrations onto it.
- Replace interaction settlement internals with task roots and separate
  foreground readiness from full structural settlement while preserving public
  behavior.
- Attach forms and router jobs to frames.
- Keep existing compiler output and protocol unchanged.

Exit gate: the existing suite passes unchanged and the new tree tests prove
owner-isolated lanes, child-first cancellation/cleanup, observed and unobserved
error propagation, detached ownership, and both readiness barriers.

### Phase 2: compiler function discovery and `TaskContext`

- Implement candidate discovery, alias/call graph analysis, activation
  definitions, builder parsing, capability validation, synthetic types, and
  source maps.
- Lower local client-only tasks first.
- Preserve inferred signal/resource behavior.
- Implement direct-call lowering, safe hoisting, and facade elision.
- Lower an inspectable conformance mode exclusively through the exported task
  ABI and compare it with hand-authored library equivalents.
- Normalize inferred policy and `TaskContext` defaults to one canonical policy
  record, leaving room for a future standards-based decorator frontend.
- Add migration diagnostics and code actions for legacy registrations.

Exit gate: client-only examples compile without wrappers, raw authored syntax
is highlighted normally, and benchmarks remain within agreed budgets.

### Phase 3: structured renderer consequences

- Propagate frame tokens through reactive scheduling and DOM commit.
- Attach bindings, reconciliation, refs, portals, blocking work, and lifecycle
  consequences.
- Implement runtime-owned producer scopes, atomic child reservation,
  foreground/descendant-settlement signals, and commit/cancel fencing.
- Implement declared/effective priority inheritance, result-wait donation,
  readiness donation, deferred aging, and prompt cancellation cleanup.
- Add stress tests for rapid invalidation, keyed removal, portals, Suspense,
  Activity, and component disposal.

Exit gate: automatic frame settlement deterministically includes visible DOM
effects without leaking frames or delaying unrelated work.

### Phase 4: server task activation and optimism

- Generalize continuation compilation from action to invoked task activation.
- Emit new typed stubs and neutral operation manifests annotated with task
  semantics.
- Keep the current remote protocol unless another behavioral requirement
  justifies a version; when it does, adopt neutral `type: "invoke"` with the
  rolling-deployment decoder.
- Add compilerless remote contract, client-stub, server-implementation,
  conditional-export, registration, schema, and opaque-capability support.
- Move optimistic journals, concurrency, argument/results, authorization, and
  generation fencing to unified definitions.
- Verify no authored source imports a transport client or generated operation
  identifier.

Exit gate: all security/adversarial suites and distributed action guarantees
pass under server task activation without application-visible transport
identity.

### Phase 5: language tools and DevTools

- Ship synthetic function typing, policy completion, semantic classification,
  owner-bound status, `taskStatus()` portability refactors, hover, code actions,
  and snapshot-consistent updates.
- Show structural versus result-wait edges and declared, inherited, donated,
  and effective priority/readiness.
- Version the DevTools protocol and implement task trees in browser/server
  agents and the Chrome panel.
- Retain compatibility query aliases for one release.
- Add accessibility and theme tests for badges and tree views.

Exit gate: editing never lags by one snapshot, semantic tokens remain normal,
and the same generation can be followed from source through browser, server,
renderer, cleanup, and settlement.

### Phase 6: repository migration

- Migrate core packages and tests, then sample apps, then the docs app.
- Update all current engineering docs, public docs routes/navigation/search,
  README files, and affected `AGENTS.md` files in the same changes.
- Replace generated artifacts and protocol fixtures.
- Remove manual cancellation, generation, and transport plumbing only where
  the new compiler contract makes it redundant.
- Run every sample in client, SSR, hydration, and applicable distributed modes.
- Add an external-library fixture that is built with ordinary TypeScript only,
  plus an adapter fixture that uses frame reservations without compiler
  transformation.

Exit gate: repository search finds no authored `this.task`, `this.action`,
`ActionContext`, component-action type, or direct generated continuation
knowledge outside compatibility fixtures and historical material.

### Phase 7: remove compatibility surfaces

- Remove `Component.task`, `Component.action`, legacy adapters, separate
  action runtime/compiler records, and action-only inspection events.
- If a behaviorally justified remote protocol version shipped, remove its old
  decoder after the independently announced protocol support window.
- Remove deprecated action-named low-level contract aliases after their source
  API support window; retain neutral operation contracts.
- Publish migration notes with before/after examples and explicit terminology
  exceptions for HTML, testing, and user interactions.

Exit gate: public package declarations and generated output expose only the
unified model, and package-size/startup measurements show that duplicate
machinery is gone.

### Later: motion proposal and package

Start `@exactjs/motion` only after task-frame renderer propagation, internal
producer scopes, and descendant settlement are stable. Its own proposal must
specify animation ownership, presence identity, list reconciliation, layout
measurement, SSR/hydration, reduced motion, router/view transitions,
accessibility, performance budgets, and DevTools presentation.

## Verification strategy

Protection should match the risk of each boundary:

- **Compiler contract tests:** semantic activation, effects, placement,
  capture/serialization, builder erasure, source maps, synthetic types, alias
  resolution, recursion, canonical dependency deduplication, `task.peek()`
  suppression, pure concurrency-key extraction, canonical policy normalization,
  and diagnostics.
- **Runtime invariant tests:** generation transitions, parallel/latest/queue,
  owner and key lane isolation, attached/detached settlement, cancellation
  direction, observed/unobserved error propagation, suppressed failures,
  failure/cancellation race precedence, producer-scope disposal, atomic child
  reservation, exactly-once foreground and descendant settlement, cleanup
  order, disposal, dynamic dependency replacement, failed-generation retry
  dependencies, stale-generation rejection, and component teardown.
- **Scheduling tests:** inherited and explicit priority, immediate-to-deferred
  result waits, priority/readiness donation and restoration, deferred
  structural children that do not remain visibly pending, starvation
  prevention, and cancellation cleanup.
- **Framework SPI tests:** compiler, DOM, forms, router, server, and motion-like
  consumers produce identical frame trees through run and reservation paths;
  opaque tokens cannot be fabricated or reused after settlement.
- **Compilerless library tests:** ordinary JavaScript and TypeScript builds can
  define, owner-bind, invoke, observe, cancel, key, queue, supersede, detach,
  clean up, and inspect local tasks without compiler transformation, including
  task-aware thenable chains, native `Promise` assimilation without brand
  dependence, attachment, and tracked reads after async suspension through
  explicit ABI calls.
- **Generated-ABI equivalence tests:** compiler conformance output and
  hand-authored JavaScript using the same versioned `defineTask()`,
  `bindTask()`, `invokeTask()`, continuation/read tracking, and callback
  reservation ABI produce equivalent frame trees, lanes, results, errors,
  readiness, priorities, cancellation, and cleanup.
- **Compilerless remote tests:** conditional exports exclude handlers from
  browser bundles; registered contracts dispatch through opaque capabilities;
  missing handlers, schema mismatches, unallowlisted contracts, forged
  capabilities, and incompatible versions fail closed.
- **Property/model tests:** random task trees compared with a small reference
  state machine for terminal settlement, late scheduling races, and
  exactly-once cleanup.
- **Renderer integration tests:** task-caused state changes through bindings,
  keyed ranges, portals, refs, blocking work, hydration, concurrent async
  continuations, and rapid reversal.
- **Security tests:** forged IDs, unauthorized calls, secret captures,
  malformed serialization, replay, CSRF, mixed builds, stale generations, and
  redacted inspection.
- **Forms/router tests:** duplicate submission, validation, optimistic
  rollback, redirects, navigation cancellation, foreground versus background
  pending behavior, revalidation, and native fallback.
- **Language-tool tests:** same-snapshot edits, semantic-token preservation,
  hover targeting, refactors, virtual synthetic members, and badge positions.
- **DevTools tests:** client-only operation, federated server frames,
  authorization/redaction, tree ordering, cancellation, and resource events.
- **Application tests:** representative end-to-end flows in every migrated
  sample rather than source-shape snapshots.
- **Performance tests:** component setup, facade allocations, hot direct calls,
  reactive invalidation, deep/broad trees, renderer token propagation,
  frame reservation/settlement, protocol payload, and inspection overhead.

Exact generated text should be snapshotted only where it is a public protocol
or artifact contract. Compiler tests should otherwise assert semantic
equivalence, placement, effects, ownership, and observable runtime behavior.

## Acceptance criteria

The proposal is complete only when:

1. ordinary declared, assigned, and expression functions cover every current
   task and action use case;
2. no separate public component action/task registration APIs remain;
3. compiler-visible calls attach automatically to the active frame, calls
   without an active frame create roots, and detachment is explicit;
4. body, argument, helper, prop, context, and derived reads infer canonical
   dependencies, while `task.peek()` excludes only the current task's
   dependency;
5. inferred cancellation and disposable ownership work without ceremonial
   context parameters;
6. optimistic state, forms, router work, and distributed execution preserve
   their current guarantees except for the explicitly documented split between
   foreground pending and structural settlement;
7. runtime-owned producer scopes and foreground/descendant-settlement signals
   include renderer consequences without late-child races or
   application-visible lifetime controls;
8. separately published framework packages coordinate through the opaque,
   versioned task-frame SPI without accessing mutable frame internals;
9. compilerless libraries can define local tasks with identical runtime
   semantics, and compilerless remote libraries can use explicit,
   schema-validated, allowlisted dual-sided contracts;
10. every compiler-generated task semantic is reproducible through a supported,
    versioned JavaScript ABI without private compiler-only runtime authority;
11. concurrency lanes are isolated by durable owner, stable definition, and
    optional key, and cross-root ownership is explicit and disposable;
12. awaited and chained child failures follow ordinary JavaScript while
    unobserved attached failures deterministically fail their structural
    parent without losing secondary errors;
13. immediate, normal, and deferred priority compose through inheritance,
    explicit override, result-wait donation, aging, and cancellation cleanup,
    while readiness and structural settlement remain independently observable;
14. synthetic task status lowers to an actual owner-bound facade and every
    status operation has a standard-TypeScript `taskStatus()` equivalent;
15. remote dispatch uses neutral opaque operation semantics and no protocol is
    versioned solely to rename an action as a task;
16. the compiler can erase builders and elide facades without observable
    semantic changes;
17. the native checker and editor fully understand synthetic task functions;
18. DevTools presents one authorized task tree in client-only and federated
    deployments;
19. every existing sample and public document uses the new model; and
20. `Presence` can retain and remove a stable child through internal frame
    settlement without requiring another public lifetime primitive.
