# Compiler architecture completion plan

Status: execution authorized by the user on 2026-11-01 after the adversarial plan audit. The objective is to fully implement this plan. Work proceeds through local commits and isolated worktrees, with the coordinator integrating on the current branch. Push and publication are not authorized.

Prepared 2026-11-01 against the inspected working tree. The preserved pre-migration compositional-analysis checkpoint is v30. This is an internal cache revision, not a compiler release, a count of attempts at one problem, or a whole-language completion claim. The previously uncommitted framework work was preserved in local checkpoint `b30c50e45` before worker branches were created. That commit establishes reproducible source, not a validated release baseline. Subsequent implementation and acceptance changes use local commits and isolated worktrees.

The current local integration is a work in progress using parameterized source dependencies for ordinary Calls, returns, captures, Gets and construction. Normal output refinement remains separate. Integration does not establish acceptance: Core compilation still exceeds its deadline, additional eager evaluation and protocol coverage remains open, and the affected framework environments have not completed validation.

Field aggregation and retained client-artifact containment are integrated, including application fields added to native containers. Combined validation still exposes readonly collection helper placement, opaque browser callback provenance, and ordinary getter/deferred-construction placement failures. Historical initializer tests that demand the removed receipt side channel also require reconciliation. These rows remain acceptance work for the first integrated delivery and do not authorize another operation-family expansion.

## 1. Objective and correction

Complete the agreed compiler architecture: ordinary TypeScript and TSX must compose recursively, with eXact analyzing dependencies, effects, placement and ownership, then transforming the relevant component and task operations into durable state machines and continuations.

The AST already represents source nesting. The project does not need another parser or a compile-time JavaScript runtime to preserve that nesting. It needs consistent semantic analysis and transformation contracts over the existing syntax and plans.

The recent implementation drifted toward proving narrowly recognized source executions. Direct initializer Calls, returned closures, array destinations and successive Calls received separate admission and receipt handoffs. These produced some valid precision improvements, but did not establish the general composition path. Reports then confused analysis-engine coverage with transpilation capability. Both mistakes must be corrected.

The work is complete only when supported operations compose through their shared contracts, original authored examples work without fixture workarounds, applicable environments are validated, and superseded special-purpose paths have been consolidated. Another isolated prerequisite passing is not completion of the original problem.

## 2. Scope and non-goals

This plan covers:

- TypeScript source acquisition, checking and executable-source selection.
- Recursive source semantics, abstract values, dependencies, effects and mutation flow.
- Component, reactive, task, placement and policy planning.
- AST transformation, runtime continuation generation and emission.
- Incremental invalidation, analysis termination and diagnostic quality.
- Migration of useful existing analysis machinery and removal of redundant bridges.
- Regression, runtime, adapter, package and release acceptance.

It does not select a new runtime architecture, a second store or interpreter, a replacement TypeScript implementation, React-style rerendering, runtime readonly enforcement, publication, or unrelated package changes. Publication requires its own authorization and the process in [release readiness](release-readiness.md).

Arbitrary nesting means that the surrounding syntactic destination does not independently determine whether an operation can be represented. It does not mean every operation is pure, every callee is statically known, all programs are portable, or every dynamic program can be analyzed exactly.

Unknown operations must remain representable and conservatively analyzed. A genuine unresolved placement, policy or serialization requirement can still make a requested artifact invalid. The compiler must identify that requirement rather than misreport it as missing syntax support.

## 3. The actual current pipeline

The inspected pipeline in `native/typescript-go/overlay/internal/exactcompiler` is:

```text
TypeScript Program, checker, selected source and bound AST
    -> source and component discovery
    -> callable/value/effect/dependency analysis
    -> task, policy, component, continuation and partition plans
    -> diagnostics and target checks
    -> eXact AST transformations and target projection
    -> TypeScript printer, source maps and runtime dependencies
    -> adapter bundling and application runtime execution
```

Important source boundaries:

| Boundary                  | Current owner and evidence                                                           | Meaning                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Project effect analysis   | `session.go`, `collectProjectCallableEffects` around line 444                        | Produces compiler-side facts and summaries.                                                                                     |
| Analysis precision engine | `source_value_provenance.go`, `source_value_invocations.go`, `source_language_*.go`  | Models selected operations with compiler-owned values, Cells, branches and receipts. These are not application runtime objects. |
| Framework plans           | `session.go` around lines 555–600                                                    | Creates state-slot, continuation, resumption, target and partition contracts.                                                   |
| Placement diagnostics     | `callable_effect_resolution.go`, `moduleInitializerDiagnostics` around lines 807–851 | Emits EXACT2101 for an unresolved or mixed executable initializer placement.                                                    |
| Pre-emission error return | `session.go` around line 746                                                         | Can prevent all emitted code even though the AST itself is printable.                                                           |
| AST transformation        | `session.go` around line 767, `jsx_lowering.go`                                      | Rewrites the relevant framework constructs. Ordinary child traversal is already recursive.                                      |
| Printing                  | `session.go` around lines 898–929                                                    | Prints the transformed AST and produces source maps.                                                                            |

Line numbers are inspection anchors, not stable API. Follow named functions when source changes.

### 3.1 Four identities that must stay distinct

1. **Source identity:** a bound declaration, expression or operation in a particular Program and source version.
2. **Analysis identity:** an abstract allocation, environment, branch, operation instance or proof inside a compiler analysis.
3. **Generated-program identity:** a temporary, component state slot, continuation state or generated operation identifier.
4. **Runtime ownership:** the mounted component, task generation, resource owner or server request that may publish a result.

An analysis receipt cannot become an application runtime activation. A source type cannot become a runtime descriptor proof. A generated slot does not establish that the compiler executed its producer. These distinctions must appear in interfaces and comments.

### 3.2 What a nested Call requires

For ordinary `outer(inner())`, the existing AST can remain nested. If an eXact transformation must split evaluation, it can generate symbolic temporaries in JavaScript order:

```text
outerCallee = evaluate outer
innerCallee = evaluate inner
innerResult = call innerCallee
result = call outerCallee(innerResult)
```

A method Call also preserves its original receiver and performs its callee Get once. A suspension saves the necessary runtime temporaries and pending control state in the generated continuation.

Generating that structure does not require knowing either runtime function or result. Static analysis separately computes possible targets, dependencies and effects. If the precision engine models the same expression, it may need scoped partial-acquisition contexts, but that is an analysis implementation concern, not a prerequisite for printing arbitrary nested Calls.

## 4. What exists, what changes, and what is missing

“Present” below means an implementation exists. It does not mean the entire language family has current integrated acceptance.

| Area                         | Present                                                                                                            | Required change or missing work                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parsing and typing           | Native TypeScript Program/checker and full AST.                                                                    | Reuse them. Do not rebuild source parsing or infer runtime facts from annotations.                                                                                                           |
| Ordinary recursive emission  | `jsx_lowering.go` uses `VisitEachChild` for ordinary nodes.                                                        | Preserve this path. Demonstrate that analysis precision failures are not confused with inability to traverse syntax.                                                                         |
| Runtime framework emission   | Component, state, reactive, task, server, JSX and continuation lowerers.                                           | Audit their plan interfaces and composition across nested transformed expressions. Consolidate duplicate staging where needed.                                                               |
| General callable analysis    | Callable facts, call edges, source-origin queries and effect propagation.                                          | Complete parameterized return/capture dependencies and current-write propagation through containers and exports.                                                                             |
| Abstract semantic core       | VALUE/Reference, Cells, object/array storage, branches, completion, captures and selected Call/Get/Put operations. | Retain useful semantics. Separate general conservative transfer from optional exact-value proofs.                                                                                            |
| Recursive operation analysis | Some common expression lowering and operation recipes.                                                             | Replace whole-pattern source admissions with recursive node semantics and shared control/flow composition.                                                                                   |
| Call result flow             | Direct initializer, array initializer and finite multi-Call paths.                                                 | Make result/dependency flow independent of its consuming destination. Do not require destination-specific completion certificates for ordinary analysis.                                     |
| Unknown handling             | Opaque effects, incomplete values and residual paths exist.                                                        | Keep value uncertainty, target uncertainty, effect uncertainty and proof incompleteness separate. Preserve known effects beside unknowns.                                                    |
| Mutation and aliases         | Source write indexes, current member queries and finite persistent storage.                                        | Connect captured dependency paths through aliases and ordered writes. Prove strong replacement only when justified, otherwise join.                                                          |
| Host source selection        | Maintained executable-slots capability v2 and selected runtime-body association.                                   | Preserve exact signature/body distinction, conditions, dependency invalidation and veto/externalization behavior. Implicit-config and factory compatibility remain open.                     |
| Security qualification       | Callable/constructor qualification, public projections, finite generic checks and lexical context policies.        | Class-field aggregation and retained client-definition containment are integrated, including authored native-container fields. Combined security and environment acceptance remain required. |
| Incremental operation        | Program/generation ownership, indexes and caches.                                                                  | Audit abstract dependency keys and invalidation across source/config/import/current-write changes. Preserve ownership without demanding live historical frames.                              |
| Termination and cost         | Advisory analysis accounting and several finite recurrence repairs.                                                | Establish a finite analysis strategy for recursion, loops and transformed generic families. Keep resource failure separate from conservative precision loss.                                 |
| Diagnostics                  | Semantic, placement, task and analysis-cost diagnostics.                                                           | Classify true unsafe boundaries separately from an analysis implementation gap. Keep warnings advisory. Never suppress a real boundary to get code.                                          |
| Acceptance tooling           | Native tests, emitted Node checks, composition corpus, adapter and runtime runners.                                | Rebind the changed contracts to an explicit environment matrix and a current reproducible source boundary.                                                                                   |

### 4.1 Maintained baseline to preserve

The v30 checkpoint includes bounded qualified behavior for:

- Ordinary parameter/local Get transfer and literal JSX input adoption.
- Registry alias-cycle and pending-writer recurrence repairs.
- Supplied-helper definition MAY analysis and its bounded dependency graph work.
- Class-field settlement-prefix handling.
- Descriptor restoration, native freeze integrity, alias-setter precision and shorthand safety.
- Module-origin effect transport and collection-map known effects, with map domains still OPEN.
- Genuine module captured Cells, two finite indexed Calls and hoisted creation.
- Conditional formal-member reads and numeric, earlier-formal, member and nullish parameter defaults.
- The finite nullish-default Get Throw path.
- Direct initializer Call results, nested closure creation and immediate direct captured invocation.
- Deferred possible Proxy Get effects, with no normal Proxy-result or DATA authority.
- Bounded represented-value `typeof`, including construction-only function category.
- Creation-only creator Return into array slot 0 and destination initialization.
- Compiler-erased task-policy effect correction and narrowly corrected test harnesses.
- Native executable-slots v2, with protocol 1.0.0 and target/source binding checks.

These are useful behaviors and regression controls. They are not permission to retain every associated implementation detail. They must survive consolidation through simpler shared mechanisms where possible.

### 4.2 Private work that is not the maintained baseline

| Candidate                                | Current evidence                                                                               | Disposition while work is stopped                                                                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Adjacent array Call after creation       | Private native analysis, client/server compile, matched emitted Node and parity checks passed. | Preserve as comparison and regression material. It is not maintained integration and does not solve the full intervening-write/export case.    |
| Empty-hoisted callable ingress           | Private source/native/runtime checks and review passed. Later combined normal checks passed.   | Preserve the coherent private candidate. Final combined observed runtime, standalone host, vet/format and maintained apply were not completed. |
| Async resolution-object effect channel   | Private positive cases passed, then browser-to-safe capture replacement exposed overretention. | Held. Do not merge it into the new shared path without resolving its current-write semantics.                                                  |
| New shared lowering or acquisition stack | Read-only reassessment and interface sketches only after the stop.                             | No implementation is accepted. The proposed stack was identified as belonging to the analysis engine, not general transpilation.               |

The exact bindings are in the local `source-ready.json` checkpoint under `.tmp/framework-confidence/compositional-language-progress-root-estimate-20261029-round1/maintained-integration`. Preserve those records, but do not copy private whole files into maintained owners.

## 5. Foundational contracts to establish before further implementation

### 5.1 Source and binding contract

Use the TypeScript AST and checker for syntax, lexical binding, type diagnostics and selected declarations. Build or reuse one function/module source index for evaluation structure, control successors and source locations.

The source index must not encode that a Call is valid only when it is the last const initializer, the only array element or the second standalone statement. Unsupported semantic precision is represented in analysis facts, not by losing the surrounding syntax.

Type-only syntax is erased according to TypeScript. Runtime-emitting TypeScript syntax remains a runtime operation. Local shadowing, declaration order, TDZ and module executable selection retain their own rules.

### 5.2 Symbolic operation and flow contract

Establish one vocabulary for source semantics: binding read, member Reference, Get, Put, Call, Construct, allocation, initialization, branch, merge, Return, Throw and suspension boundaries. Reuse current operations where their contracts fit.

Eager module evaluation gets an effect owner from its source schedule, independently of optional Call or getter refinement. Declaration-only syntax and deferred bodies do not acquire performed effects merely because they have AST descendants. Top-level runtime statements share `runtimeModuleEvaluation` for discovery and identity, including class definition work, blocks, control statements and export assignments. Each original statement owns its nested eager operations. The existing source walker separates computed names and static work from instance initializers and callable bodies. Module demands consult the existing lexical branch/completion relation before collecting effects. Implicit lexical disposal and reached class/member decorator application retain independent opaque protocol contributions until their contracts account for them. Explicit decorator factories and member Gets stay eager, including parameter decorator expressions when authored TypeScript options enable legacy decorators. Parameter defaults and bodies remain deferred. Activated decorated-class defaults enter the shared source demand list, including generator defaults. Raw default contributions use the existing initializer-phase obligation, while instantiated caller effects keep their own operation context. Supplied inputs bypass only the matching default, preserving independent body effects. Invoked method roots do not repeat their definition decorators. Their application does not publish arbitrary decorated body effects or replacement/initializer execution. A definite initializer Throw acquires no disposal obligation. Selected import and re-export loading remain with the module dependency owner. These relationships grant no normal output or descriptor receipt, and artifact authorization and target pruning retain their existing contracts.

Each operation names its source site, symbolic operands and result, control predecessors and successors. It does not require a known runtime result merely to exist. A source reference must remain distinct from its acquired value so receiver and evaluation-order semantics are preserved.

Do not invent a universal runtime IR if existing AST and framework plans can express the transform. The shared requirement is semantic composition and consistent relationships between consumers. The representation decision must explain what concrete duplication it removes.

Start with a lazy, AST-backed interface over bound nodes, existing source indexes and framework plans. Do not materialize another operation graph for every node merely to satisfy this vocabulary. Store shared records only when identified consumers need them, with explicit invalidation. The first design must show one concrete pair of destination-specific paths replaced by a shared transfer, including which repeated scans or records disappear.

### 5.3 Abstract analysis contract

Analyze symbolic operations with abstract facts, including:

- Possible value categories and optional exact constants.
- Possible source callable targets and parameterized return descriptions.
- Lexical capture identities or dependency roots.
- Abstract object/array locations, field paths and alias relationships.
- Known guarded effects and dependencies, plus independent residual uncertainty.
- Possible Normal, Return, Throw, suspension and divergence outcomes.

Concrete-known evaluation is a refinement of these facts. It is not the only way to transfer a browser dependency or preserve a function through an array.

Keep these questions separate: Can the operation be represented? What may it depend on? What effects may it have? Is a precise value known? Is the requested framework boundary authorized? A negative answer to precise-value knowledge cannot automatically answer all the others negatively.

### 5.4 Function and closure contract

For generation, resolve free references to their lexical declarations and record which bindings must remain available. The compiler does not need the captured runtime values. Reuse the TypeScript checker's resolved symbols and existing scope ownership. A lexical context-chain lookup is the underlying model, but identifier-text searches must not replace bound-symbol identity or mishandle shadowing, hoisting, block scope and TDZ.

Preserve ordinary JavaScript closures where no transformation requires otherwise. When a state-machine or continuation rewrite moves work out of its lexical scope, map the referenced binding to the appropriate generated parameter, component slot or persistent runtime environment. Preserve shared mutable binding behavior and per-iteration binding distinctions. A compiler traversal stack can be discarded after generation, but the generated program must retain any environment that an escaping closure needs. Creating a closure must not read or execute its deferred body.

For analysis, build summaries parameterized by arguments, receiver and free bindings. Start with symbolic relationships such as `reads captured input.value`, rather than exact captured values or compile-time function activations. A returned closure retains a relationship to its captured binding or abstract object, not a snapshot of that binding's old value.

Transport that relationship through ordinary binding, array/object storage, return and argument operations. Reads at a later program point consult the applicable write state. Source callable category does not require body-entry permission. Effect-summary edges are not proof that a body definitely ran.

Only add value or alias precision when a specific consumer needs it. The original projected-call placement case needs enough dependency flow to connect the captured member read to the browser-derived write. Closure generation itself does not require that analysis. Recording only that a free variable is used is sufficient for many capture-emission decisions, but does not by itself establish its eventual placement, secret qualification or reactive field dependencies.

#### Minimum analysis-summary interface

The following is a consumer contract, not a requirement to allocate a new record, execute a function or introduce a heap interpreter. Prefer adapting the existing callable facts, `sourceValueOwner`, relative receiver bindings and effect graph.

| Part                       | Required information and rule                                                                                                                                                                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Definition input           | Bound function/declaration identity, selected executable source, parameter/receiver positions, free binding symbols and deferred child functions.                                                                                                                                                                                           |
| Use input                  | Caller source site and control context, supplied abstract argument/receiver relationships, captured environment relationships, requested observation point and relevant write-state dependencies. No runtime argument value is required.                                                                                                    |
| Binding versus acquisition | A live binding reference follows that binding's applicable assignments. Passing its value to a formal associates the formal with the value/object alternatives acquired at that call site. Reassigning the caller binding later does not retarget the already acquired argument.                                                            |
| Context identity           | Distinguish factory uses and capture environments enough to preserve required aliases and independent inputs. Use source sites and a finite abstract context policy, not unbounded simulated runtime activation IDs. If contexts are merged, join their alternatives and retain uncertainty rather than asserting unique identity.          |
| Return output              | Parameterized relationships such as an acquired argument value, a newly created closure with capture mappings, or a projected container field. Include Normal/abrupt/residual possibilities without requiring a concrete return value.                                                                                                      |
| Dependency/effect output   | Relative read/write paths, known guarded host dependencies and effects, escape facts, residual effect roots, and whether each contribution belongs to current evaluation or a deferred body. Merely creating a closure does not publish its future reads as performed work.                                                                 |
| Instantiation              | Substitute a use's abstract arguments and captures into the summary once at that use. A returned function's deferred reads are resolved when the consuming operation is analyzed, using the relevant captured binding/object relationships and observation point. Never replay initializer syntax to manufacture them.                      |
| Mutation and joins         | Keep acquired scalar snapshots distinct from live captured bindings. Track object identity only as precisely as the requested dependency needs. Strong replacement requires definite target/key/order and covered interference, otherwise union old/new and unknown alternatives.                                                           |
| Validity and termination   | A summary is valid only for its Program/source/configuration/selected-source dependencies and the mutation facts used at its observation boundary. Initially it may be request-local and uncached. Recursion and repeated contexts must converge through finite joins/widening or produce a conservative result with known donors retained. |

Relative state effects must retain argument-to-parameter mappings through forwarding and reordered arguments. A derived effect edge must carry its use's mapping, or consume the already mapped callable graph. Deduplicating writes by path cannot repair a lost receiver relationship. `TestForwardedStateEffectBindings` protects direct, forwarded, reordered and separate-call mappings, with an ordinary-object control that must not acquire parameter authority. Conditional alternatives must retain known and unknown receiver relationships independently. Paired emitted checks preserve the original argument order and actual mutation target.

Predicate observation follows the shared logical short-circuit rule directly, without reacquiring an entire left subtree to ask for its predicate again. Forwarding obligations retain each source reference once in first-seen order. Their consumers check reference membership, so repeated joins must not duplicate the retained path. Interference scans contribute a monotone opacity verdict and can stop after that verdict is known, while still computing the member boundary proof and leaving known values, indexed writes and getter effects with their owning analyses. These local bounds do not establish request-wide acquisition termination or package-compilation acceptance.

The source dependency consumer uses `sourceValueSummary` demands, `sourceValueBindings`
and per-use creator contexts through `source_value_dependencies.go`. Instantiated contexts
and current-write results are request-local. Only checker-owned AST templates and static
write indexes are shared. Ordinary synchronous effect demands enter this consumer directly.
Normal storage recipes and acquired-value receipts remain separate refinements for consumers
that request getter-chain elision, await operands or async settlement.

Effect resolution associates a relative field or Call obligation with its original source
operation, declaration, phase and instantiated use/consumer. Coverage requires every matching
source alternative to be complete. Calls and getter bodies publish the same immutable coverage
records. Receiptless return projection uses `consumeInvocation` and its selected-body/input
consumer in `source_return_projection.go`. Each alternative's creating bindings and creator
context stay installed through successful-return projection, including Call-valued callees
and stored intermediate functions. This relation creates no normal output or execution receipt.
A missing exact output can be discharged only by its matching operation relationship.
Known dependencies, unmatched unknown effects, normal outputs and execution receipts remain
separate contributions. Generator calls evaluate arguments and activated defaults while their
bodies remain deferred. This source contract does not model generator resume state.
Dependency-only body entry joins finite source input relationships for an active declaration.
Distinct acquired callbacks and capture roots can instantiate that same summary before its
outer invocation finishes. The relation uses source nodes, formal symbols, creator/use sites
and adjacent member edges. Distinct relation sets retain reordered and recombined inputs.
It contains no live input maps or runtime activation identities.
Repeated edges and cyclic capture, rest or copied relationships saturate with residual
uncertainty on reentry. New source alternatives still contribute their demands and known
donors after a join. Normal entry and unrelated active-occurrence fences keep their existing
guards. These query-local entries are released when the outer body consumer exits.
Query-local advisory work is accumulated into the checker owner's existing cost counters
without retaining a query or its binding maps. Binding-write and member-write relations remain
owned by `source_value_bindings.go` and `source_value_members.go`.

Constructor dependencies share the selected executable target owner with normal construction.
Selected constructor bodies and instance-field demands retain known effects beside unresolved
construction, without supplying an instance or completion receipt. Default derived constructors
retain base dependencies. Class-definition keys, static initializers and deferred field closures
keep their own evaluation phases. Effects-only New origins carry selected source fields and
prototype members into ordinary member and serialization demands. Field initializers acquire
scalars at construction while referenced objects retain applicable later member writes. The
existing ordered write owner qualifies replacement of a known own data field. Unknown escape
or constructor-return replacement keeps independent lookup uncertainty. Missing exact instance
output alone does not add an effect. Shared selected-return projection also supplies getter
return relationships without issuing a Get receipt. Definite abrupt construction prevents later
field or serialization consumers, and nonconstructible functions do not perform their bodies.
Completion projection here establishes no successful Normal result. Literal-computed class
member selection and the serialization `toJSON` protocol still require separate donor audits.
Array-binding summaries retain default donors beside unresolved iterator/value selection. Such a summary does not prove iterator execution or default bypass.

The first summary slice must distinguish these controls:

- `let x=a; const f=()=>x.value; x=b; f()` reads the later live binding `x`.
- `const f=make(x); x=b; f()` keeps the formal's association with the previously acquired argument object, while later writes to that same object remain visible.
- `make(a)` and `make(b)` must not accidentally share a parameter environment merely because their parameter declaration is the same.
- A `finally` assignment to a captured formal before the creator completes affects the later closure read, without executing that read during closure creation.
- An already acquired scalar remains a snapshot when its former source binding is reassigned.

These controls prevent a free-variable list from being mistaken for sufficient placement analysis while keeping capture generation independent of exact-value analysis.

### 5.5 Effects, writes and uncertainty contract

Known effects survive joins with unknown alternatives. A runtime value can be unknown while its browser or server dependency is known. Property writes must preserve which abstract location and key they may affect.

Use strong replacement only for a definitely selected successful write with sufficiently complete target/key/interference information. Otherwise join possible old and new values and effects. Unknown calls invalidate exposed mutable facts conservatively without erasing unrelated known donors.

Do not treat a declaration type as proof of a DATA descriptor, builtin identity, absence of a Proxy trap, immutability, purity or a public/security qualification.

### 5.6 Transformation and runtime continuation contract

Preserve ordinary JavaScript AST where no eXact rewrite is needed. For transformed operations, generate temporaries, state slots and control edges that preserve evaluation order, receiver, once-only effects and abrupt exits.

Runtime continuation state is generated-program state. It may retain temporaries, pending completion and ownership tokens across a suspension. It is not an analysis receipt. eXact task generations fence publication without pretending to cancel JavaScript effects or restore readonly data.

### 5.7 Policy and placement contract

Abstract analysis supplies guarded dependencies and effects to placement and policy. Those consumers make their decisions under explicit framework rules. Retaining the ordinary AST is not a reason to emit an unsafe cross-target artifact.

EXACT2101 must continue to reject genuinely unresolved executable placement. The repair is to recover supported dependency/effect relationships, not to disable the diagnostic. Deferred secret inspection must not establish public aggregate disclosure. Whole-value qualification includes call and construct member result contracts as well as record fields and indexed payloads. A public sibling projection is checked using its selected checker type, including a resolved generic invocation, while argument policies and execution effects remain independently enforced.

Qualification queries visit each checker type identity once. Finite record width does not impose a qualification limit. A narrow checker adapter reuses the pinned TypeScript checker's deeply nested type detection, including its recursion identities for reference, anonymous, mapped and conditional types. The detection follows repeated active instantiation origins rather than a global type count. A positive signal retains incomplete qualification protection, including when a deep conditional payload could become secret. It cannot authorize disclosure or populate the completed cache. Separately selected public leaves retain their own qualification query.

Completed facts belong only to the current unchanged checker generation and are reused at query roots. Inner traversal discharges its own active family obligations so subtree cache warmth cannot change whether a query completes.

#### Uncertainty and requested-artifact decision table

The selected request, target facts and policy determine authorization. “Unknown” alone is not a decision. Preserve the separate value, target, effect and qualification facts below, and feed them to the existing owning boundary.

| Facts at the use                                                                                                                            | Requested artifact/context                | Required decision                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unknown runtime string, known browser dependency, no additional opaque effect                                                               | Client artifact                           | Keep the client dependency and emit if the remaining component/module, type and policy contracts permit it. Do not seek the DOM string.                                                                          |
| Same browser dependency                                                                                                                     | Server artifact                           | Apply existing target projection, paired export or denial rules. Never evaluate the browser operation on the server or infer safety merely because its value is unknown.                                         |
| Unknown result, supported effect-free operation contract                                                                                    | Otherwise authorized target               | Value uncertainty alone does not create a new opaque-effect denial. Other argument effects, dependencies and policy still apply.                                                                                 |
| Opaque Call effects with current `ArtifactTargets` explicitly including the requested target                                                | Target-local artifact                     | Preserve the opaque facts. Apply the existing target authorization rather than automatically raising EXACT2101. A request's target by itself is not this authorization, and no purity or policy release follows. |
| Unbounded opaque Call or side-effect import during eager module initialization, without an applicable existing target/host/policy allowance | Requested client or server artifact       | Keep known donors and residuals and report the owning placement diagnostic. Structural printability does not authorize execution there.                                                                          |
| Unknown deferred function body, no current invocation                                                                                       | Function creation/storage                 | Do not invent performed body effects. Keep deferred obligations for invocation, reactive or boundary consumers. Creation's own effects and all independent checks still apply.                                   |
| Indivisible known browser and server effects                                                                                                | Requested single-target initializer       | Reject under the current mixed-placement rule. An opaque-target allowance does not turn mixed known effects into safe work.                                                                                      |
| Incomplete secret or serialization qualification                                                                                            | Disclosure/transport consumer             | Deny or remain unproven according to that independent policy. A known target or printable AST does not grant disclosure or serialization.                                                                        |
| Sound precision widening completed                                                                                                          | Any consumer                              | Use the widened result, including known effects and remaining uncertainty, then apply that consumer's ordinary authorization rules. Do not describe it as runtime Throw or a failed compiler execution.          |
| Analysis bug, resource abort or inability to produce a sound conservative result                                                            | A check needed for the requested artifact | Report the actual analysis/resource failure and withhold the unestablished permission. Do not cache success, invent purity or classify this as an unsupported AST node.                                          |

The current `moduleInitializerDiagnostics` contract is narrower than blanket rejection. It skips this diagnostic for `TargetDefault`, rejects known mixed initializers, and for opaque unknown initializers considers `ArtifactTargets`, `preserveOpaqueInitializers` and `policyConstrainsModuleInitializer` on the server. `session.go` derives the host-preservation input from `PreserveOrdinaryModules` and the eligible ordinary/test-module context. None of those paths grants unrelated type, secret, transport or runtime ownership permission.

Before changing this boundary, pin positive and negative fixtures for each existing allowance and trace the fact to its current policy owner. Preserve the existing allowance when justified, or record an actual defect and repair it with its counterexample. Do not silently broaden an exception or abolish it as part of an analysis refactor. Default-target analysis is not evidence that a client/server artifact was authorized.

Field declaration annotations participate in whole-value qualification through checker-resolved
property declarations. Public sibling selection and retained-definition containment are separate
consumers. After target and task projection, retained qualified initializers deny client publication
with EXACT3022 and no code or map. Only unreferenced definitions with effect-free creation may be
removed. Stored-property contracts follow checker declarations across aliases without treating
synthetic constructor prototypes or callable result types as stored data. Retained direct eval
fences pruning after erased wrappers are normalized. Private authored source must not reappear in client map `sourcesContent`.

### 5.8 Proof and lifetime contract

Keep precise analysis receipts where they justify optimization, elision, descriptor preservation or other consequential facts. They remain compiler-side derivation artifacts with source/generation/dependency validity.

Do not require a successful concrete-known Call receipt for every general source dependency transfer. Do not pass analysis IDs into generated runtime ownership. Do not cache live traversal frames. Distinguish historical derivation validity from fresh observations of mutable state.

### 5.9 Reuse the existing TypeScript compiler before adding machinery

Read-only inspection confirmed the following facilities in the pinned native TypeScript source used by this repository. These are concrete reuse candidates, not claims that each is already integrated or suitable without an adapter.

| Priority                       | Existing facility                                                                             | Reuse and expected simplification                                                                                                                                                                                                                                         | Boundary to preserve                                                                                                                                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First                          | Checker symbol binding, `GetSymbolAtLocation` and `ResolveName`                               | Resolve free variables and shadowing once. Reuse declaration identity for captures, reads, writes and renaming rather than maintaining independent name-resolution stacks.                                                                                                | A resolved declaration is not the current runtime value or an unchanged property descriptor.                                                                                                                                            |
| First                          | `ast.NodeVisitor`, `VisitEachChild` and generated factory update methods                      | Keep one recursive transformation strategy and update only affected nodes. Preserve ordinary nested syntax instead of manually reconstructing it. Existing eXact JSX traversal already uses this mechanism.                                                               | Generic child traversal preserves syntax. It is not a substitute for operation-specific effect or evaluation-order analysis.                                                                                                            |
| First                          | Printer `NodeFactory.NewTempVariable`, `NewUniqueName` and `EmitContext` lexical environments | Reuse hygienic temporary generation and declaration placement for split expressions and continuations. Avoid independent string-based naming or hoisting systems.                                                                                                         | Generate temporaries only at actual transformed boundaries. Runtime saved state remains an eXact continuation concern.                                                                                                                  |
| First                          | `EmitContext.SetOriginal`, source-map and comment-range helpers                               | Maintain authored-source association, diagnostics and source maps through node updates. Avoid reparsing printed source or using text offsets as declaration identity.                                                                                                     | Keep checker-owned source stable. Follow existing parent-link and Program lifetime rules rather than mutating the checked tree indiscriminately.                                                                                        |
| Next                           | Binder flow nodes and checker flow/type queries                                               | Reuse available branch, assignment, loop and narrowing information when it answers an analysis question. Add eXact dependency/effect facts to source identity instead of rebuilding all control-flow discovery.                                                           | TypeScript flow supports type checking and is not a complete JavaScript effect, alias, mutation or runtime-execution graph. Verify coverage and add only missing relationships.                                                         |
| Next                           | Existing TypeScript transform chain and semantic helpers                                      | Audit type erasure, runtime-emitting TypeScript, destructuring, logical/optional/nullish operations, class fields, async lowering and other upstream implementations before writing equivalents. Adapt supported helpers where their ordering and target contracts match. | Do not run a second incompatible transform chain, erase information before authored analysis, or use ordinary TypeScript JSX lowering for native eXact components. Preserve the existing adapter-owned stages and target configuration. |
| Next                           | Checker signatures, alias/export queries, Program and module resolution                       | Reuse declaration/signature resolution, import/export binding and project dependencies. Cache shared source facts per valid Program generation.                                                                                                                           | A typing signature, especially from a declaration file, does not prove a unique executable target. Host-selected source, conditions and externalization remain authoritative.                                                           |
| After architecture correctness | Cached function summaries, AST subtree facts and incremental project state                    | Compute shared read/write/capture facts once, skip unaffected subtrees and invalidate only dependent summaries. Avoid repeated whole-module scans and per-consumer rediscovery.                                                                                           | Key caches by source/config/dependency validity. Subtree flags do not establish purity. Imported changes, mutable inputs and policy dependencies can require invalidation.                                                              |

Concrete upstream locations include `internal/checker/exports.go`, `internal/ast/visitor.go`, `internal/ast/flow.go`, `internal/printer/factory.go`, `internal/printer/emitcontext.go`, `internal/transformers/chain.go` and `internal/compiler/emitter.go` in the pinned native TypeScript checkout. The maintained eXact integration is under `native/typescript-go/overlay`. These are internal APIs, so reuse requires the existing upstream pin and compatibility checks.

The largest expected gains are less duplicate compiler implementation, fewer AST passes and preservation of syntax that does not need rewriting. Do not promise measured speedups before profiling. TypeScript supplies syntax, binding, typing and standard transformation machinery. eXact still owns reactivity, placement, policy, durable component semantics and its runtime continuation contracts.

### 5.10 System and builtin types use explicit contracts

Use the supported platform and builtin contracts. Do not attempt to prove the implementation of JavaScript engines, DOM objects, standard constructors or conforming polyfills by analyzing their code. Standard-library declarations supply typing and recognized declaration identity, while the supported semantic/effect model supplies the operation contract. A compatible user-authored structural type does not automatically acquire that contract.

Examples:

- A `document.title` read has a browser dependency even when its actual string is unknown. No reconstructed DOM object, native allocation or executed getter receipt is necessary to record that dependency.
- A supported Promise operation uses its specified scheduling and callback/settlement contract. The compiler need not establish the concrete Promise implementation or solve the eventual fulfillment value merely to represent or emit it.
- A supported array operation uses the modeled callback and access behavior. A readonly annotation does not prove immutable elements, native method identity or absence of getters and Proxy behavior.

Recognize local shadowing and relevant authored replacements. If the selected reference or an operation's effect is genuinely unresolved, preserve that uncertainty and any known alternatives. Do not silently treat an arbitrary function with a matching signature as a system function.

Apply stronger current-reference, descriptor or mutation proof only when a particular optimization or framework boundary requires it, such as eliding a Get, selecting one replacement method or asserting absence of a callback. Do not make proof of the entire platform or globally pristine prototypes a general condition of transpilation. Changes to public host-integrity assumptions remain separate architecture decisions.

The lookup contract must name the supported host/builtin model, bound reference or receiver relationship, member key when applicable, and acquisition point. Its dependencies include relevant authored writes through aliases, reachable prototype writes, imported changes and foreign escapes that can affect that lookup. Reuse the mutation and standard-entry owners described in `docs/native-compiler.md` rather than introducing a competing native-identity rule.

- Direct local shadowing selects the authored binding, not the builtin contract.
- A definite replacement of `xs.map` or `Array.prototype.map` participates in a later lookup and selects or joins the authored behavior.
- A foreign operation receiving an alias to `xs` can make a later method lookup uncertain. Invalidate the overlapping receiver/member facts, preserve known alternatives and apply section 5.7 to the use.
- A method value acquired before a later property replacement remains that earlier acquired value. Looking up the method again is a fresh observation. Calling it still includes argument, callback and other effects required by its contract.

These are local lookup and dependency rules. They do not require scanning or proving an entire platform implementation. Precision about a specific acquired reference must not silently become an assumption that every ambient prototype is unchanged.

This follows the existing `docs/native-compiler.md` contract: inference supports the target standard libraries, including conforming polyfills, without validating their implementation. Host globals retain their target requirements. System API contracts do not establish blanket purity, policy release, serialization or ownership authority.

## 6. Representative use cases and required outcomes

Each row is a contract to validate, not a claim that the whole case currently passes.

| Use case                                                                 | Required behavior                                                                                                                                     | Current state and work                                                                                                                                                                                  |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `outer(inner())`                                                         | Preserve outer callee acquisition before inner evaluation. Join both analyses. Emit nesting or ordered temporaries without requiring known functions. | Ordinary AST traversal exists. General analysis composition needs audit and consolidation.                                                                                                              |
| `obj.method(a(), b())`                                                   | Evaluate receiver and callee Get once, then arguments left to right, preserving `this`.                                                               | Existing reference and Call owners exist. Repeated source admission and optional precise acquisition contexts are incomplete.                                                                           |
| An argument changes the callee binding                                   | Invoke the already acquired function, not the replacement.                                                                                            | Preserve runtime AST semantics. Precise analysis must distinguish binding state from acquired value.                                                                                                    |
| Throw or suspension in an argument                                       | Do not evaluate later arguments or invoke the outer Call prematurely.                                                                                 | Completion concepts exist. Verify transformed and analysis paths independently.                                                                                                                         |
| Call result in a binding, array, object, return, argument or conditional | Use the same result-flow relationship independent of destination.                                                                                     | Several finite bridges exist. Replace their ordinary-analysis role with shared transfer.                                                                                                                |
| Returned closure called immediately                                      | Retain capture relationship and dependencies.                                                                                                         | A bounded maintained direct path passes. It is a regression control, not the universal mechanism.                                                                                                       |
| Returned closure stored in an array                                      | Preserve the callable and capture dependency through the slot.                                                                                        | The shared analysis now passes the unchanged array/current-write/export anchor. Legacy precise bridges still need consumer-based consolidation.                                                         |
| Captured object member changed before invocation                         | Later closure read sees the applicable member write and dependency.                                                                                   | The unchanged original and current-write controls pass on the integrated source. Full related-family acceptance remains open.                                                                           |
| Old scalar acquired before a later write                                 | Old scalar retains its original dependency and value possibilities.                                                                                   | Original peers pass in bounded evidence. Preserve them against an overbroad mutation fix.                                                                                                               |
| Aliases and safe replacement                                             | Distinguish old object identity from reassigned binding. Do not retain stale browser effects after a proven safe replacement.                         | Existing source and precise storage mechanisms are partial. Their shared transfer must be explicit.                                                                                                     |
| Unknown alias write                                                      | Keep known donors and add uncertainty. Do not claim a strong kill.                                                                                    | Existing conservative owners exist. Validate through new summaries.                                                                                                                                     |
| Getter, setter and Proxy                                                 | Keep lookup, trap and body effects at the correct phase. A dormant body contributes no performed effect.                                              | Descriptor/Get owners and effects-only Proxy refinement exist. General Proxy values remain unresolved.                                                                                                  |
| Computed member or key coercion                                          | Preserve base, key and coercion order, including Throw and known effects.                                                                             | Several recipes exist. Arbitrary nesting is not comprehensively accepted.                                                                                                                               |
| Defaults and destructuring                                               | Evaluate defaults only for undefined alternatives, preserve parameter order, TDZ and iterator/close rules.                                            | Many finite qualified slices exist. Replace wrapper-dependent routing, retain semantic algorithms.                                                                                                      |
| Rest/spread and unknown vectors                                          | Preserve order, argument positions, iteration and unknown length.                                                                                     | Mixed bounded support and missing ingress. No fake exact vector from a type.                                                                                                                            |
| `typeof`, `void` and operators                                           | Analyze and emit operands in their actual language order. Category knowledge is separate from invocation authority.                                   | Bounded typeof and several operators exist. BigInt/Symbol/native ingress remains incomplete.                                                                                                            |
| Hoisted and lexical functions                                            | Preserve declaration instantiation, actual lexical binding and deferred body behavior.                                                                | Captured hoisting is maintained. Empty-hoisted unrelated-argument ingress is private.                                                                                                                   |
| Blocks, branches, loops and labels                                       | Compose all control edges and completions. Analysis terminates conservatively.                                                                        | Statement-family implementation is incomplete. Ordinary syntax printing is not absent.                                                                                                                  |
| `try`/`catch`/`finally`                                                  | Preserve pending completion, replacement rules and prefix effects across exits or suspension.                                                         | Partial semantic paths exist. Broad composition remains to validate.                                                                                                                                    |
| Classes and `new`                                                        | Separate eager static work, deferred methods, instance fields and constructor behavior.                                                               | Bounded construction paths pass. Unknown alternatives must conserve authored constructor effects.                                                                                                       |
| Async return and `await`                                                 | Distinguish body completion, Promise result and settlement. Generate correct runtime control flow without solving the Promise at compile time.        | Existing emitted task/await infrastructure and partial analysis exist. General analysis precision is open.                                                                                              |
| Iteration and generators                                                 | Preserve done/value ordering, close precedence, deferred bodies and resumption.                                                                       | Several finite iterator/close contracts pass. Full generator/async coverage is incomplete.                                                                                                              |
| Browser/server value through helper                                      | Propagate placement dependencies without knowing the actual DOM/server value.                                                                         | Some direct paths pass. The integrated returned-closure/container/current-write anchor passes native and paired emitted checks. Broader environment acceptance remains open.                            |
| Imports, reexports and selected runtime implementation                   | Analyze the executable source selected by the host while retaining its typing declaration.                                                            | v2 selected-source transport is maintained. Factory and implicit-config integration still have gaps.                                                                                                    |
| Component state and derived expressions                                  | Maintain one durable component instance and rerun only affected consumers.                                                                            | Mounted nested capture passes two updates with retained instance, state and DOM identity in Node-hosted Vitest/jsdom. Broader reactive integration remains open.                                        |
| Parent props and component inputs                                        | Preserve parent ownership and accessor/Proxy effects. Adopt only supported delivery facts.                                                            | Literal JSX input adoption is maintained. Generic standalone props and current component-method descriptor precision remain open.                                                                       |
| Tasks, optimistic state and cleanup                                      | Preserve setup ownership, generation fencing, direct state updates and disposal.                                                                      | Substantial infrastructure exists. Test transformed nesting against it, not just scalar helpers.                                                                                                        |
| SSR, hydration and islands                                               | Preserve paired ownership, placement, serialization and DOM identity.                                                                                 | Existing runtime and corpus coverage exist. Changed contracts require fresh affected-environment acceptance.                                                                                            |
| Secret data through aggregate or generic types                           | Deny unauthorized whole-value disclosure even when qualification is deferred. Preserve proven public leaves.                                          | Call, constructor, lexical, field and retained-artifact containment repairs are integrated. Native-container augmentations retain independent stored obligations. Combined acceptance remains required. |
| Cache reuse and source replacement                                       | Never reuse stale targets, dependencies or policy facts across changed source/config/state.                                                           | Ownership infrastructure exists. All new summary relationships need explicit invalidation.                                                                                                              |
| Foreign calls and dynamic code                                           | Preserve ordinary JS where allowed, invalidate exposed analysis facts and keep unresolved authority visible.                                          | General precise modeling is intentionally limited. The conservative boundary still needs a consistent contract.                                                                                         |

## 7. The unchanged end-to-end anchor

Keep the original source from `TestModuleWriteProducerDependencies/projected_call` unchanged:

```ts
function make(input: { value: string }) {
	return () => input.value;
}
const input = { value: 'safe' };
const xs = [make(input)];
input.value = document.title;
export const value = xs[0]!();
```

Baseline result: exported `value` was analyzed as `unknown`, expected `client`. The module browser write was known separately. This analysis failure caused EXACT2101 before AST lowering, despite the printable Call syntax.

Integrated verification at `09925238a` now passes the unchanged native anchor and paired emitted checks. The client reads the title getter once, the server reads it zero times, and the safe RHS control reads it zero times. The [owned composition corpus](component-composition-corpus.md) records the exact execution scope. This closes the original behavior at those boundaries. It does not establish completion of the language families, transformed suspension, package builds or the affected environment matrix.

The intended analysis does not need the contents of `document.title`:

1. `make` returns a closure whose member read is relative to its captured `input` argument.
2. The argument aliases the module object. The closure relationship survives storage in `xs[0]`.
3. The intervening write stores a value with a browser dependency into that object's `value` field.
4. The later closure read observes that dependency at the applicable program point.
5. The exported value is client-dependent. Its runtime string may remain unknown to the compiler.

Paired controls must include a safe RHS remaining isomorphic, a write after the read not retroactively changing it, an unrelated field write not contaminating it, distinct creator inputs not sharing captures, and an unknown overlapping writer preserving uncertainty.

Analyze, compile and runtime expectations are separate. Validate the existing paired-artifact/export contract on both targets rather than assuming both should execute a browser read. Do not weaken a placement or security diagnostic to obtain an emitted artifact.

## 8. Inventory of language-family work

The existing A–L inventory remains a historical scope crosswalk. It mixes four different kinds of work, which must not become one all-or-nothing completion gate:

1. **Ordinary preservation:** keep syntax and upstream behavior when no eXact rewrite is required.
2. **Required conservative analysis:** discover the dependencies/effects and uncertainty needed by a particular supported framework consumer. Exact values are not required.
3. **Framework transformation:** rewrite only constructs that interact with component state, tasks, target boundaries or other eXact semantics.
4. **Optional precision:** derive exact values, identities, branch choices or internal platform behavior to improve otherwise sound analysis or enable a particular optimization.

| Family                       | Ordinary preservation                                                                              | Required analysis and framework-sensitive work                                                                                                  | Optional precision, not a general syntax gate                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| A: References and writes     | Preserve ordinary access, assignment, delete and update syntax.                                    | Track relevant reads, writes, aliases, receiver and key effects. Rewrite observed state/props and transformed references where needed.          | Exact descriptors, selected accessors, strong kills and private/super object identity.           |
| B: Conversion and operators  | Preserve operators or use the configured upstream transform.                                       | Keep operand order, guards and possible coercion effects. Stage operands only across an actual transformed boundary.                            | Exact constants, conversion recipes, Symbol/BigInt results and statically selected branches.     |
| C: Patterns and containers   | Preserve literals, patterns, rest/spread and defaults through the existing source/TypeScript path. | Carry relevant dependencies through fields, vectors and bindings. Rewrite reactive patterns or suspended operands where necessary.              | Exact own-key populations, iterable contents, argument lengths and selected defaults.            |
| D: Calls and construction    | Preserve ordinary Calls and `new` expressions.                                                     | Join target/receiver/argument effects and symbolic return relationships. Integrate actual task/transport or suspension boundaries.              | Known-value Call execution, exact constructed instance, bound target and newTarget results.      |
| E: Closures and classes      | Preserve native closure/class semantics outside rewrites.                                          | Resolve free bindings and eager versus deferred work. Retain needed runtime bindings across moved component/task code.                          | Exact environment instances, private brands, object identities and per-instance field results.   |
| F: Statements and completion | Preserve blocks, control flow and abrupt exits.                                                    | Account for reachable guarded effects and dependency writes. Preserve pending completion in transformed control flow. Analysis must terminate.  | Exact path pruning, iteration counts, branch states and divergence proofs.                       |
| G: Async                     | Preserve ordinary async/await through native syntax or the configured upstream lowering.           | Distinguish deferred work and resumed dependencies. Implement eXact task/target continuation ownership and publication.                         | Exact Promise settlement, thenable execution and fulfillment objects.                            |
| H: Iteration                 | Preserve ordinary loops and generators where the host/compiler target supports them.               | Retain relevant iteration/callback effects and closing behavior when eXact transforms or consumes them.                                         | Exact iterator steps, yielded values and generator suspension states.                            |
| I: Reflection and storage    | Preserve ordinary reflection and platform Calls.                                                   | Use supported contracts, relevant mutation/escape facts and known handler/getter effects. Serialization boundaries keep independent validation. | Exhaustive descriptors, prototype chains, Proxy result identities and freeze-preservation facts. |
| J: Modules                   | Preserve module syntax under the selected host/module contract.                                    | Resolve executable sources, live dependencies and target ownership. Rewrites must retain import/export and cycle semantics.                     | Exact module-evaluation state and arbitrary loader/CJS implementation modeling.                  |
| K: Foreign/dynamic behavior  | Preserve runtime syntax where the supported source mode permits it.                                | Invalidate exposed dependency facts conservatively. If a moved-code or safety boundary cannot be established, diagnose that boundary.           | Executing foreign functions or resolving arbitrary eval/with behavior.                           |
| L: TypeScript                | Reuse upstream erasure and configured runtime-syntax transforms.                                   | Retain bound source/policy identities and any runtime work introduced by the selected transform.                                                | Reimplementing the TypeScript checker, transformer or emitted helper semantics.                  |

Some optional precision becomes required for a specific optimization or public behavior. In that case name the consumer and requirement explicitly. It does not become a prerequisite for unrelated ordinary syntax or every family in this table.

For example, an ordinary generator on an authorized target can remain native generator code. A generator feeding reactive dependencies or crossing a task/transport boundary has additional obligations. Exact compile-time simulation of all its iterator states is a separate precision project.

Framework integration is an additional dimension, covering components, state, tasks, contexts, registries, placement, transport and policy. The first integrated delivery is the original anchor plus a mounted reactive composition and their relevant controls, defined below. It does not wait for optional exact modeling of every A–L family.

## 9. Step-by-step completion guide

These are dependency stages, not new release versions or permission to postpone foundational invariants. No stage authorizes silently changing the architecture. Each change must name the contract it owns and the observable failure it fixes.

### Rules applied to every substantive integrated slice

Before integrating a slice, specify:

1. Its finite abstract context/join/widening strategy and sound fallback for recursion or budget exhaustion. A failure to construct a sound result is not success.
2. Its lifetime and dependency validity. Request-local uncached summaries are acceptable first. A cache without source/config/import/mutation coverage is not.
3. Its artifact-authorization decisions from section 5.7, preserving all independent policy and serialization checks. Existing incomplete policy precision cannot grant release authority.
4. The duplicate bridge or scan it replaces. Retire that path within the slice once its consumers are migrated, rather than leaving cleanup to the project's end.
5. Meaningful source positives/negatives, fresh native branch/condition witnesses for the changed analysis/lowering paths, and emitted semantic checks. Record defensive or unavailable outcomes individually without claiming MC/DC or exhausting arbitrary fabricated graphs.
6. Its affected adapter/render/runtime/package matrix, with executed rows and justified unaffected rows. Run affected checks with the slice and reuse them while relevant inputs remain unchanged.

These are proportional acceptance rules for coherent behavior changes, not a full-suite run for every helper. Later stages deepen policy, cache and environment coverage. They do not allow an earlier unsafe, nonterminating or stale intermediate integration.

### Step 0. Stop and preserve the baseline

**State: done for planning.**

1. Stop delegated implementation and queued work. Verify owned process cleanup.
2. Keep maintained v30 and the existing index unchanged.
3. Preserve private adjacent-array and empty-hoisted variants and their failure evidence.
4. Record unfinished validation as unrun. Do not promote candidates merely because they were nearly integrated.
5. Perform only read-only inspection and this plan until implementation is explicitly resumed.

**Exit:** the user has one accurate baseline, no hidden active work and no ambiguous maintained/private claims.

### Step 1. Reconcile the architecture and terminology

1. Map AST/checker, source index, analysis summaries, precise refinement, framework plans, transformations, printer and runtime to named owners.
2. Annotate existing design terms such as “execution,” “actual,” “receipt,” “Cell” and “continuation” as analysis or generated-runtime concepts.
3. Correct the existing engineering reference where it implies precise source execution is the transpiler backbone.
4. Establish the contracts in section 5 with source examples and interface consumers.
5. Classify each existing whitelist or source-family check as semantic necessity, source-index validation, optional precision limit or accidental composition restriction.
6. Assign each use case to ordinary preservation, required conservative analysis, framework transformation or optional precision. Do not size the first delivery from the old mixed-precision percentage.

**Exit:** one reviewed pipeline map and contract table. An implementation must be able to explain exactly where an unknown value lives and why it does or does not affect placement or transformation.

### Step 2. Establish a truthful baseline corpus

1. Bind the current maintained source and tools, including dirty-worktree inputs.
2. Reproduce the unchanged original anchor once and retain its Analyze result and actual diagnostic chain.
3. Select a small composition corpus from existing cases: nesting in arguments, bindings, arrays, objects, returns and branches, plus method receivers and abrupt order.
4. Classify each failure as typing/setup, analysis precision, security/placement denial, transformation defect, runtime defect or resource failure.
5. Keep expected behavior independent of emitted text and internal receipt counts.
6. Build the affected-environment matrix now. Name the client/server, mount/update/disposal, SSR/hydration, adapter-resolution and runtime contracts intersecting the first delivery, including justified unaffected rows.
7. Pin the section 5.7 artifact-decision examples, capture binding-versus-acquisition examples and relevant builtin replacement controls as contract fixtures before changing their shared facts.

**Exit:** a fixed representative corpus and affected-environment matrix with original source, expected behavior, current result and first responsible subsystem. Historical partial replays do not count as this current baseline.

### Step 3. Consolidate the source semantic and control-flow interface

1. Reuse the existing bound AST and source index. Identify the smallest shared symbolic operation/flow representation needed by analysis and transformed boundaries.
2. Define recursive expression results as values or References, with explicit control/completion relationships.
3. Specify source evaluation schedules per operation type. Compose their children without examining whether the parent is a particular initializer shape.
4. Centralize shared structural validation and source-location association instead of separately enumerating operands in lowerer, population, prefix scan and dispatcher.
5. Preserve existing semantic algorithms for coercion, descriptor lookup, iterator close and async domains. Do not replace their order with a generic child union.
6. Leave ordinary unchanged AST on the emission path. Use symbolic staging only for actual framework rewrites or required continuation splitting.
7. Prefer the lazy AST-backed interface in section 5.2. Demonstrate the shared transfer on two existing destination paths and identify the special-case records/scans removed. Do not replace the old interpreter-shaped admission with an eager universal operation graph.

**Exit:** the same supported operation can be represented in several destinations without new destination-specific admission or proof records. No concrete-known value is required merely to build that representation.

### Step 4. Complete shared abstract value, capture and effect transfer

1. Separate lexical capture resolution for generation from capture dependency summaries for analysis. Resolve existing checker symbols through lexical owners and map only the required runtime bindings into transformed environments. Do not introduce exact captured-value evaluation for generation.
2. Add or consolidate parameterized function return and capture summaries in the existing callable/source-value owners. Begin with symbolic binding and member-read dependencies.
3. Carry closure dependencies through ordinary binding and object/array slots.
4. Connect demanded field reads to applicable member writes and alias state at the consuming program point.
5. Represent a browser-derived unknown string as unknown value plus known browser dependency, rather than demanding the runtime string.
6. Separate may-effects, dependency reads, writes, target uncertainty and successful-value refinement.
7. Reuse precise known-value proofs where they improve a fact. Their failure must fall back to sound abstract transfer, not erase known contributions or simulate syntax again.
8. Implement the minimum summary consumer contract in section 5.4, with finite recursion handling and request-local lifetime or complete invalidation from the first slice. Run contrasting capture, stale-import and recursive-summary controls before framework consumers adopt the facts.

**Exit:** a source-level analysis path can explain the original capture/container/write/read relationship without a concrete DOM value or full-module execution certificate.

### Step 5. Close the original failure end to end

1. Make the unchanged anchor report the correct exported client placement through the shared facts.
2. Keep safe, later-write, alias, unrelated-field, repeated-creator and unknown-writer controls correct.
3. Exercise the artifact-specific allow/deny cases in section 5.7. Preserve justified existing exceptions and report genuine unsafe placement. Do not remove EXACT2101 or reject every unknown as a substitute for analysis.
4. Compile the actual client/server artifact pair under the established export contract.
5. Run matched emitted consumers with independent value/effect/order and cleanup assertions.
6. Repeat the same semantic operations in the other destination shapes from Step 2 to reject a fixture-specific fix.

**Exit:** the original behavior works and the explanation points to reusable operation transfers, not a new exact module matcher. If this fails, revise the shared contract rather than declaring another prerequisite delivery complete.

### Step 6. Integrate with component and reactive state-machine planning

1. Feed dependency summaries into state, derived value, render and task consumers without re-deriving source semantics in each lowerer.
2. Preserve eXact's long-lived component definition model. Do not turn its outer definition into a React-style linear setup/rerender function.
3. Verify state aliasing, nested mutation, props ownership, context/ref/resource ownership and cleanup.
4. Keep task policy markers compiler-erased while ordinary default arguments and body effects remain analyzed.
5. Test a nested helper/closure dependency driving an actual mounted component update, not only a scalar export.
6. Use the same component instance across an observed state change. Assert the affected render/derived consumer updates, an unrelated consumer is not spuriously rerun, and cleanup occurs once. Include the corresponding safe and unresolved-dependency controls.

**Exit:** changes update only the affected work on the same inspectable instance, with correct task activation, errors and disposal.

### Step 7. Validate transformed nested Calls and runtime continuations

1. Identify where a framework Call or Await actually requires splitting rather than ordinary AST preservation.
2. Use existing task/continuation AST factories and plans to save symbolic callee, receiver, arguments and result as needed.
3. Validate once-only Get and operand evaluation, callee replacement during argument evaluation, and pending completion through catch/finally.
4. Keep suspension and generation/publication semantics in generated runtime contracts. Do not substitute compiler receipt lifetime for runtime ownership.
5. Verify client/server transitions, cancellation, stale-result rejection, disposal and pending work using actual artifacts.

**Exit:** nested transformed operations preserve JavaScript order and eXact ownership without compile-time simulation of their runtime results.

### First integrated delivery boundary

Steps 1–7 produce one vertical delivery, not seven independently declared feature completions. New operation-family expansion waits until this boundary passes. Necessary foundation repairs and safety corrections continue within the boundary. A passing representative example does not advance a stage whose exit conditions remain unmet. When a prerequisite fails, the next assignment repairs that prerequisite or validates an independent requirement of this delivery. It does not add another optional capability.

The delivery includes:

- The unchanged projected-call anchor and safe/current-write/capture controls through shared analysis facts.
- One actual mounted component using a nested helper/returned closure through a container to read observed state, with update, instance identity and cleanup assertions.
- The required value/Reference, receiver, operand-order and abrupt-completion cases across several syntactic destinations, using ordinary AST preservation or the existing transformed boundary as appropriate.
- Finite summary behavior, source/import replacement validity, artifact-decision and independent policy negatives, and local builtin shadow/replacement/acquired-reference controls.
- Removal of the replaced destination-specific bridges, updated owning contracts and the actually affected environment rows, including native condition and emitted behavior evidence.

Detailed generator/Promise/Proxy execution modeling and other optional precision do not block this delivery. If one becomes necessary for an included public behavior, establish that exact dependency rather than broadening the whole project by default. Missing required safety or affected-environment verification remains an acceptance gap.

### Step 8. Complete remaining operation families on the common path

1. Start from the four-way section 8 classification. Preserve ordinary syntax with the existing upstream/AST path and supply the required conservative facts for its actual framework consumers.
2. Implement missing eXact transformations only where supported state, task, transport or other framework behavior requires them. Define one applicable operation contract and compose it with the existing source relationships.
3. Treat exact BigInt/Symbol/native values, iterator states or reflected descriptors as separate precision work unless an identified supported consumer requires that precision.
4. Use representative family-level end-to-end targets and mechanism-based negatives. Do not turn every wrapper or optional exact result into a project-completion gate.
5. Keep dynamic or unprovable cases conservative with explicit reasons and known effects retained. The ability to preserve a runtime construct is distinct from authority to move or disclose its result.

**Exit:** required syntax preservation, conservative analysis and framework transformations have an explicit supported contract and acceptance. Optional precise modeling has an honest backlog with consumer justification. Only a proposed new public language/environment limitation requires agreement, not every internal conservative join or unimplemented optional optimization.

### Step 9. Resolve policy, host-selection and incremental-analysis frontiers

1. Complete aggregate qualification for supported field policies and retained secret-bearing client definitions. Preserve the maintained callable/constructor result checks, finite generic inspection and incomplete-query refusal.
2. Preserve selected `.d.ts` signatures separately from host-selected executable bodies and validate import/reexport/current dependency lineage.
3. Complete context/factory dependency handling using the shared summaries, not phantom-type exemptions or guessed core-method identity.
4. Extend the lifetime, finite-analysis and dependency rules already required with every slice. Complete broader cache reuse for values, captures, writes, effects and qualifications only when coverage is established. Reanalyze or stay uncached when it is incomplete.
5. Exercise changed source, imported dependency replacement, checker/config changes, repeated requests, reset and current mutation state.

**Exit:** security cases deny correctly, public controls pass, and no copied or stale summary can authorize a current request. Unselected or external source stays conservative.

### Step 10. Consolidate and remove superseded machinery

1. Finish the consumer inventory and removals begun with each integrated slice. Inventory every remaining destination-specific bridge before deletion.
2. Migrate each consumer to the shared relationship and prove the same behavior there.
3. Remove obsolete initializer/array/two-site receipt-selection branches once their ordinary-analysis role is replaced.
4. Retain exact-proof algorithms only for consumers that need that strength. Give them a named, bounded interface.
5. Remove duplicate validation and abandoned private staging paths. Keep consequential failed examples as focused regressions, not permanent investigation frameworks.
6. Consolidate owning docs and temporary plans after the architecture is implemented. Do not publish development chronology to the docs app.

**Exit:** the final implementation has fewer independent semantic paths and no permanent old/new engines for one operation. Cleanup is part of delivery, not a future optional task.

### Step 11. Validate the affected framework-wide environment matrix

1. Consolidate the per-slice affected-environment results and run appropriate native analysis/compile regressions on the exact integrated source. Rebind fresh native branch/condition evidence when relevant analysis or lowering inputs changed.
2. Validate actual emitted client/server consumers, real browser behavior where applicable, SSR, hydration and task/resource lifetime.
3. Exercise Vite, Bun and Webpack paths affected by shared compiler resolution, configuration or artifacts using shared observable fixtures.
4. Run `npm run test:runtimes` for changed shared server/runtime boundaries. Keep Node, Bun, Deno and workerd outcomes explicit.
5. Validate installed-package consumers and source/body selection outside workspace conveniences.
6. Run TypeScript checks, Go vet, formatting, relevant build-script tests, source-map and diagnostic checks.
7. Run a current bounded or complete regression campaign with all exclusions reported. Preserve resource failures and unexecuted tails.
8. Measure representative analysis cost, memory and delivered artifacts only after correctness, using the repository's measurement and retention rules.

**Exit:** the [composition corpus](component-composition-corpus.md) and affected environment matrix contain actual results. Shared code or Node-only tests do not stand in for unexecuted environments.

### Step 12. Final acceptance, documentation and release preparation

1. Review the integrated architecture, not only individual patches.
2. Verify original examples, compositional corpus, security controls and regression frontiers against the final source binding.
3. Update `docs/native-compiler.md` and relevant public lessons with supported usage and actual limits. Keep the architecture plan internal.
4. Reconcile API/artifact changes against [release readiness](release-readiness.md), including ABI classification and released fixtures.
5. Apply repository artifact policy to staged changes when staging is separately authorized. Keep raw captures, builds and copied source out of Git.
6. Publish a concise final change description: behavior fixed, common mechanism, removed special cases, validation and remaining limits.
7. Obtain separate authorization before any publication or other irreversible delivery action.

**Exit:** completion is justified by current source and observable behavior, not historical test volume or an internal cache version.

## 10. Dependency and parallel-work rules

The main dependency chain is:

```text
accurate baseline, layer contracts, scope and affected-environment matrix
  -> shared AST-backed transfer and finite valid summaries
  -> first integrated delivery:
       unchanged original + mounted reactive composition
       + retired duplicate bridges + affected-boundary acceptance
  -> remaining required framework/language and policy feature closure
  -> final integrated-scope acceptance and release preparation

optional exact-value/platform precision: separate consumer-justified backlog
termination, invalidation, safety, cleanup and affected checks: every slice
```

The first delivery does not wait for the optional-precision backlog or for unrelated family features. Security authorization, finite analysis and valid dependencies are continuous obligations. They are not features that may be postponed until the later policy/cache work package.

When implementation is resumed, useful parallel roles are:

- **Core owner:** source semantics and shared analysis/plan interfaces, with one coherent integrated candidate.
- **Independent contract/test owner:** authored use cases, valid/invalid controls, environment acceptance and challenges to the core assumptions.
- **Targeted reviewer:** reviews a substantive coherent change with fresh context. It does not repeatedly approve every helper or field.
- **Root coordinator:** owns the original target, integration, scope, source boundaries and truthful progress reporting.

Serialize actual overlapping source mutations, not the whole project. Keep build stages and mutable outputs isolated. Do not turn every routine internal implementation decision into another permission cycle. Escalate genuine changes to public contracts, architecture or authority.

### Commit and worktree coordination

The coordinator owns the current integration branch. Establish a local WIP source checkpoint before creating worker worktrees, so workers inherit the actual current source rather than an old HEAD plus private file overlays. Label that checkpoint as unvalidated existing work. Keep ignored captures, dependencies and generated builds outside Git, and run the repository artifact check before committing.

Each implementation slot uses an isolated worktree and short-lived task branch created from the agreed integration commit. The coordinator assigns disjoint ownership or a concrete shared interface, and each worker commits coherent changes with their relevant validation. Integrate commits in dependency order, resolve conflicts against the final contracts and validate the combined result. Commit history replaces whole-file handoffs and repeated source-copy inventories.

Refresh a worker at an explicit clean boundary after its work is committed and the worker is idle. Never rebase, reset or replace an active worker's checkout. Confirm the new integration base before its next task. Preserve branches and useful commits until integration is verified. Squashing is a later history cleanup, not part of active coordination. Do not push or publish without separate authorization.

## 11. What to reuse, refactor, retire and defer

| Disposition                  | Work                                                                                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reuse                        | TypeScript parser/checker/AST/printer, existing recursive AST visitors, framework target/state/task plans, semantic operation algorithms, effect propagation, storage/alias knowledge and meaningful regression oracles. |
| Refactor                     | Source-origin/return/capture summaries, destination-dependent result transfer, repeated structural validation, unclear analysis/runtime naming and cache dependency contracts.                                           |
| Retire after replacement     | Redundant wrapper recognizers and fixed-tail/two-site receipt routing used as a substitute for general abstract source composition. Duplicate old/new ownership for the same analyzed operation.                         |
| Retain as bounded refinement | Precisely known Call/Get/descriptor/iterator facts needed for elision, preservation or safe optimization. They must not become mandatory for representing every ordinary source expression.                              |
| Preserve, then adjudicate    | Private adjacent-array and empty-hoisted candidates. Reuse their semantic fixes and tests if justified, but do not merge them just to recover sunk effort.                                                               |
| Defer explicitly             | Unrelated release changes and optional precise modeling not required by supported framework behavior. Do not defer essential security, generation or mutation soundness.                                                 |

No bulk deletion is authorized by this plan. Each removal needs a consumer audit and replacement evidence. Likewise, preserving sound work is not a reason to keep redundant architecture.

## 12. Acceptance and progress reporting

### Current execution boundary

The original and SDK acceptance rows bind to `09925238a`. Later integrated source includes eager module ownership and retained-artifact safety corrections. The combined module, default, decorator, policy, original, shared, construction, forwarding and collector cohort passed on the ordinary merge of `d8021c855`. This does not rebind the SDK or environment rows. Private worker results do not change a row until integration and the relevant checks complete. Detailed commands and environment limits belong to the [owned composition corpus](component-composition-corpus.md).

| Plan step                              | Current status                           | Evidence or remaining requirement                                                                                                                                                                    |
| -------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Preserve baseline                   | Complete for the migration               | The original source and private precision candidates are preserved separately from integrated work.                                                                                                  |
| 1. Architecture and terminology        | Established, retirement audit incomplete | General source dependencies and optional precise output have separate owners. Remaining old consumers still need classification.                                                                     |
| 2. Baseline corpus                     | Established                              | Original, safe, capture/acquisition, overlap and opaque-authorization controls exist. The environment matrix records unexecuted rows.                                                                |
| 3. Shared source semantics             | In progress                              | Ordinary Calls, Gets, returns, construction and eager module evaluation use shared consumers. Activated-helper disposal and source-only Proxy effect conservation remain required repairs.           |
| 4. Shared capture and effect transfer  | Integrated, termination incomplete       | Original and shared safety controls pass. Core still exceeds its unchanged request deadline, so request-wide convergence is not established.                                                         |
| 5. Original end-to-end anchor          | Verified at native and SDK boundaries    | Unchanged analysis and emitted title-read counts pass on a freshly built host. Installed-package and adapter rows remain unverified.                                                                 |
| 6. Component and reactive integration  | Representative witness verified          | Two mounted updates, durable identity, isolated unrelated work, lifecycle and paired SSR pass in Node-hosted Vitest/jsdom with source aliases.                                                       |
| 7. Transformed nested continuation     | Incomplete                               | The required suspension, acquisition order, Throw, cancellation and stale-publication witness has not completed.                                                                                     |
| 8. Remaining operation families        | Incomplete                               | Statement, iterator, protocol, async and builtin-contract coverage still requires mechanism-based qualification. Exact-value simulation is not the completion criterion.                             |
| 9. Policy, selection and invalidation  | In progress                              | Field, native-container, wrapped-eval and default containment corrections are integrated. Binding-default propagation, source selection and broader invalidation acceptance remain under validation. |
| 10. Remove superseded paths            | Partial                                  | Canonical return projection replaces the old declaration/property fallback, and the unused module-origin side channel is removed. Remaining precision consumers still need inventory and migration.  |
| 11. Framework environment matrix       | Incomplete                               | Browser, adapters, native runtimes and installed-package execution remain open. Paired Core generation blocks several downstream checks.                                                             |
| 12. Final acceptance and consolidation | Incomplete                               | No full-plan acceptance or release readiness is claimed.                                                                                                                                             |

Track three distinct dimensions:

1. **Architecture completion:** common interfaces exist, consumers use them, and superseded paths are removed.
2. **Authored behavior:** original use cases pass analysis, transformation and runtime expectations at their applicable boundaries.
3. **Validation coverage:** exact environments and checks executed on the integrated source, with remaining gaps visible.

The existing fixed capability ledger mixes ordinary syntax, required framework analysis, transformations and optional precise modeling. Suspend its use as a current project-percentage headline. Its historical IDs and results remain available for crosswalk, but they do not measure this plan's completion.

Classify their completion criteria using section 8 before proposing a new current metric. Preserve the historical record and explicitly document any metric/version change. Do not silently split capabilities, narrow scope or award private-test credit to make a number move. Current progress should identify the first integrated delivery's concrete exit criteria and remaining gaps.

During execution, report only substantive checkpoints:

- Which unchanged authored behavior now works.
- Which shared contract enabled it and which duplicate path was removed.
- What actually ran, on which source and environments.
- The first remaining blocker and its owning layer.

Test counts, cache versions and prerequisite counts are supporting evidence, not the progress headline. Do not give a completion date until the foundation scope and first representative implementation establish a defensible work estimate.

## 13. Decisions required before resuming

The requested stop, plan and adversarial audit were completed. The user subsequently authorized continuing with the causal-engineering workflow and explicitly set full implementation of this plan as the goal. That authorization does not require another approval for the original architecture or its routine implementation decisions.

At the start of execution, settle these engineering decisions in the existing architecture reference:

1. The exact shared semantic/flow representation, using the existing AST and plans wherever possible.
2. Which current `source_language_*` consumers require precise refinement and which need general abstract dependency/effect facts.
3. The first coordinated source ownership boundaries and a fixed original-behavior corpus.
4. Any public supported-language or environment limitation. Ordinary helper/field choices within the agreed architecture do not require another architectural approval.

Unresolved technical choices are a reason to inspect the relevant consumer and specify its contract, not a reason to restart a chain of destination-specific prototypes.

## 14. References and evidence limits

- [Native compiler reference](native-compiler.md): current compiler and artifact contracts, to be reconciled during the implementation.
- [Maintainability and regression acceptance](code-maintainability.md): ownership, proportionate testing, related-defect investigation and integration criteria.
- [Component composition corpus](component-composition-corpus.md): cross-path runtime, adapter and lifecycle acceptance.
- [Release readiness](release-readiness.md): artifact compatibility, package validation and publication boundaries.
- Local original design: `.tmp/framework-confidence/compositional-language-detailed-design-20261028-round1/design.md`, with `state-and-continuations.md` and `operation-recipes.md`. These contain valuable analysis laws but must not be described as the printer's execution requirements.
- Local maintained state: `.tmp/framework-confidence/compositional-language-progress-root-estimate-20261029-round1/maintained-integration/source-ready.json`, especially `direct_captured_call_integration`, `typeof_represented_integration` and `array_initializer_call_integration`.
- Original regression: `native/typescript-go/overlay/internal/exactcompiler/source_value_provenance_test.go`, `TestModuleWriteProducerDependencies`, `projected call`.
- Prior TypeScript semantic compiler: Git revision `0c1e6d4e8e6a9cbc59fb4e3357e105a7f0107e08`, `packages/compiler/src/analysis/callable-effects.ts`, `call-resolution.ts` and `callable-propagation.ts`. It supplies comparison evidence for dependency summaries, not verified success on the exact original source or equivalent concrete-known analysis guarantees.

The initial plan was prepared through read-only inspection. Subsequent execution status is bound to the integrated checkpoints and checks named above and in the owned corpus. No full-suite, all-runtime or release acceptance is claimed.
