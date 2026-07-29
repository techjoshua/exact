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

| Delivery area         | Current state                                             | Proposed state                                                                  |
| --------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Reactive work         | Registered with `this.task(...)`                          | Inferred from ordinary inner functions and their activation sites               |
| Explicit invocation   | Registered with `this.action(...)`                        | An ordinary function invoked without a parent `TaskContext`                     |
| Placement and policy  | Fluent component factories and positional arguments       | A compiler-read default value on the final `TaskContext` parameter              |
| Cancellation          | Task/action contexts and inferred abort signals           | One `TaskContext.signal`, with the existing cancellable-call inference retained |
| Optimistic state      | `ActionContext.optimistic(...)` only                      | `TaskContext.optimistic(...)` for eligible invoked task generations             |
| Cleanup and ownership | Returned cleanup, inferred resources, component ownership | `task.cleanup(...)`, `task.own(...)`, and compiler-owned disposables            |
| Parent/child work     | Interaction settlement plus independent tasks/actions     | An inspectable structured task tree                                             |
| Server dispatch       | Generated action continuations using `type: "action"`     | Generated invoked-task operations; opaque identity and security remain          |
| DevTools              | Separate task and action views                            | One task tree with activation, placement, policy, ownership, and effects        |
| Motion/presence       | Not implemented                                           | A later package built on attached task descendants and `task.join()`            |

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

There are two call forms:

```ts
const result = await quoteProviderOnServer(id, request); // new invoked generation
const result = await quoteProviderOnServer(id, request, task); // attached child frame
```

Passing `task` does not merely forward an abort signal. It explicitly joins the
callee to the current structured lifetime. Omitting it activates an
independently scheduled generation of the callee's task definition. When that
invocation occurs inside another task, DevTools retains causal parentage, but
the invoked generation has its own policy, status, optimistic journal, and
settlement.

`TaskContext` is deliberately not promise-like. Authors await returned values
normally and use `await task.join()` only when they need an intermediate
barrier for all currently attached descendants.

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
- Make the task tree sufficient infrastructure for a later presence and motion
  package.
- Replace, rather than layer over, the duplicate task/action concepts in the
  compiler, runtime, language tools, protocol, and DevTools.

## Non-goals

- Making every JavaScript function globally inspectable or scheduled.
- Turning `TaskContext` into a Promise or requiring an `await` at every nesting
  level.
- Treating every reactive invalidation as an application “action.” An
  invalidation is a cause; the scheduled work it activates is a task
  generation.
- Inferring optimistic intent from arbitrary writes before an `await`.
- Making arbitrary functions remotely callable.
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
| Separate `ActionContext` and task `{ signal }` context                              | One `TaskContext` with signal, generation, activation, optimism, cleanup, ownership, and joining                                           |
| A task callback may return a cleanup function                                       | New tasks return data normally and register cleanup with `task.cleanup(...)`                                                               |
| Separate `ComponentAction` callable/status type                                     | Compiler-synthetic task-function status members when a facade is required                                                                  |
| Separate action and task runtime state machines                                     | One definition/generation/frame scheduler and ownership model                                                                              |
| Separate internal interaction settlement                                            | Interaction hosts create root task generations                                                                                             |
| `interactive` in some scheduling packages and `immediate` in proposed source syntax | One public `immediate` priority term, normalized internally                                                                                |
| Generated `type: "action"` requests and action manifests                            | Versioned invoked-task requests and task manifests, with a bounded compatibility decoder                                                   |
| Separate task/action compiler collectors and continuation kinds                     | Activation metadata on one task definition model                                                                                           |
| Separate DevTools action/task snapshots, queries, and panels                        | One authorized task tree                                                                                                                   |
| Raw TypeScript diagnostics treated as authoritative for component source            | `exactc` and the eXact language service own compiler-synthetic source semantics; TypeScript still validates public declarations and output |

Package consequences include:

- `@exactjs/core` removes component registration factories, merges context and
  status contracts, and exports the policy-builder marker.
- `@exactjs/compiler` and the native compiler replace action/task collectors,
  manifests, lowering, and diagnostics with the unified model.
- `@exactjs/server`, hydration, adapters, and microfrontend packages consume
  versioned invoked-task contracts while preserving all existing authority and
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

The implementation must keep four identities distinct:

1. A **function implementation** is authored JavaScript/TypeScript code. A
   capture-free implementation may be shared by every component instance.
2. A **task definition** is compiler metadata for one activation role of that
   function: policy, placement, effect summary, source location, and opaque
   operation identity.
3. A **task generation** is one independently scheduled activation with
   status, cancellation, optimistic journal, and result.
4. A **task frame** is one attached execution in a generation's structured
   tree. Passing a `TaskContext` creates a child frame; it does not create a
   second independently scheduled generation.

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
inside another function is an ordinary invoked or attached call according to
whether its final context argument is omitted or passed. This rule applies
only when the target is already task-classified by effects, placement,
capabilities, or a known host; ordinary pure setup helpers retain ordinary
JavaScript call semantics. The language service shows the inferred activation
at the call site and offers an explicit policy parameter when the inference is
not what the author intended.

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

	optimistic(work: () => void): void;
	cleanup(cleanup: () => void | Promise<void>): void;
	own<T extends Disposable | AsyncDisposable>(resource: T): T;
	join(): Promise<void>;
}

export interface TaskContextPolicy extends TaskContext {
	client(): TaskContextPolicy;
	server(): TaskContextPolicy;
	parallel(): TaskContextPolicy;
	latest(): TaskContextPolicy;
	queue(): TaskContextPolicy;
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

Policy defaults are:

| Facet                | Default                                                               |
| -------------------- | --------------------------------------------------------------------- |
| Placement            | Inferred                                                              |
| Invoked concurrency  | `parallel`                                                            |
| Reactive concurrency | Latest generation supersedes the prior generation                     |
| Priority             | `normal`                                                              |
| Readiness            | `nonblocking`                                                         |
| Attachment           | Attached when a context is passed; independently invoked when omitted |

`immediate` means eligible in the current interactive scheduling turn. It does
not guarantee synchronous completion or a paint. It replaces the current
cross-package ambiguity between “interactive” and “immediate.”

Concurrency facets apply to independently invoked generations. A reactive
activation always uses superseding generations; applying `parallel()` or
`queue()` to a purely reactive definition is a diagnostic. Readiness affects
only an activation with a renderer or server-readiness owner. `detached()`
allows work to outlive its causal parent, but it remains owned by the component
and is cancelled on component disposal.

Contradictory or repeated facets are compile errors:

```ts
// Error: a task cannot be both client- and server-placed.
task: TaskContext = TaskContext.client().server();
```

The parameter may be destructured when no child context must be forwarded:

```ts
async function load(url: string, { signal }: TaskContext = TaskContext.server().latest()) {
	return fetch(url, { signal });
}
```

Use a named `task` binding when calling attached children, registering
ownership, applying optimistic state, or joining descendants.

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
	const route = await resolveRouteOnServer(request, task);
	const quotes = await Promise.all(providers.map((id) => quoteProviderOnServer(id, request, task)));
	this.state.route = route;
	this.state.providers = quotes;
}
```

Calling `refresh(request)` creates a latest-wins invoked generation. Both
server calls receive its context and become attached child frames. The parent
does not settle until its returned promise and every attached descendant have
settled. An explicit `await task.join()` is needed only for an intermediate
barrier:

```ts
function publish(update: () => void, task: TaskContext) {
	update();
	return task.join(); // wait for reactive/renderer descendants caused so far
}
```

Passing a context through a synchronous helper does not require an `await`.
The runtime frame tracks descendants independently of the JavaScript call
stack.

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

Recognized task functions have a compiler-synthetic intersection type with the
existing stable status surface: `pending`, `pendingCount`, `generation`,
`result`, `error`, and `cancel()`. The native checker and language service must
provide completion, hover, rename, and diagnostics for these members.

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

1. its function has returned or thrown;
2. every attached child frame has settled;
3. renderer, router, form, and resource jobs attached to the frame have
   settled; and
4. required optimistic commit or rollback work has completed.

This automatic settlement is the reason callers do not have to await at every
layer. Awaiting a task's returned promise observes the whole attached subtree,
not only the immediate function promise.

### Cancellation, failure, and cleanup

- Cancellation travels from a generation to all attached descendants.
- Component disposal cancels every attached and detached generation it owns.
- An unhandled child failure rejects its nearest attached parent; handled
  failures remain handled by ordinary JavaScript.
- Cleanup runs child-first, then registration-last-in-first-out within a frame.
- Cleanup is awaited before terminal settlement.
- `latest` cancellation fences stale state, DOM, transport, and optimistic
  commits even when an external API ignores its signal.
- Detached failures are reported to the component error/inspection channel;
  they cannot become unhandled process rejections.

The runtime records both a structural parent and a causal origin. An omitted
context starts a new generation, so it is not structurally attached, but
DevTools can still answer “which interaction invoked this work?”

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

An attached child shares its generation's optimistic journal. An omitted-
context invocation owns a new journal. The current path/collection conflict
rules, rollback ordering, generation fences, staged server effects, and
parallel-overlay diagnostic remain. `optimistic()` is rejected in reactive,
initialization, lifecycle, and detached generations unless a later proposal
defines a sound commit authority for those activations.

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
6. classify captured inputs, state/context reads and writes, placement,
   resources, cancellation, serialization, and optimistic effects; and
7. diagnose unresolved escapes and incompatible multi-role policies.

Recursive task calls without a passed context create invoked generations and
therefore obey concurrency policy. Passing the current context performs
ordinary recursion within an attached frame. The compiler must preserve stack
and tail-call behavior; the task runtime must not flatten recursion into one
frame.

### 3. Parse and erase policy builders

The default builder is accepted only on the final `TaskContext` parameter.
The compiler canonicalizes the chain to policy metadata and removes it from
the lowered function signature. It also removes the framework-supplied context
argument at a remote serialization boundary and reconstructs a local context
on the destination.

The compiler emits diagnostics for dynamic builders, conditional chains,
aliases of the builder value, duplicate facets, unsupported facet/activation
combinations, and attempts to transmit `TaskContext`.

### 4. Preserve ordinary JavaScript and optimize safely

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

### 5. Unify continuation and artifact generation

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

The recent typed action-result and stub work becomes typed invoked-task result
generation.

### 6. Extend the native checker

The checker must understand:

- synthetic task-function status members;
- omitted versus explicit compiler-supplied final context arguments;
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
- `TaskGenerationRuntime`;
- `TaskFrameRuntime`;
- one callable facade/status implementation;
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

### Reactive runtime and DOM renderer

Reactive invalidation itself is recorded as a causal edge. Any derived
computation, binding, reconciliation job, ref callback, portal update,
blocking candidate, or mount/remove lifecycle scheduled as a consequence of a
task frame inherits that frame unless explicitly detached.

This is required for `task.join()` to mean “the visible consequences of work
started so far are settled,” rather than merely “some promises resolved.”
The renderer must propagate a small frame token through its scheduler and
settle the corresponding child job after commit. It must not retain a whole
`TaskContext` in every reactive node.

The existing precise dependency graph remains. A state change does not create
an application task by itself; it schedules the already-classified reactive
definitions and renderer jobs that consume the changed path.

### Forms and router

Known event and form callbacks create interaction-activated root generations.
Pending UI, duplicate-submit suppression, external errors, focus behavior,
and native-form fallback remain package-owned. Their settlement source changes
from the separate interaction object to the task subtree.

Router navigation, fetch, submit, redirect, and revalidation join the current
task frame when initiated synchronously from it. A standalone navigation
creates its own interaction generation. Latest-wins navigation and stale
response fencing remain.

`InteractionHandler` may remain as a contextual host type because it describes
why a callback runs, not a second runtime resource. Any public action-specific
handler or status types are renamed to task equivalents.

### Server, hydration, and protocol

The wire protocol intentionally changes from an action operation to an invoked
task operation:

```ts
type InvokedTaskRequest = {
	type: 'task';
	activation: 'invoked';
	operation: OpaqueOperationId;
	generation: number;
	args: SerializedValue[];
	// existing build, scope, CSRF, authorization, and tracing fields
};
```

Generated manifests expose invoked-task contracts, not authored function names.
Low-level `defineExactActionContract`-style APIs are renamed to invoked-task
contracts where they remain necessary. Application authors still do not
construct requests or acquire an eXact client directly.

This requires a protocol-version bump. During one release window, servers may
decode the previous `type: "action"` request for rolling deployment, mapping it
to an invoked task internally. New clients emit only the new format. The
compatibility decoder is removed after the documented window. Mixed-build,
allowlist, authorization, CSRF, serialization, redaction, cancellation, replay,
and stale-generation adversarial tests must pass before removal.

SSR and hydration serialize task definitions and resumable generation
metadata using compiler-owned identities. They never serialize `TaskContext`,
cleanup callbacks, resources, or generated continuation names.

## Developer tooling

### Language server and VS Code

The compiler-aware language service must replace separate task/action
classification with task definition, activation, and frame information.

It must provide:

- completion and hover for synthetic task status members;
- policy-builder completion, validation, and quick fixes;
- “Convert `this.task`/`this.action` to function-defined task” refactors;
- call-site hints distinguishing new invocation from attached child;
- placement, priority, concurrency, readiness, activation, dependencies,
  captured values, resources, cleanup, and optimistic information;
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

Each node shows definition, activation, policy, generation, parent, causal
origin, placement, status, duration, dependencies, writes, transport,
optimistic journal, resources, cancellation reason, and error. Timeline events
include queue, start, frame enter/exit, remote dispatch/return, optimistic
apply/commit/rollback, resource acquire/release, renderer commit, cancel, and
settle.

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
		const request = normalizeDraft(this.state.draft);
		const route = resolveRouteOnServer(request, task);
		const quotes = initial.configuredProviders.map((id) =>
			quoteProviderOnServer(id, request, task)
		);
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
Calling `refreshRates(...)` later from inside another function remains an
ordinary invoked generation unless that caller passes its `TaskContext`.

The refresh code passes `task`, so every quote and route request is attached.
Manual generation comparisons can then be removed: latest cancellation and
commit fencing are runtime guarantees. The component never imports a
transport client or names a continuation.

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

The form creates an interaction root; `saveProfile(...)` intentionally omits
the context and therefore creates its own latest-wins invoked generation with
causal linkage. A framework host may instead pass its context when the desired
contract is one attached lifetime.

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

| Area                          | Required change                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Shipping calculator           | Replace server actions and reactive tasks; remove manual generation fences made redundant by attached latest generations |
| Kanban                        | Replace persistence registration with a reactive activation                                                              |
| Server-components sample      | Replace server setup task registrations and verify SSR/hydration                                                         |
| Sudoku                        | Migrate timers, generation, persistence, and worker/server work; verify disposal and cancellation                        |
| Workbench/compiler demos      | Show inferred, explicit-policy, attached, detached, optimistic, and server examples                                      |
| Docs application              | Replace every `this.task`/`this.action` example and add a task-tree guide                                                |
| Core/compiler fixtures        | Recast task/action fixtures around definitions, activations, frames, and protocol v2                                     |
| Forms/router samples          | Preserve pending, duplicate suppression, redirects, and navigation joining                                               |
| Microfrontend/server samples  | Regenerate invoked-task contracts and verify scope/authorization boundaries                                              |
| Chrome and VS Code extensions | Remove action-only UI and consume the unified inspection schema                                                          |

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
2. opens an attached motion task frame;
3. asks registered descendant motion participants to leave;
4. awaits the motion subtree with `task.join()`;
5. cancels stale leave work if presence returns; and
6. stops rendering only after the subtree settles.

`Motion` registers a participant through ordinary component context.
Animations, observers, and frame callbacks are owned resources; an animation
wrapper can implement `AsyncDisposable`. Cancellation, reduced motion,
component disposal, and rapid enter/leave reversal therefore use task
semantics rather than a second transition token.

An internal helper can express the renderer boundary:

```ts
async function commitDomUpdate(
	update: () => void,
	task: TaskContext = TaskContext.client().immediate()
) {
	const value = update();
	await task.join();
	return value;
}
```

This works only if renderer consequences inherit the active frame as required
above. No public DOM-commit token is needed.

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
  facet, context-passing form, recursion form, resource outcome, and placement
  boundary.
- Add protocol fixtures for old action and new invoked-task requests.
- Record current action/task/form/router behavior as black-box compatibility
  tests.
- Benchmark current allocations, setup time, task/action invocation, reactive
  rerun, server dispatch, and DevTools snapshot cost.

Exit gate: examples in this proposal have an unambiguous parse and every
retained current guarantee has a named regression test.

### Phase 1: unified internal runtime behind existing APIs

- Implement definitions, generations, frames, common status, scheduling,
  concurrency, cancellation, cleanup, and inspection internally.
- Adapt current `this.task` and `this.action` registrations onto it.
- Replace interaction settlement internals with task roots while preserving
  public behavior.
- Attach forms and router jobs to frames.
- Keep existing compiler output and protocol unchanged.

Exit gate: the existing suite passes unchanged and the new tree tests prove
child-first cancellation/cleanup, error propagation, detached ownership, and
automatic settlement.

### Phase 2: compiler function discovery and `TaskContext`

- Implement candidate discovery, alias/call graph analysis, activation
  definitions, builder parsing, capability validation, synthetic types, and
  source maps.
- Lower local client-only tasks first.
- Preserve inferred signal/resource behavior.
- Implement direct-call lowering, safe hoisting, and facade elision.
- Add migration diagnostics and code actions for legacy registrations.

Exit gate: client-only examples compile without wrappers, raw authored syntax
is highlighted normally, and benchmarks remain within agreed budgets.

### Phase 3: structured renderer consequences

- Propagate frame tokens through reactive scheduling and DOM commit.
- Attach bindings, reconciliation, refs, portals, blocking work, and lifecycle
  consequences.
- Implement `join()` barriers and commit/cancel fencing.
- Add stress tests for rapid invalidation, keyed removal, portals, Suspense,
  Activity, and component disposal.

Exit gate: awaiting a subtree deterministically observes visible DOM effects
without leaking frames or delaying unrelated work.

### Phase 4: invoked server tasks and optimism

- Generalize continuation compilation from action to invoked-task activation.
- Emit new typed stubs and manifests.
- Add the versioned protocol and rolling-deployment decoder.
- Move optimistic journals, concurrency, argument/results, authorization, and
  generation fencing to unified definitions.
- Verify no authored source imports a transport client or generated operation
  identifier.

Exit gate: all security/adversarial suites and distributed action guarantees
pass under invoked tasks.

### Phase 5: language tools and DevTools

- Ship synthetic function typing, policy completion, semantic classification,
  hover, code actions, and snapshot-consistent updates.
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

Exit gate: repository search finds no authored `this.task`, `this.action`,
`ActionContext`, component-action type, or direct generated continuation
knowledge outside compatibility fixtures and historical material.

### Phase 7: remove compatibility surfaces

- Remove `Component.task`, `Component.action`, legacy adapters, separate
  action runtime/compiler records, and action-only inspection events.
- Remove the old protocol decoder after its announced support window.
- Rename or retire action-specific low-level contracts.
- Publish migration notes with before/after examples and explicit terminology
  exceptions for HTML, testing, and user interactions.

Exit gate: public package declarations and generated output expose only the
unified model, and package-size/startup measurements show that duplicate
machinery is gone.

### Later: motion proposal and package

Start `@exactjs/motion` only after task-frame renderer propagation and
`task.join()` are stable. Its own proposal must specify animation ownership,
presence identity, list reconciliation, layout measurement, SSR/hydration,
reduced motion, router/view transitions, accessibility, performance budgets,
and DevTools presentation.

## Verification strategy

Protection should match the risk of each boundary:

- **Compiler contract tests:** semantic activation, effects, placement,
  capture/serialization, builder erasure, source maps, synthetic types, alias
  resolution, recursion, and diagnostics.
- **Runtime invariant tests:** generation transitions, parallel/latest/queue,
  attached/detached settlement, cancellation direction, error propagation,
  cleanup order, disposal, and component teardown.
- **Property/model tests:** random task trees compared with a small reference
  state machine for terminal settlement and exactly-once cleanup.
- **Renderer integration tests:** task-caused state changes through bindings,
  keyed ranges, portals, refs, blocking work, hydration, and rapid reversal.
- **Security tests:** forged IDs, unauthorized calls, secret captures,
  malformed serialization, replay, CSRF, mixed builds, stale generations, and
  redacted inspection.
- **Forms/router tests:** duplicate submission, validation, optimistic
  rollback, redirects, navigation cancellation, revalidation, and native
  fallback.
- **Language-tool tests:** same-snapshot edits, semantic-token preservation,
  hover targeting, refactors, virtual synthetic members, and badge positions.
- **DevTools tests:** client-only operation, federated server frames,
  authorization/redaction, tree ordering, cancellation, and resource events.
- **Application tests:** representative end-to-end flows in every migrated
  sample rather than source-shape snapshots.
- **Performance tests:** component setup, facade allocations, hot direct calls,
  reactive invalidation, deep/broad trees, renderer token propagation,
  protocol payload, and inspection overhead.

Exact generated text should be snapshotted only where it is a public protocol
or artifact contract. Compiler tests should otherwise assert semantic
equivalence, placement, effects, ownership, and observable runtime behavior.

## Acceptance criteria

The proposal is complete only when:

1. ordinary declared, assigned, and expression functions cover every current
   task and action use case;
2. no separate public component action/task registration APIs remain;
3. passing a context creates a deterministic attached child frame, while
   omitting it creates a policy-governed invoked generation;
4. inferred cancellation and disposable ownership work without ceremonial
   context parameters;
5. optimistic state, forms, router work, and distributed execution preserve
   their current guarantees;
6. `task.join()` includes renderer consequences and cannot hang on unrelated
   work;
7. the compiler can erase builders and elide facades without observable
   semantic changes;
8. the native checker and editor fully understand synthetic task functions;
9. DevTools presents one authorized task tree in client-only and federated
   deployments;
10. every existing sample and public document uses the new model; and
11. `Presence` can retain and remove a stable child by awaiting descendant task
    frames without requiring another public lifetime primitive.
