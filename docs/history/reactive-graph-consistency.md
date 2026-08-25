# Reactive graph consistency

## Status

**Implemented and archived (August 2026).** `@exactjs/reactive` now provides depth-independent
synchronous freshness, clean/checked/dirty/computing graph settlement, deterministic computed-cycle
diagnostics, detachable standalone ownership, rollback-aware source validation, and bounded
value-free inspection. Current runtime behavior is summarized in `docs/component-language.md`,
`docs/scheduling-suspense-activity.md`, `docs/devtools.md`, and `packages/reactive/README.md`.

The delivered error policy keeps the last successful result after a scope-handled failure. Its
recovery dependency set is the union of the previous successful sources and the sources reached by
the failed attempt, so a later change on either path can retry the computation. An unhandled error
is rethrown. Graph settlement and observer teardown are iterative once edges are known; authored
callbacks still discover never-evaluated dependencies through their ordinary JavaScript calls.

The proposal does not adopt the TC39 Signals API, make eXact application state cell-oriented, or
replace compiler-planned component execution. It incorporates the graph invariants that are useful
for eXact while retaining ordinary `this.state` reads and writes, compiler-inferred relationships,
component ownership, transactional publication, and scheduled DOM consequences.

## Decision summary

eXact should guarantee the following consistency rule:

> A successful synchronous state write is immediately observable through every subsequent derived
> read. DOM reactions, tasks, and other consequences may remain coalesced until their scheduled
> settlement point.

To provide that rule without executing application computations during a write, retained computed
nodes should distinguish four states:

- `clean`: the cached result is current;
- `checked`: an indirect source may have changed, but no immediate source is yet known to have a
  different result;
- `dirty`: the computation must be evaluated before its current value can be returned; and
- `computing`: the computation is being evaluated and encountering it again is a cycle.

Source writes mark direct computed consumers dirty and transitively mark computed descendants
checked. A synchronous derived read or scheduled computation settlement resolves only the relevant
upstream subgraph, using an explicit work stack rather than recursive JavaScript calls. Result
equality remains a propagation barrier: a recomputation whose effective result is unchanged does
not execute downstream computations or DOM reactions.

Unobserved standalone computed values should remain pull-based and must not be retained by a
long-lived source merely because they were read once. Watched and component-owned values attach
the reverse edges required for scheduling and release those edges when their watcher or effect
scope stops.

## Why this proposal exists

eXact already has a substantial fine-grained reactive implementation. It provides:

- deep observable objects, arrays, `Map`, and `Set` values;
- property- and collection-key dependency tracking;
- dynamically refreshed dependency sets;
- lazy cached derived values;
- result-equality propagation barriers;
- untracked reads through `peek()`;
- transactional publication, rollback, and optimistic mutation journals;
- coalesced reactions with interactive, normal, and deferred priorities;
- nested, pausable, transferable effect scopes and deterministic disposal;
- scheduler overflow protection; and
- compiler-owned DOM, task, SSR, hydration, and server-continuation integration.

At the August 24, 2026 audit baseline, the focused `@exactjs/reactive` suite protected these
contracts with 125 passing tests. Existing coverage included conditional dependency switching,
nested `peek()`, unchanged-result suppression, handled computation errors, transaction
deduplication and rollback, stopped and paused work, scheduler recovery, and runaway
self-invalidation.

Reviewing the implementation against the invariants explored by the TC39 Signals proposal exposed
two missing graph-level guarantees:

1. an initialized computed that depends on another computed can return its previous cached value
   when read synchronously after the original state source changes but before scheduler settlement;
2. a directly or indirectly recursive computed is not detected as a graph cycle and can instead
   exhaust the JavaScript call stack.

The first result is depth-dependent. A computed that reads state directly refreshes synchronously
when read after a write, while a computed above it does not yet know that its immediate computed
source is stale:

```ts
const state = reactive({ value: 1 });
const doubled = computed(() => state.value * 2);
const label = computed(() => `value:${doubled.get()}`);

label.get(); // "value:2"
state.value = 2;

doubled.get(); // 4
label.get(); // audit-baseline behavior: "value:2" until settlement

flushSync();
label.get(); // "value:4"
```

The scheduler does settle an ordinary diamond graph once with its final consistent value. This is
therefore not evidence that routine DOM publication is generally glitching. It is a gap in the
synchronous read contract of a retained transitive computation.

The second result occurs when runtime-dependent composition escapes the compiler's static cycle
diagnostics:

```ts
let recursive!: ReactiveValue<number>;
recursive = computed(() => recursive.get());
recursive.get(); // audit-baseline behavior: RangeError from host stack exhaustion
```

A framework diagnostic should identify the reactive cycle before the host stack is exhausted.

## Compiled-component relevance

Compiled components do not allocate a general-purpose computed cell for every expression. The
compiler elides a safe scalar derived value when it has one eager view consumer and may place the
calculation directly in that consumer's reactive closure. Compiler-owned render programs can also
subscribe directly to indexed state slots and update selected operations.

Retained computed nodes nevertheless remain part of compiled component execution:

- `createDerived()` delegates to the reactive package's `computed()` implementation;
- shared derived declarations lower to `createDerived(() => ...)` and `.get()` calls;
- identity-bearing derived values retain a cell even with one consumer;
- compiler-generated dynamic child and expression boundaries use computed values;
- explicit `this.reactive()` values use the same implementation; and
- derived values passed to tasks or read by deferred callbacks retain their first-class cell.

A derived chain can therefore survive compiler optimization when an intermediate value is shared,
has an identity-bearing result, crosses a framework boundary, or is used outside one eager view
consumer. Correctness cannot depend on whether a compiler optimization happens to fuse that chain.

## Relationship to the TC39 Signals proposal

The [TC39 Signals proposal](https://github.com/tc39/proposal-signals) is a Stage 1 exploration of a
standard, framework-neutral reactive graph substrate. It is intentionally not a complete UI,
ownership, effect, scheduling, transaction, or server-execution model.

eXact and that proposal share several core ideas:

| Graph concern   | TC39 direction                                | Current eXact direction                        |
| --------------- | --------------------------------------------- | ---------------------------------------------- |
| Writable source | Explicit `Signal.State` cell                  | Deep state paths and collection entries        |
| Derived source  | Explicit `Signal.Computed`                    | Compiler-inferred or explicit computed value   |
| Dependencies    | Dynamic tracked signal reads                  | Dynamic tracked target/key reads               |
| Evaluation      | Lazy, cached, synchronous read                | Lazy and cached, with scheduled recomputation  |
| Equality        | Default identity with configurable comparison | Structural effective-result comparison         |
| Untracked read  | `Signal.subtle.untrack()`                     | `peek()`                                       |
| Effects         | Framework-owned through low-level watchers    | eXact scheduler, watchers, tasks, and bindings |
| Ownership       | Outside the core proposal                     | Effect scopes and durable component ownership  |
| Transactions    | Outside the core proposal                     | Atomic batch, publication batch, and journals  |

The TC39 proposal's most relevant contribution here is not its application-facing API. It is the
distinction between a computation known to be stale and one that merely has a potentially stale
transitive source. That distinction allows a read to be synchronously current while preserving
lazy evaluation and equality-based suppression.

Native Signals would not replace eXact's compiler analysis, object and collection observation,
DOM-region ownership, task scheduling, transaction journals, SSR, hydration, or distributed
component execution. This proposal therefore does not make adoption of a changing Stage 1 API a
prerequisite.

The delivered runtime also keeps three intentional semantic differences explicit. TC39 Watcher
notification occurs synchronously during a source write, whereas eXact only invalidates graph state
and schedules owned reactions at that point. TC39 computed failures cache and rethrow the exception,
whereas an eXact computation whose scope handles a later failure keeps its last successful result and
remains eligible for dependency-driven recovery. TC39 defaults to `Object.is` and permits custom
comparators; eXact retains its framework-wide effective-result equality because that boundary also
governs identity-sensitive rendering and reconciliation.

## Goals

- Make synchronous derived reads independent of graph depth and compiler cell-elision decisions.
- Preserve lazy evaluation, cached results, and unchanged-result propagation barriers.
- Keep writes synchronous without running user computations or DOM work inside the write.
- Preserve eXact scheduling priorities, batching, interaction publication, and effect scopes.
- Detect direct and indirect computed cycles deterministically.
- Keep graph traversal bounded and independent of the JavaScript call-stack depth.
- Let unobserved standalone computeds be collected when the application no longer retains them.
- Preserve dynamic branch dependencies and `peek()` semantics.
- Make graph state and cycle failures inspectable without exposing mutable runtime internals.
- Establish a focused conformance suite for the reactive graph independently of renderer tests.

## Non-goals

- Adopting `Signal.State`, `Signal.Computed`, or `Signal.subtle.Watcher` as public eXact APIs.
- Replacing `this.state` with explicit cells or setter functions.
- Introducing React-style component reexecution, Hooks, or a virtual-DOM rerender loop.
- Executing DOM reactions, task bodies, or arbitrary effects synchronously from a state setter.
- Removing compiler-selected subscriptions, indexed state, or derived-cell elision.
- Changing the meaning of batching, optimistic journals, task generations, or scheduling priority.
- Making asynchronous computation a property of a computed value; asynchronous work remains a
  task or external-source concern.
- Treating an observable stream as a signal; reactive values represent current state rather than
  every historical transition.

## Required observable semantics

### Synchronous freshness

After a successful write, a subsequent `.get()`, `unwrap()`, coercion, compiler-generated derived
read, or task-input sample must observe the result implied by all preceding synchronous writes:

```ts
const subtotal = computed(() => state.quantity * state.price);
const total = computed(() => subtotal.get() + state.shipping);

state.quantity = 3;
state.shipping = 4;

total.get(); // reflects both writes without requiring flushSync()
```

This guarantee applies inside an event callback, task transition, batch callback, library callback,
and ordinary application code. It does not force DOM publication before the scheduler's defined
interactive, normal, or deferred settlement point.

### Glitch freedom

A consumer must not observe an intermediate result caused by evaluating only one side of a
multi-path dependency graph. A diamond graph publishes only the final consistent result for one
atomic transition:

```text
        source
        /    \
      left  right
        \    /
         total
```

If `left` or `right` recomputes to an equal effective result, work beyond that equality boundary
does not execute solely because an ancestor was written.

### Dynamic dependencies

Each successful computation evaluation replaces its prior dependency set with the reads from the
new branch. Sources used only by an abandoned branch cannot invalidate that computation. Failed
evaluation follows the error contract below and must not leave half-published reverse edges.

### Cycles

Reading a node already in `computing` state is a reactive computation cycle. The runtime must throw
a stable eXact error before executing another computation frame. The error should identify the
available owner or inspection labels without including source text, secrets, or an unbounded graph
dump.

Compiler diagnostics remain preferable for statically visible derived-state cycles. Runtime
detection covers explicit reactive values, library composition, dynamic branches, and other cycles
that cannot be proved during compilation.

### Errors

The implementation must retain eXact's error-boundary and effect-scope routing rather than adopting
TC39 exception caching implicitly. The delivered contract must explicitly select and test:

- what value a handled recomputation failure leaves readable;
- which dependency set can reactivate a failed computation;
- whether repeated reads retry or rethrow without another dependency change; and
- how an unhandled initial failure releases partially installed ownership.

The current behavior keeps the last successful result after a handled recomputation error. This is
the compatibility baseline unless implementation work deliberately changes and documents it.

### Equality

eXact's effective-result equality remains the default propagation boundary. A computed may execute
because it is dirty, but it publishes to its dependents only when the effective result changes.
This proposal does not silently change the default to `Object.is` or add a public comparator option.
A comparator API, if later justified, requires a separate public-API decision because equality
affects identity, reconciliation, and downstream work.

## Delivered graph architecture

### Computed node

Each computed value owns a node conceptually equivalent to:

```ts
type ComputedNode<T> = {
	state: 'clean' | 'checked' | 'dirty' | 'computing';
	initialized: boolean;
	value: T;
	sources: Set<ReactiveDependency>;
	computedSources: Set<ComputedNode<unknown>>;
	computedSinks: Set<ComputedNode<unknown>>;
	queued: boolean;
	scope?: EffectScope;
};
```

This shape is illustrative, not a required source layout. The implementation should keep state
transition logic in a cohesive computation-graph module rather than expanding `observation.ts`
into a second scheduler.

Raw dependency sets remain target/key based. Computed-to-computed edges add only the information
needed to propagate `checked` state and settle a transitive read. Every edge has one owner and is
removed when a dynamic dependency disappears, a watcher retires, or its scope stops.

### Invalidation

A target/key trigger performs no computed callback evaluation. It:

1. records or publishes the mutation according to the active transaction;
2. marks each directly dependent computed node `dirty`;
3. walks computed sinks iteratively, changing clean descendants to `checked`;
4. coalesces already dirty or checked nodes; and
5. schedules only the existing priority-appropriate computation work.

The traversal must snapshot or otherwise stabilize subscriber membership so a scheduler callback,
scope stop, or dynamic edge replacement cannot make one atomic publication rediscover a new
consumer.

### Synchronous read settlement

Reading a computed node behaves as follows:

- `clean`: return the cached result;
- `dirty`: settle dirty computed ancestors, evaluate the node, compare, and return;
- `checked`: validate computed ancestors in dependency order; evaluate this node only if an
  immediate source changed; otherwise restore `clean` and return the cache;
- `computing`: throw the cycle diagnostic.

Settlement uses an explicit stack with enter and leave phases. It must support deep acyclic graphs
without consuming one JavaScript stack frame per computed node. The scheduler's existing work
limit or a graph-specific bounded limit prevents corrupted or adversarial graphs from creating
unbounded work.

Synchronous settlement removes only the computation entries it actually executes from the queued
work set. It does not flush unrelated computations or reactions and does not change their priority.

### Scheduled settlement

The scheduler retains its existing rule that computations drain before reactions. Scheduled
computation settlement uses the same graph operation as synchronous `.get()` so the two paths
cannot disagree about dependency order, equality, errors, or cycles.

A computation that was already settled synchronously is removed from its queued entry. A later
reaction therefore observes the same cached result without repeating the calculation. Priority
promotion remains valid for work still queued; synchronous reading does not demote or donate
priority to unrelated work.

### Dependency replacement

Evaluation prepares a new dependency record separately from the currently published record. On a
successful evaluation, it replaces the prior raw and computed source edges atomically. On failure,
the error contract determines whether the prepared dependencies replace or augment the recovery
set, but no source may retain an edge that neither the prior successful value nor the selected
recovery policy owns.

`peek()` suppresses both raw target/key tracking and computed-to-computed graph edges. A computed
created inside `peek()` may still own its own dependency collection, matching the current nested
tracking rule.

### Transactions and journals

`batch()` and compiler-owned publication batches continue collecting target/key triggers. At
commit, the combined subscriber snapshot produces one invalidation wave. A consumer affected by
several changed paths is marked once.

Rollback emits no invalidation for a failed atomic batch whose mutations never publish. Optimistic
journal publication and rollback each create their existing versioned transition; graph states
must follow the effective published values and preserve authoritative-write fencing.

A derived read inside an active batch observes the writes already performed in that callback. It
may settle the required computed subgraph without publishing the batch's queued reactions. Later
writes in the same batch can dirty that subgraph again before commit.

### Ownership and liveness

Component-owned computed nodes remain registered with the effect scope captured when they are
created. Stopping that scope removes queued work, raw dependency subscriptions, computed edges, and
cleanup ownership exactly once.

Standalone unobserved computeds require a pull-only form:

- the live computed object may retain descriptors for the sources needed to validate its cache;
- those source objects must not retain the computed merely because it was previously read;
- acquiring a watcher or framework consumer attaches the reverse edges needed for push scheduling;
- losing the last watcher detaches those reverse edges; and
- a later direct read validates source versions and reconstructs current dependencies lazily.

This matches the package's advertised standalone-model use without requiring every caller to
invent an effect scope. If measurement shows that detachable pull validation is prohibitively
expensive, the proposal must be amended explicitly before substituting a public disposal API.

## Compiler and framework integration

No application syntax changes are required. The compiler continues deciding whether a derived
declaration is elided, fused into one reactive closure, or retained as a shared cell.

The compiler acceptance fixture must include a retained chain in which:

- an intermediate derived value has multiple consumers;
- a downstream derived value also has multiple consumers or crosses a task/callback boundary;
- an interaction writes the original state and reads the downstream value before returning; and
- the synchronous read and final DOM publication agree.

Compiler-proven state-assignment cycles retain their current diagnostics. Generated artifacts
continue importing the focused component-reactivity runtime entry rather than the public reactive
facade.

Renderer bindings, dynamic ranges, styles, props, keyed lists, contexts, and tasks should need no
independent freshness workaround. They consume the corrected shared graph contract. A project- or
renderer-local `flushSync()` inserted to hide a stale chain is not an acceptable implementation.

SSR and hydration continue to create request- or component-owned scopes. Synchronous server
rendering must settle the same graph semantics as the browser. Hydration adoption cannot force a
different initial computation order or duplicate an already settled server continuation.

## Inspection

Development inspection should expose, at minimum:

- the computed node's clean, checked, dirty, computing, failed, paused, or stopped status as
  applicable;
- its owner and work priority;
- bounded source and sink counts;
- the source evidence already owned by compiler inspection; and
- a bounded cycle path when cycle detection fails.

Production inspection remains redaction-safe and must not expose values or arbitrary source text
merely to explain graph state.

## Performance requirements

Correctness is mandatory, but graph strengthening must not quietly turn every write into a full
component traversal. Measure at least:

- direct state-to-DOM bindings;
- one-level and deep computed chains;
- wide fan-out and diamond graphs;
- repeated equal results;
- dynamic branch switching;
- large compiler-indexed component programs;
- creation, first read, steady reads, invalidation, settlement, and disposal;
- retained heap for mounted, stopped, and abandoned standalone computeds; and
- browser interaction-to-paint timing for production-shaped applications.

The intended complexity is proportional to the affected watched computed graph. Clean direct reads
remain constant-time. Checked reads visit only the potentially stale upstream closure, and equality
prevents execution beyond unchanged results. Implementation benchmarks must include metadata and
retained-heap cost rather than reporting recomputation time alone.

## Alternatives considered

### Flush the scheduler from `.get()`

Rejected. A read must not execute unrelated DOM work, tasks, or lower-priority reactions. It would
also obscure ownership and make ordinary value access a global scheduler boundary.

### Trigger every downstream reaction immediately

Rejected. Eager notification restores freshness only by discarding equality suppression. Effects
and DOM bindings could execute even when every effective derived result remains unchanged.

### Declare all pre-settlement derived reads stale by design

Rejected unless adopted as a separate, comprehensive language change. Current one-level computeds
already refresh on synchronous read, and application meaning must not depend on derived graph depth
or whether the compiler elides a cell. A settlement-snapshot model would require uniform runtime,
compiler, task, callback, and documentation changes.

### Inline every derived chain in compiler output

Rejected. Shared calculations, first-class identity, task inputs, callback consumers, library
boundaries, and explicit reactive values legitimately require retained cells. Duplication would
also weaken inspection and result-equality barriers.

### Adopt TC39 Signals directly

Deferred independently. The proposal is Stage 1 and intentionally omits eXact's ownership,
scheduling, transactions, collections, rendering, and distributed execution. A future native
substrate can be evaluated after its semantics and implementations stabilize; correctness of the
current framework cannot depend on it.

## Verification plan

### Focused reactive graph tests

- One-, two-, and many-level synchronous freshness after a source write.
- Fresh reads inside and outside `batch()` and compiler publication batches.
- Wide and diamond graphs publishing one final consistent result.
- Equal intermediate results preventing downstream computation and reaction execution.
- Dynamic conditional sources adding and removing both raw and computed edges.
- Nested `peek()` excluding the correct graph edges.
- Direct self-read and indirect multi-node cycles producing a bounded eXact diagnostic.
- A deep acyclic chain settling and disposing without JavaScript stack overflow.
- Initial and later computation failures under handled and unhandled error policies.
- Reentrant writes permitted by the selected computation contract without graph corruption.
- Priority promotion, pause/resume, stop-before-flush, and scope transfer.
- Nested batches, rollback, optimistic journals, and authoritative-write fencing.
- Unwatched computed collection under forced-GC test infrastructure where reliable, plus
  deterministic edge-count assertions independent of garbage-collector timing.

### Compiler and renderer tests

- Emission tests proving which scalar chains are elided and which retained chains call
  `createDerived()`.
- A compiled event that writes a source and synchronously consumes a retained downstream derived
  value.
- DOM text, prop, style, branch, list, and dynamic-component publication after the same transition.
- Component replacement and unmount releasing every retained computation edge.
- SSR and hydration agreement for retained chains and handled computation failure.
- Task activation sampling a current retained derived input without a preparatory global flush.

### Acceptance commands

At minimum, implementation must pass:

1. the focused `@exactjs/reactive` package suite;
2. affected `@exactjs/core`, compiler, DOM, SSR, and hydration suites;
3. test type checking and repository source-architecture checks;
4. package-content and JSDoc checks for changed public or framework entries; and
5. reactive, DOM-list, framework, and retained-heap performance guards.

Testing should use the least-coupled layer that protects each invariant. Graph state transitions
belong in focused runtime tests; compiler tests protect emitted ownership; DOM and SSR tests protect
observable integration rather than duplicating the complete graph matrix.

## Documentation and delivery

Implementation is complete only when:

1. `docs/component-language.md` states the synchronous freshness and cycle contracts;
2. `packages/reactive/README.md` explains standalone computed ownership and disposal behavior;
3. the public docs application's state page explains that derived reads are current immediately
   while DOM consequences remain scheduled;
4. scheduling documentation distinguishes computation settlement from reaction publication;
5. DevTools documentation describes the new graph states and bounded cycle diagnostic;
6. this proposal moves to `docs/history` with its delivered contract summarized in current
   references; and
7. no current documentation continues describing the superseded depth-dependent behavior.

## Acceptance criteria

1. A synchronous derived read returns a value consistent with every preceding successful
   synchronous write, regardless of computed-chain depth.
2. No state setter directly executes a user computation, DOM reaction, or task body.
3. Diamond and fan-out graphs expose no intermediate value and execute each required computation at
   most once per settled transition.
4. Equal effective results stop downstream computation and reaction execution.
5. Direct and indirect cycles fail with a deterministic bounded diagnostic before host stack
   exhaustion.
6. Dynamic dependency replacement, `peek()`, errors, batches, journals, priorities, pauses, scope
   transfer, and disposal preserve their documented contracts.
7. Graph traversal and teardown do not depend on JavaScript call-stack depth.
8. An abandoned unobserved standalone computed is not retained by a reachable source graph.
9. Compiled retained-derived chains and explicit reactive values use the same corrected semantics.
10. Focused tests, integration suites, documentation, inspection, and performance gates pass before
    the proposal is marked implemented.
