# Compiler analysis necessity and optimization plan

This plan is for maintainers changing the native compiler or its SDK consumers. Its decision
unit is a public compile, check or analysis request and the component or tool behavior that
consumes the result. It covers the path from host source selection through publication and
validation. A code path can be necessary in one request and wasted in another. See the
[architecture plan](compiler-architecture-completion-plan.md#component-consumer-completion-criteria)
for supported behavior and the [native compiler reference](native-compiler.md) for interfaces.

The source audit uses revision `a99e643ef`. “Remove” below identifies work with an unused
result or equivalent existing input. “Narrow” identifies a real consumer currently sharing a
stronger query. Changes in that category must demonstrate that the weaker answer still serves
the consumer. “Keep” identifies an observable requirement. The measured costs below apply to
one package request. No totals are available for an uncensored whole build.

## Where the time goes

On the original client compile of Theme’s `components.ts`, allocation through 25 seconds
totalled 16.13 GiB, with approximately 105 million allocations, 114 garbage collections and
174 MiB on the heap at that point. CPU sampling continued to the existing 30-second
deadline. Property access, invocation and tracing the sources of returned values appeared on
the same stack in 65.3% of CPU samples. Parallel background GC accounted for 31.5%.
These are overlapping call-tree measurements. The largest exclusive allocation sites were
`acquireCallableScope`, `accessorsAtGetOutput`, `origins`, `snapshotCalleeScope` and
`snapshotCalleeTerms` (74.9% combined). Profiling used the normal SDK worker, native Go
sampling, the original 20 Theme sources and no forced GC. Independent runs on earlier and
current source hit the deadline with the same five leading allocators. Neither the number
of identical semantic queries nor the speed of a completed compile follows from those totals.

Core has a different measurement: its ErrorBoundary default reset button reaches intrinsic
receipt construction, an opaque operation and its prototype cache. Earlier stack sampling
found callable-effect collection and member-origin reconstruction. On the actual request,
removing the initial demand for one stored executor saved 13 of 495 indexed body-node visits
in an approximately five-millisecond phase. Later cross-module redemption was unverified
when both controls hit their test deadline. Keep ordinary indirect invocation conservative.
A stored executor’s body, a metadata getter executed at construction, and the executor called
at redemption have three different triggers. Skipping a tagged private helper’s whole body
would also miss an eager platform dependency newly introduced inside it.

## Request and project work

| Source and consumer | Minimum justified work and disposition | Change and verification |
| --- | --- | --- |
| Host selection, project synchronization and authored typing | **Keep** executable JS identity, checker declarations, target conditions, source generation and config. The selected executable can differ from its typing sibling. A type-only import has no runtime initializer. | Reuse selected source and bound symbols under those same inputs. Preserve runtime-JS/typing-TS disagreement, conditional package exports, edits and stale-source refusal in both library and application builds. Keep the existing foreign-JSX passthrough and compiler-aware semantic check. |
| Import collection → module graph and SDK build | **Remove repeated lookup.** `collectImports` already holds each declaration and specifier. `Session.executeProjection` walks from the file root with `nodeAtSpan` for each import to recover them. It also searches for dynamic import calls whose results this particular resolution loop cannot use. | Resolve static imports and reexports while the original nodes are in hand. Preserve the existing dynamic record, source spans, ordering, type-only/side-effect flags and the syntax-only invalidation caller. Compare complete records and source maps on static, dynamic, reexport and mixed files. |
| Callable cache → graph rebuild | **Remove production fingerprint construction and storage.** `prepareProjectCallableSource` always returns a non-nil `sourceContext`. The sole production value read from `cache.fingerprints` is behind the right operand of `refreshed.sourceContext != nil || …`. Preparation, discovery and post-collection nevertheless serialize complete facts; invalidation also maintains the table. | Keep unconditional refresh at the same branch, the existing generation checks, graph rebuilds and source-local clone isolation. Remove the unused map and its producers. Move fingerprint comparisons still protecting clone and mutation behavior into test support. Compare first request, repeat, dependency edit, host selection change, reset and retired AST. Measure the eliminated serializations separately from the remaining clone cost. |
| Project discovery → callable and component linking | **Keep** a cheap declaration/symbol/module index to resolve imports and recursion. `ensureProjectCallableSources` separately prepares state, component bindings, enhancement imports and assets on uncached program sources. `beginProjectCallableCollection` assembles their inventories before demand is known. Opening a source as a type root alone does not justify extracting all those bodies. | First remove repeated traversals with identical inputs. Then split indexing from expensive analysis of reachable module initializers, component definitions and invoked work. Compare selected module graphs, dependency edits, recursive groups, library-only components and dormant exports; preserve canonical identities, late demands and subscriptions. Track number of indexed files separately from bodies actually analyzed. |
| Response construction → SDK and developer tooling | **Keep** public `Analysis` shape, diagnostics, export records and source maps. `collectSemanticGraph` also feeds JSX interop, shared artifacts and component build facts in the SDK. Treating it as editor-only would change builds. | Reuse stable declaration/reference indexes for `component-build-facts.ts` and repeated source scans. Classify each field against these real consumers before considering lazy serialization or a different response contract. Compare compile, analyze, check and editor results, not just emitted code. |
| Lowering, diagnostics and printing | **Keep** authored normalization, checker identity, target plan, generated-code validation and location mapping. A framework-aware authored check can catch illegal assignment even when generated code typechecks. `validateAuthored` already shares the neutral check by Program and request. Semantic diagnostics can require maps even when the caller does not request a map. | Reuse that validation under its existing key. Compare both generated and authored diagnostics, import rewrite/refusal, source content and target artifacts. Preserve secret redaction in client artifacts and source maps and restore checker-owned AST parents. Optimize trace hooks only on evidence of disabled-path work. |
| Build hosts and release | **Keep** ordinary helper emission through the host, type erasure, selected JSX transform and runtime package identity. Server scalar helper behavior has passed through all three adapters. Ordinary helper JSX has narrower proven coverage. | Exercise only affected host routes during a slice. Final acceptance builds fresh Core, Theme and downstream providers, compiles application and library variants, then exercises actual SSR, hydration, task HTTP and release compatibility. A retained package or a skipped server target leaves that row open. |


## What a component needs to know

| Component decision | Minimum fact and where it goes | Work to narrow and acceptance |
| --- | --- | --- |
| Pick an execution target | `resolveCallableEffectsWithWork` propagates executing dependencies to tasks, components and module initializers. The definition owns its eligibility. Known target requirements include an authored occurrence, target and reason; an unresolved alternative stays separate. A node can have several callers and participate in a cycle. | Resolve the host variant first, then propagate over the existing graph and its recursive groups. Treat known runtime imports as leaves; preserve lexical shadowing, type erasure and the effects of evaluating a module. Reuse an either-side definition on both targets. Keep a caller-specific callback or receiver requirement on the executing edge. Distinguish a true mixed dependency in one execution from mutually exclusive target exports and explicit cross-target dispatch. A predicted state write currently influences scheduling; it does not determine eligibility. |
| Invoke or store a callback | The evaluating caller owns argument expressions, defaults, getters and conversions. A stored callback value carries identity and any closure needed later; a true invocation carries execution effects at that use. A callback’s body may read a browser global or a secret. | Preserve ordinary passing and storage. Demand the body at a direct or recovered indirect call, including callbacks a standard algorithm invokes. A bound function, receiver or saved method may need source identity at that later call. Require the retained-then-redeemed cross-module browser callback to fail server placement before adopting speculative root removal. Keep eagerly executed metadata getters, mixed alternatives and secret arguments in the controls. |
| Initialize state and update a render reader | `collectStateAnalysis` and `collectReactiveBindings` supply state slots and subscriptions; `jsx_render_program_updates.go` wires specific updates. The component needs the signal, path or existing dynamic reader, and when to read it. It normally needs the helper’s actual returned text or style only when the program executes. | Keep authored evaluation, receiver identity, order, exceptions and cleanup. Prefer the existing runtime reader when it provides the dependency. Test that a nested helper read updates the correct mounted element and an unrelated field leaves it untouched. Check initial SSR, hydration and disposal. |
| Invoke an unchanged helper with mutable state | `callable_state_receivers.go` projects relative paths onto the component call. `task_pending_state.go` and task lowering enroll owned operands; the pending view journals actual writes under the generation signal. | Remove helper simulation used only to predict whether an already enrolled mutation happened. Preserve callee/receiver identity, evaluated arguments and the helper’s own return. Direct scalar and component-authored setter paths already work. Treat a fresh accessor envelope containing raw state as separate: its accessor receiver, nested initializer and possible escape require independent support. |
| Read after that call and publish a server response | `taskEffectLocalReadRanges` controls dependency substitution. `continuation_state_reads.go` and `continuations.go` describe allowed inputs/writes. Server `continuation/execution.ts` intersects those paths with the actual generation’s recorded changes. Policy separately checks path overlap. | Replace predicted writes **first for live reads** where the caller already owns the pending view. Keep entry snapshots and blocking client reads distinct. Keep exact authority for returned scalar paths, deletes and collection operations until another equally narrow contract exists. Exercise skipped writes, protected siblings, returned value vs state, cancellation/stale generations, arrays, sets and maps through direct and batch HTTP. Never grant a whole root because a helper received it. |
| Start tasks, resume work and release resources | `collectTasks`, `task_captures.go`, `invokedTaskOperations`, generation-signal lowering and task cleanup select inputs, scope and ownership. A resumed task needs its live inputs and pending control state. An await can execute an authored thenable’s getter or method. | Preserve evaluated operands, capture and legal transport, invocation target, completion and exactly-once disposal. Ordinary synchronous code that never consumes a result needs no settled value. Apply the same test to the broad async refinement in `sourceValueRefinementRequired`: distinguish an ignored promise from a later awaited result and from thenable assimilation during async return. Test throw, catch/finally, cancellation and cleanup while suspended. |
| Check contexts before setup | `lowerEnhancementContextContracts` publishes actual token identities; the DOM and SSR enhancement-chain owners reject contradictory order before setup. The installed instance answers an optional lookup using the actual symbol. | Optional-only ordinary helpers need no attachment. Preserve component-owned provided/required identities and private-token initialization order. For an imported ordinary helper, keep the implicit getters on token/instance fields and retain known platform effects beside unknowns. Independently qualify separate provider/consumer compilation, imported identities, reversed order with zero setups, correct order with two setups/disposals. A private experiment emitted a dependency reader expecting helper metadata. That unresolved contract cannot be repaired by guessing a token from its name. |
| Construct a component, registry child or opaque operation | Native JSX/SSR/claim lowering consumes component identity, state/input slots and child layout. A keyed registry or opaque handle needs its actual domain, key, target and generation. The JavaScript host can construct a compiled component in the supported ordinary TSX path. | Keep props/key/spread order, deferred children, registry ownership and stale loader fencing. A host JSX transform needs no simulation of the compiled child’s helper caches. Keep the actual browser/server executor check at redemption and metadata effects at creation. Verify compiled/public vs internal source separately, key transitions, wrong target, ordinary identity and original DOM/SSR behavior. |
| Permit data, dependencies and built-in operations across a boundary | Task policy, capabilities, assets, secret qualification and artifact pruning consume source policy, type/transport eligibility, runtime module identity and selected output. Receiver-relative paths used for secrecy or transport are stronger than a placement tag. | Trust checked primitive types and supported standard contracts. Preserve authored property/key getters, coercions, iterators, callbacks and proxy effects where reachable. Keep actual native node/Bun capabilities, authored shadows, secret flow into captures and forbidden client artifacts. Apply only the demanded check to ordinary values. A usable runtime validation already handles some uncertain Map keys. Unknown with an independently safe route needs an advisory only for an actionable behavioral limitation; unsafe disclosure or missing compilation data still blocks. |


## Why the hot analysis starts

The compiler can print an ordinary call without resolving its return value. The production
effects path can still request that value **as an intermediate step**. Consider three uses:

- `helper(input)` with its result discarded needs eager argument/callee effects, possible
  executed bodies, state effects relevant to the component and surviving control flow.
  The helper’s exact result is irrelevant to this use.
- `helper(input).field` can execute an authored getter on a returned object. The field name
  and possible getter bodies on that receiver can matter to placement or secrecy. The
  getter’s numeric/string result usually does not. A user-defined thenable, iterator or
  coercion can produce the same distinction between identifying executed work and computing
  a value.
- `helper(input)()` needs to know which returned closure can execute and what it captures.
  A later call through another module, a changed receiver or a prior assignment can alter
  the answer. A cache of “helper is either-side” cannot, by itself, discharge that call.

In public compile mode, `appendArgumentAccessorEffectsObserved` can already accept a
registered definition-call edge. In its ordinary fallback it requests invocation dependencies,
then publishes opacity, source writes and accessor/callee edges. Those publications have
component consumers. There is no publication of the helper’s exact JavaScript result in
that branch. Farther down, `projectSourceCallReturnsWithViews` can re-enter
`consumeInvocation`, follow selected bodies, and walk return expressions under their
creating scopes to discover a possible receiver or target. A receiver query can in turn
search earlier writes, reconstructing their targets and scopes. The private all-body
`stagedReplacement` mode and public requests using some of the same code have different
roots. Deleting by filename or substituting a successful private harness run would miss this.

### The actual Theme call and its consumer

The original stock stacks were too deep to identify the initiating operation. A second,
observation-only compile labelled the existing outer collector, authored use, effect publisher
and query while each was running. All 29.70 sampled CPU-seconds involving return-source
projection and all 24.93 seconds involving the interference scan belonged to **one authored
call**: [`parseCssColor(value)` in `parseThemeColor`](../packages/theme/src/color.ts).
It was the string arm of the conditional initializer for `parsed`, in ordinary
possible-effects collection. Neither protocol handoff nor normal-result refinement was
active. The call entered `appendArgumentAccessorEffectsObserved` and
`sourceInvocationDependenciesObserved`. Its three published outputs are uncertainty about
execution, possible source writes, and callable/accessor edges. The graph uses those facts
to constrain work reachable from ThemeScope’s presentation and render. The publisher
does not emit color channels or need to calculate them at compile time. No final placement
was emitted before the deadline. This run establishes attribution; it is not a timing comparison.

There is a genuine second use: `parseThemeColor` subsequently reads `parsed.l`, `.c`,
`.h` and `.alpha`. A getter at one of those reads could execute authored work. A
TypeScript structural type alone does not prove a plain data property. Preserve those
reads and evaluate their effects at their own use sites. The existing
`prepareDefinitionMAYCall` shortcut requires a normal definition input and restricts its
consumer to specific forwarding/return forms. A conditional initializer in ordinary
effects collection is outside that contract. The first change should use the already
resolved, stable local function edge for the **effects of this call**, covering eager input
evaluation, relative writes, unknowns and invoked work. Supply a result-source demand
separately when an actual later operation needs one. Test a parser that returns plain data
and a returned object whose getter is browser-only: the first must emit and the second must
retain its placement conflict in server work. Never assume purity from the parser’s name,
return type, or the absence of writes through its primitive argument.

### Dispositions for the expensive owners

| Owner | Why it exists | Narrowing or optimization |
| --- | --- | --- |
| `accessorsAtGetOutput` and the ordinary member visitor in `source_accessor_declarations.go` | Resolve the particular member that can execute, including authored getters, setters, inherited members, changed receivers and captured callbacks. Consumers also ask about enumeration and deeper reachability. | Ask for the exact operation (read, write, invoke, enumerate) and property only when downstream code uses it. For an effect-only Call with a complete callee summary, propagate that summary before entering general value discovery. Preserve receiver/key/argument evaluation and unknown alternatives. Keep full selection for a later member use that can change observable work. |
| `occurrenceOrigins`, `origins` and `source_member_writer_inputs.go` | Earlier writes may replace the selected method or getter. Matching a receiver to a current write can reveal an executable donor or exact component-state path. | Filter writer candidates first with the existing bound source, owner, member key and ordering facts. Project only the requested field or receiver. A negative filter must cover the original program point, aliases, inherited lookup and possible authored alternatives. In Theme, one combined interference verdict includes uncertainty that an own-slot shortcut would lose. Do not special-case the color literal or suppress prototype lookup. |
| `memberWriterReadCut` → `acquireCallableScope` | A prior writer must be interpreted relative to the original reader even while recursion visits another call or constructor. The current implementation seals initializer values and copies writable binding and creator maps. | Separate the need to retain an original read from the need to materialize both maps. For a cut that cannot reach a scope reader, remove the copy while preserving charges, incomplete flags and source ordering. For a cut that is read, prefer an existing immutable, generation-owned input description or the specifically required fields. Prove where maps are mutated, retained, restored or shared before borrowing. A pointer to a mutable map is insufficient. |
| `prepareInvocation` → `acquireCallableScope` | A selected alternative may outlive the transient query and need different bindings, defaults or a different receiver. | Split immediate effects-only consumption from escaping or alternative-specific captures. Avoid making a writable copy at a proven synchronous read-only use, or eliminate a superseded copy while preserving sealing and accounting. Test aliasing, a default getter, two alternatives with different captures, writer mutation, and return after input restoration. |
| `beginCalleeAcquisition` → `snapshotCalleeScope` → `snapshotCalleeTerms` | A recursive Get through an earlier writer can request the output of the Call still being selected. A finite snapshot and its reading/initializing/returning/invoking positions prevent circular self-use. Inputs can change at the same AST node. | Take the cheap stable direct-callee path ahead of the deep snapshot only where this same-output re-entry is impossible. Otherwise use a cheaper exact comparison or share an immutable description within the same query and cuts. Cover equal/different captures, creators, nested containers, pending output, scope expiry, and changed Program. A cheaper rejected-first allocation has a local proof but no measured benefit on this Theme request. |
| Normal-result, constructor, descriptor, branch and framework-storage paths | Some clients genuinely select an initializer to omit, trace a returned callable/field, check a qualified source, or resume an acquired result. A plain placement query needs potential effects and known donors. A missing normal result and missing execution coverage mean different things. | Preserve cheap literal/checked primitive decisions. Accept a conservative union of possible branches for effects when it preserves required diagnostics and artifact usability. Keep operand effects, short-circuiting, defaults, abrupt completion and known unsafe alternatives. Restrict stronger prior-state, descriptor, async and return proofs to actual consumers; retire private-only replacement requirements after their last public or tooling use is accounted for. |

The original profile was decoded by call site as well as by function. Of 25.12 sampled CPU
seconds in `occurrenceOrigins`, 24.98 passed through the writer-interference scan. Of
3,498 MiB allocated directly in `acquireCallableScope`, approximately 2,299 MiB came from
`memberWriterReadCut` and 1,112 MiB from `prepareInvocation`. All 1,850 MiB allocated
directly in `snapshotCalleeScope` came from `beginCalleeAcquisition`. All 29.83 sampled CPU
seconds in the return-projection routine entered it via the ordinary member/projection visitor.
These are measured priorities for this input. They give no evidence for optimizing an
unsampled reflective getter merely because it shares the same allocation helper.


### Remaining users of return-source reconstruction

The direct callers fall into the following distinct correctness cases. They determine what
can be removed after the ordinary effects caller migrates.

| Request into the shared engine | Quantity actually consumed | Disposition |
| --- | --- | --- |
| The member visitor in `accessorsAtGetOutput` and the separate `reflectiveTargetValues` wrapper | A source/view for the next Get, write or invocation. The reflective caller needs the potential receiver of a write; the sampled Theme path is the ordinary visitor. | Eliminate exact result acquisition where possible effects or an argument-relative overlap answer suffice. Preserve a returned setter, prototype getter and changed member as contrasts. |
| `projectSelectedSourceReturns` from ordinary invocation, `acquireGetResult`, and proxy/descriptor protocol effects | A subsequent observer can consume a returned callable, receiver or typed descriptor. Source identity can affect the next operation. | Keep only the demanded projection and its captures. A getter still executes when its result is ignored. Reflective receiver, throwing getter, stale closure and mixed known/foreign target are controls. |
| `appendBoundAccessorEffects`, implicit accessors and `moduleDefinitionAnalysis.evaluatedAccessors` | Executable donors of an actual read, destructuring/default, spread, or eager module initializer. | Preserve operand evaluation and alternative effects. Separate a read from invocation, construction, enumeration and exact acquired output. Verify a module-scope getter with a side effect independently of an uncalled exported function. |
| `originsAt` in setter inputs, consumed writes, component assignment and framework-storage writers | Actual root/path, receiver or token for a particular write or capability. | Keep the relation for authorized state delivery, secret filtering and context ordering. Return an unknown or use an existing runtime operation for an ordinary value when no such boundary consumes the origin. |
| Native callbacks, promise settlement, construction, reflection and installed Get/normal-output consumers | Selected callback, receiver, return or completion **if** the supported algorithm consumes it. | Preserve authored effects and abruptness only as far as they change a surviving component decision. Do not materialize a complete descriptor, cache, array, iterator history or object graph just to emit the original expression. |
| Migration-only replacement mode | The private harness can require every occurrence to publish a stronger result than the public request uses. | Remove the requirement from product acceptance. Retain production-used portions and their behavior tests. Remove the private mode, its synthetic closure expectations and dead producers as their production callers disappear. Audit direct caller lists on the revision where the last user is removed. |

## Implementation order and acceptance

Static imports are resolved during collection. Production callable fingerprints have been
removed, and cold component linking groups matching facts once per source. A literal prop
can refine the caller's render edge while the child keeps its portable definition. The
component and callable caches preserve that distinction across a dependency edit.
Export reporting and pruning share settled declaration availability within one executable
selection and initializer revision. Named module lookups use the checker's export index.

Ordinary source values carry construction metadata only when a construction binding exists.
This reduced their size from 496 to 248 bytes on linux/amd64. Member reads retain the original
bindings and creators when the read occurs. A consumer that needs writable lookup maps can
materialize them from those detached entries. Calls with no direct declaration skip the unused
caller indexes while preserving selection-time sealing. Callee snapshots reserve their binding
and creator vectors after admission, and retain detailed term projections only where present.

The checked native array membership lookup on a fresh literal now reaches the Theme color
parser. Executable element and argument expressions remain placement inputs. These changes
reduced individual costs measured on component compiles. The uninstrumented original Theme
and Core commands on revision `4f7378ad1` still timed out at 30 seconds on the client
compile, before producing paired artifacts. That run predates the compact callee-term layout.
The remaining acceptance criterion is successful compilation and use of both targets.

1. **Remove demonstrated redundancy in parallel with the hot-path change.** Remove production
   callable fingerprints. Resolve static imports at collection. In `linkProjectComponents`,
   retrieve a component’s callable fact once for the linker, `componentInputDemandsFor`
   and (when required) `componentInputBodyPlacement`. They currently scan the same slice
   up to three times per component. Preserve the current first/last match behavior if a
   declaration can appear twice, and keep the Program/checker/source checks on input demands.
   Use the existing graph-local index or a single pass; a persistent new cache is unnecessary.
   Compare emitted artifacts, complete public analyses and diagnostics across client/server
   and edits. Count removed serializations, traversals and fact comparisons. These are useful
   improvements independently of their contribution to either deadline.
2. **Replace the broadest measured semantic query at one genuine component use.** Start with the measured direct call to
   `parseCssColor(value)`. Establish complete definition-effect propagation there, and
   reserve returned-source selection for its actual downstream readers. For unresolved
   members that still need writer attribution, examine the interference test in `scanInterferenceInSources`. Its `reaches` predicate enumerates
   source origins, descends into local containers and tests receiver/path overlap. Try an
   existing declaration or argument-relative effect summary at the original Call/Get with
   three outcomes: proven disjoint, possible write with the required effects covered, or
   insufficient coverage. Use the existing full analysis for the third case. A positive
   possible overlap does not identify the replacement getter or callback by itself. Keep
   known platform/secret/state effects and distinguish own-slot from inherited work.
   First acceptance pair: a real rendered component with an ordinary returned data value,
   then the same boundary with an effectful returned getter or replaced member. Add a
   known browser donor alongside a foreign alternative and inspect diagnostics **and** the
   generated artifact. Run the original Theme request; record eliminated origin queries or
   reduced allocation for comparable completed work. A new refusal on a supported component
   is a regression even if compilation becomes fast.
3. **Reduce storage for the analysis that survives.** At the measured reader-cut constructor,
   count empty/nonempty binding and creator inputs and which portions actual consumers read.
   Try a read-only empty representation only where later installation, writes, absence versus
   emptiness, expiry and accounting remain correct. On the overlap-only path, a single known
   origin can be consumed without creating an owned slice if no caller retains or mutates it.
   The singleton allocation in `origins` accounts for about 1,405 MiB in this profile; the
   avoidable fraction is unknown. Check reached result and incomplete flag, writes, allocation
   count and bytes per matched operation. Reprofile after the semantic cut before investing
   in the next scope-copy or recursion-guard change.
4. **Reuse stable placement and dependency facts.** Compute definition-local executing
   edges once, solve cycles to convergence and compose formal callback/receiver obligations
   at actual invocations. Retain per-source initializer effects and target-specific package
   resolution. On cold linking, index symbols, exports and possible registry members before
   demanding full component analysis on reachable edges. Where export reporting and module
   pruning ask for the same declaration availability, share it only for the same revision,
   use and policy. Keep the transformed-artifact audit, including generated imports.
   Test recursive functions, two callers with different actuals, eager vs dormant callbacks,
   an unrelated project root, changed dependency/config/target and an application/library pair.
   Never cache an active binding map, pending output, authorization, or live AST from an old
   generation as a portable definition summary.
5. **Separate framework decisions still sharing stronger facts.** Migrate live post-helper
   reads independently of HTTP write authorization. Migrate optional versus required context
   dependencies independently of placement. Reuse checked standard contracts for ordinary
   operations while retaining the authored code those contracts actually execute. Compare
   the old/new effect donors and returned data/state on real components. Keep source-side
   opaque receipt redemption, hidden required tokens and escaping accessor envelopes on the
   conservative path until their specific tests succeed. Changing a public restriction or
   broadening a permission requires a separate contract decision.
6. **Retire orphaned precision work and qualify the result.** At each cut, enumerate the
   remaining direct callers, including implicit Get, initializer, constructor, async,
   reflective and tooling paths. Remove the obsolete writer/return/descriptor machinery
   and private migration assertions once all remaining callers use a smaller contract.
   A helper-only cache/prototype simulation is unnecessary as a product gate. Preserve
   ordinary cache identity/ordering where it crosses an actual component boundary.
   Run the original Core and Theme package builds on client and server under normal
   deadlines, with fresh dependent outputs. Validate real render/update, hydration,
   returned task state, secrets, maps, host selection, ABI and changed-source reuse.
   Record each unresolved package separately.

For each change, compare the same inputs, toolchain, target, options and domain of work.
During diagnosis it is legitimate to measure a completed phase or a disjoint operation
count when whole requests time out. An instrumented attribution run measures who asked a
question; it does not measure the speed of the uninstrumented compiler. Evaluate material
changes on common fast compiles as well as the pathological packages. A warning is justified
only by a specific useful emitted path, an observable limitation and an action the author
can take. There is no blanket time-budget-to-warning conversion.

### Source entry points

- [Request planning and printing](../native/typescript-go/overlay/internal/exactcompiler/session.go),
  [source preparation](../native/typescript-go/overlay/internal/exactcompiler/callable_project_collection.go),
  [cache and graph assembly](../native/typescript-go/overlay/internal/exactcompiler/callable_effects.go)
  and [component linking](../native/typescript-go/overlay/internal/exactcompiler/project_components.go).
- [Ordinary call effects](../native/typescript-go/overlay/internal/exactcompiler/callable_argument_accessors.go),
  [member visitor](../native/typescript-go/overlay/internal/exactcompiler/source_accessor_declarations.go),
  [interference scan](../native/typescript-go/overlay/internal/exactcompiler/source_value_interference.go)
  and [return projection](../native/typescript-go/overlay/internal/exactcompiler/source_return_projection.go).
- [Reader scope](../native/typescript-go/overlay/internal/exactcompiler/source_member_writer_inputs.go),
  [scope capture](../native/typescript-go/overlay/internal/exactcompiler/source_accessor_candidates.go)
  and [pending callee comparison](../native/typescript-go/overlay/internal/exactcompiler/source_callee_availability.go).
- [Task planning](../native/typescript-go/overlay/internal/exactcompiler/tasks.go),
  [server state delivery](../packages/server/src/continuation/execution.ts),
  [public operation placement](../native/typescript-go/overlay/internal/exactcompiler/public_opaque_operation_effects.go)
  and [SDK component consumers](../packages/compiler/src/compilation/component-build-facts.ts).
