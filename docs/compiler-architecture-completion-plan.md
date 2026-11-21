# Compiler architecture completion plan

Status: execution authorized by the user on 2026-11-01 after the adversarial plan audit. The objective is to fully implement this plan. Work proceeds through local commits and isolated worktrees, with the coordinator integrating on the current branch. Push and publication are not authorized.

For the remaining implementation, follow the [analysis audit and work plan](compiler-analysis-work-plan.md) and apply the [component-consumer completion criteria](#component-consumer-completion-criteria) to the historical operation-family milestones and acceptance tests.

Prepared 2026-11-01 against the inspected working tree. The preserved pre-migration compositional-analysis checkpoint is v30. This is an internal cache revision, not a compiler release, a count of attempts at one problem, or a whole-language completion claim. The previously uncommitted framework work was preserved in local checkpoint `b30c50e45` before worker branches were created. That commit establishes reproducible source, not a validated release baseline. Subsequent implementation and acceptance changes use local commits and isolated worktrees.

The integrated source at `24a616c5b` includes additive renderCapability facts, while runtime
coordination migration remains pending. The original nested Analyze, both compile paths, SDK
artifacts and Node HTTP checks pass at their separately recorded retained-provider boundary.
Core still times out, with required source-effect transfer and finite request-wide work unresolved.
The [current execution boundary](#current-execution-boundary) owns source bindings and remaining
acceptance limits. No scoped vertical establishes completion of this plan.

The immediate scalability boundary is source callee discovery during receiver-write inspection. Separate callable regions that only append to one array repeatedly acquire each other's named method before the existing conditional write-domain check runs. A reduced six-region source demonstrates ordered exclusion permutations without entering member-writer input binding. The local integration now separates canonical MAY callee discovery from receiver-write consumption through finite source-member work rows. It retains old and new alternatives while inspection is pending. Getter uncertainty, unsupported source contexts and ambiguous repeated input mappings take the original path. Borrowed availability intervals remain query-owned and must still be live. This grants no native identity, strong replacement or NoWrites authority.

A consumer audit separates dependency discovery from stronger exclusion proofs. Interference closure restricts possible calls and writer regions, while ordinary task Call evaluation remains native JavaScript. Explicit task placement can retain unknown effects but still rejects known conflicting browser or server dependencies. Await has an additional required effect: its implicit thenable Get and Call can execute user code. Retain the existing normal Await producer for the bounded core wherever it supplies the required effects and compilation completes. Source-only decoupling is follow-up unless an original or representative core compilation causally requires it. Removing the normal prerequisite requires qualified source effect coverage, not prediction of every runtime object or omission of implicit effects. The unqualified source property/protocol draft is comparison evidence and is not adopted.

The historical six-region comparison completes with fewer acquisitions and allocations, without bounding preparation inside each row. Its matched metadata compile emits the same 356-byte artifact in both versions, while the frozen candidate allocates about 5.6% more memory after removing unused setup. That unfavorable result remains an open cost concern. The earlier five-second stop of the required nested request established neither termination nor nontermination. Its bounded nested acceptance is superseded by the `fd3446424` results below, without establishing Core completion. Writer-input preparation, saved argument/Get relationships and broader integrated acceptance remain open.

Field aggregation and retained client-artifact containment are integrated, including application fields added to native containers. Native-container policy qualification and source freeze relationships have scoped passing controls. Readonly structural inputs remain conservative, while callback element-input transfer and deferred-construction phase coverage still need integrated qualification. The opaque component callback retains both its browser donor and its structural-input residual. Its regression now checks those independent contributions, with emitted getter/Throw order controls, rather than requiring an exclusively browser effect. Historical initializer receipt-bootstrap assertions are retired with the unused execution lifecycle. Their authored semantic and emitted Node controls remain. These rows remain acceptance work for the first integrated delivery and do not authorize another operation-family expansion.

## 1. Objective and correction

Complete the agreed compiler architecture: ordinary TypeScript and TSX must compose recursively, with eXact analyzing dependencies, effects, placement and ownership, then transforming the relevant component and task operations into durable state machines and continuations.

The AST already represents source nesting. The project does not need another parser or a compile-time JavaScript runtime to preserve that nesting. It needs consistent semantic analysis and transformation contracts over the existing syntax and plans.

The recent implementation drifted toward proving narrowly recognized source executions. Direct initializer Calls, returned closures, array destinations and successive Calls received separate admission and receipt handoffs. These produced some valid precision improvements, but did not establish the general composition path. Reports then confused analysis-engine coverage with transpilation capability. Both mistakes must be corrected.

The work is complete only when supported operations compose through their shared contracts, original authored examples work without fixture workarounds, applicable environments are validated, and superseded special-purpose paths have been consolidated. Another isolated prerequisite passing is not completion of the original problem.

### Architecture direction

Prefer direct compiler-generated alternatives whenever feasible. Runtime management must
serve a demonstrated dynamic component need that generated code and its existing context
cannot adequately serve. Preserve evaluated values, origin and identity across boundaries,
together with required ABI, transport authorization and lifecycle contracts; these do not
require an opaque receipt for every operation.

The integrated [direct finite component-root prototype](compiled-component-artifacts.md#direct-finite-component-roots-prototype)
applies this direction to selected finite roots. Saved or escaping values retain their
composition owners. Cross-source-site keyed compatibility, a released matching provider
minimum and whole-artifact acceptance remain separate obligations. This bounded runtime
path does not resolve the original ErrorBoundary analysis timeout or establish a performance
improvement. Existing analysis receipts retain their compiler-side proof roles.

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

### Component-consumer completion criteria

Use the following scope for the remaining implementation and for interpreting the operation-family
inventory below. An operation-family entry identifies syntax that a component can contain. It
creates an implementation requirement only when an observable component behavior depends on it.
An ordinary helper keeps its JavaScript behavior, including object identity, cache hits, exceptions
and evaluation order. The host may erase types and transform supported JSX. A helper export,
a JSDoc annotation or an adapter include rule alone gives the compiler no reason to rewrite a body.

#### Work by observable boundary

| Boundary | Required work and owning code | Evidence for closure |
| --- | --- | --- |
| Source and module identity | Keep host-selected executable JS distinct from the declarations used for typing. Account for module initialization and reexports separately from invoking a function. Select the actual package export for the target. Honor checked declarations, placement and secret annotations. | A package with client/server variants selects each implementation correctly. Runtime JS and TS declarations may have different bodies. Type-only imports impose no execution requirement. An edit, reexport or loader change invalidates the affected result. |
| Placement graph | Use the existing callable graph, recursive groups and retained effect sources. Compute eligible targets from local platform uses and executable edges. Treat known Node modules and published placement contracts as leaves. Establish the recognized Bun runtime modules or capabilities against the supported host resolver. Keep restrictions from known descendants when some edges are unknown. Separate task scheduling defaults from eligibility in `tasks.go`; a predicted state write currently influences the default. | An either-side helper can be called from both targets. Explicit incompatible and indivisible mixed work produce an authored diagnostic. Alternative client/server exports remain usable on their respective targets. Explicit server dispatch preserves a client caller. The same component compiled in an application and a library has the same eligible targets. |
| Callback and implicit execution | Distinguish passing, storing and invoking a callback. Preserve eager argument evaluation, including getters. Include callbacks, accessors, coercions, iteration and thenables that a supported operation actually invokes. Use checked primitive types and established platform contracts. Demand a returned value’s origin only when later component work depends on it. | A dormant callback introduces no execution restriction. An invoked browser callback in a server task retains the conflict. Storing a callback and invoking it later uses the later execution boundary. A getter with an observable effect still executes in the original order. |
| State and reactive reads | Have component lowering pass the owned state view or the component-authored setter. The transaction observes performed writes. For a subsequent read, maintain invocation-time visibility across a helper carrying that state. Separate runtime-tracked reads from facts needed to construct a render dependency, hydrate state, or send activation inputs before execution. | Direct and nested calls through an unchanged imported helper preserve identity and return value. The following read sees the pending write. A skipped write emits no patch. A render consuming the changed field updates, and unrelated rendered work stays untouched. Test direct scalar, setter and alias cases separately from arrays, Maps and Sets. |
| Continuations, transport and security | Separate allowed input/output paths, runtime evidence of a performed change, and the value returned by the operation. `createExactContinuationHandler` currently consults static writes to enable capture, prepare containers and project outputs. Policy propagation also uses path overlap. Replace these dependencies only with equivalent component-owned authority. Keep checked transport, secret and residency constraints. | Direct and batch HTTP both deliver the correct result and authorized state. An untouched or secret sibling stays out of the reply. Conditional set/delete, cancellation, stale generations and collection updates preserve their existing contracts. A new broad state or transport grant requires design agreement. |
| Task, context and lifecycle ownership | Keep explicit task placement, resources, optimistic work, cancellation, disposal, context lookup and enhancement setup order tied to the component instance. Separate optional lookup from mandatory pre-setup ordering. Resolve the private-token case for an imported ordinary provider/consumer without attaching compiler metadata to that helper. | Client and SSR reject contradictory required order before setup and accept correct order with exact disposal. Optional lookup observes absence/presence with the original helper identity. Component-passed setters remain usable. Decide support or a specific limitation for the unresolved fresh accessor envelope and escaping callbacks. |
| Component and ordinary JSX | Use selected component identity for state-machine lowering. Keep public API calls, ordinary exports, module initialization and helper function identity intact in mixed files. Confine placement-driven partitioning and runtime attachments to real owners. Audit nested functions, arrows, type-only casts and ordinary callable exports separately. | Preserve helper value, identity, name, arity, throw/default/receiver behavior and package public imports. Cover supported ordinary TSX construction of compiled components, keys, children, target and rejected inputs. Current Webpack TSX evidence excludes legacy JSX and nested ordinary callables inside selected components; settle their support and Bun/Vite JSX host behavior explicitly. |
| Analysis and reuse | At each entry into invocation, Get, prior-write, return, constructor or descriptor reconstruction, identify the output consumer. Keep a shared graph edge or an unknown fact when it suffices. Remove work used only by retired private execution/migration assertions. Reuse stable facts across callers with source, selected dependency, checker and configuration validity. Keep execution-local state out of shared caches. | First migrate the ordinary effects fallback in `appendArgumentAccessorEffectsObserved` on a real component. Cross-check implicit accessor, module-initializer, framework protocol and staged callers before deleting shared machinery. Verify a reused summary after edits and reset, recursive calls, a known platform dependency plus an unknown alternative, and a real component whose output needs greater precision. |
| Performance and distribution | Qualify the original Theme and Core package compiles on both targets under their existing deadlines. The Theme profile identifies property-read scope copying, value-origin recovery and call preparation; these are cost candidates, not proofs of redundant work. Build fresh affected providers and the SDK, and exercise installed outputs. | Produce usable paired artifacts for the real components, then exercise public rendering or invocation. Compare CPU and allocations for matched completed work where possible. Preserve diagnostics and maps, ABI and process compatibility, and validate affected Webpack, Bun and Vite routes. A timeout, a passing microtest or a retained-provider run cannot close a fresh package-build requirement. |

#### Observable compiler consumers

Start with the decision and its trigger before asking for more source precision. The scope column
specifies where the answer is valid. Reuse a definition summary only while its source, resolved
dependencies, checker, target where relevant, and configuration still agree. An applied summary
also needs the original receiver, inputs, execution phase and ordered read or write cut where
those affect the answer. A generation change retires graph-local pending work, receipts and
authority. Reapply or revalidate stable inputs in the new graph. The [project work audit](compiler-analysis-work-plan.md#request-and-project-work)
describes current reuse and its costs.

| Consumer and changed output | Trigger | Minimum answer and stopping rule | Producer, scope and invalidation | Status and evidence |
| --- | --- | --- | --- | --- |
| Compile/check and host preparation decide which source to check or emit, where errors point, and whether an artifact set can publish. | Import, re-export, module initializer, selected JSX input or requested artifact. | Keep declaration and selected executable identities, import kind, resolved target, provenance and source ranges. Type-only edges impose no runtime initializer. An opaque host edge stays opaque for private authority. Preserve ordinary host emission where allowed and refuse an unresolved required proof. | Host resolver and snapshot bind executable edges. Native checker and module analysis own semantic facts and authored/generated diagnostics. The artifact host publishes the validated set. Reuse within matching resolution conditions, source revisions and checker/configuration. A host selection or dependency edit invalidates affected edges and projections. | Maintained paths and host limits are documented in [public integration](native-compiler.md#public-integration). Ordinary JSX coverage varies by host. |
| Public Analyze returns component, task, callable and module facts and diagnostics. SDK paired builds can change sharing, target availability or retained component facts using this metadata. | An analysis request or an SDK consumer of the compiled analysis. | Preserve the published records and source locations. For example, shared-artifact selection needs callable neutrality subject to its other checks. Preserve unknown effects and authored diagnostics. A value prediction is unnecessary when effect and provenance facts answer the reader. | Native analysis owns facts. The SDK maps them and owns shared-artifact selection. Reports are request projections. A reusable definition result still depends on source, checker, selected dependencies and configuration. Target output comparison belongs to its artifact pair. | [Direct caller audit](compiler-analysis-work-plan.md#item-6-direct-caller-dispositions) and [shared-artifact selection](../packages/compiler/src/compilation/shared-artifact.ts). Field-by-field downstream reader coverage is open. |
| Source inspection and editor diagnostics explain inferred tasks, component regions, placement reasons and authored errors. | A no-emit inspection or synchronization against an editor snapshot. | Project current entities, ranges, reasons and diagnostics. Keep unresolved reasons where proof is missing. A stale or cancelled result cannot replace the current observation. | Native Analyze supplies facts and the language service projects them into separate records. Overlay version, dependency edits, close/delete, project configuration and disposal govern freshness. Cached disk analyses have bounded retention. | [Source inspection](language-tools.md#source-inspection) and [no-emit language sessions](native-compiler.md#no-emit-language-sessions). |
| LSP hover, task-status completion and compiler-backed code actions change the editor response or edit. | A request at an authored document position. | Use the matching entity or task region, reason or diagnostic, and valid edit preconditions as appropriate to the request. Stop at the published inspection facts. Omit a result when ownership or the edit cannot be established. | Language server owns projection, using the current document text and inspection from its workspace project. A superseding document version, affected dependency, cancelled request or disposed workspace fences publication. | [LSP capabilities](language-tools.md#language-server-protocol) and [projection controls](../packages/language-server/src/lsp-projections.test.ts). The necessity of additional analysis used exclusively by any one LSP request is open. |
| Build inspection catalog changes the server-owned metadata returned to a build host. | The build's effective inspection setting or an exposure catalog selection. | Preserve compiler identities, source metadata and reachable component selection for the requested catalog. Stop at the metadata projection. Catalog emission follows the effective setting and stays outside generated JavaScript. | Compiler artifact inspection owns the catalog. Its inputs are the current build analysis/configuration and, for selection, the exposure root and graph. Changes to those inputs invalidate the selected view. | [Build catalog contract](language-tools.md#optional-build-inspection-catalog). A separate costly source requester for the catalog has not been established. |

#### Observable component decisions

| Consumer and changed output | Trigger | Minimum answer and stopping rule | Producer, scope and invalidation | Status and evidence |
| --- | --- | --- | --- | --- |
| Component and task placement determine artifact eligibility, target-local emission or a diagnostic. | A reached module initializer, setup, render, task or callback execution. | Keep known target donors with authored reasons and independent uncertainty. Include eager operands and the actual implicit or explicit operations reached. Store a dormant callback with its identity and analyze its body when demanded by a use. Keep task scheduling defaults separate. Apply the existing [requested-artifact decision table](#uncertainty-and-requested-artifact-decision-table) when placement remains unresolved. | Native callable graph propagates effects through recursive groups. Definition effects determine portable eligibility. Actual receiver and callback substitutions refine the executing edge. Selected dependency, source and target-condition edits invalidate affected effects. | [Component decision audit](compiler-analysis-work-plan.md#what-a-component-needs-to-know). |
| Render capability reports whether a component can render on each target. | Analysis of the returned render function and the setup needed by it. | Report supported for a target-local proof, unsupported for an established incompatible requirement, and unknown for incomplete proof where no incompatibility is established. Stop at the recognized intrinsic JSX and covered setup/render effects. Preserve unknown for unproved child composition. Artifact availability and runtime ownership have their own checks. | Native component analysis produces the definition fact. The SDK projects it into analysis and retained build facts. Recompute for changed component source, selected dependencies, checker or target configuration. Caller inputs can refine their own composition edge. | [Render capability and coordinated execution](#32-render-capability-and-coordinated-execution) and [scoped evidence](#scoped-evidence-and-abi-boundary). The additive fact is implemented at `24a616c5b`. Runtime ownership migration is pending. |
| A downstream executing read, invocation or write may need the source of a returned callable, receiver, descriptor or context token. | The next boundary actually consumes the result, for example a returned setter is invoked on component-owned state. | Recover only the needed identity or relative relation, with creating inputs and possible replacements. Stop at effects when the consumer needs only donors. When proof is incomplete retain known alternatives and unknown residue. Preserve ordinary runtime values and evaluation. | Source result and interference producers under the original Call, Get or construction context. Stable definitions are reusable. Receiver, captured inputs, intervening writes and current graph determine the applied result. | [Remaining return-source users](compiler-analysis-work-plan.md#remaining-users-of-return-source-reconstruction). Exact-value and stronger exclusion requesters beyond those traced are open. |
| Reactive setup and rendering choose initial work, derived relationships and affected DOM updates. | An initializer or render reader depends on owned state or another supported reactive source. | Keep the state slot or path, dependency and evaluation phase, or the existing supported runtime reader. Preserve actual result, order and identity at execution. Use existing dynamic tracking where sufficient and retain uncertainty when a required dependency is missing. | State/reactive analysis feeds render and task lowering. Static wiring follows component source/configuration and selected dependencies. Live reads, writes and cleanup belong to the mounted instance and its active generation. | [Guarded DOM updates](native-compiler.md#guarded-dom-updates) and [reactive decision audit](compiler-analysis-work-plan.md#what-a-component-needs-to-know). Broader nested mounted, SSR and hydration acceptance stays with the [integration gates](#first-integrated-delivery-boundary). |
| Render lowering selects a generated component-root path or the existing composition path. | A component returns a root whose output can be generated directly, or a child value is saved, deferred or transferred. | Use direct DOM and SSR output where the generated wiring and component context suffice. At a composition boundary retain the evaluated value, creation origin and occurrence identity as needed by the receiving owner. Preserve authored evaluation order, hydration and cleanup. Stop at the facts needed by the selected path. | Compiler render lowering owns selection from the component source and target configuration. DOM, SSR and hydration owners consume the emitted contract. Source or configuration changes require a fresh selection and ABI changes require a fresh compatibility check. Live output identity belongs to its owning instance and occurrence. | [Direct finite component-root prototype](compiled-component-artifacts.md#direct-finite-component-roots-prototype) covers selected roots. Cross-source-site keyed compatibility, a released matching provider minimum and whole-artifact acceptance remain open. |
| Task lowering determines owned mutation enrollment and which subsequent reads see pending state. | An unchanged helper or setter receives owned state, or an actual call or await can affect a later task read. | Keep the relative root/path and the evaluation cut needed for a live read or capture. An activation snapshot and a derived live read differ. When the owned view can observe actual mutations, stop predicting whether the branch writes. Preserve independent transport and policy evidence. | Receiver projection and task pending-state lowering enroll operands. The runtime pending view belongs to the active task generation. A changed operand, write cut, source dependency or retired generation invalidates the applied relation. | [Direct task and HTTP controls](compiler-analysis-work-plan.md#item-5-disposition-at-a5c584b62). Retained controls cover bounded paths. |
| Await effect analysis supplies donors and uncertainty to public task analysis and the requested-artifact decision. | A reached Await consumes the alternatives of its evaluated operand. | Preserve the required constructor or then Gets, then Call and resolve assimilation when reached. Reject retains ordinary argument work. Preserve known donors beside independent uncertainty and keep a child-owned task's effects on its own edge. Stop once those effects are accounted for when the consumer only needs effects. | The normal Await effect producer consumes the original operand in its installed frame. Authored resolver roles require the originating query, receiver and capture binder, source generation and Await interval. Retire the observation with its frame and reacquire it after changes to the relevant source, dependencies or inputs. | [Await consumer acceptance rows](#await-consumer-acceptance-rows) retain the individual witnesses and source bindings. Qualification is scoped, with canonical Vitest, the inherited-getter server request, server execution, hydration and fresh providers still open. |
| Continuation transport and hydration/resumption determine which operation, inputs and state can cross. | A cross-target task, callable, component or resumable artifact edge. | Keep the compiler-owned operation and owner, eligible inputs and outputs, serialization and authorization checks. Intersect allowed response paths with actual generation writes. An opaque or unqualified edge cannot expand authority. Preserve evaluated values and independent lifecycle checks. | Partition and continuation plans describe allowed edges. Generated code and runtime dispatch validate the actual request or artifact, with instance/request generation and cancellation fences. A source/configuration/ABI change invalidates the relevant plan or compatibility proof. | [Artifact contracts](compiled-component-artifacts.md) and [HTTP publication controls](compiler-analysis-work-plan.md#item-5-disposition-at-a5c584b62). Scoped prototype or task results do not qualify all providers or released artifacts. |
| Secret policy decides whether a value, capture, dependency or artifact projection may be disclosed. | An output or client-reachable path can expose a qualified value or executable dependency. | Qualify the actual selected path/type and its payload contract. A whole value needs whole-value qualification. Preserve incomplete protection when qualification cannot finish and check execution effects separately. Source-map and artifact containment still apply. | Native checker-backed qualification, policy and artifact pruning own the decision. Completed type facts are checker-generation facts. A selected projection, capture or emission is checked at its own use and target. Requalification follows changed type, source, policy or selected executable inputs. | [Policy and placement contract](#57-policy-and-placement-contract) and [policy decision audit](compiler-analysis-work-plan.md#what-a-component-needs-to-know). |
| Enhancement context ordering decides whether setup can begin. Optional lookup determines the actual runtime value or absence. | An enhancement provides/requires a token or an installed helper performs an optional lookup. | For required ordering retain actual token identity and the provided/required relation. Apply the existing conservative path if identity cannot be established. Optional lookup uses the installed context and actual token without adding a pre-setup requirement. | Compiler context lowering publishes required contracts. DOM and SSR chain owners validate before setup. Runtime owns lookup and disposal on the instance. Definition facts follow source/token imports and generation. Installed identities and lookup results remain instance-local. | [Retained context controls](compiler-analysis-work-plan.md#item-5-disposition-at-a5c584b62). Hidden required tokens and escaping accessor envelopes remain open. |

#### Necessity tests for component decisions

Hold logical component identity, target, configuration and surrounding source fixed in each pair below. The alternatives describe substitutions within otherwise well-typed components. A policy rejection is itself an observable decision. The test for needing a distinction is whether the two programs require different output or different obligations on that output. If the same emitted operation discharges both obligations using its actual operands, the differing runtime answers alone do not require the compiler to distinguish them. A definition compiled for a library has the same obligations as that definition in an application.

| Boundary and time of decision | Discriminating programs and minimum sufficient answer |
| --- | --- |
| Component selection and JSX lowering, at emission | A selected component returning a render function and an ordinary exported factory returning a function require different treatment of their outer function. Identify the component definition and returned render region. Preserve ordinary callable creation and invocation elsewhere. A directly returned intrinsic root and a child saved for later composition require direct root wiring or preservation of the child's creation context at its eventual consumption. Neither decision needs predicted text. |
| Setup and reactive updates, at emission and mounted reads | Initialize a displayed derived value from a literal or from an owned state read. Only the second must observe subsequent changes. A reader of one state slot and a reader of its sibling must update on their corresponding writes. Identify the reader, phase and dependency, or emit the supported live reader and let its actual reads establish subscriptions. Preserve initializer effects at their original evaluation. |
| Render capability, at definition analysis | An intrinsic-only render with neutral setup and the same render whose required setup reads the browser document differ on server eligibility. Keep the source of the incompatible requirement. Incomplete child coverage allows an unknown capability only where no incompatibility is established. A capability report alone cannot select the mount owner. |
| Event, lifecycle and task execution, at registration and invocation | Installing a handler that reads the DOM and reading the DOM while computing the handler have different setup effects. A disposer registered against the instance and an event handler require different invocation and cleanup wiring even with identical bodies. Keep the registration role, owner, eager operands and deferred execution edge. Resolve the actual callback and receiver when executed. A setup-owned task invoked twice still has one definition and separately fenced executions. |
| Pending reads and writes, at task lowering and active generation | Save a scalar before a helper mutates the task's state, or read the same slot after calling it. Preserve the captured scalar in the first program and the pending view in the second. Pass the owned view when a helper receives the mutable alias. The branch the helper will take can remain a runtime decision. |
| Placement, including implicit execution, at target selection | In an explicitly server task call a foreign callback, or choose between that callback and one that accesses the DOM. Preserve independent uncertainty in both and the known browser conflict with its authored origin in the second. Likewise awaiting plain data and awaiting an object with an authored browser-dependent then getter differ even when the result is discarded. Stop at the reachable effects unless another consumer uses the result. Apply the requested-artifact table for the precise target and phase. |
| Capture and transport, at extraction and dispatch | A client optimistic prelude reads a task input, or reads a local computed only inside the remote task. Declaration origin changes prelude eligibility even for the same primitive type. A local invocation and a cross-target invocation require different operation binding and input validation. Bind the generated operation to its permitted owner and payload; validate the actual transmitted values and dispatch at runtime. |
| Secret projection and publication authority, at build and response | Returning a public field and returning its enclosing record with a secret sibling require different disclosure decisions. Track the selected path and its qualification, including executable dependencies. A server task allowed to write a field conditionally and one that cannot write it require different maximum response authority. For the former publish only actual authorized writes from the current generation. An unknown alias cannot grant write permission. |
| Ownership and identity, at composition and replacement | Updating a registry child with the same key or selecting a different key requires preservation or replacement and disposal. Emit the registry relation and carry the actual key and owner to reconciliation. Their future values need no static prediction. Requiring a context token before setup and looking it up optionally after installation require different ordering obligations even if their successful values coincide. |
| Hydration, at paired emission and adoption | Compare a complete client root containing an extracted island with the same host containing ordinary intrinsic children. Extraction requires compatible child ranges in both projections. Emit structural boundaries and registration for the selected owner. At adoption use the actual root, markers and transferred state under the applicable validation contract. Server HTML text alone cannot establish resumption authority. |
| Public inspection, at Analyze or instrumented execution | Moving an otherwise identical task declaration changes its published source location; changing its placement changes its reported facts. Retain the declared source relation and requested facts. Live status and state come from the owning instance and generation. No pair here requires compile-time prediction of live status or payload contents. Field-by-field tooling readership remains open. |

These tests derive from the [component language](component-language.md), [task contract](tasks.md), [component registries](component-registries.md), [SSR and hydration](ssr-hydration.md) and the [requested-artifact rules](#uncertainty-and-requested-artifact-decision-table). A foreign implementation may genuinely have unknown effects. A missing delivery for a known authored getter, an unvisited fallback or an aborted analysis is a compiler gap. Preserve available source and reasons, and withhold any permission whose proof is incomplete.

#### Component scenarios for the minimum-analysis target

These are design expectations for a component compiled independently in an application or library. The snippets describe substitutions inside a well-typed component. Each row gives a distinction the compiler must preserve and the point at which ordinary execution can supply the rest. They specify expected behavior before assessment of any compiler implementation.

**A helper takes a client callback.** Let `focus = () => input.focus()`, with a valid captured DOM element at invocation. Assume creating the closure has no browser dependency of its own. In the first five rows the call to the helper is in setup. Consider a request that needs this setup to execute on the server.

| Authored situation | Required facts and observable outcome |
| --- | --- |
| `helper(focus)` with `helper(fn) { return 1 }` | Evaluate the argument and preserve the ordinary return. There is no invocation edge to the DOM method. This call permits server setup. No analysis of the focused element's value is required. |
| Replace the helper body with `fn()` | Associate the formal with this argument and the call with setup. The DOM access makes that server execution invalid even when the helper result is discarded. |
| Replace the body with `return fn` and install the result as a click handler | Return the actual closure with its captures. Server setup may prepare the handler. Clicking invokes it on the client. Placement needs the later use of the returned callable. It needs no prediction of the return from the DOM method. |
| Use `invoke(fn) { return fn() }` and install the result of `invoke(() => focus)` as the click handler | Setup invokes the wrapper once. Its result is the original closure. Focus runs on click. Treating every invocation in the helper as an invocation of the innermost callback would incorrectly reject server setup. |
| Pass `makeFocus()` to the ignoring helper | The factory still executes once before helper entry. If it reads the DOM itself, server setup is invalid. If only its returned function reads the DOM, that read stays dormant. A factory throw prevents helper entry. |
| Install `() => invoke(focus)` on a button | The same helper and arguments now belong to event execution. The initial server render needs no DOM access for this handler. One click invokes the acquired callback once. |
| `forward(a, b) { run(b, a) }`, where `run(x, y)` invokes only `x` | In setup, `forward(focus, noop)` and `forward(noop, focus)` differ in server eligibility. Carry the actual-to-formal association across the reordering. Stop once the invoked operand and its effects are accounted for. |
| `if (enabled) fn()` in the helper | A definitely bypassed call contributes no invocation. If the flag may be true, retain the possible DOM effect for server placement. Preserve the runtime condition. The compiler needs no forecast of a particular mount's flag. |
| Save `box.fn = focus`, then call the saved entry later | Storage establishes a possible later callee. A definite overwrite with `noop` before a fresh lookup replaces it. A closure acquired before that overwrite still invokes the original. If an unknown alias can write the entry, retain the known alternative and uncertainty. |
| An external helper with no execution contract receives `focus` | Passing the closure supplies no evidence about invocation timing. Keep its possible invocation distinct from a proven call and apply the requested target's existing authorization. A client-local use whose obligations are satisfied by ordinary execution needs no timing prediction. A required server execution with a possible incompatible callback needs a safe projection or a placement diagnostic. |

**One operation changes what the component needs.** The following cases cover readers that cannot be decided solely from the name of the helper or the type of its result.

| Paired component situations | Required facts and stopping point |
| --- | --- |
| A task evaluates `save(state, input)` and discards its return. A second version evaluates `save(state, input).label`. | Both evaluate the operands and perform the helper's actual writes. Only the second needs the returned receiver for the subsequent Get. If its getter reads the DOM, server placement must account for that read. Neither needs to predict the label text. |
| Setup passes `service.handler` to an ignoring helper, or calls `service.handler()`. | A getter runs in both cases. Only the second invokes the selected method, with the original receiver. An authored browser read inside the getter affects both. A browser read only inside the returned method affects the second. |
| A task uses `values.some(predicate)` on a fresh ordinary array, or calls an authored object's method named `some`. | For the standard operation keep element reads and possible predicate invocations in their specified order, including early exit. The authored method has its own behavior. Placement needs reached effects and feasible alternatives. It need not compute the boolean unless another decision depends on it. |
| Render reads `props.left ? props.a.n : props.b.n`. A sibling displays a previously saved object's `n`. | Updates must follow the active branch and the saved object's identity respectively. Supported live readers can observe actual fields as they execute. Replacing a prop must not silently retarget a saved reference. |
| A button invokes a server task with a literal key, an argument-derived key, or a key reading a server-only binding. | The key runs at explicit invocation before dispatch. A literal needs no platform fact. An argument-derived key needs its actual argument and once-only evaluation. A server-only read conflicts with browser invocation even when the executor itself is correctly server-placed. Storing the task without invoking it evaluates no key. |
| A server task captures a default argument, calls a helper that may write a state field, then reads that field. | Preserve the activation input and the later generation-local read separately. Carry the possible write through the helper's receiver. Only a taken, authorized write may be published. Predicting the branch or computing the field value is unnecessary. |
| An explicitly placed task awaits ordinary data or an object with an authored then getter, and discards the result. | Preserve the operand's evaluation and applicable settlement behavior. The getter's target dependency still affects placement. No consumer here needs the fulfilled value. A rejected or superseded generation must retain its own settlement behavior. |
| Setup registers `this.onUnmount(makeCleanup())`; another version calls the returned cleanup immediately. | In both versions the factory executes during setup. Registration binds the actual result to the instance and releases it at teardown. Immediate invocation executes its effects during setup. No compile-time identity for the particular closure is needed. |
| A helper calls required context lookup with a private token; another helper merely tests whether that token is present. | The required peer-order check needs the same token identity as the provider before setup begins. An ambient lookup uses the installed context during execution. Optional presence alone imposes no prerequisite. A token's display name cannot supply identity. |
| A component returns a public leaf from server work, or attempts to return the whole record containing a secret sibling. | Check the selected payload, execution dependencies and transport boundary. An authorized serializable leaf can cross. Authorization of that leaf gives no permission for its sibling. No secret value is needed to decide this. |
| A parent selects the same registered child twice or selects a different registry key on the second delivery. | The live owner needs the actual key and registry identity to retain or replace the child and release its resources. The compiler can pass these to reconciliation without predicting the next selection. Initial SSR adoption has its own marker and mismatch contract. |
| A parent passes a literal flag to an imported child; another parent obtains the flag at runtime. | Caller facts may refine those uses. The child's own supported targets, reactive wiring and portable contract must remain valid when compiled alone. A warm build after changing the child must make the same decisions as a fresh build. |

**Interactions that change the answer.** Each example below has a component consumer. The family letters refer to the [language inventory](#8-inventory-of-language-family-work). That inventory names syntax families; these cases specify when analyzing them changes a framework decision.

| Component situation and distinguishing variation | Expected result and minimum analysis |
| --- | --- |
| In a task, evaluate `service.handler(replaceHandler())`. The getter returns a browser-only function. The argument installs a neutral replacement. In a second version, replace the handler in the preceding statement. (A, D, I) | The first call retains the previously acquired function and the original receiver. The second performs a fresh lookup. If the argument throws, the getter and the argument's preceding effects remain, while the method body is skipped. If the argument suspends across a generated continuation, retain the acquired reference and receiver across that boundary or diagnose an unsupported transfer. Re-reading the property after resumption changes behavior. |
| A task calls `pane?.show(makeArg())` versus `pane.show?.(makeArg())`. The property is a getter. (A, B, D) | In the first, a nullish pane skips both getter and argument. In the second, a present pane's getter runs even if its result is nullish and skips the argument. A nullish pane in the second throws before argument evaluation. Preserve these guards and the method receiver. For uncertain inputs retain feasible effects; no static prediction of the actual pane is required. |
| A render helper reads `record[key]`, first with a checked string and then with an object whose primitive conversion reads the DOM. A third version receives a Proxy with an authored Get trap. (A, B, I) | Key conversion and the actual property read can each contribute target requirements. A checked primitive string adds no conversion callback. A known trap that reads the DOM still counts when its returned text is discarded. Preserve independent uncertainty about what other traps can do. Rendering through a Proxy needs a supported dependency reader if subsequent writes must update this text. |
| An event calls a helper with `{ label = getDefault() }` as its parameter. Compare an explicitly supplied empty string, `undefined`, and a property getter that throws. (C, D, F) | Property acquisition occurs even when the default is skipped. Empty string stays empty, undefined runs the default, and a throwing getter prevents default and body entry. A target-specific default contributes only on feasible default paths. An unknown runtime label can remain unknown. |
| A task passes `...items` before a callback argument. An authored iterator yields a variable number of items. Compare a direct call with a fixed argument list. (C, D, H) | Keep iterator work during expansion and the positional uncertainty at parameter binding. If expansion throws, later arguments are skipped. With fixed positions, attribute only the callback actually selected. Unknown length cannot prove that a browser callback misses an invoked formal. No need to enumerate an ordinary vector whose positions affect no framework decision. |
| A component stores a generator returned by a helper, advances it once, or breaks out of a loop consuming it. Its generator body contains a target-specific read and a `finally` cleanup. (F, H) | Creating the iterator preserves argument evaluation. Advancement can enter the body. Early loop exit can invoke iterator return and run entered cleanup. Attribute work to the operation that reaches it, including abrupt completion of cleanup. Exact yield values and iteration counts are unnecessary unless another consumer reads them. |
| A component initializer evaluates a class expression with a computed name and static field; a later event constructs an instance and calls a method. Compare with constructing it in the initializer. (D, E, L) | Computed name and static initialization can affect setup. Instance fields and constructor effects move with construction. A method body belongs to its reachable call. Keep runtime work of configured TypeScript transforms and erase type-only mentions. A DOM type annotation alone introduces no browser execution. |
| A helper calls a hoisted function before its declaration; another returns a closure capturing a mutable module binding. The event reads it after reassignment, or uses a scalar saved during setup. (A, E, J) | Bind the hoisted call to its declaration. Preserve live binding versus earlier scalar acquisition. When the result is invoked, identify the corresponding possible callees; moving the same closure through an array, return or argument cannot change that answer. Predicting the scalar's contents is unnecessary for ordinary display. |
| A recursive helper searches nested component inputs and invokes the first matching visitor. Another version only returns the visitor. (D, F) | Terminate analysis while retaining possible invocation, receiver and target requirements in the first. In the second, the reader that invokes the result owns execution. Recursion depth or number of visits need no prediction. An unresolved recursive edge cannot erase a known browser read on another path. |
| A task awaits within `try`, handles a rejection and releases an owned resource in `finally`. While suspended, a second invocation supersedes the first. (F, G) | Preserve which continuation receives fulfillment or rejection and run entered cleanup under the owning lifetime. A stale continuation cannot publish state into the newer generation. A throw from cleanup follows ordinary completion replacement. Generation checks protect publication; they do not justify moving earlier authored effects or predicting Promise contents. |
| The browser submits a server task which mutates a selected field through an alias. Compare a permitted write, a skipped write, a stale reply, and a reply also naming a protected sibling. (A, G, I) | Bind dispatch to its operation, instance and generation; validate payload shape and independently authorized paths. Publish an actual current authorized write. A skipped write gives no update, a stale reply cannot overwrite newer state, and an invalid sibling must not partially publish. Disclosing a whole input record for a dynamic selector needs its own qualification. |
| A component renders an imported helper's result. Its package exports select different client and server implementations; a neighboring import is type-only. Change only the selected runtime implementation in a warm build. (J, L) | Analyze the chosen executable source and eager module work per target. Preserve live imports and module initialization order, including cycle semantics. The type-only import contributes no eager runtime effect. Fresh and retained builds must agree after the edit and revert. A change to an unrelated caller cannot alter the helper's owning component definition. |
| Setup creates an opaque operation and stores it. Later an event redeems it. Its creation metadata includes an enumerable getter. (A, D, I) | Metadata acquisition can execute the getter at creation even when the executor stays dormant. Redemption needs the original operation, owner/domain and authorized target. Storing a receipt grants neither execution nor transfer permission. Ordinary metadata values need no source reconstruction when actual values suffice. |
| A parent spreads props containing a getter, prepares a child and saves it for later composition. Compare immediate composition and two uses under different owners. | Preserve prop evaluation order and the creation context required by the supported child representation. Redemption must honor its ownership contract at the actual use. Reusing a source location supplies no proof that two mounted occurrences share an instance. Parent-owned props retain ordinary shallow TypeScript readonly semantics. |
| A registry changes from lazy child A to B before A resolves. Compare selecting A a second time without changing the key. | For a changed selection, fence the stale candidate and preserve B's range and lifecycle. For same-key updates use the registry's existing identity contract. SSR and hydration need the paired registry identity and range. Predicting load order or the next key adds nothing. |
| A component renders a client island among server-owned siblings. Compare successful adoption, mismatched root under strict hydration, and ordinary replacement under the default element-root policy. | Emit matching ownership ranges and validate the actual artifact, resumption data and root. Preserve the adopted node on success, reject the recognized strict mismatch, and replace according to default recovery. Do not infer island authority from matching visible text. The initial component-key disagreement below is a separate undecided mismatch criterion. |
| A task changes from latest to queue; a second edit only changes the number written inside it. An editor asks for the task at its source position. | The first edit changes the scheduler option, public task record and displayed mode. The second preserves the mode. Moving the declaration changes the source mapping even with identical emitted options. Requesting these facts creates no need to predict live queue length, overlapping invocations or state contents. |
| A component calls an external adapter that may schedule a callback, versus explicitly transporting that callback to a remote task. (D, K) | Existing target-local authorization can permit an opaque call; preserve its independent known effects. Opaque scheduling gives no invocation-time or disposal guarantee. At transport the actual callable needs a supported representation and authority. A warning cannot authorize sending a closure with DOM captures. |
| A server task reads a credential and returns a derived public result. Compare retaining the credential's import or source text in a client artifact or its map. (J, L) | Qualify the result and the executable artifacts separately. An allowed response grants no permission for client retention. Preserve diagnostic source correspondence while enforcing existing redaction. A generated program passing type checks cannot waive an authored readonly or policy error. |

**Coverage against the framework decisions.** The [representative use cases](#6-representative-use-cases-and-required-outcomes) and [component decision inventory](compiler-analysis-work-plan.md#what-a-component-needs-to-know) bound this reconciliation. For a new variation, use the following comparisons to determine whether it changes the expected artifact, diagnostic or runtime obligation.

| Decision | Variation that changes the answer | Variation handled by the same rule |
| --- | --- | --- |
| Target eligibility and artifact selection | Calling a DOM callback in server setup versus installing it on click; selecting a different executable export | A different string returned by the same browser operation has the same placement. Two export names for the same selected binding do not change its effects. |
| Setup, reactive dependencies and child composition | Reading the current prop versus retaining an earlier object; invoking a prop getter before saving a child | Different leaf values use the same subscription and evaluated-input machinery. |
| Task scheduling, capture and resumption | Moving a read across a helper write or suspension; changing concurrency mode or the target of key evaluation | Changing an assigned scalar leaves the scheduler and generation authority intact. |
| Ownership, context and teardown | Required peer ordering versus an optional installed lookup; changing a live registry key versus updating that child | Different callback closures use the same registration and cleanup when their owner, phase and escape behavior agree. |
| Transport, secret policy and publication | Selecting a public leaf versus its enclosing record; current reply versus superseded reply | Two permitted scalar payload values use the same validation and authorized paths. |
| SSR, hydration and host projection | Changing the island or registered child owner; selected runtime import versus a type-only reference | Equal visible HTML establishes neither identity nor authority. Different text can use the same checking and recovery contract. |
| Analyze, authored diagnostics and tool inspection | Moving a task's source range, changing its policy, or exposing protected source in a client map | Live task status is instance-owned whatever source position the editor inspects. |

**Rules derived from these situations**

1. Attach each effect to the operation and phase that can perform it. Argument evaluation, a property Get, a helper call, a returned callback, settlement and teardown can all have different owners in one expression.
2. Carry a value relationship as far as a concrete reader requires it. Forwarding a callback needs its binding at invocation. A later Get may need its receiver. An ordinary discarded result ends value demand, while already reached effects, writes and abrupt exits still count.
3. Use ordinary execution or existing runtime tracking for actual values, branch selection, identity and generation-local changes whenever it meets the component obligation. Preserve order, receiver and once-only evaluation across generated boundaries.
4. At a placement, disclosure, transport or lifecycle boundary retain each known requirement and any independent uncertainty. A definite replacement or bypass can remove the corresponding alternative. An unobserved implementation or alias cannot.
5. Keep definition facts portable. Caller-specific substitutions belong to the use that supplies them. Reuse across edits requires the same relevant source, dependencies and configuration.
6. Preserve acquisitions across intervening work. A later mutation may affect a fresh lookup while leaving an already evaluated reference intact. A guard, throw, suspension or early exit determines which subsequent operations can run and which cleanup remains due. When native syntax preserves this, the compiler only needs the distinctions consumed by the component. A transformed boundary must preserve them explicitly.
7. Check the selected implementation, receiver and authority at the boundary that uses each. The same value can be permitted locally, forbidden to serialize and irrelevant to another artifact. Analysis of a definition, public tooling record or type-only reference cannot authorize runtime transfer.

**Support choices that need a decision.** An advisory makes sense only if emitted execution remains authorized and usable and a particular framework behavior can differ. For example, if a foreign scheduler saves a callback beyond component teardown and offers no cancellation contract, the outstanding design question is whether the supported integration provides a disposal handle, or whether an advisory should explain that the callback may run after unmount and direct the author to register cancellation. This example proposes no new scheduler contract or warning code. Acknowledgment could silence an approved advisory only within its documented scope.

A private required token poses a different choice. Standalone ambient lookup needs the token at execution. Ordering co-targeted enhancements needs that identity before either peer starts. If an ordinary preserved helper cannot expose it, a warning alone cannot establish safe ordering. Decide how the identity can be supplied or which composition must receive a diagnostic. Likewise, first hydration with matching shape and different keys needs a product decision about adoption before specifying a marker comparison. Further source-value analysis cannot settle either product choice.

Before using these rules to judge compiler implementation, resolve any scenario whose support outcome changes the expected artifact or diagnostic. Apply the rules back to each concrete case, including the nested callback, overwritten reference, private token and opaque callback cases. Keep implementation findings and performance measurements in the analysis work plan.

#### Open requester and acceptance decisions

The [analysis work plan](compiler-analysis-work-plan.md) owns profiles, individual requester
dispositions and their source bindings. When an existing decision receives a missing or stale
fact, repair the implementation and verify the observable consumer. When the same answer takes
too much work, measure the original requester and qualify a cheaper answer against that consumer.
An inclusive profile, repeated syntax location or matching eventual diagnostic cannot establish
that two requests share a receiver, cut or obligation. A request with no verified reader stays
open until its production entry, downstream output and fallback are traced. This includes any
claimed inspection-only work and any remaining stronger proof requested by a fallback without a
demonstrated observable consumer. Keep current behavior while that audit is pending.

Package deadline failures, repeated acquisition and incomplete required source-effect delivery
are implementation or performance work. They leave the applicable integration gates open.
Support decisions for opaque host edges, escaping context values and ordinary JSX boundaries
retain their existing review requirements. A change to supported behavior, authorization,
diagnostic severity or a public analysis field requires agreement on that specific product
decision. This inventory records existing consumers and unresolved coverage without changing
those requirements.

#### Source boundaries for removing the fallback

Start at the public entry points. The ordinary call collector in
[`callable_argument_accessors.go`](../native/typescript-go/overlay/internal/exactcompiler/callable_argument_accessors.go)
already has a registered graph-edge route. Migrate the invocation fallback separately from
explicit and implicit member reads in `callable_accessor_effects.go` and
`callable_implicit_accessor_effects.go`. Keep module initialization in
`module_value_definitions.go` distinct from function invocation. In
[`source_value_dependencies.go`](../native/typescript-go/overlay/internal/exactcompiler/source_value_dependencies.go),
both a fresh dependency query and the fallback from an incomplete precise result can do work.
Removing only the first route leaves the second reachable.

Follow those callers into property interference, function return projection, constructor and
prototype lookup, descriptor and getter resolution, and scope capture. The staged assignment,
Get, native operation and framework protocol entry points also construct dependency queries.
Public reachability and an actual component consumer determine each disposition. A filename
containing “staged” establishes neither private-only use nor a reason to retain a path.
Validate the retained source and cache behavior after removing the last consumer. For a
bounded reproduction of expensive work, require the production component or package compile
as the final check for package completion. Evaluate an individual optimization on the work it
changes. With equivalent component behavior, a measured reduction in allocations, CPU, or
repeated operations on the same input or completed phase can justify integrating it while the
package still times out. Weigh that saving against the maintenance and common-path cost.
Two runs stopped at the deadline give lower bounds on completion time; their elapsed times
cannot establish a speedup or rule one out.

#### Decisions and order of implementation

Use the [compiler analysis work plan](compiler-analysis-work-plan.md) for the audited
production consumers, work to remove, implementation sequence and acceptance controls.
It governs which of the historical operation-family and migration steps below are required.
A private closure test or a potential precision improvement creates no product requirement
without a component or a supported tool consuming its result. A change to transport authority,
published ABI or diagnostic policy remains a separate design decision.

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

### 3.2 Render capability and coordinated execution

The additive render-capability vertical is implemented at `24a616c5b`. There are exactly two
execution targets, server and client. Isomorphic means a component can render correctly on both.
Component render capability, per-operation/task placement, and coordinated transport, activation,
hydration and resumption ownership have separate contracts. Existing execution behavior and task
defaults remain unchanged. The separation grants no new execution policy or runtime authority.

Component analysis and SDK IR expose:

```ts
renderCapability: {
	server: 'supported' | 'unsupported' | 'unknown';
	client: 'supported' | 'unsupported' | 'unknown';
}
```

Supported requires a target-local render proof, including required setup data. Unsupported
retains an established incompatible requirement. Incomplete proof remains unknown independently
of known requirements. Both known browser and server requirements conflict when they belong to
the same target-local execution closure. A component containing a client event and a server task
does not by itself have that conflict. The implemented proof covers recognized returned render
functions with intrinsic JSX and covered setup/render effects. Child composition and missing
proof remain unknown. Neutral callable effects and paired artifact targets cannot establish
render support. DOM mount lifecycle availability and SSR fallback remain separate requirements.

A dormant callable's creation does not execute its body. Ordinary Calls propagate requirements
at their actual uses. Only the existing compiler-owned transport plan can exclude a remote body
from local execution requirements. Caller arguments, captures and serialization effects remain.
Names and annotations alone cannot grant that exclusion. The first vertical's server task is
invoked from a client event, while rendering retains its own requirements.

Module availability composes with render capability at the selected retained export. Module
load, eager initialization and retained import closure must be legal for each artifact. Existing
valid projection may omit unrelated server exports but must retain required side effects. An
environment-neutral helper in a server-associated module is ordinary source, without an automatic
warning. Body compatibility does not make that export accessible on both targets.

#### Implemented ownership and pending migration

| Layer                      | Owner and current disposition                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Analysis producer          | Native `contracts.go`, `components.go` and `component_analysis.go` initialize unknown capability and retain applicable ordinary-call, mixed and extracted setup-input requirements independently of legacy placement.                                                                                                                                                               |
| SDK projection             | `process-component-contracts.ts`, `native/module-analysis.ts` and `contracts/analysis.ts` carry per-target statuses without deriving them from placement, subgraphPlacement or artifactTargets.                                                                                                                                                                                     |
| Retained facts             | `compilation/component-build-facts.ts` and `compilation/artifact-component-facts.ts` retain component-only facts even without import/enhancement edges. Protocol 1 normalizes an absent field to unknown on both targets and rejects malformed present shapes/statuses. Older readers can ignore the additive field, which cannot grant capability acceptance or runtime authority. |
| Existing coordination      | Component Placement, SubgraphPlacement, ArtifactTargets, TargetPlan, ComponentExecution and task Placement retain their current consumers and defaults. They are not aliases for renderCapability.                                                                                                                                                                                  |
| Publication and resumption | `component_contract_lowering.go`, local activation, continuation and island owners remain unchanged. Proven resumption can survive unknown placement. Publication still requires legacy isomorphic coordination plus its existing ownership conditions. Capability grants neither permission.                                                                                       |
| Runtime validator          | Core `component-contract/contract-validation.ts` and `component-contracts.ts` retain their existing record shape and publication truth table. Explicit ownership predicates and coordinated producer/validator replacement remain the next architectural vertical.                                                                                                                  |

Capture allowlists, secret exclusion, serialization, state identity, generation fencing, cleanup,
reactivity and hydration authorization retain their existing provenance and owners. Compact
environment facts cannot replace richer read/write/capture facts or diagnostic source references.
Remove superseded internal facts only after their consumers migrate. Do not retain obsolete
aliases solely for unreleased callers or globally rename live isomorphic strings.

#### Frozen summary roles and bounded graph prototype

The agreed compact environment contract preserves known server/client requirements plus
independent unknown and invoked-formal dependencies. The conceptual payload is
`{ requiresServer: boolean, requiresClient: boolean, unknown: boolean }`. Here requiresClient
means browser execution, not activation. Reuse existing cached summaries, effect graphs, module
owners and invalidation. This contract does not require a new persisted record or cache.

Private formal identity is the declaration AST plus zero-based parameter slot within one checker
generation. Symbols and checker IDs stay private. Receiver roles and default evaluation use the
existing binder and callback classifier. Mappers are invoked roles, while reduction seeds and
thisArg values are data. Defaults retain MAY-selected evaluation effects. Unsupported projected,
destructured or dynamic associations retain independent uncertainty without erasing known facts
or invoking every argument. Capture links identify lexical binding declarations. A future retained
library protocol, if needed, must use export-relative declaration identity and slot, never checker
IDs. The first vertical publishes no invoked-formal protocol. Local guards must prove whole
compatibility, including fallback, initialization and independent uncertainty. Do not persist a
conditional-property graph.

The bounded graph prototype is authorized. Only its notification API is qualified, and source
producer integration is not established. Register an already-known owning callable fact before
recursive collection. A declaration-owned demand retains its original operation/use/consumer,
role and admissible detached source observation cut, with source-relative actual substitutions
and formal/receiver/capture links. Delivery notifies or dirties that fact through existing effect
work before publication, preserving MAY alternatives and unresolved residuals. ReceiverBinding
continues to describe state receivers, not arbitrary argument or capture substitution.

Do not retain sourceInvocationConsumer callbacks, sourceValueInputs, live queries, call frames,
whole binding/scope maps or the query-owned afterArguments authority. Missing detachable cut
proof retains its residual and known donors. Delivery cannot replay executeInputs, grant native
identity or change sourceCallOutcome.complete. The construction witness already passes its
baseline and supplies no repair credit. Storage/prototype expansion is paused. No universal
argument/result/key/value graph, new body driver, broad pending relation, scheduler or solver is
adopted. Graph propagation cannot repair classification, module initialization or runtime
validators by itself. Optional precision remains with the [existing future-work inventory](proposals/future-work.md#compiler-precision-after-the-bounded-core).
Required source-effect transfer and finite Core compilation remain core acceptance obligations.

The bounded component-input source producer records a declaration-relative invocation dependency for
`props.read(props.label)`. The owned source witnesses are
`packages/compiler/src/test-support/component-input-invariance.fixtures.tsx` and
`component-input-invariance-consumers.ts`. The target definition and emitted target body must
remain identical across library/application consumers. Supplied callable requirements belong
to the particular parent render edge. The existing `sourceComponentInputDemand` and adoption
owner certify exact named string-literal protocol recipes only. They do not certify callable
inputs, and their private body-placement projection must not be broadened to erase a Call.

The detached invoked-input demand identifies the target
declaration, props parameter slot, named member and original Call occurrence. It must retain
the method receiver, argument relationships and captured bindings through the existing source
dependency owners. A field Get or callable creation alone cannot issue this demand. Composition
delivery must authenticate the selected JSX target and input at its source occurrence, then
add known callable requirements and independent unresolved alternatives to that edge before
the existing subgraph fixed point. It must never substitute the consumer into the target
definition, publish an ordinary invocation receipt or retain a live query/frame. This uses the
existing callable facts and subgraph fixed point independently of literal adoption. Direct function declarations and inline function expressions supply their existing
callable summaries. Other selections retain uncertainty and a warning. No input substitution
or callable body activation is performed by this projection.

Input recipes follow JSX source order. Definite own-property writes replace the preceding
value and its selection residual. Later unresolved spreads or computed keys retain known MAY
callable donors beside independent uncertainty, including a donor introduced by an unknown
key. Finite object-literal data properties and methods supply ordinary cached callable facts.
Getters stay unresolved value producers, with their eager spread effects owned by the original
source operation. Selection never replays a Get or activates a dormant callback. Function-valued
inputs still obey the existing serialization boundary. The side-effectful dormant-getter
control retains the server serialization rejection and verifies one Get with no callback Call.

Focused acceptance pairs named safe/browser callbacks with a dormant browser callback and
retains the inline and mutable controls. A mutable unresolved selection must preserve
JavaScript and diagnostic uncertainty without recursively proving every writer. Known donors
must survive alongside that uncertainty. Fresh native source-matched Analyze and both-target
Compile checks, emitted receiver/argument/capture behavior and branch/condition witnesses are
required before acceptance. SDK sessions must compare identical target source and path across
library/application contexts. Shared adapter acceptance must exercise the same edge outcomes
through Vite, Webpack and Bun. Scoped checks cover these callback recipes through each adapter
with retained package providers. Broader module-loading and retained-export compositions remain
in the acceptance frontier below. TypeScript qualification alone is not compiler regression evidence.
Indexed prop and state lowering must retain the ordinary member-access lane for receiver-bearing
Calls and template tags, including erased wrappers. Numeric slot reads produce values and cannot
replace JavaScript References in those positions. Saved callable values remain detached. The
paired artifact witness checks actual receiver, argument and capture behavior independently of
the analysis projection. Receiver recognition uses TypeScript binder scopes and the core
`Component` import declaration, including renamed imports, namespace imports and local type
aliases. Interface heritage retains that identity only when a base resolves through those
authenticated declarations, including multilevel inheritance. Symbol visitation bounds cycles.
Custom interfaces, structural receivers and shadowing type parameters supply no component identity. An explicitly ordinary receiver cannot regain identity through a protocol
method's spelling. The unchanged `namedSpellingBrowser` source is an ordinary-callable control.
Optional/computed callee access, aliases of invoked props and call/apply forwarding remain
outside this direct-call producer.

Broader composition acceptance still requires paired ordinary-call/transport and dormant-body
creation/invocation controls, target-dependent invoked formals, legal retained projection versus
illegal module initialization, and client lifecycle with SSR fallback. Preserve positive and
negative capture/secret/serialization cases, retained state and cleanup at the affected boundaries.
The notification pilot and already-passing construction witness cannot supply this evidence.

#### Scoped evidence and ABI boundary

At `24a616c5b`, the three capability selectors pass 18 subcases covering Analyze, both compile
targets, server-task/client-event separation, direct and transitive mixed/default requirements,
independent unknown and actual extracted setup inputs. Source-file beforeimage substitutions
reproduce the repaired setup, mixed and false-unknown defects. They are not clean baseline
checkouts. Eight nearby selectors pass state, secret, capture, serialization, transport, legacy
publication and unknown-placement resumption controls. The full nearby task-placement matrix
remains red in nine inferred-placement cases. Only one representative was reproduced identically
on actual main `150cad12e`. The other eight are unclassified, with no waiver.

The capped source-loaded SDK equivalent passes 15 tests, including real public Analyze and both
compile/fact projections for supported, unsupported and unknown, strict malformed/absent-field
handling, and component-only retention. Sessions own disposal. Its immutable source-matched host
has SHA256 `93c0c159fac24959db8c532cbb83c06a3fd5623b80b293ed83377c1cebd3970b`.
This is not canonical SDK/Core acceptance. The initial default-configuration startup failure is
separate setup evidence. Freshness of retained root-built providers remains unverified.

The supplied independent native audit bound to `24a616c5b` passes uninstrumented, branch and
condition runs, each with 10 groups and 80 named subcases. Changed ranges cover 23 of 30 branch
outcomes and 79 of 116 condition outcomes. Remaining outcomes are individually classified as
unchecked valid-source candidates (5 branch and 31 condition outcomes) or defensive paths
without established source witnesses (2 branch and 6 condition outcomes). Candidate frontiers
include browser-operation fallback, render shapes/child composition, task/lifecycle/source-file
exclusions and setup-input short-circuit combinations. This is neither MC/DC nor whole-family
coverage. The supplied binding, runs and gap details are retained outside Git under
`.tmp/compiler-confidence/render-audit-24a616c5/package-aware-attempt2/changed-path-audit.json`.
The earlier audit setup failure supplies no passing native evidence. This documentation task
records supplied results and does not rerun them.

SDK TS7, changed-file lint/formatting, documentation and staged-artifact checks passed for that
vertical. The repository architecture gate remains red for ten size violations in files unchanged
from `150cad12e`, without waiver. No fresh Core, corpus, full-runtime or performance acceptance
follows from these checks. The original nested Analyze, both compile, SDK artifacts and Node HTTP
retained-provider acceptance remain independently bound to their existing source rows.

The public analysis schema and persisted build-fact surface changed additively. Runtime component
version 6, render-program version 4, component-library protocol 1 and compiler-process protocol
1.0.0 retain their current authority contracts, owned by scripts/contracts/compiler-abi.json.
New required runtime keys would conflict with exact-key validators. Reinterpreting placement in
publication or resumption checks changes artifact semantics even without changing JSON shape.
The pending producer/validator migration requires explicit semantic ABI and provider review before
implementation. Any new runtime behavior or authority still requires user agreement. Published releases exist, so the initial prerelease redesign exception cannot
justify breaking them. Preserve fixtures/release-abi and apply release-readiness epoch/provider
rules where incompatible. Coordinated local 0.8.0 preparation does not authorize publication or
choose compatibility on its own. Public documentation describes supported behavior, without this
internal progress record.

### 3.3 What a nested Call requires

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

Eager module evaluation gets an effect owner from its source schedule, independently of optional Call or getter refinement. Declaration-only syntax and deferred bodies do not acquire performed effects merely because they have AST descendants. Top-level runtime statements share `runtimeModuleEvaluation` for discovery and identity, including class definition work, blocks, control statements and export assignments. Each original statement owns its nested eager operations. The existing source walker separates computed names and static work from instance initializers and callable bodies. Module demands consult the existing lexical branch/completion relation before collecting effects. Implicit lexical disposal and reached class/member decorator application retain independent opaque protocol contributions until their contracts account for them. Explicit decorator factories and member Gets stay eager, including parameter decorator expressions when authored TypeScript options enable legacy decorators. Parameter defaults and bodies remain deferred. Activated decorated-class defaults enter the shared source demand list, including generator defaults. Raw default contributions use the existing initializer-phase obligation, while instantiated caller effects keep their own operation context. Supplied inputs bypass only the matching default, preserving independent body effects. Invoked method roots do not repeat their definition decorators. Their application does not publish arbitrary decorated body effects or replacement/initializer execution. A definite initializer Throw acquires no disposal obligation. Cleanup obligations also enter ordinary body summaries, so reached helper cleanup remains uncertain after resource acquisition, including abrupt exit. Dormant helpers and bypassed defaults do not perform that operation. No disposal handler or replacement state is simulated. Selected import and re-export loading remain with the module dependency owner. These relationships grant no normal output or descriptor receipt, and artifact authorization and target pruning retain their existing contracts.

Deferred reflective descriptor candidates share source-phase eligibility between the MAY inventory and getter consumers. Complete checker-bound observation-only uses can exclude a private top-level function body or a class's constructor and instance-field regions. A source owner without an attached current Program supplies no such exclusion. The existing index retains those regions. Invocation, construction, aliases, capture, export, direct eval, unknown syntax and unmodeled uses withhold exclusion. Source replacement invalidates the generation-owned use proof before later queries. Static initialization can construct or expose a class through its lexical receiver without naming the class, including through an arrow. Indexed receiver uses and the shared receiver-scope relation preserve those candidates. This negative source law grants no Normal result, property absence, NoWrites or executed-operation authority and clears no independent uncertainty.

On committed integration `345464dc5`, the full `Policy|Secret` suite passes without exclusions. The exact private/dormant, selected-closure, module-write dependency and shared-composition cohort also passes, including emitted Node controls, source replacement and unattached-Program refusal. The validation merge has no source delta from that integration. Both original `TestOrdinaryGetComposition` dormant fixtures lose the erroneous browser donor. Their unchanged `make` neutral assertions retain the independent unresolved call-prefix frontier and were not rerun in this validation. This source-phase law does not discharge that separate obligation. Adapter, browser and non-Node runtime acceptance are not established by these checks.

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

Public callable analysis is rooted in component execution consumers. Retain reusable source and symbol inventories, but demand body summaries from components, task/render/callback entry points and required module or policy boundaries, following their transitive helper references. An ordinary unused declaration or export does not require staged body or value closure merely to preserve its TypeScript. A missing summary is not a neutral analyzed body. Required helpers and module effects retain their ownership, placement, transport and security checks.

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

The reflective source-input work remains unaccepted. Its allocation association
uses the receiver scope acquired before writer rows are lent, separately from the
original consumer input cut used for ordering. Different factory contexts exclude
a target only for the same represented allocation endpoint with known creating
Calls and an existing literal or qualified default-class field relationship.
A reflective comparison can demand an original target Call's canonical source
return relationship at that Call's acquisition cut. Returned alternatives retain
their captures, while argument, callee and default effect publication stays with
the original operations. Missing or partial output retains the raw Call target and
independent uncertainty. This does not dereference all symbolic Calls globally.
Unprojected Call targets and missing captures remain possible alternatives.
Uncorrelated descriptor getter projection binds an unknown receiver and nil
operation with the existing source body and return owners. Lexical arrow captures
stay lexical. The contribution retains opacity and cannot discharge an actual Get,
start a normal lifetime or publish an observed output. Object.create targets
receive no freshness or descriptor premise from this source relationship.

Effect resolution associates a relative field or Call obligation with its original source
operation, declaration, phase and instantiated use/consumer. Coverage requires every matching
source alternative to be complete. Calls and getter bodies publish the same immutable coverage
records. Receiptless return projection uses `consumeInvocation` and its selected-body/input
consumer in `source_return_projection.go`. Each alternative's creating bindings and creator
context stay installed through successful-return projection, including Call-valued callees
and stored intermediate functions. This relation creates no normal output or execution receipt.
A missing exact output can be discharged only by its matching operation relationship.
Known dependencies, unmatched unknown effects, normal outputs and execution receipts remain
separate contributions. Destructured formal names retain source-only field obligations at
their original slots. Present fields of an observation-only object-rest copy can account for
read effects without granting normal DATA, descriptors or property absence. Conditional
selection between a known browser getter and a safe value retains the browser dependency
without inventing an opaque operation. Independent foreign work remains unknown. Generator
calls evaluate arguments and activated defaults while their bodies remain deferred. This
source contract does not model generator resume state.

Selected standard collection declarations and source input effects are separate
obligations. An application augmentation does not change an unrelated native method's
declaration contract. Structural component props and callback elements still require
their own source Get obligations. A readonly annotation or type alias supplies neither
those effects nor normal DATA, runtime method identity or immutable elements. Tests of
selected method ownership therefore check it independently of component placement.

The [native compiler reference](native-compiler.md) owns the implemented source-only native
array callback input, acquisition-phase and default-presence contracts. Complete runtime-native
callback-slot identity and generic edge default coverage remain unresolved. They cannot be
inferred from library declarations or supplied-defined local bindings.

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

A local array populated at one standard append site with a loop-carried value can
contribute source alternatives to a later indexed member demand. The entry
binding and the loop's member Get supply possible origins. The later member
lookup uses its own writer cut and the selected origin's captures. Repeated
origins and unavailable inputs retain unresolved alternatives. The relation
supplies no index or length guarantee, and it grants no mutation, normal-output,
or effect-completion authority. Theme scope ancestry uses this relation at
two points. At the original loop increment Get, direct extraction and
instantiated body analysis acquire the initial value at its initializer,
then follow possible successful results at the original Get cut. The existing
member writer lookup preserves possible getter replacements. Repeated source origins end that branch with independent
uncertainty. This cutoff does not identify captured values or certify that any
iteration completes. The indexed reader continues to use its own cut.

A component-owned derived cell with an inline producer and only direct reads
supplies possible producer returns through the existing source
return projection at the consumer. Callback effects remain on the reactive
registration and the emitted read retains ordinary dependency tracking.
The projection does not create a normal result or a reusable captured value.
The pinned Theme package is still blocked by setup analysis cost and the
separately reproduced initializer diagnostic.

Callee selection has a separate synchronous availability boundary. While an original Call
acquires its callee and receiver, a return demand for that same pending selection remains
unknown when its syntax inputs, creator endpoints and read cuts match. These descriptions
are immutable snapshots, compared by source contents. The borrow expires before argument,
default or body dispatch. It supplies no value, completion, alias or NoWrites proof.
Snapshot and comparison scans contribute to the existing advisory cost estimate without
limiting analysis or charging normal queries.
Finite source rest/copied and capture descriptions can participate when their source-origin
ancestor shapes do not repeat. Container presence, nil versus present-empty alternatives, copied keys
and ordered rest slots remain distinct. Repeated shapes decline proof rather than equating
contexts, including some finite descriptions. Capture bindings and creator body/call/return
endpoints share the top-level immutable context snapshot and exact content matcher. Absent
and present-empty captures remain distinct. Adapted and normal input carriers retain their
existing acquisition route. This closes the reduced descriptor/freeze acquisition cycle
for supported syntax inputs without claiming request-wide Core termination or general
source-context equivalence. Finite body-entry joins remain a different relation.

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
Completion projection here establishes no successful Normal result.
Nested field-completion proofs retain a possible continuation when callee lookup reenters
construction. This negative-proof refusal supplies no instance or successful completion,
and the outer proof still excludes values after a definitely abrupt field prefix.
The original field-demand interval can retain its own lexical receiver through already
selected source method and getter bodies. Its issuing query owns the synchronous header,
which is revoked on exit and restored before post-field completion. It cannot
qualify another constructor, detached receiver or normal output. Private member selection
uses the original Get's checker symbol, keeping public string keys with the same spelling separate.
Literal-computed class member selection and the serialization `toJSON` protocol still require separate donor audits.
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

Async return settlement keeps source Get-effect coverage separate from normal fulfillment
observations. A request-local source query reuses selected dependency edges, original Call
bindings and reflective descriptor consumers. Empty source obligations describe effect coverage
only. They do not supply an absent property, an undefined value, a completed operation or a
successful Promise payload. Relevant intrinsic prototype escapes remain uncertain, and known
getter captures remain dependencies beside that uncertainty. An own `then` slot masks the
inherited route, while a literal `__proto__: null` removes that route.

Recognize local shadowing and relevant authored replacements. If the selected reference or an operation's effect is genuinely unresolved, preserve that uncertainty and any known alternatives. Do not silently treat an arbitrary function with a matching signature as a system function.

Apply stronger current-reference, descriptor or mutation proof only when a particular optimization or framework boundary requires it, such as eliding a Get, selecting one replacement method or asserting absence of a callback. Do not make proof of the entire platform or globally pristine prototypes a general condition of transpilation. Changes to public host-integrity assumptions remain separate architecture decisions.

#### Agreed standard built-in trust policy

Policy agreed by the user on 2026-11-03. The represented-operation implementation below has scoped validation. Broader policy coverage and acceptance remain pending. This policy applies to all standard built-in types, functions and properties under the selected target libraries, including conforming polyfills. It applies equally to applications and published libraries. The first implementation slice below is deliberately narrower than the policy.

An established standard operation uses its full specified semantics without proving that the engine or a conforming polyfill implements it correctly. Hypothetical monkey-patching or foreign corruption of standard entries is no longer a prerequisite to using that contract. This supersedes the earlier requirement in this section to invalidate standard identity merely because an alias escaped. It does not discard effects of foreign code or invalidate fewer ordinary authored object facts.

Operation identification needs the acquired function or property origin. Algorithm-specific receiver admission is a separate question. A standard prototype function can be identified independently of the receiver later supplied through `call` or `apply`. An array origin is therefore not a universal requirement for Array prototype operations. Direct `xs.push(...)` still needs a relationship that establishes which member was acquired from `xs`. Reuse binder-owned standard globals, existing standard-member declaration recognition and source value origins. A checker signature, annotation, assertion, familiar class name or method spelling alone cannot establish a runtime built-in operation. An unknown input typed `number[]` can have an authored `push`. Caller-supplied array facts remain conditional on that caller and input alternative, including through library summaries. Unsupported origin paths retain uncertainty rather than gaining trust from a type.

Lexical shadowing, explicit own-member replacements, subclass overrides and custom implementations remain ordinary authored behavior. Standard built-ins and conforming polyfills are trusted semantic contracts without implementation inspection. Nonconforming replacement of standard prototype or global entries is outside the supported assumptions and does not require general prototype-write transport. Own authored methods select or join their actual alternatives at the original acquisition point and do not gain standard identity. An established array subclass can inherit the standard operation, but an overriding method is authored behavior. Calling an explicitly acquired standard prototype method on a non-array uses that algorithm's generic receiver requirements, not an array identity inferred from the method name. A conforming polyfill supplies the standard contract without implementation inspection. An explicit source replacement does not acquire that status from its name or signature.

Trust establishes the operation contract, not purity, NoWrites or successful completion. Preserve callback execution (`map`, `sort`), getters, Proxy traps, iteration, coercion, species and Symbol hooks, `Object.assign` source Gets and target Sets, and Promise thenable assimilation wherever the algorithm invokes them. Retain writes, Throw and independent state, secret and placement restrictions. A trusted operation can return arbitrary authored values. Those values acquire no native identity, descriptor, successful output or completion authority from their producer's trust. Existing normal and storage owners retain those decisions.

Keep the original receiver evaluation, member Get, saved callable and `this`, then argument order. A saved method survives a later replacement, while a fresh Get observes the replacement. Trust does not authorize removing or repeating those operations.

When acquiring a single named member, the compiler can skip reconstructing a writer's call inputs if the key of a computed assignment or a recognized single-property descriptor definition is a const initialized directly by standard `Symbol.for`. Every successful call produces a symbol. The write, its operands and any installed getter retain their existing effect analysis. A descriptor definition on a fresh object literal can also be excluded when looking up a member of the standard `Object` constructor. Reads through symbol or dynamic keys and calls to a lexically shadowed factory keep ordinary writer matching.

For an immediately awaited standard `Promise.resolve` with a checked scalar input, the installed original Call receipt supplies scalar settlement and the fresh result's constructor-lookup context. External reference availability is not a thenable-assimilation or pristine-platform requirement. This narrow lookup admission still uses the ordinary member owner for authored replacements and descriptor effects; it supplies no completed Get or caller-frame authority. Saved results, non-scalar inputs and unresolved or foreign receipts retain their independent settlement and member obligations.

For a direct one-argument membership call on a fresh dense array literal, the array member owner can select the standard `includes` method without searching for writes through aliases. Element and argument evaluation remain ordinary; the helper need not predict which element matches. The index conversion for a second argument can invoke authored work. See the [native compiler reference](native-compiler.md) for the supported form.

#### Proposed shared recognition seam for coordinator adjudication

The smallest shared owner is the existing standard-entry/value acquisition path in `source_native_members.go`, with operation identity represented by `sourceNativeValue`. Reuse `standardLibraryValue`, `standardLibraryCallOwner` in `derived_builtin_operations.go` and `nativeReceiverMemberSymbol` for declaration recognition. These helpers supply declaration candidates, not runtime operation identity or receiver admission. Reuse acquired source origins and current authored replacement selection to identify the selected function/property. Then apply that identified algorithm to the invocation's actual receiver through existing semantic/effect owners. Do not introduce a name-based whitelist, independent interference engine or second algorithm summary system.

Proposed internal interface, not implemented:

```go
func (query *sourceValueQuery) trustedBuiltinOperation(
    acquiredValue sourceValue,
    acquired *ast.Node,
) (sourceValue, bool)
```

This replaces the receiver-first `trustedBuiltinMember` proposal. `acquiredValue` is the selected function/property alternative with its source origin, not an invocation receiver or checker type. Member key and declaration evidence remain in the existing acquisition path rather than becoming a second lookup. The result is one existing `sourceValue` with `native` carrying its standard operation kind and original acquisition point. A true result establishes only that alternative's standard semantic contract. False means recognition is unavailable, not that the source operation is invalid. The caller retains other alternatives, binding/input conditions and acquisition effects. Extend the existing native kind representation only for operations actually integrated. Reuse `nativeMemberSeed` and `nativeMemberKey` as the selection entry points, keeping explicit replacement selection outside this candidate helper. The helper must not recursively prove global prototype integrity, create an executed Call receipt, manufacture a value result or clear independent uncertainty. Invocation routing belongs to `ordinaryInvocationPlan` and `planOrdinaryInvocation` in `restricted_call_arguments.go`, backed by `restrictedCallArgumentsPlan` and its existing `nativeFunctionInvocation` adapter classifier. Reuse that `.call`/`.apply`/`.bind` routing, including saved target, actual `this`, argument order and apply-vector materialization. Routing supplies no native identity or successful execution proof. Apply the separately identified operation through the existing source/native semantic and effect consumers, with no new driver. `acquireNativeInputs` retains its separate actual-input and normal-operation requirements.

Generic operations and branded operations impose different receiver requirements. `Array.prototype.forEach.call({0: 'a', 1: 'b', length: 2}, callback)` legitimately invokes the standard generic algorithm. It reads length, tests indexed property presence and Gets present values, including inherited indexed properties. Length alone cannot prove callback execution because holes are skipped. `Array.from({length: 3}, map)` instead visits each array-like index and calls the mapper with undefined for missing entries. Its iterable alternative retains iterator effects. `Map.prototype.get.call({}, key)` identifies the standard function but fails the required Map brand check with TypeError. Trusted operation identity must preserve that abrupt behavior. Unknown receiver properties retain algorithm-specific uncertainty and effects without losing the identified function contract or gaining successful output authority.

The approved insertion point is the existing array member-selection owner. An established literal-array origin and standard declaration identify a conditional push alternative before interference finishes. Indexed own writers retain their existing source cuts, input mappings, captures and descriptor consumers. Inventory callers retain pending obligations in their existing view. Outside that supported inventory context, unfinished interference stays unknown and replacement precision is withheld while known authored donors continue through the indexed owner. The push invocation consumer contributes possible receiver mutation through source-write summaries, with no native result receipt, exact contents or completion authority. Unsupported length/index hooks remain conservative. This first slice alone does not establish complete built-in coverage. The shared represented-operation checkpoint below records subsequent nested-source evidence and its limits.

For task placement, a read of element zero can retain a single-field object literal passed to a direct standard `push` on a fresh, function-local empty array. The dependency consumer follows the observed read through immutable local aliases. A single append site can execute repeatedly in a preceding `for…of`. The contribution describes a possible argument at that site and does not identify individual loop iterations. An array alias or an indexed overwrite created after a value was captured cannot retarget that capture. Caller-supplied arrays, earlier escapes, own method replacements, multiple append sites and mixed-position reads remain outside this contribution. In particular, a read from a second position cannot borrow the first position’s getter. A possible replacement of the wrapper field also leaves placement to the ordinary writer analysis. A helper installing the tracked descriptor must take its wrapper directly from the same array selection. Joining every possible pushed argument at the read can incorrectly attribute the getter to an untouched object when descriptor target acquisition is incomplete. Separately captured factory results can still receive a conservative placement error through that existing descriptor fallback.

#### Shared represented-operation acquisition checkpoint

Standard candidates from `nativeMemberSeed` and source-array acquisition use
`memberValuesAtGetWithStandard`. An established standard-container lookup does
not require a hypothetical implementation-integrity proof. Actual inventory
demands, indexed own writers, descriptors, source captures and independent
uncertainty remain with the existing selection owner. Ordinary receivers retain
their unfinished own-operation debt. A candidate cannot supply replacement
precision or establish that own writes are complete.

The source inventory transports detached `sourceNativeValue` identities with
their existing standard declaration and acquisition origin. It continues to
refuse native result facades and invocation receipts. `consumeNativeInvocation`
routes selected alternatives to the existing push, freeze, property-definition
and Promise-resolution consumers. Native `.call` and `.apply` targets cross the
existing ordinary adapter relation separately from the acquired adapter property.
`planOrdinaryInvocation` retains actual receiver and argument-vector routing.
That bridge transfers MAY effects without granting normal input, output,
completion, storage, descriptor or successful-await authority.

Bounded native controls cover static and prototype consumers, saved borrowed
calls and apply vectors, shadowed and type-only negatives, own adapter overrides,
mixed alternatives, callback and getter donors, pending own writers, public
placement rejection, and paired client/server emission. The unchanged source-only
freeze relationship and adjacent output/descriptor negative controls pass. TS7
qualifies the cross-category fixture sources. The unchanged nested source also
passes Analyze, semantic client/server compilation, SDK `compileProjectArtifacts`
and the maintained canonical Node HTTP journey with the frozen fd3446424 host.
That journey verifies value 3, saved method/receiver and operand order, Throw and
finally, cancellation without later operands or stale work, cleanup and subsequent
progress. Its source and configuration remain unchanged. The harness reuses the
saved Analyze response and adapts only test-runner lifecycle/assertion plumbing.
Evidence uses retained built runtime providers whose build provenance is not
freshly verified. Root Vitest/Core source-transform, broader runtime acceptance
and complete builtin coverage remain open.

General primitive/prototype recognition, native bound construction, Promise
`then` invocation, generic receiver algorithm protocols, broader callback
algorithms, iterator and species summaries remain incomplete. Existing
reevaluation classifications do not supply those missing summaries. Unsupported
paths must retain uncertainty and their existing known hook effects. Broader
acceptance also remains open around pre-existing ordinary callback-reassignment
and authored-apply failures, reproduced on the immutable c61 baseline.

#### First vertical slice and acceptance gates

1. Trace a genuine local array literal and its stable alias into a direct `xs.push(value)` lookup. Add the standard member candidate through the shared recognition seam, preserving authored own-member overrides and caller conditions. Nonconforming standard-prototype replacement is outside the supported assumptions. Reuse the existing effect/write summary ownership for the algorithm's indexed and length writes. Do not derive exact array contents or a successful numeric return merely from recognition.
2. Let source callee discovery and receiver-write inspection consume that selected standard contract before seeking arbitrary authored `push` bodies. Remove only hypothetical standard-entry corruption prerequisites on this path. Preserve explicit replacement alternatives and algorithm effects. The failed unqualified interference draft remains comparison evidence and is not adopted or widened.
3. Pair the genuine-array and stable-alias cases with a custom same-name object/class, an own `push` replacement, unknown and typed-only inputs, and a mixed caller alternative. Include inherited subclass behavior and an authored subclass override. Check saved-method versus fresh lookup order. Add a generic borrowed-method control using `Array.prototype.forEach.call({0: 'a', 1: 'b', length: 2}, callback)`, paired with holes and an inherited index so length cannot stand in for presence. Keep `Array.from({length: 3}, map)` and branded Map rejection as adjacent algorithm controls. Reuse existing provenance and invocation fixtures where possible.
4. Verify mutation and abrupt behavior independently. Include an argument with visible effects, a throwing argument, a non-writable length or non-extensible array, and an inherited indexed setter. A generic explicit prototype call and Proxy receiver must retain their Gets, coercions, Sets and traps, or stay conservatively unresolved if outside this first slice. Do not demand exact completion to preserve these effects. Ordinary push stores its arguments without coercing them. Confirm that state writes and secret/placement restrictions survive trust.
5. Run native analysis controls and paired emitted semantic checks, then the unchanged original nested source as the required integration gate. Preserve the earlier six-region comparison as scoped evidence. Earlier five-second stops prove neither termination nor nontermination. Do not weaken the nested source or report slice success as architecture completion. Complete the maintainability standard's related-defect, native condition audit and affected-environment acceptance before accepting a compiler fix.

No builds, compiler requests or semantic acceptance runs were performed for this policy documentation. Public documentation remains unchanged because this records agreed internal direction with implementation pending. Update supported public limits when implementation and acceptance establish them.

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

#### Fact scope and bounded core acceptance

Classify each remaining fact by its actual consumer, in addition to section 8's operation-family classification:

1. **General semantic or dependency facts:** preserve JavaScript evaluation and the required known effects. Await may perform a thenable Get and Call, resolve may assimilate its argument, and reject does not assimilate that argument. An async Call returns a Promise object, not the body's payload. Unknown alternatives must not erase known donors, and known alternatives must not erase independent uncertainty.
2. **Conditional use facts:** receiver, capture, argument, target and selected-body relationships apply only under their explicit source use and input proof. The source-only property projection and direct protocol-formal association belong here. Neither supplies successful normal output, native callback identity, descriptor authority, NoWrites or completion.
3. **Optional precision:** exact callee/output identity, strong replacement, finer caller discrimination and exclusion of unreachable MAY writes may improve a conservative result. Their absence is not itself a failure to represent ordinary syntax. The [maintained future-work inventory](proposals/future-work.md#compiler-precision-after-the-bounded-core) owns these deferred candidates.

Closed application compilation may substitute compiler-visible callers' inputs at their particular uses. Open library consumers require relative summaries and retained uncertainty for callers that are not known. Source substitutions remain conditional use facts in both settings. A fact observed at one application call must never become an unconditional exported-library certificate of purity, target safety, stable identity, NoWrites or completion.

Keep native syntax, the existing normal Await owner and task/runtime ownership wherever they already satisfy the core contract. The core still requires finite usable compilation, the unchanged original ordinary and mounted behaviors, known dependencies with independent uncertainty, placement and secret/serialization checks, and emitted order, cleanup and generation fencing. It does not promise that every unknown program compiles. Existing artifact decisions remain in force, and a new public limitation still requires agreement. A partial migration, an analysis stall or a dropped required donor cannot be relabeled optional precision.

For an original Await-selected authored `then` alternative, the protocol may supply two conditional source-only resolver inputs under that exact receiver/capture binder. Only the live originating query, source generation and original Await interval may recognize those roles; ordinary same-shaped methods and replaced formals retain their own alternatives. The shared resolver consumer keeps ordinary argument Gets and Throw for both roles, and adds nested assimilation Effects only for resolve. This association supplies neither normal body entry nor a fulfilled value, completion, purity or permission to clear independent uncertainty. No live protocol issuer belongs in cached facts or cloned semantic payloads.

#### Await consumer acceptance rows

The known-thenable/unknown-operand row retains its source-bound native task, artifact and eight public SDK analyze/compile controls. The three other rows now also have real client task execution on private composition `61168083`: the unchanged inherited-getter, nested resolve/reject and async-primitive component witnesses compile through the public SDK and mount through the public testing API. Real clicks reach their state and rendered-output assertions, preserve the same button, and release the mounted content on disposal. The inherited getter preserves its receiver mutation and throw; resolve retains nested assimilation while reject retains ordinary argument work without assimilation; both abrupt arguments preserve their throw. The async-primitive witness observes the constructor getter and restores its original descriptor. Its boolean observation does not attribute an exact global getter count.

The same composition passes the focused native public donor/unknown, ordinary or replaced resolver-role refusal, retained/fresh body-edit, unpaid dependency, result-type, cache-lifetime and resolver-invocation controls. All 61 selected top-level/subtest PASS sentinels are reached without skipped or failed tests. The older broader placement, transport and lowering matrices keep their original source bindings; they are not new coverage from these runs.

This is bounded client qualification with an exactly bound compiler host and retained, source-matched provider outputs. It does not qualify a freshly built SDK/provider distribution, server execution or hydration. The inherited getter's server request with setup-local class fields still encounters the existing class-reconstruction admission diagnostic before its expected placement diagnostic; that unchanged server case remains open. Canonical whole-module Vitest analysis also still times out before any mounted test. Keep those server-admission, diagnostic and integration gaps separate from the reached client assertions; private composition and these checks do not establish final integration or release acceptance.

| Row                                 | Smallest necessary public-consumer check                                                                                                                                                          | Acceptance requirement                                                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Known thenable plus unknown operand | A function task awaits a conditional browser-reading thenable or foreign operand. Inspect public task effect sources and compile the requested server artifact, with paired safe/client controls. | Retain both the browser donor and independent unknown. Apply the existing conflicting-placement diagnostic.                                                         |
| Inherited then getter               | Use the same task boundary with an authored inherited getter and its actual receiver.                                                                                                             | Retain the known getter donor through public task effects and the artifact decision. Exact prototype identity is not the oracle.                                    |
| Nested resolve versus reject        | Pass an object containing a browser-reading `then` getter to each supplied protocol argument in paired thenables. Inspect public task effects and server compilation.                             | Resolve retains the assimilation donor. Reject adds no assimilation donor. Both retain ordinary argument effects and unresolved effects.                            |
| Async primitive payload             | Await an async helper returning a primitive, with an authored browser-reading `Promise.prototype.constructor` getter. Inspect public task effects and server compilation.                         | The primitive payload must not bypass the actual Promise object's constructor/Get effects. Do not invent native identity from a type or source return relationship. |

Missing known Get, then-Call or resolve-assimilation effects at a supported public consumer are correctness blockers, not deferred precision. Retain the existing normal effect producer and its gates until the actual affected consumer is qualified. Source-only decoupling becomes core work only when this required behavior or an original/representative finite-compilation failure depends on it. The unchanged nested fixture now passes scoped semantic compilation, SDK paired artifacts and canonical Node HTTP assertions with retained providers. Canonical Vitest and fresh Core/provider qualification remain open, as recorded in the [corpus execution binding](component-composition-corpus.md#nested-method-evaluation-execution-evidence).

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

The uncalled array-initializer readiness helper and pass-through object-return validator have
been removed after verifying that the retired prefix lifecycle held their sole callers.
Live layout guards, object-completion ancestry checks and pending-actual refinements remain.
This is partial consolidation, not completion of the remaining bridge inventory.

Ordinary task and helper effect collection keeps authored operations on the existing
semantic collector. Syntax alone does not transfer them to staged result or protocol
consumers. A transfer requires an explicit operation purpose. Required results
and initializer transformations retain source, generation and completion checks.
MAY summaries carry effects only.

An original component task Call can retain child-owned Effects without entering that child as an ordinary body in the caller. The graph-local normal receipt records this distinct ownership disposition while remaining unentered, incomplete and valueless. Direct Await of a checked primitive task payload needs no additional authored assimilation work; its effect consumer validates the original live Call/owner/frame and retained child edge, including an edge already published to that exact live caller fact before the later receipts-only operand consumer. This is not child completion or a primitive result receipt. Non-scalar settlement, unknown child effects, rejection/cancellation, result policy and transport requirements retain their existing owners and guards.


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

The additive render-capability slice at `24a616c5b` is implemented and independently audited
within the [scope and limits above](#scoped-evidence-and-abi-boundary). Runtime ownership migration
is pending. The graph notification API is qualified, but source producer integration is unproved
and storage/prototype expansion remains paused. The construction baseline already passes.
An ordinary callback-reassignment bug has been identified and its correction reviewed. The
coordinator's separate `1da` qualification candidate is not integrated in this baseline and must
not receive completed-fix credit here. Core's required source-effect transfer remains blocked.

The first integrated delivery remains incomplete. The original mounted/SDK acceptance rows bind to `09925238a`, as recorded in the [owned composition corpus](component-composition-corpus.md#shared-capture-composition-acceptance). Current compiler artifacts are separately rebound at `b0f2c5808` through the rebuilt SDK. The unchanged plain-module anchor and safe replacement retain paired values, client-only browser export and exact title-Get counts. The unchanged component passes two mounted updates, retained instance/state/DOM identity, unrelated-consumer isolation, exactly-once disposal and paired SSR in Node/jsdom, plus the maintained Chromium mount/update/dispose journey with current component artifacts. These checks use retained workspace runtime providers. Their package builds have not been regenerated by the current compiler, and the browser provider build provenance remains unverified. A clean Linux/Node consumer also passes six explicit semantic SDK rows through installed local tarballs and the packaged native host. The same plain-module anchor and safe control also pass actual Vite, Webpack and native Bun client/server build hooks with retained providers. The extracted pre-existing source-isolation fixture passes on all three hosts. The maintained module-build configuration passes both Vite and Webpack tests without component setup. Other adapter suites retain their workspace component setup, whose Core analysis timeout remains unresolved. Fresh Core generation, installed mounted framework providers, hydration and cross-runtime acceptance remain open.

Current native integration includes the source relationship repairs for ordinary and reflective writer inputs, both-context constructor qualification, shared mutable factory caches, async settlement, formal/default effects, source freeze and nested binding Gets. Current-write selection at `6f70066b8` can exclude an obsolete local entry value before acquiring it at a later read. Its original initializer Get effects remain with the original body demand. Focused combined binding, capture, nested-binding and continuation facade controls pass. The unchanged parameter local-identifier source now compiles on both targets. The returned local-identifier leaf was already green and receives no repair credit. The genuine member-callee Get now retains its authored operation, closing the native acquired-method leaf through both targets. The separately saved method now passes scoped paired client/server tests at `9a7967514`. Its definition-relative query retains an exact Call-selection obligation, while contextual source queries still select the original method and capture and the initializer Get keeps its independent field obligation. Partial binding projections retain unavailable alternatives beside known donors. Source getter analysis separates discarded body values from successful return precision without removing unknown effects. These repairs add no normal output or result cache. The integrated source at `f71ff1133` passes the full `Policy|Secret` suite without exclusions, original module-write and shared destination/capture/mapping controls, and the combined source, construction, callee, saved-Get, Proxy and reflective cohort. Its native branch/condition evidence retains individually classified gaps. Descriptor-getter callback defaults and pattern inputs now have a source-bound regression: unused unknown inputs must not activate a caller default when the getter returns a known defined value. Reflective getters reuse the shared Get acquisition owner for that distinction, while returning an unavailable parameter retains output uncertainty. Broader abrupt-input and output-saturation compositions remain open. The descriptor-getter correction at `9b8907960`, with the literal-index witness at `8f6444610`, passes its scoped native branch and condition audits and emitted default/Throw controls. The separately executed static-to-instance getter projection control retains its browser donor both before and after this correction. Independent strict TypeScript 7.0.2 and Node qualification of its unchanged private-class source identifies no independent unknown operation. Its former nested-construction residual assertion was implementation-coupled and now expects the browser effect. At `9dd295aa3`, all three ordinary native qualification runs pass: `TestGetterMemberProjectionRecursion` retains the browser donor and cyclic Get controls, `TestPatternAliasEffectResiduals/foreign_alternative` retains the known browser donor with independent unknown, and `TestGetterReturnedMethodEmission` passes. Conditional setter input transfer from `3356fe01b` is integrated. The unused Await-specific binder was removed at `ec131fcff`, retaining the generic query-local receiver borrow. Fresh scoped branch and condition audits at `9dd295aa3` both exit successfully, including setter emission on both targets. Uncovered outcomes remain individually classified as unchecked source candidates or defensive paths without established source witnesses. These results establish neither full getter/setter-family coverage, MC/DC nor architecture acceptance. Fresh package consumers and broader closure/default behavior remain unverified.

Request-wide Core completion remains unproved. The retained Core diagnostic at `e23a3135d` synchronizes the preserved 300-source input with zero diagnostics, then produces no compile response before the owner stops it after three completed runtime profile segments. The process group is reaped. This is a diagnostic stop, not a latency acceptance failure or a natural compiler terminal outcome. Profiles concentrate on member acquisition, writer-input preparation and source return projection. They identify repeated work without proving source-context equivalence. Earlier natural stack overflows and uncapped no-response runs remain counterevidence to completion. The integrated allocation reductions preserve scoped behavior and reduce measured allocation in completed controls, but do not establish finite request-wide work. Detailed bindings and raw diagnostic profiles remain ignored under `.tmp/current-architecture/core`.

Source argument relationship delivery before recursive callee selection remains incomplete beyond the qualified boundaries. Binder-only transfer and wrapping unresolved Call provenance as an acquired receiver were insufficient. Both pilots regressed a previously completed small control and were reverted. A later queued argument/result trial also regressed that control and was reverted. Its member uses still synchronously expanded downstream callee and writer preparation. A shallow worklist alone did not establish convergence. Pending source demands must preserve later discovered alternatives, known donors, independent uncertainty and original acquisition cuts before outer source publication. Body-entry ownership, normal actual/output tables and native identity remain separate.

Earlier bounded original-source requests stopped within their diagnostic windows, including at `9dd295aa3` and the push-only slice. Their stacks implicated member, array, interference and writer-input preparation. Those observations established neither nontermination nor performance, and the earlier protocol setup failure supplied no compiler evidence. Frozen `fd3446424` now completes the unchanged Analyze request, semantic client/server compilation, SDK paired artifacts and canonical Node HTTP assertions. The [corpus execution binding](component-composition-corpus.md#nested-method-evaluation-execution-evidence) records exact inputs, command and observable traces. Evidence uses retained providers and adapted test-runner plumbing. Canonical Vitest, fresh Core/provider qualification and the wider environment matrix remain open. Earlier 75d metrics are beforeimage evidence only.

The unused prefix reservation, qualification, history and continuation lifecycle and its candidate-only source dispatch are retired. Ordinary normal storage, events, defaults, Get and async consumers retain their independently owned validators and refusal boundaries. The retirement does not authorize source relationships to produce normal DATA or integrity evidence. Remaining consolidation and environment acceptance must be assessed against the complete integrated change, not inferred from removed line counts or passing reduced regressions.

| Plan step                              | Current status                                                 | Evidence or remaining requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Preserve baseline                   | Complete for the migration                                     | The original source and private precision candidates are preserved separately from integrated work.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 1. Architecture and terminology        | Separation established, runtime migration pending              | Render capability is additive at `24a616c5b`, distinct from task placement and module availability. Runtime coordination consumers still need explicit ownership migration and semantic ABI review. General source dependencies and optional precision retain separate owners.                                                                                                                                                                                                                                                                                                                                                                                             |
| 2. Baseline corpus                     | Established                                                    | Original, safe, capture/acquisition, overlap and opaque-authorization controls exist. The environment matrix records unexecuted rows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 3. Shared source semantics             | In progress                                                    | Ordinary Calls, Gets, returns, construction and eager module evaluation use shared consumers. Reached helper disposal source/default and strict/host emitted controls pass on the integrated source. Source-only Proxy/Get-reference effects and selected-runtime closures pass scoped native checks. Writer-context and current-point transfer remain under repair.                                                                                                                                                                                                                                                                                                       |
| 4. Shared capture and effect transfer  | In progress                                                    | Original and shared capture controls pass. Ordinary/reflective writer input, capture and reader-cut controls pass. Core query termination and required donor transfer remain unresolved. The bounded graph notification API is qualified, but source integration is not established. Construction already passes baseline. Storage/prototype expansion is paused.                                                                                                                                                                                                                                                                                                          |
| 5. Original end-to-end anchor          | Current module anchor verified, environment acceptance pending | Native controls and the plain-module SDK anchor pass through `b0f2c5808`, including emitted title-read counts and safe paired values. Linux/Node installed SDK plain modules also pass. Scoped Vite, Webpack and native Bun module rows pass. Installed framework providers and canonical adapter-suite execution remain unverified.                                                                                                                                                                                                                                                                                                                                       |
| 6. Component and reactive integration  | Current artifacts mounted, provider rebuild pending            | At `b0f2c5808`, component artifacts pass mounted identity, lifecycle and paired SSR controls with retained providers. Additive render facts at `24a616c5b` have scoped native/SDK and independent condition evidence. Runtime ownership migration and fresh providers remain pending.                                                                                                                                                                                                                                                                                                                                                                                      |
| 7. Transformed nested continuation     | Scoped Node HTTP pass                                          | Unchanged source passes Analyze, semantic client/server compilation, SDK paired artifacts and the original method/receiver/order, Throw/finally, cancellation and cleanup assertions at fd3446424. Retained providers and adapted lifecycle/assertion plumbing limit this evidence. Canonical Vitest, fresh Core and wider runtime acceptance remain open.                                                                                                                                                                                                                                                                                                                 |
| 8. Remaining operation families        | Incomplete                                                     | Statement, iterator, protocol, async and builtin-contract coverage still requires mechanism-based qualification. Exact-value simulation is not the completion criterion.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 9. Policy, selection and invalidation  | In progress                                                    | Field, native-container, wrapped-eval and default containment corrections are integrated. Propagated binding and assignment fallbacks pass integrated policy checks. Source selection and broader invalidation acceptance remain open.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 10. Remove superseded paths            | Partial                                                        | Canonical return projection replaces the old declaration/property fallback. The unused module-origin and prefix-slot view adapters are removed. Session reservation, collector plumbing, unreachable first-entry dispatch and refusal source-coverage transport are removed. Historical hold/retarget routing and uncalled candidate entry methods are removed. The connected lifecycle and candidate-only language dispatch are retired with obsolete receipt bootstrap. The orphaned array-initializer readiness helper is removed after its last caller retired. Live layout/refusal guards and shared normal storage/events and validators remain independently owned. |
| 11. Framework environment matrix       | Incomplete                                                     | Linux/Node installed compiler-only source replacement passes. Actual Vite, Webpack and native Bun plain-module rows pass with retained providers. Browser, full adapter suites, other runtimes and installed mounted framework execution remain open. Paired Core generation blocks downstream package checks.                                                                                                                                                                                                                                                                                                                                                             |
| 12. Final acceptance and consolidation | Incomplete                                                     | The render slice is implemented with its scoped evidence and red gates recorded in section 3.2. Full-plan acceptance and release readiness remain incomplete.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

Track three distinct dimensions:

1. **Architecture completion:** common interfaces exist, consumers use them, and superseded paths are removed.
2. **Authored behavior:** original use cases pass analysis, transformation and runtime expectations at their applicable boundaries.
3. **Validation coverage:** exact environments and checks executed on the integrated source, with remaining gaps visible.

The existing fixed capability ledger mixes ordinary syntax, required framework analysis, transformations and optional precise modeling. Suspend its use as a current project-percentage headline. Its historical IDs and results remain available for crosswalk, but they do not measure this plan's completion.

At the user's request, concise updates also give a coarse overall engineering estimate.
The last recorded estimate on 2026-11-02 is about 50% of this entire plan, including remaining
source convergence, transformed execution, environment acceptance and consolidation.
This is a judgment about completed requirements and remaining work, not a capability-ledger
ratio, test-pass percentage or schedule forecast. Passing another scoped check does not
by itself advance the estimate. The requirement-level states above remain the acceptance record.

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

Historical local paths beneath `.tmp/framework-confidence` are retained in the verified ignored archive `.tmp/framework-confidence-history-20261102.tar.gz`. Extract only the specific source or evidence needed. Old build caches, duplicated dependencies and compiled diagnostic binaries are not retained prerequisites.

The initial plan was prepared through read-only inspection. Subsequent execution status is bound to the integrated checkpoints and checks named above and in the owned corpus. No full-suite, all-runtime or release acceptance is claimed.
