# Scheduling, suspension, and Activity implementation plan

## Status

Implemented in the framework runtime, compiler, DOM renderer, SSR/hydration
pipeline, and React compatibility layer. The phase descriptions below preserve
the design rationale and acceptance criteria.

The first compiler-supported async component form deliberately accepts one
direct state assignment from one awaited `this.task()` call, followed by the
component's render-function return. The compiler rejects additional setup
statements, multiple awaited task assignments, and arbitrary setup `await`
expressions instead of emitting ambiguous restart or ordering semantics. Those
forms can be expressed with explicit owned tasks today; broader sequential
continuations require a separately specified state-machine extension.

## Objective

Add cooperative scheduling, compiler-supported async component suspension,
detached mounted ranges, and native Activity boundaries without replacing
eXact's setup-once, fine-grained reactive model with a rerender scheduler.

Use the same low-level facilities to make React compatibility substantially
more faithful:

- React transitions and deferred values receive real lower-priority work;
- React Suspense can distinguish urgent fallback replacement from a transition
  that preserves already revealed content;
- React Activity preserves component and DOM state while hidden, cleans up
  effects, and prepares hidden work at lower priority;
- streaming SSR can reveal individual Suspense boundaries rather than replacing
  the entire root.

Native eXact and React compatibility share mechanisms, not source semantics.
React-owned components continue to observe React's render, Hook, effect, and
boundary contracts. Native eXact components continue to use inspectable state,
compiler-detected dependencies, and precise reactive work.

## Existing foundation

The implementation should extend these existing capabilities rather than
introduce parallel systems:

- `@exactjs/reactive` has one microtask scheduler that settles computations
  before reactions and deduplicates queued work.
- component tasks already own generations, cancellation, prior-settlement
  barriers, cleanup, and stale-result protection;
- `ComponentTask` already exposes `task`, `task.client`, and `task.server`
  callable registrations;
- `SuspensionContext` already lets a descendant render report a promise to an
  ancestor;
- the DOM renderer represents component, fragment, dynamic, and keyed-item
  output as marker-delimited mounted ranges;
- `mountedDomNodes()` and `placeMountedBefore()` already identify and move a
  complete mounted subtree;
- effect scopes can be stopped or transferred between parents;
- domain replacement temporarily parks foreign component mounts so they survive
  an owning-domain replacement;
- React compatibility already recognizes `Suspense`, `Activity`, `lazy`,
  `use`, `startTransition`, `useTransition`, and `useDeferredValue`;
- SSR observes component tasks and can emit an early shell followed by an
  authoritative root replacement;
- hydration can apply validated server patches to owned roots.

The current facilities are not yet sufficient:

- scheduler work has no priority;
- suspension replaces rendered output with `null`, so an update can dispose
  previously committed children;
- React Suspense tracks only a count of promises and uses an ordinary
  conditional to switch between children and fallback;
- React Activity omits hidden children instead of preserving their mounted
  state;
- effect scopes cannot pause and later resume;
- React Hook renders commit their working slots before a renderer-level
  candidate tree has committed;
- SSR cannot identify and reveal an individual readiness boundary.

## Design decisions

### Scheduling is work ordering, not component rerendering

The scheduler operates on work eXact already knows how to isolate:

- reactive computations and reactions;
- component task generations;
- distributed continuation dispatch and response application;
- React compatibility render attempts;
- mounted-range preparation and commits;
- bounded list, hydration, and patch work.

It does not interrupt arbitrary TypeScript, rerun native component setup, or
introduce a virtual-DOM frame loop.

### Suspension is readiness for a generation

A native boundary waits only for blocking work registered for its current
candidate generation. It does not wait for every descendant task to become
globally idle. Polling, subscriptions, and ordinary owned tasks therefore do
not prevent a boundary from revealing.

An awaited task in a compiler-lowered async component is blocking by default:

```tsx
async function ShippingOptions(this: Component<State>) {
	this.state.options = await this.task(() => getOptions(this.state.destination));

	return () => <Options options={this.state.options} />;
}
```

The compiler detects `this.state.destination` as an input, treats the
`this.state.options` assignment as an effect, infers client/server placement,
and lowers the async function into a synchronously constructed component
instance plus a generated continuation.

The awaited assignment is lowered into the existing task callback model rather
than awaiting an opaque task-registration result at runtime. Conceptually:

```ts
this.task(
	this.reactive(() => this.state.destination),
	async (destination, { signal }) => {
		const options = await taskAwait(signal, getOptions(destination));
		throwIfTaskAborted(signal);
		this.state.options = options;
	}
);
```

The actual emitted form may combine the temporary and assignment, but the
assignment remains inside the task generation that already owns and wires the
abort signal. Existing task resource and callable analysis continues to pass or
combine that signal for recognized operations. The additional post-`await`
check closes the interval between promise settlement and resumption of the
async continuation, ensuring a generation aborted in that interval cannot
perform its following assignment or effects.

Application values remain in `this.state`. Generated private state is limited
to continuation position, generation identity, cancellation, and temporary
values that have not been assigned to application state.

### State written by a suspended generation is staged

Writes performed by a suspended async component generation are staged:

- committed UI and external state inspection continue to see committed state;
- successful boundary commit publishes state and DOM atomically;
- cancellation, supersession, or failure discards staged writes;
- protocol responses are validated before entering the overlay.

The initial direct-assignment lowering has no statements after its awaited
assignment, so it does not require staged reads. Supporting multiple sequential
awaits would require a generation-local read overlay before that syntax can be
accepted safely.

### Awaiting and scheduling remain independent

`await` makes a task value-bearing and blocks the current async continuation.
Task facets describe execution policy:

```ts
await this.task(() => work()); // inferred placement, normal
await this.task.deferred(() => work()); // inferred placement, deferred
await this.task.server(() => work()); // asserted server placement
await this.task.server.deferred(() => work()); // server and deferred
```

An awaited deferred task still blocks its component continuation. Deferral
changes when work runs, not whether the continuation requires its result.

Unawaited tasks remain owned effects. `task.blocking()` allows an unawaited task
generation to participate in the nearest readiness boundary when that is
deliberately required.

### Activity is retention, not readiness

Suspense decides when a candidate is ready to commit. Activity decides what
happens to an already created subtree while it is inactive. Async components
automatically participate in suspension; they do not automatically become
Activity boundaries.

Native eXact Activity uses detached DOM ranges. React Activity uses the same
retained-mount and scheduling infrastructure but applies React-specific
visibility and effect behavior.

### Committed and candidate trees are explicit

A readiness boundary owns:

- a committed mounted range;
- at most one current candidate generation;
- an optional fallback range;
- blocking tokens for the candidate;
- a generation fence and cancellation scope;
- the priority and presentation policy of the update that created it.

Preparing a candidate must not mutate or dispose the committed range. Committing
is one ordered operation:

1. validate that the candidate generation is still current;
2. publish staged state;
3. place the candidate range;
4. activate candidate lifecycle/effects;
5. detach or dispose the superseded committed/fallback range;
6. publish settlement to parent boundaries and transition owners.

## Public native API

The initial API should remain small:

```tsx
import { Activity, Suspense } from '@exactjs/core';

<Suspense fallback={<Loading />}>
	<ShippingOptions />
</Suspense>

<Activity mode={this.state.showEditor ? 'active' : 'parked'}>
	<Editor />
</Activity>
```

Native Activity modes:

- `active`: connected and scheduled normally;
- `parked`: detached, state retained, owned reactive work and tasks paused;
- `background`: detached and retained, with permitted preparation scheduled at
  deferred priority.

Task facets:

- `task.client` and `task.server` continue to assert placement;
- `task.deferred` requests deferred scheduling;
- `task.blocking` makes an unawaited generation block readiness;
- composed forms such as `task.server.deferred` and
  `task.server.blocking` are supported through one normalized task policy.

The compiler should infer placement and normal scheduling by default. Facets
are assertions or deliberate policy, not required ceremony.

Native Suspense presentation:

- first mount shows `fallback` until the candidate is ready;
- an update retains already committed content while a new generation prepares;
- nested boundaries reveal independently;
- a fallback that blocks delegates readiness to its nearest parent boundary;
- changing a boundary key resets its committed generation.

This update behavior is intentionally eXact-native. React's urgent-update
fallback behavior is supplied by the compatibility adapter.

## Internal contracts

### Work priority

Add an internal priority contract to `@exactjs/reactive`:

```ts
type WorkPriority = 'interactive' | 'normal' | 'deferred';
```

Required operations:

- run a synchronous scope with a priority;
- capture and restore priority around compiler-generated continuations;
- queue a computation or reaction at a priority;
- promote already queued work when a more urgent invalidation arrives;
- flush through a requested priority;
- explicitly flush all work for SSR, tests, and compatibility `act`;
- observe pending and settled transition groups.

Queue invariants:

- computations settle before reactions within each priority;
- interactive work is drained before normal work;
- deferred work is starvation-safe;
- a reaction appears at most once at its highest pending priority;
- stale generations can be removed without running;
- errors retain their owning effect-scope routing;
- the existing runaway-settlement protection applies across lanes.

Interactive and normal work remain microtask-driven. Deferred work should use a
host abstraction so browsers can use a yielding task source while Node, Bun,
SSR, and tests remain deterministic. Do not require an experimental browser
API; `scheduler.postTask` may be an optional optimization behind the host
contract.

### Priority propagation

Priority originates from:

- DOM events: interactive;
- ordinary reactive writes: current priority or normal;
- `task.deferred`: deferred;
- server continuation dispatch: starts after the current interactive
  transaction, without an idle delay;
- server response application: deferred unless a blocking boundary is waiting
  for it;
- React `startTransition` and `useTransition`: deferred transition group;
- React `useDeferredValue`: deferred, superseding value publication;
- hidden React Activity preparation: deferred.

The compiler must restore captured priority when an emitted async continuation
resumes. Runtime-only React code must carry priority through its explicit
transition and promise bookkeeping.

### Readiness scope

Replace the promise-count-only suspension model with an internal readiness
scope:

```ts
type ReadinessContextValue = {
	readonly boundary: ReadinessBoundary;
	readonly candidateGeneration: number;
	register(work: BlockingWork): ReadinessRegistration;
};

type BlockingWork = {
	readonly owner: ComponentInstance<Record<string, unknown>>;
	readonly taskGeneration: number;
	readonly settlement: PromiseLike<unknown>;
};

type ReadinessToken = {
	readonly generation: number;
	readonly settlement: PromiseLike<unknown>;
	cancel(reason?: unknown): void;
};
```

The exact shape can differ, but the contract must support:

- registration against the nearest boundary;
- idempotent settlement;
- generation supersession;
- cancellation;
- parent-boundary delegation;
- error ownership;
- transition-group settlement;
- SSR boundary identity.

Each Suspense boundary establishes a generation-bound readiness context before
its candidate descendants are constructed. Logical component descendants
inherit it through ordinary component context propagation. Host elements do
not interrupt that ancestry, and portals retain the context of their logical
owner rather than the context of their physical DOM target.

Potential descendants are not enumerated by the compiler. Work registers
dynamically when a blocking generation is created. The compiler identifies
awaited or explicitly blocking task work and emits its normalized task policy;
the task runtime uses the owning `ComponentInstance` to find the nearest
readiness context and register the generation. This keeps generated source
small and also supports blocking work that the native compiler did not create.

Registration is bound to both the boundary candidate generation and the task
generation. A stale task settlement therefore cannot reveal a superseded
candidate. Disposing the owner, cancelling the task, or discarding the
candidate cancels its registration idempotently.

Keep `SuspensionContext` as a compatibility adapter for thrown thenables.
React `lazy`, React 19 `use`, and other uncompiled React-owned code register
their thenables through the same readiness coordinator rather than maintaining
a separate promise-count boundary.

### Nested readiness contexts

A nested Suspense boundary replaces the inherited readiness context for its
candidate descendants. It does not forward every descendant promise to its
parent. Once the nested boundary can commit either its completed content or its
own fallback, it is ready from the parent's perspective. This permits nested
progressive reveal.

Fallback content must be constructed beneath the boundary's parent readiness
context, not its own candidate context. If a fallback itself blocks, it
therefore activates the nearest parent Suspense boundary instead of creating a
self-dependency.

A root readiness coordinator supplies deterministic behavior when an async
component has no authored Suspense ancestor. Client roots retain their current
committed output during an update; SSR roots use their shell and stream policy.

### Activity readiness gate

Activity boundaries gate readiness as well as effects:

- active Activity lets blocking descendants register with the nearest visible
  Suspense boundary;
- parked Activity pauses or cancels its blocking generations and does not keep
  a visible ancestor pending;
- background Activity tracks deferred preparation in a private readiness scope
  without activating a visible ancestor's fallback;
- when Activity becomes active while its preparation remains pending, it
  registers one aggregate readiness token with the visible ancestor.

This prevents invisible preloading from changing visible Suspense presentation
while still allowing activation to wait for required content.

### Effect-scope suspension

Extend effect-scope state from a single active boolean to an explicit lifecycle:

```ts
type EffectScopeStatus = 'active' | 'paused' | 'stopped';
```

Pause/resume invariants:

- stop remains terminal;
- pausing is recursive and idempotent;
- invalidations received while paused are recorded but not executed;
- resume schedules each dirty reaction once at its current priority;
- new owned work cannot accidentally escape into an active parent;
- cleanup registered for final disposal is not run merely because a scope is
  paused;
- task policy decides whether an active generation is aborted, paused, or
  permitted to continue in background mode.

Native `onUnmount` does not run when an Activity parks. Add optional
`onActivate` and `onDeactivate` lifecycle registrations once the range
foundation is stable.

### Mounted range

Introduce a renderer-owned `MountedRange` operation rather than adding parking
flags throughout patching:

- enumerate a mount's physical nodes in document order;
- detach the range into an owned `DocumentFragment`;
- reinsert it before a validated cursor;
- retain logical parent, component ownership, refs, delegated events, portals,
  and marker boundaries;
- activate, pause, or dispose its effect/task scope exactly once;
- prepare a candidate without publishing mount lifecycle;
- commit or discard a candidate transactionally.

Portals require separate handling: their logical boundary is retained with the
range, while physical portal children use a visibility policy appropriate to
the boundary. A parked native Activity should park portal output too unless a
future explicit policy says otherwise.

The existing cross-domain replacement parking remains a short-lived ownership
transfer. It should be refactored to use the shared range operations where
possible, but must not acquire Activity pause semantics.

## Compiler work

### Task policy normalization

Extend task analysis and emission with one normalized policy:

```ts
type TaskPolicy = {
	placement: 'inferred' | 'client' | 'server';
	priority: 'normal' | 'deferred';
	readiness: 'blocking' | 'nonblocking';
	result: 'ignored' | 'awaited';
};
```

The compiler must:

- recognize valid callable facet chains;
- reject contradictory or repeated facets;
- preserve existing unawaited task behavior;
- identify `await this.task(...)` as value-bearing;
- mark awaited and explicitly blocking generations for runtime readiness
  registration without emitting authored context lookup ceremony;
- lower the expression consuming an awaited task result into the owned task
  callback so its assignment and subsequent continuation remain inside the
  task generation;
- emit a task-generation abort check immediately after each compiler-managed
  `await` before allowing following assignments or effects;
- include policy in distributed continuation emission without exposing
  generated operation identifiers;
- keep compiler-detected reads as dependencies and writes as effects;
- retain locality, serialization, shared-value, context, and secret-policy
  checks.

### Async component lowering

Accept an async component in authored source, but emit a synchronous runtime
component factory. Lower it into:

- a durable component instance;
- an activation generation;
- compiler-detected dependency subscriptions;
- awaited task continuations;
- state-overlay reads and writes;
- a readiness registration;
- cancellation and stale-generation fences;
- a render slot that becomes a candidate only when setup has produced the
  render function.

Important diagnostics:

- awaiting arbitrary work outside a compiler-owned task when it cannot be
  assigned deterministic ownership or restart semantics;
- crossing client/server boundaries with non-serializable or server-local
  closure values;
- assigning secret-qualified values to shared state;
- using an async component where compilation is disabled;
- side effects before an await that would be repeated after a reactive
  generation restart and are not owned by a task.

Initially require asynchronous work that can restart to occur through
`this.task()`. Broader arbitrary `await` support can follow only when its
ownership and restart semantics are defined.

### Suspense and Activity JSX

Represent native boundaries as compiler-recognized intrinsic VNodes with stable
boundary IDs. Do not lower them to ordinary components whose conditional output
would dispose the inactive branch.

The emitted ID must be stable across server/client compilation and usable by
hydration and stream patches without becoming an authored protocol identifier.

## DOM implementation

### Range foundation

First extract and test range operations from current placement and teardown
behavior. No public feature should land until these operations prove:

- contiguous fragments and components move without recreation;
- text, keyed items, raw HTML, and nested markers retain ordering;
- refs remain fulfilled while natively parked and clear only on disposal;
- delegated and direct event handlers do not duplicate;
- form values, selection, scroll positions, and focus identity survive a
  park/unpark cycle where browser behavior permits;
- nested roots and component domains retain ownership;
- portal children follow the boundary policy;
- cleanup occurs exactly once after any failed preparation or final disposal.

### Native Activity

Implement native Activity as a mounted-range controller:

- `active -> parked`: deactivate lifecycle, apply task policy, pause scope, and
  move physical output into a fragment;
- `parked -> active`: restore the range, resume scope, publish dirty work, and
  activate lifecycle;
- `active -> background`: detach, deactivate visible lifecycle, and schedule
  allowed work as deferred;
- `background -> active`: promote required pending work and restore when ready;
- disposal from any mode: stop scopes, clear refs/ownership, dispose portals,
  and release the fragment once.

Nested Activity boundaries inherit the least-active effective mode while
retaining their authored mode for restoration.

### Native Suspense

Implement a renderer boundary with committed, fallback, and candidate ranges.
Mount and update work must be split into prepare and commit phases so a
suspended render cannot dispose committed children.

The renderer must install the candidate's readiness context before constructing
any descendant component instance. Nested boundaries install a new context for
their candidate content and use the inherited parent context for fallback
content.

For a blocking task that completes without changing rendered output, publish
its staged state without unnecessary DOM operations. Existing equality checks
remain authoritative.

## React compatibility

React compatibility must use the shared scheduler and range controller through
an internal adapter contract. It must not expose native eXact Activity modes or
task APIs to React-owned source.

### React Suspense

Implement the observable React contract:

- thrown thenables from `lazy` and `use` activate the closest boundary;
- thrown thenables register through the owning React adapter's inherited
  readiness context;
- all descendants in one boundary reveal together;
- nested boundaries reveal independently;
- a first mount that suspends does not preserve uncommitted React Hook or class
  state and retries from scratch;
- an urgent update that suspends shows the fallback;
- a transition/deferred update that suspends retains already revealed content;
- when revealed content is hidden, layout effects are cleaned up and recreated
  when it becomes visible again;
- a fallback that suspends activates the parent boundary;
- rejection follows React error-boundary routing;
- a key change resets the boundary;
- stale thenable settlement cannot commit an obsolete render.

`HookHost` needs a two-phase render contract:

- prepare working Hook slots without replacing committed slots;
- commit prepared slots only after the candidate DOM commits;
- discard prepared slots when a render suspends, errors, or is superseded;
- run insertion, layout, passive, ref, and external-store effects at the
  correct compatibility commit/deactivation points.

Class adapters need an equivalent prepared snapshot so lifecycle callbacks and
`setState` callbacks do not run for discarded candidates.

### React transitions

Replace the current pending-boolean approximation:

- `startTransition` enters a deferred transition group;
- Hook and class invalidations record that group and priority;
- synchronous writes in the callback inherit the group;
- compatibility-owned awaited actions retain the group across their known
  promise;
- `useTransition().isPending` remains true until the group's candidate work and
  blocking boundaries settle or are superseded;
- a newer urgent update may preempt or invalidate a transition candidate;
- controlled text-input updates remain interactive even if called from a
  transition, matching React's restriction.

This does not require a Fiber lane graph. It requires observable transition
group ownership, deferred renderer attempts, and discardable candidates.

`useDeferredValue` should publish the latest superseding value in the deferred
lane, retain the previous committed value while its consumer suspends, and
integrate with boundary settlement instead of relying on an unconditional
microtask.

### React Activity

React 19 Activity accepts `visible` and `hidden`. Its adapter must preserve
React component/Hook state and ephemeral DOM state while hidden, render hidden
updates at deferred priority, and disconnect effects and external
subscriptions.

React's DOM visibility behavior is not required to match native eXact's
detached-fragment policy. The shared mounted-range controller must support a
React visibility strategy that reproduces React's observable host behavior,
including mixed element/text ranges. On hide:

- retain Hook slots, class instances, DOM nodes, and form state;
- clean up insertion, layout, and passive effects as React requires;
- unsubscribe external stores where React does;
- suppress effect commits from hidden renders;
- prepare first-hidden renders at deferred priority;
- recreate effects when visible.

Do not guess class lifecycle, ref, portal, media, focus, or text-only behavior.
Add React 19 oracle scenarios first and implement to their observable traces.
React 18 has no public Activity export and must retain its existing API
disposition.

### Genuine secondary React renderers

Packages using genuine `react-reconciler` keep their own scheduler, Fiber
boundaries, and Activity implementation. eXact priority state must be installed
only while the eXact compatibility dispatcher owns the render and restored in
`finally`. Do not mutate or emulate private lane fields in the bounded owner
frame used by context bridges.

## SSR and hydration

### Boundary streaming

Extend the native stream protocol with stable boundary events:

- shell output contains fallback or committed boundary markup and boundary
  anchors;
- each settled boundary emits a generation-fenced replacement;
- nested reveals cannot target a boundary invalidated by an ancestor
  replacement;
- hydration metadata records committed boundary generations and staged shared
  state;
- abort and deadline behavior disposes candidates and request-owned work.

Readiness context objects are runtime-local and must never cross the
client/server protocol. For a client-initiated server task, the client
registers the whole exchange promise with its local boundary before dispatch.
The request carries only generated continuation inputs, and the response
settles that local promise. During SSR, the server constructs its own local
coordinators. Only stable boundary and generation identifiers needed for
streaming and hydration are serialized.

Keep the existing root replacement event as a compatibility fallback during
migration. Remove it from ordinary settled-boundary paths only after mixed old
and new client/server version handling is defined.

React-compatible streams should translate React Suspense behavior onto this
transport while continuing to emit React-compatible HTML. Selective hydration
and event replay are separate follow-up capabilities; boundary streaming must
not claim them implicitly.

### Activity on the server

Native parked Activity emits only its stable anchors and serializable retained
state required by the client contract. Server-only values remain server-only.
Background initial preparation may execute on the server, but hidden DOM is not
inserted into the document.

React Activity SSR output must be established by React 19 differential fixtures
rather than inferred from native behavior.

## Delivery phases

### Phase 0: contract and oracle fixtures

- Add machine-readable native behavior scenarios for priority, readiness, and
  Activity.
- Cover context inheritance through ordinary descendants and portals, nested
  boundary aggregation, suspending fallbacks, stale generations, owner
  disposal, and Activity readiness gating.
- Extend the real React 19 differential harness with Suspense transitions,
  Activity visibility, effects, refs, forms, portals, text-only output,
  classes, errors, and SSR.
- Record existing eXact behavior before mutation.

Exit criteria: proposed observable contracts are represented by tests, and
unknown React behavior is identified rather than silently approximated.

### Phase 1: priority scheduler

- Add priority context, lane queues, promotion, starvation prevention, and
  deterministic flushing to `@exactjs/reactive`.
- Propagate priority through DOM events and component invalidation.
- Add a host-yield abstraction and instrumentation counts by priority.
- Preserve current behavior when every operation uses normal priority.

Exit criteria: scheduler invariants, errors, runaway protection, and existing
reactive tests pass; performance baselines show no material normal-path
regression.

### Phase 2: task scheduling

- Add normalized task policy and callable facets in core.
- Emit policy for client, server, and distributed tasks.
- Coalesce server dispatch after interactive work and apply responses with
  generation-checked priority.
- Add `task.deferred` before awaited-task or async-component syntax.

Exit criteria: interactive writes supersede stale server/deferred work,
cancellation remains deterministic, and protocol exchange tests expose
priority without relying on generated operation names.

### Phase 3: mounted ranges and scope pause

- Add pause/resume effect-scope state.
- Extract range detach, restore, candidate, commit, discard, and disposal
  operations.
- Refactor transient cross-domain parking onto safe shared operations where it
  does not change semantics.

Exit criteria: high-risk DOM identity, ownership, portals, form state, focus,
cleanup, and nested-range tests pass.

### Phase 4: native Activity

- Add intrinsic VNode, compiler lowering, runtime modes, task behavior, and
  lifecycle activation.
- Add SSR anchors and hydration adoption for active and parked modes.

Exit criteria: native Activity preserves state and DOM identity, pauses or
defers work according to mode, and disposes exactly once.

### Phase 5: readiness boundaries

- Add readiness scopes and tokens.
- Install generation-bound readiness contexts and runtime owner registration.
- Replace promise-count suspension with generation-owned readiness.
- Implement committed/fallback/candidate renderer ranges.
- Add state overlays and atomic publication.
- Integrate nested boundaries, errors, cancellation, and testing inspection.

Exit criteria: no suspended or stale generation can mutate committed state or
dispose committed DOM; nested reveal and failure behavior is deterministic.

### Phase 6: async component and awaited-task lowering

- Extend task typing and compiler analysis for awaited results.
- Lower async components into synchronous component factories and generated
  continuations.
- Apply distributed capture, placement, serialization, context locality, and
  secret policy.
- Add focused diagnostics for unsupported restart or ownership patterns.

Exit criteria: the idiomatic shipping-options example works in client-only,
server-only, distributed, SSR, hydration, cancellation, and error scenarios.

### Phase 7: React scheduling and Suspense fidelity

- Move compatibility invalidation to scheduler priorities.
- Add two-phase Hook and class render state.
- Implement transition groups, deferred values, candidate discard, urgent
  fallback, retained transition content, and layout-effect reconnection.
- Upgrade `lazy`, `use`, `Suspense`, and compatibility `act` tests.

Exit criteria: the expanded React 18/19 differential traces agree for supported
observable contracts; remaining differences are explicit dispositions.

### Phase 8: React Activity fidelity

- Replace structural hidden behavior with retained mounts.
- Add React-specific visibility, effect disconnection, hidden priority, and
  reactivation.
- Validate host elements, text, refs, forms, portals, class components, and
  nested Suspense against React 19.

Exit criteria: React Activity scenarios agree with the real React 19 oracle and
React 18 behavior is unchanged.

### Phase 9: progressive boundary SSR

- Emit and consume boundary-specific stream events.
- Integrate state/resumption publication and hydration generation fences.
- Use the same transport for native and React-compatible boundary reveals while
  preserving their markup contracts.

Exit criteria: shell-first nested reveals work without root replacement,
aborted requests leak no work, CSP/serialization limits remain enforced, and
all-ready APIs preserve their existing contract.

## Testing strategy

These features are stateful, concurrent, lifecycle-sensitive framework
boundaries and require fighter-jet-level protection under the repository's
seat-belt rule.

Use the least implementation-coupled layer that protects each risk:

- scheduler unit tests for ordering, promotion, starvation, deduplication,
  error routing, and deterministic flush;
- task/runtime tests for generations, cancellation, cleanup, and policy
  composition;
- compiler semantic tests for inferred dependencies, writes, placement,
  serialization, diagnostics, and emitted runtime behavior;
- DOM integration tests for identity, ownership, focus, forms, portals, refs,
  nested ranges, and cleanup;
- SSR/hydration protocol tests for generation fencing, limits, abort, and
  boundary replacement;
- real React differential traces for public compatibility behavior;
- package fixtures using `React.lazy`, React 19 `use`, Suspense-enabled TanStack
  Query, transitions, and Activity;
- focused performance tests for normal reactive latency, deferred fairness,
  large parked ranges, and repeated park/unpark memory retention.

Avoid snapshots of incidental generated variable names, queue containers, or
private marker spelling. Assert semantic placement, ordering, identity,
protocol validity, and observable lifecycle.

## Documentation and compatibility reporting

When each phase lands:

- update core, reactive, DOM, compiler, SSR, hydrate, and React compatibility
  package READMEs for their owned contracts;
- add native docs examples using inferred placement first and explicit task
  facets only where policy is intentional;
- update the React capability disposition from `approximate` only after its
  differential scenarios pass;
- state clearly that genuine secondary React renderers retain their own
  schedulers;
- document SSR behavior separately from client behavior;
- expose scheduler, readiness, Activity mode, and boundary generation through
  testing inspection without exposing generated action names.

## Risks and recommended resolutions

### Deferred work starvation

Use aging or a bounded normal-work budget that promotes an old deferred item.
Do not solve starvation by draining all deferred work after every interactive
event.

### Partially committed state

Make the state overlay and candidate range one commit transaction. Do not
publish async state merely because its individual promise resolved.

### Unbounded retained DOM

Activity is explicit. Do not automatically retain every conditional branch.
Add instrumentation for retained node and component counts; consider optional
cache eviction only after real use cases demonstrate a need.

### Paused resource leakage

Distinguish pausing reactions from owning external resources. Native tasks
abort by default when parked; background mode is explicit. React effects run
their cleanup when hidden.

### Priority inversion across the server

Start required network work promptly after the current interactive transaction.
Use priority primarily for coalescing, response application, candidate
preparation, and commit. A blocking boundary may promote the work it needs.

### React behavior drifting by version

Keep target-specific React 18 and 19 oracle fixtures and capability
dispositions. Shared primitives must not erase version differences.

### Candidate render side effects

Native async work must be task-owned and state-staged. React Hook/class effects
and callbacks must not run until compatibility commit. Render-time side effects
remain application defects and are not made safe by candidate rendering.

### Abort between await settlement and continuation

The existing task await helper races promise settlement against the task signal
and rejects promptly when cancellation wins. A signal can still be aborted
after the awaited promise resolves but before the JavaScript continuation
resumes. Compiler-managed awaits must therefore check the task signal again as
the first operation after resumption. Tests must force that microtask ordering
and prove that no stale assignment, cleanup replacement, readiness settlement,
or distributed result publication occurs.

### Excessive scheduler complexity

Use three priorities and explicit transition groups initially. Do not reproduce
Fiber lanes, expiration matrices, or arbitrary JavaScript interruption unless
an observable supported contract later requires them.

## Completion criteria

The work is complete when:

- native eXact code can use async components and awaited tasks with ordinary
  TypeScript syntax;
- client interaction remains responsive while deferred and server work is
  pending;
- suspended generations cannot publish stale state or destroy committed UI;
- native Activity detaches and restores retained ranges with correct ownership;
- React Suspense, transitions, deferred values, and Activity match the
  maintained React oracle scenarios;
- SSR progressively reveals nested boundaries using validated, resumable
  protocol exchanges;
- framework testing can inspect priorities, readiness, retained Activity
  ranges, and protocol exchanges;
- normal synchronous eXact components retain their current setup-once,
  fine-grained behavior and performance profile.
