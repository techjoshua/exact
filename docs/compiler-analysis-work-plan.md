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

Core's ErrorBoundary default reset button reaches intrinsic receipt construction and its
prototype cache. The November 19 request profile on revision `4f7378ad1` sampled 11,765 MiB
of allocation through 25 seconds of client compilation. Accessor evaluation accounted for
3,593 MiB and registration of possible writer inputs for 3,149 MiB. During the 30-second
request, member selection appeared in 71.6% of CPU samples, returned-source projection in
67.7%, and native member lookup in 64.6%. These cumulative stacks overlap. The compile
reached the deadline before emitting the component. On the actual request,
removing the initial demand for one stored executor saved 13 of 495 indexed body-node visits
in an approximately five-millisecond phase. Later cross-module redemption was unverified
when both controls hit their test deadline. Keep ordinary indirect invocation conservative.
A stored executor’s body, a metadata getter executed at construction, and the executor called
at redemption have three different triggers. Skipping a tagged private helper’s whole body
would also miss an eager platform dependency newly introduced inside it.

The November 19 descriptor-key change at `53bd279d7` excluded most disjoint descriptor
candidates on the frozen 300-source Core request. In the instrumented before/after hosts
based on `7a4b7a697`, cumulative CPU in `sourceAccessorOperationCandidates` fell from
26.92 to 16.32 seconds. Both hosts reached the deadline. The after profile attributed
12.77 CPU seconds and 7,763 MiB of sampled allocations to `memberWriterBodyCalls`
(CPU through the deadline, allocation through 25 seconds, overlapping stacks). Total
allocation through 25 seconds rose from 7.87 to 10.86 GB. Those intervals contain
different work. Two fresh server compiles per host in before/after/after/before order
allocated 105.9–106.3 MB before and 101.2 MB after for a task that reads an installed
getter after a disjoint symbol definition. A dynamic-key control remained near 102.5 MB.
Each pair emitted identical code; the estimated-cost advisory changed. These guarded
single-CPU diagnostics use instrumented overlays and do not measure completed Core cost.

The reset button's receipt issuer calls `intrinsics.set` and normalizes children. In
the dependency query for `createCompiledIntrinsicReceipt`, the store lookup demands
`set` on the result of `sharedOpaqueOperationStore('intrinsic')`. The array lookup
demands `push` on the normalization array literal. Both are terminal Gets with opaque
interference. They retain the issuing call as the reader use. The array Get occurs
during `appendNormalizedChildren`. The indexed writes to `view.data`, `view.factory`
and `view.domain` belong to `readComposableIntrinsicReceipt`. None supplies either
terminal name, regardless of which invocation produced the view. The original Get
still owns installed accessor effects and each original Call owns its argument effects.

A separate acquisition starts at `compositionViews.get(value)` and projects
`data.key` or `data.domain`. Here the read cut was the call to
`domainOperationPrototype(prototype, metadata.domain)` during acquisition of the
`createOpaqueOperation` inputs in `withIntrinsicReceiptChildren`. The shared-store
writer assigns through a const initialized by the standard `Symbol.for`. Its RHS
cannot supply any segment of either named path. A computed segment with unknown
key or an authored symbol factory still requires ordinary writer discovery. The
matching `view.data` write, invocation of the stored factory and later use of a
cached field have separate consumers. A helper's resolved declaration alone supplies
no evidence about argument getters or callback invocation. After these exclusions,
the original 300-source Core request still reached
its 30-second deadline on instrumented and uninstrumented single-CPU hosts with Go
inlining disabled for the compiler package. Seven server task controls emitted
identical code in matched builds. Client tasks retained the installed getter and
the getter supplied through a nested dynamic alias as browser effects.

On the same ErrorBoundary input at `2940abd9d`, recovery for `view.domain`
at `intrinsics.get(value)` projected the shared store's `get` member and followed
`value` back to `compositionViews.get(value).factory`. Both projections reached
4,096 observations before the deadline. Matching a writer needs its callable identity
and creating scope. The ordinary source return inventory cannot identify a callback
obtained through an opaque store or determine which getter its closure captured.

This distinction affects server task emission. An opaque caller can invoke a closure
that installs a captured field on an object. When the task copies that field into
component state, a captured `document.title` getter requires the browser. A probe
that kept uncertainty but omitted refused writer scopes lost the getter and emitted
the server task. A plain captured field emitted on the reference host.
Writer discovery therefore retains capture recovery and donor publication. It reuses
the read's source and enclosing callable across each scan of indexed calls. Each
candidate still gets its original argument-order exception and reachability check.
In a diagnostic prefix of 100,000 candidate visits on the frozen Core build, the
old predicate required 200,000 source-file lookups. The scan performed 4,826 for
the same visits and agreed with the original ordering decision at every visit.
The original Core package build still times out on the first client component.

Callable effect collection now opens an explicit property-access query only for property
and element syntax. Implicit evaluation such as argument coercion has its own consumer.
Queries sharing an executable's source indexes also avoid constructing replacement maps.
In two server compiles of the direct state-helper regression per build, allocation attributed
to constructing dependency queries fell from 159 KiB to 37 KiB. The paired workload
allocated about 181 MiB overall in each build; this reduction is local to query setup.

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
| Pick an execution target | `resolveCallableEffectsWithWork` propagates executing dependencies to tasks, components and module initializers. Artifact targets now come from the definition’s converged effects, including known restrictions alongside unknown calls. Adding a caller cannot select a target for the definition. Known target requirements include an authored occurrence, target and reason; an unresolved alternative stays separate. A node can have several callers and participate in a cycle. | Resolve the host variant first, then propagate over the existing graph and its recursive groups. Treat known runtime imports as leaves; preserve lexical shadowing, type erasure and the effects of evaluating a module. Reuse an either-side definition on both targets. Keep a caller-specific callback or receiver requirement on the executing edge. Distinguish a true mixed dependency in one execution from mutually exclusive target exports and explicit cross-target dispatch. A predicted state write currently influences scheduling; it does not determine eligibility. |
| Invoke or store a callback | The evaluating caller owns argument expressions, defaults, getters and conversions. A stored callback value carries identity and any closure needed later; a true invocation carries execution effects at that use. A callback’s body may read a browser global or a secret. | Preserve ordinary passing and storage. Demand the body at a direct or recovered indirect call, including callbacks a standard algorithm invokes. A bound function, receiver or saved method may need source identity at that later call. Require the retained-then-redeemed cross-module browser callback to fail server placement before adopting speculative root removal. Keep eagerly executed metadata getters, mixed alternatives and secret arguments in the controls. |
| Initialize state and update a render reader | `collectStateAnalysis` and `collectReactiveBindings` supply state slots and subscriptions; `jsx_render_program_updates.go` wires specific updates. The component needs the signal, path or existing dynamic reader, and when to read it. It normally needs the helper’s actual returned text or style only when the program executes. | Keep authored evaluation, receiver identity, order, exceptions and cleanup. Prefer the existing runtime reader when it provides the dependency. Test that a nested helper read updates the correct mounted element and an unrelated field leaves it untouched. Check initial SSR, hydration and disposal. |
| Invoke an unchanged helper with mutable state | `callable_state_receivers.go` projects relative paths onto the component call. `task_pending_state.go` and task lowering enroll owned operands; the pending view journals actual writes under the generation signal. | Remove helper simulation used only to predict whether an already enrolled mutation happened. Preserve callee/receiver identity, evaluated arguments and the helper’s own return. Direct scalar and component-authored setter paths already work. An invoked setter on an inline argument can now publish a named scalar through its own field initialized to the component state root. Dynamic aliases, deeper initialization and escaping accessors still need receiver and lifetime evidence. |
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
search earlier writes, reconstructing their targets and scopes. The retired all-body
experiment used some of the same code with different demand roots. The item 6
inventory records the live readers separately.

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
reads and evaluate their effects at their own use sites. The checked primitive forwarding
case now uses the resolved definition edge for the call. The rendered data and browser-getter
controls cover that separation through compilation, including a foreign alternative beside a
known getter. The parser's result type does not establish that any subsequent read is inert.

### Forwarding object inputs through helpers

Theme's other color branch forwards the object input to `parseDtcgColor`, where destructuring
and indexed reads can invoke getters. Intl passes `formatter.options` to `validateOptions`,
which forwards it to `requireRecord`. Eager evaluation owns the read of `formatter.options`.
The record copy separately owns reads of the input's properties, including the supported
nonenumerable fields. Core's child normalization forwards an input array and a mutable
destination through a recursive edge. Iteration on the first input and writes through the
second need separate coverage.

A definition edge can carry input-independent effects once per definition. Formal substitutions
describe which original argument supplies an input. The relative solver already transports
invoked callable roles and field mutations in its supported domains. A substitution alone
does not report which getter an input Get can invoke. The existing field fallback requires a
completed outcome for the original operation on the direct edge. Forwarded field fallbacks
remain unresolved. The shared requester already propagates unsupported input uses through
forwarding edges. For those uses, `prepareSourceInputConsumerDecisions` dispatches the same
invocation dependency query after extraction. The query can instantiate the Get under a concrete
argument and recover a known getter beside a foreign alternative. Registering the definition
edge earlier can therefore move that work without removing it. Removing the query requires an
equivalent contribution at the original Get or enumeration, with that operation's receiver,
read cut and residual uncertainty. Placement has no consumer for the exact returned record,
component children or color channels at the call site.

Two shared-requester trials based on `4dd773d50` reused the existing declaration machinery
without changing the workloads. The first admitted nonterminal immutable formal forwarding to
the existing binder. The second enabled the existing source-input planner and terminal binder
for ordinary collection. In three alternating fresh server compile pairs per control, the first
retained artifact and placement decisions and changed a callback diagnostic path. The second
retained those decisions for data and getter inputs, including a getter beside a foreign
alternative. It settled the known callback input through relative transfer. When that same
input selected between a known browser callback and a foreign result, a forwarded invocation
requested an input projection the staged producer could not deliver. The request reported
pending compiler coverage where the baseline produced the browser placement diagnostic and
retained the unknown alternative. Keep the original requester for this domain.

Neither trial showed consistent improvement on completed requests. In the broader trial the
median callable-analysis time moved from 2.04 to 1.72 ms for direct plain data and from
1.90 to 2.73 ms for the corresponding getter. These cold requests include one compilation
each. On November 19, the fixed single-CPU, 1 GiB validation service ran the original Core,
Theme and Intl package commands against the 30 s client request deadline. Command wall times
to failure in that order were 31.83, 32.64 and 35.56 s at the baseline, 31.86, 32.32 and
34.66 s for the forwarding trial, and 31.84, 32.36 and 34.91 s for the broader trial.
Both trials were uncommitted overlays that changed only shared call admission. These
measurements establish the deadline outcome. They do not measure completed package throughput.

The mixed callback failure is an input producer gap. The original `value()`
issues an invoked-formal effect. Relative transfer carries that obligation through
the lexical calls until the actual argument is the local `input` read. The staged
binding producer retains the initializer as one source expression. Its DATA domain
accepts an inert value or an original Call, Get, or binding read. It does not resolve
this conditional into a known callable and a foreign alternative. The read remains
required for publication after the surrounding function facts have been collected.
The existing dependency query can recover both alternatives. Treating unpublished
DATA as runtime uncertainty would lose the known browser donor.

A named Get needs the accessor effects for its particular receiver and read cut.
The direct field outcome can discharge that obligation on its matching edge.
The forwarded fallback cannot use that outcome as transitive coverage. Enumeration
also needs the selected key set and per-key reads, including the nonenumerable
fields used by Intl. Relative mutation already substitutes supported target roles,
but concrete receiver or writer overlap still needs its own coverage. Reusing the
definition effects in any of these cases can leave the same recursive dependency
query in place. The trials did not establish a traversal that could be removed
with equivalent coverage on the original workloads.

The selected Theme operation is the `colorSpace` binding element in
[`parseDtcgColor`](../packages/theme/src/color.ts#L38), reached through
`parseThemeColor`'s lexical call `parseDtcgColor(value)`. The named Get belongs to
the binding element. Its receiver is the forwarded `value`, and the read follows
the earlier `components` binding and precedes the `alpha` default and color-space
dispatch.

In the original 20-source package command, an observation-only overlay at
`18fc4a7ab` recorded one dependency-query entry at this forwarding call during
the client `color.ts` compile. At that use, the Get had one input alternative
and two field fallbacks. Its field outcome was unfulfilled, with no concrete
getter or source write contribution. The named interference-scan counter
recorded zero entries for this Get. Missing input stopped member selection
before any concrete receiver could reach that scan. The package command then
reached the 30-second client request deadline in `components.ts` and exited after
32.32 seconds without paired artifacts. The observation used the fixed one-CPU,
1 GiB validation service. The executable SHA-256 was
`ac20ade67aed5befdfcfd5839b0d02dcfce6678da0b27826bfe218e75eb9966c`.
This run measures reach and time to failure.

The dependency query binds the input at the call, visits the actual Get alternatives
at that cut, and publishes callable/accessor donors, unresolved alternatives and
source writes. It also preserves the rest of the call's effects. The field outcome
records whether that specific Get was fulfilled for the instantiated receiver.
It can retire a matching field fallback on the direct edge when the required call
coverage is complete. The outcome is built from the Get traversal and carries no
independent replacement selection, write payload or proof about other alternatives.
An installed getter contribution can name and propagate a possible body at its
own cut. It cannot use that body to certify a foreign receiver or to reconstruct
the earlier writes that determined which member was selected. A field fallback
forwarded through another declaration is ineligible for direct-edge discharge.

In separate completed server requests, stable own data emitted and the
instantiated Get was fulfilled. The inherited getter, earlier descriptor replacement,
and known browser getter beside a foreign receiver all retained browser and
unknown effects and reported `EXACT2001` for the explicitly server task.
The forwarded dependency-query and matching scan entry counts were respectively
2 and 4 for data, 1 and 4 for inheritance, 1 and 2 for replacement, and 1 and 2
for the mixed receiver. These are entries across each complete request's compiler
phases. A single Get may ask for both effects and value acquisition.

Keep the original dependency requester for this operation. Reusing the field outcome
would either leave the same query in place or lose evidence required by placement.
This closes the proposed redundancy for the named Get. Enumeration and mutation
retain their current owners.


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
| Migration-only replacement mode | The former all-body harness required stronger results than public requests consume. | Removed in item 6. The ordinary demand, recovery and publication paths still serve production callers. |

## Implementation order and acceptance

Placement now uses an executable definition edge when a stable lexical call forwards an
unchanged checked primitive. Standard primitive members and a fresh dense literal's
`every` or `some` with a standard Number predicate can account for invocation effects
without reading the elements' values. Original operand expressions still own their
effects. Later property reads select returned getters, and a completed Get with
accounted effects can defer a missing runtime value to its later consumer.

The earlier Theme trace measured 8.716 µs to collect the `parseCssColor(value)` edge.
It then reached `.every(Number.isFinite)` on four returned fields. Their original Gets
can execute authored work. The Intl trace reached `validateOptions` after collecting
`requireRecord` in 1.375 ms. An unknown object passed to `validateOptions` may contribute
getters during initialization. A definition edge alone cannot identify them. An
earlier parser-result control eliminated two value-only source refinements in the
ordinary-data case and one in the mixed browser-getter case. Those events were
absent before the original Theme and Intl client deadlines.

Library compilation needs the callable graph for placement, context and policy.
The library builder has no semantic reader for the serialized callable inventory.
Both original client requests stalled during graph rebuilding, before inventory
projection, even when a private build omitted the callable array from its response.
On Theme’s immediate array literal, selecting the inherited `every` method previously
requested parser results to investigate possible receiver writes. The original
element reads retain their getter effects independently. On Intl, selecting
`validateOptions` finished before argument binding requested `formatter.options`
from the record returned by `requireRecord`. Copying its input can invoke getters.

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

On Core's ErrorBoundary compile, a possible writer input now stores a separate reading
record only when a consumer enrolls. At the 25-second mark, this site's sampled allocations
fell from 3,149 MiB to 1,091 MiB over approximately 5.1 million requests. Both runs reached
the deadline. Component discovery now assigns portable identities in its original pass, and
binding analysis resolves a component's props signature when it encounters the first
namespaced attribute that can use the signature. The opening-element traversal prunes
subtrees without JSX. Across 360 JSX and TSX source files under packages, apps and examples,
it visited 83,141 nodes instead of 170,125 and found the same 6,804 openings in order.

The checked native array membership lookup on a fresh literal now reaches the Theme color
parser. Executable element and argument expressions remain placement inputs. These changes
reduced individual costs measured on component compiles. The uninstrumented original Theme
and Core commands on revision `4f7378ad1` still timed out at 30 seconds on the client
compile, before producing paired artifacts. That run predates the compact callee-term layout.
The remaining acceptance criterion is successful compilation and use of both targets.

The November 19 placement run used the dirty integration worktree at `65af12ad0`
including the prior extraction changes. The native executable’s SHA-256 was
`b48d116c645a373ad1276cf4dfc30b7d18408d81eeba756f390e143952b43a79`.
With one CPU and a 1 GiB memory limit, elapsed time from package command start to
exit was 31.91 s for frozen Core, 32.79 s for Theme and 35.91 s for Intl. Each
client component request reached its 30 s deadline before emission. Core stopped
at `error-boundary.tsx`, Theme and Intl at `components.ts`. These are times to
failure. Earlier stack samples on the same workloads located all three requests
in direct callable extraction, before fixed-point propagation. Returned member
reads and possible writer inputs still request invocation-specific dependencies.

The November 19 follow-up used the placement extraction changes based on `097aa17de`
with executable SHA-256
`93b474031e900a543af61687d2f2d42c782aae704f5425304a2ff6d162790f55`.
The native overlay used the base accessor declarations and the placement work staged
for this change. Under the same coordinate-validation service limits and unchanged
30 s host deadline, command wall time to exit was 31.83 s for frozen Core,
32.64 s for Theme and 35.56 s for Intl. The same three client requests timed out
before emission. This measures time to failure and leaves full package acceptance open.


1. **Remove demonstrated redundancy in parallel with the hot-path change.** Remove production
   callable fingerprints. Resolve static imports at collection. In `linkProjectComponents`,
   retrieve a component’s callable fact once for the linker, `componentInputDemandsFor`
   and (when required) `componentInputBodyPlacement`. The original implementation scanned the same slice
   up to three times per component. Preserve the current first/last match behavior if a
   declaration can appear twice, and keep the Program/checker/source checks on input demands.
   The integrated linker groups matching facts in one pass; a persistent new cache is unnecessary.
   Compare emitted artifacts, complete public analyses and diagnostics across client/server
   and edits. Count removed serializations, traversals and fact comparisons. These are useful
   improvements independently of their contribution to either deadline.
2. **Use definition effects where the placement consumer needs no occurrence result.**
   The checked primitive forwarding case and the rendered data, getter and mixed return controls
   are complete. Ordinary object forwarding still has input-dependent Gets, enumeration and
   receiver writes. The definition edge carries known body effects and existing relative
   obligations. Keep the current input query where an original operation has incomplete coverage.
   For writer attribution that survives, use existing declaration or argument-relative effects
   to distinguish proven disjoint from possible overlap and insufficient coverage. Possible
   overlap alone cannot identify a replacement getter or callback. Preserve independently
   known browser, secret and state effects and the distinction between own and inherited work.
   Package acceptance requires paired target artifacts within the original deadlines.
3. **Reduce storage for the analysis that survives.** Empty reader scopes already defer
   map allocation (`ec1df3225`). Populated reader scopes already seal entries and defer
   writable indexes unless the registered consumer needs them (`368bb9fe5`).
   Branch-order and original writer binding still need an isolated scope. Creator
   comparisons use that same detached scope. The older matched Theme profile used an
   instrumented frozen overlay and reported 2,459,749,789 versus 1,692,252,314 sampled
   bytes attributed to reader cuts through about 25 seconds. Both attempts timed out
   and reached different amounts of work. In the isolated populated-cut control, the
   unread path used 7 versus 4 allocations and 1,560 versus 1,008 bytes per cut.
   The writable control used 7 allocations and 1,560 bytes per cut on both paths.

   A November 19 profile of the original 20-source Theme build at `18fc4a7ab`
   sampled 3,168 MiB of allocations on stacks containing the interference scan
   through 25 seconds of the client `components.ts` request. Flat allocation at
   the two singleton sites in `origins` was 203 MiB for the non-identifier return
   and 269 MiB for the fallback seed passed to `liveValues`. Of those flat totals,
   160 and 264 MiB respectively had the scan on the stack. The immediate initial
   operand acquisition through `occurrenceOrigins` accounted for 83 and 248 MiB
   respectively. Those allocations include inputs to acquisition that may
   produce a different result or expand a container. Other stacks include
   nested acquisition and other callers. These samples show time to failure
   and allocation attribution through the cutoff.

   The initial operand is consumed synchronously for overlap. One scan-local
   slot can back either singleton and is cleared after the operand is matched.
   The fallback binding resolver can use the seed directly or copy it into an
   owned join. Exact member acquisition and factory-origin replacement still
   produce their existing alternatives. Container members enter the FIFO through
   independent acquisitions with owned storage, and recursive scans have their
   own local slots. No origin storage travels into a write body, graph result or
   editor cache through this consumer.

   The matched allocation diagnostic reused the checked source and warmed
   indexes, with a fresh query per completed scan. Each disjoint case scanned
   48 authored calls with array literals, fallback identifiers, or nested
   object literals. Two 300-scan samples per host in base/candidate/candidate/base
   order gave 18,592 → 6,560 bytes and 201 → 154 allocations per scan for the
   direct return, and 18,216 → 6,184 bytes and 154 → 107 allocations for the
   fallback. The nested-container case used about 164,072 → 152,040 bytes and
   1,548 → 1,501 allocations. The short writer and opaque-call control stayed
   at 4,568 bytes and 30 allocations. Both hosts agreed on query work, opacity,
   value incompleteness and write outputs in the matched scans. The write
   control retained opacity and the three disjoint cases completed without it.

   The server component controls returned equal responses aside from timings.
   Stable own data emitted, while the descriptor replacement, a container
   passed to a foreign call, and mixed browser and data sources retained their
   placement diagnostics. The emitted container test passed on both targets,
   as did graph invalidation and watch tests. Three closure-interference
   subtests had the same placement failures and diagnostics on both hosts.

   Original package builds used the fixed coordinate-validation service with
   one CPU, a 1 GiB memory limit and the unchanged 30-second request deadline.
   In base/candidate order, wall time to exit was 32.17/32.13 s for Theme,
   31.50/31.49 s for Core and 34.47/34.41 s for Intl. Each run timed out on
   the client request for `components.ts` (Theme and Intl) or
   `error-boundary.tsx` (Core). No run emitted a new paired package. These
   command durations describe censored builds.
   The base and candidate host SHA-256 values were
   `93b474031e900a543af61687d2f2d42c782aae704f5425304a2ff6d162790f55` and
   `768b0d29c11f1f6fe555b9f7bcb971f545e4b990582544b4f240ceaee1971627`.
   Both used Go 1.27.1, Node 26.11.1, Linux WSL2 on a Ryzen 7 8745HS,
   and the same frozen SDK, package inputs and native build flags.
   The candidate overlay contained the production change from `6062cb0c0`
   on `18fc4a7ab`. The pending accessor edit was outside both overlays.

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

   Definition-owned placement reuses executing edges and propagates restrictions to convergence.
   The recursive, distinct actuals, eager and dormant callback, and application/library controls
   retain caller-specific effects and either-target exports. Target-specific package selection
   and per-source initializer effects still participate. Export reporting and pruning share
   availability within the executable selection and initializer revision of one request.
   Generated imports still enter transformed-artifact validation. Watch and language-server
   controls refresh an untouched caller when a helper or declaration changes.

   Cold component linking now shares the existing source-ordered candidates and their lexical
   signals with record construction and placement. Each admitted dependency used to run those
   three consumers' identical declaration discovery and signal classification separately. It
   now runs discovery once. Both targets retained the same code, source maps, analysis and diagnostics
   in the matched cross-file control, which included an unrelated root, repeated render edges, a
   child edit and a configuration change. The edit refreshed both edges from isomorphic to
   client placement. Callable body demand follows executable edges.

   The linker now indexes project declarations before preparing dependency records. Every
   component declared in the requested module seeds the render graph. Local targets reached
   through direct and finite JSX edges enter the placement fixed point. Dependency record
   preparation still runs per source file. Registry metadata, checker resolution, executable
   imports and watch discovery retain their own project inputs.

   On the same checked sources and configuration, the cold client fixture with an unrelated
   component root reduced dependency-source preparations from two to one and JSX link walks
   from five to three. A child edit brought the unrelated root into the render graph. Its client
   placement appeared in the child analysis. The 15 matched native host responses agreed on
   emitted code, source maps, analysis and diagnostics across both targets, application and
   library requests, edits and an alternate configuration. The comparison excluded timings and
   work counters. The baseline was the `66f368697` host below. The candidate host SHA-256 was
   `9adb1c972f978444e57ce81a338a4657709732f376e54d2d776e38d5a2590946`.
   Both used the same toolchain and installed declarations for the fixture, with the fixed
   one-CPU, 1 GiB validation service. The compared overlays excluded the pending accessor edit.

   Original package stacks reached direct extraction before propagation and linking. Sharing
   cached answers across entries would add an invalidation boundary without addressing the
   measured cold request. Occurrence-specific getter and writer work remains necessary where
   definition edges lack coverage.

   With the fixed coordinate-validation limits and 30-second host deadline, the original
   Theme, Intl and frozen Core client commands still timed out at `components.ts` (Theme
   and Intl) and `error-boundary.tsx` (Core). Time to command exit in base/candidate order
   was 32.27/32.13 s, 34.34/34.36 s and 31.52/31.49 s respectively. No new paired package
   was produced. Both hosts used the same original package inputs, frozen SDK and toolchain as
   item 3. The base executable was `768b0d29c11f1f6fe555b9f7bcb971f545e4b990582544b4f240ceaee1971627`
   at `7c6388236`. The candidate executable was
   `ce05b2940a3e4c295ee81c49ebbba882dc105cf92e83e0ad75080aec99f998c4` with the shared
   component discovery change. Both overlays excluded the pending accessor edit.
   Those packages timed out before project linking and were not rerun for the render-closure cut.

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

### Item 5 disposition at `a5c584b62`

The checked-primitive call and Get paths and the fresh dense array predicate path in
`collectDirectCallableEffects` require effects from the original operands. The
standard operation needs no separate occurrence result for placement. Theme's
`parseThemeColor` consumes the result of `[parsed.l, parsed.c, parsed.h,
parsed.alpha].every(Number.isFinite)` during ordinary execution. Its four Gets
remain placement inputs. The matched client component comparison retained emitted
code, analysis and diagnostics for the neutral predicate, browser element getter,
browser callback, same-name authored method, explicit own replacement and secret
operand. The own-replacement comparison included TS2352, so it is diagnostic
evidence only. The [server membership component control](../native/typescript-go/overlay/internal/exactcompiler/component_array_membership_test.go) covers Theme's hex-length
check, effects in the element and needle, authored `valueOf` for a nonempty array,
the empty-array case that skips conversion, and an authored method. These controls
exercise placement and emission. They do not require the compiler to predict the
boolean or array contents.

The same distinction applies when an algorithm actually enters authored code.
`implicitAccessorQueries` supplies iterator getter, enumeration, serialization and
coercion donors to callable and eager module analysis. `consumeNativeInvocation`
receives selected native alternatives from ordinary invocation, including a
borrowed target, and preserves applicable receiver writes and independent effects.
The represented-operation controls in the
[built-in policy](compiler-architecture-completion-plan.md#agreed-standard-built-in-trust-policy)
remain scoped to their original inputs. A typed-only receiver, an acquired own
replacement and an unknown iterator or thenable each retain their existing effect
obligations. In Intl, an options-record Get during argument binding can still run
an authored getter. In Core, receipt creation, metadata access and delayed executor
redemption each have a separate executing consumer. The checked standard entry
does not discharge those consumers or supply successful completion. The existing
comparisons did not establish another shared removal on an executing path.
The pending spread/member edit was excluded from this disposition.

For the task controls, an alias derived from component state follows that live
source at consumption. A read after the imported helper sees the pending task
view, including a write performed by that helper. Under that contract the retained
emitted server writer produced `after:after:take` and `before:before:skip`. A default
parameter reads the activation input when its arguments are captured. In the
separate defaulted control, the snapshot therefore stays `before` while both derived
reads see `after` on the taken writer path. The retained client and server artifact
checks observed `before:after:after:take` and `before:before:before:skip` for that
writer. [HTTP publication](../packages/server/src/continuation/execution.ts) independently intersects exact authorized response paths
with mutations performed by the request generation. The [direct HTTP control](../packages/compiler/src/compilation/task-state-regressions.test.ts)
authorized `result` for the read-only helper and additionally `left.value` for the
writer. Only the taken writer returned a `left.value` change. Neither the
activation input nor the derived reads grant authority for the sibling. These
are bounded controls for the activation change and leave broader task acceptance
open.

The [retained context checks](../packages/compiler/src/compilation/enhancement-intrinsics.test.ts)
cover a helper-private optional lookup and a provider and consumer with an imported
public token alias. Required-token metadata and
its ordering checks still have consumers in enhancement lowering and setup.
Hidden required tokens, escaping accessor envelopes and source-side opaque
receipt redemption retain their conservative treatment.

### Item 6 direct caller dispositions

| Candidate | Disposition and actual reader |
| --- | --- |
| All-body replacement mode | Removed the test-only request and project flag, session key suffix, gap panic and recovery, and construction-yield callback. Get acquisition, input delivery and native Effects discovery retain their ordinary incomplete-result, fallback and pending branches. `componentCallableDemand` and the public MAY purpose still choose work for normal requests. Callable cache refresh still uses changed source and requested-file identity. |
| Return and writer projections | The first cut removed `writerProjectionDelta`. `projectSelectedSourceReturns` serves acquired Gets, ordinary invocation, return projection and native descriptor callbacks that need a returned callable or receiver for the next operation. `reflectiveTargetValues` supplies possible write receivers. `writerSourceDelta` still builds and validates writer recipes and delivers their accepted contributions. |
| Implicit Gets, initializer and constructor | `collectDirectCallableEffects` uses `appendImplicitAccessorEffects` for executable donors such as iteration, copying and coercion. Eager module traversal uses `evaluatedAccessors` to account for effects before exported code runs. Direct extraction calls `sourceValueRefinementRequired` to select initializer, async-body and awaited-operand refinement. Source invocation calls `constructDependencyEffects` to retain constructor effects. Each still participates in ordinary placement. |
| Native entry and Symbol prefix | The first cut removed `nativeAlgorithmEntrySupported`. `nativeAlgorithmDescriptionSupported` still calls `nativeAlgorithmEntryShapeSupported` to admit supported algorithms. Removed `nativeSymbolSourceFacts`, `bindingSymbolWrite`, the unproduced source and static KEY schedule events, the observer and dependent first-binding Get/number-prefix checks. Builders only emitted direct string keys, so `storageKeyOperand` still validates those keys for member, array and descriptor storage operations. This scheduler experiment was independent of `nativeSymbolKeyReadingCurrent`, which still authenticates the original KEY reading for eager source and native writer capability consumers. |
| Private return and descriptor assertions | Moved the two return-description helpers and test-only descriptor/mutation fingerprints to Go test files. `relativeFieldMutationIdentity` retains shared fingerprint primitives for mutation propagation and contribution identity. The first cut removed the test-only map wrapper. Production still consumes `consumeStagedMapConversionTerminal` for ordered map protocol work. Descriptor acquisition still checks the current writer ticket through `currentPendingInvocationSource` before accepting target source. |
| Tooling, artifact and invalidation consumers | Session compile, check and analyze share callable demand and reject unresolved contributions before publishing. `nativeModuleAnalysis` maps that metadata and `sharedArtifactResult` checks callable neutrality before sharing output. The language service uses native analyze for source inspection and on-edit diagnostics. The LSP projects inspection into hover, task completions and fixes. Callable cache refresh and the import-elision generation's abandonment fence still protect source edits and interrupted checker work. |

The first cut at `fbf1fc653` used the fixed coordinate-validation limits of one CPU
and 1 GiB. The focused native controls covered descriptor-map ordering and borrow
lifetime, component descriptor and writer effects, semantic client/server compilation,
descriptor-key edits against a fresh session, and warm watch lowering after sibling
declaration changes. Both emitted descriptor/freeze artifacts executed with the original
JavaScript completion. The reactivity oracle was compiler-visible state ownership and
dependency tracking. Collection mutations retained their state paths, computed collection
reads still produced a safely reevaluable derived binding, and the client descriptor
task retained both state writes and render reads. These checks cover compiler behavior
and leave mounted render/update and hydration qualification open.

The follow-up cut used the same fixed limits and excluded the pending accessor
edit. Focused tests passed for ordinary check and analyze, paired component
compilation and placement, descriptor-key edits and warm watch lowering,
native map ordering and lifetime, and descriptor/freeze execution on both
targets. Task-state and reactivity assertions inspect compiler metadata and
lowering. The descriptor/freeze runners exercise emitted JavaScript without
mounting framework components.

The original frozen Core client build timed out at `error-boundary.tsx`. Theme and
Intl each timed out at `components.ts`. Each reached the 30-second request deadline
before emitting paired artifacts. This unreachable-code cut did not repeat those
builds and establishes no speed improvement. The standard-operation and task
receipts above are reused within their original source, target and runtime scopes.
They leave full package client/server qualification, fresh dependents and
end-to-end acceptance in item 6 open.

The inventoried private gates and test projections are exhausted. The remaining
executed-path work is item 6 acceptance. Begin with ErrorBoundary's ordinary
direct callable extraction under the stock request deadline. Follow the
component's remaining receiver/writer query to its effect or state consumer,
then narrow that query where argument-relative effects can answer it. Verify
the component's emitted client and server behavior before repeating the stock
package and fresh-dependent builds. The prior deadlines are separate evidence
for Core, Theme and Intl. Successful package emission, mounted updates,
hydration and the remaining item 6 boundary controls still need qualification.

### Ordinary callable extraction on Core

The ordinary Call requester in `collectDirectCallableEffects` uses
`appendArgumentAccessorEffectsObserved` and the source-only invocation query.
The receiver and writer search serves original callee selection, including
accessors, authored alternatives and unknown residuals. The requester publishes
environment and context effects, receiver-relative state writes, and executing
callable edges. A later Get that depends on the returned source has its own demand.

On the original frozen Core package command with the 30-second host deadline,
the instrumented `e036418fd` baseline reached the render closure's call to
`renderErrorBoundary`. An experimental overlay reused the existing declaration
Effects planner in ordinary extraction. It reached
`createDefaultBoundaryView(errors, reset)`. Both stopped at the client request
for `error-boundary.tsx` and emitted no new package. Wall time to exit was
31.63 and 31.96 seconds. Cumulative CPU in `memberWriterInputs` was 12.27 and
12.21 seconds within the censored intervals. A second experimental overlay
also admitted terminal formal forwarding through the source planner. It
timed out with the sampler still in `createDefaultErrorView` and showed no
further progress. These samples describe progress through different work.
They do not establish a completed-build speedup.

The production cut enables the source-planned declaration edge for ordinary
collection and leaves lexical defaults with the original binder. The
unprofiled production overlay reached the same package deadline and exited
after 31.72 seconds. The frozen package, SDK, Node 26.11.1, native build flags
and fixed one-CPU, 1 GiB service were shared. All overlays excluded the
uncommitted accessor edit. The observed frontier belongs to the instrumented
experiments.

The same-file definition edge can carry an ordinary lexical Call and compose its
known input-relative effects. The default button stores `reset` as `onClick`,
so passing it to receipt construction does not activate its body. The authored
custom fallback is invoked during render. Its property Gets and the selected
callback have separate effect obligations, including any secret access. The
18 paired component requests agreed on emitted text, source maps, component
analysis, and diagnostics. They covered stored and invoked callbacks, getter
effects, receiver writes, captured inputs, state updates, and secret capture
rejection. Direct effect provenance and call edges changed as the graph began
propagating those effects through definition edges. The paired state artifacts
rendered on the server, mounted and updated in the DOM, and adopted the existing
button during hydration before updating that same node. These fixture runs
used installed runtimes. The frozen Core build produced no new package artifacts.

At the remaining receipt path, the missing fact is coverage of the effects of
the operations that consume a particular input at its original cut. For a member
Call it includes the Get's possible getter and installed callable sources, any
receiver-relative writer that can change that source, and unresolved alternatives.
For the receipt constructor it includes the copied property Gets and the rest
elements later consumed by child normalization. The existing lexical planner
refuses rest formals and spread actuals. Definition placement supplies the known
body edge but cannot supply those missing contributions. The next graph slice
can subscribe a Get or Call to the receiver/key and input roles it actually
uses. A writer known to target a disjoint receiver or key can be excluded
before scope recovery. An overlapping writer still supplies its possible
accessor or callable sources, and an unresolved writer leaves a residual.
Neither side needs table contents, an exact receipt, or inputs unrelated to
those effects. Result-dependent reads and redemption keep their independent
producers.

### Source entry points

- [Request planning and printing](../native/typescript-go/overlay/internal/exactcompiler/session.go),
  [source preparation](../native/typescript-go/overlay/internal/exactcompiler/callable_project_collection.go),
  [cache and graph assembly](../native/typescript-go/overlay/internal/exactcompiler/callable_effects.go)
  and [component linking](../native/typescript-go/overlay/internal/exactcompiler/project_components.go).
- [Ordinary call effects](../native/typescript-go/overlay/internal/exactcompiler/callable_argument_accessors.go),
  [member visitor](../native/typescript-go/overlay/internal/exactcompiler/source_accessor_declarations.go),
  [interference scan](../native/typescript-go/overlay/internal/exactcompiler/source_value_interference.go)
  and [return projection](../native/typescript-go/overlay/internal/exactcompiler/source_return_projection.go).
  For an immediate named read of a synchronous factory result, the member visitor can
  exclude earlier calls from the receiver-write scan on a directly returned empty object
  literal. It matches the active invocation, selected return expression and conditional
  arm. Saved results and input aliases retain their writer searches. Descriptor and
  inherited-property lookup still belong to the original read.
- [Reader scope](../native/typescript-go/overlay/internal/exactcompiler/source_member_writer_inputs.go),
  [scope capture](../native/typescript-go/overlay/internal/exactcompiler/source_accessor_candidates.go)
  and [pending callee comparison](../native/typescript-go/overlay/internal/exactcompiler/source_callee_availability.go).
- [Task planning](../native/typescript-go/overlay/internal/exactcompiler/tasks.go),
  [server state delivery](../packages/server/src/continuation/execution.ts),
  [public operation placement](../native/typescript-go/overlay/internal/exactcompiler/public_opaque_operation_effects.go)
  and [SDK component consumers](../packages/compiler/src/compilation/component-build-facts.ts).
