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

## Conformance to the minimum-analysis rules

Use the [scenario catalog and traversal rules](compiler-architecture-completion-plan.md#final-traversal-and-persistence-rules) as the design target. The combined control build uses the committed production tree at `1b31bc5b0`, identical to `eb234c6b3` apart from documentation. It excludes the unrelated accessor edit. Existing tests, source traceability and passing public behavior are distinct kinds of evidence.

| Observable discrepancy on the control build | Correction and acceptance |
| --- | --- |
| A component renders an opaque module-initialized label. Placing an independent server secret consumer on the same line lets the module emit; inserting a newline yields EXACT2101 for the label. | Bind the existing policy allowance to the particular initializer. Compare adjacent statements, adjacent declarators, and an authorized consumer beside ordinary public data. |
| A server task explicitly invoked from a browser event rejects a browser-safe concurrency key using `location.pathname`. An inferred argument key can acquire spurious opacity from its policy builder. | Separate invocation-site key evaluation from executor body placement. Preserve independent body requirements. Exercise local and cross-target callers, dormant definitions, mixed keys and parameter transport. |
| A server task stores a public opaque operation. A browser-only getter on its domain or on an enumerable field copied during creation passes target checks. | Attribute actual metadata Gets to creation. Preserve the skipped-copy control and defer the executor to redemption. Use both SDK targets and a component invocation. |
| Explicit server tasks accept browser work in the body of an async generator consumed by `for await`, including a close path on early exit. | Follow iterator acquisition, advancement and applicable closing effects in their executing phase. Compare neutral and unadvanced generators and verify the selected task artifacts. |
| An explicit server task accepts untagged interpolation of an object whose own string conversion accesses the browser. | Include applicable coercion hooks at untagged substitutions. A tag receiving the unconverted object and checked primitive substitutions are separate controls. |
| A server task invokes a browser callback recovered from a local array pattern, or from an object pattern before the source property is replaced. Both forms emit on the control. | Preserve the value selected at binding initialization through the invocation. Compare direct snapshots, overwritten source properties, defaults and nested patterns. |
| A browser access in an unreachable helper branch or after an unconditional exit can reject a server task. | Use control-flow reachability at the point that contributes effects. Compare dynamic conditions and reachable effects on the same paths. |
| Compiling a supplied-child component that forwards its unchanged input down a branching chain exceeds the native suite deadline at depth 28. | Bound work for repeated source obligations. Verify both targets for the transparent child and the replacement leaf, and retain the distinct receiver and cycle controls. |
| The installed Intl component request exceeds its normal deadline while recursive translation-node visits repeatedly extend the same member projection. | Exercise the original package request sequence and verify termination alongside recursive getter and argument cases that require distinct effects. |
| A component returns SVG with a conditional fragment containing two dependent children. Testing a transformed child for direct root attachment dereferences its absent parent and panics on client compilation. | A direct root requires an authored return parent. Keep the nested composition path when the parent is absent. The existing narrowed-fragment regression checks emitted readers. |
| A blocking server task completes a nested state write before rendering, but the renderer observes the old value. | Publish the successful generation’s writes before the server slice exposes its outputs. Verify rendered state, abort and failure. |
| A remote task commits a scalar alongside Map and Set operations. The mounted client receives the scalar but misses the collection updates. | Preserve task-generation ownership and record ordered collection changes on successful publication. Reconcile with intervening local edits and verify abort and failure. |
| A client list with setup-local types and ordinary constants receives a server-boundary proxy and fails to mount. | Compare the selected artifact with the working basic list in the same runtime. Identify the placement source and mount the original list. |
| A task reads a fresh standard Event, or initializes and uses an EventTarget. Unknown or server-only effects reject portable work. | Verify intrinsic construction, performed method effects and separately consumed results. Preserve shadowed constructors and actual listener effects when dispatch occurs. |
| An explicit server task adds two helper results whose authored `valueOf` touches the browser. The control emits with no diagnostic. | Attribute implicit primitive conversion to the addition, including conversion of a returned object. Retain checked primitive and strict comparison controls, and verify the depth-28 dependency graph. |
| Fresh typed-array fill and subarray calls, buffer slices and DataView operations introduce unknown placement on otherwise portable components. A server task can also emit when a fill argument's conversion or a replaced instance method reads the browser. | Check original byte storage and method declarations and the selected receiver. Conserve scalar fast paths, actual argument conversions, per-instance replacements, species Gets and callbacks. |
| Checking a host global after an authored module-level terminal guard discards its export on the server. | Carry availability across the eager declarator boundary. Import both emitted artifacts with the global present, and verify the authored throw when absent. |
| A component uses a browser-only module initializer through a helper. Partitioning can omit the initializer or helper while emitting its reference. A list with setup-local aliases can also become an unusable server proxy. | Share selected dependency availability with artifact selection, preserve opaque portable component paths, and mount the original repeated owners on both sides. |
| A component task reassigns a captured callback before forwarding a scalar through helpers. Its browser effect disappears from the caller summary. | Check captured bindings before reusing a definition's effects. Verify both the browser donor and the remaining unknown alternative on the original server task, alongside the depth-28 forwarding control. |
| Converting a typed state field with `+` introduces an opaque dependency after setup extraction or inside a function task. | Preserve the component receiver's checked field type at the conversion. Exercise string, server, opaque and mixed inputs after extraction, and numeric state in the task transport case. |
| A mutable context provider initializes state directly from a numeric prop. The literal use has no provider activation in the published plan. Selective SSR can attempt to serialize the descendant's captured context commands. | Record the literal input proof on the render edge while keeping the provider declaration portable. A client-capable root can own the whole subtree. A server-only parent can publish an island at the selected site. Paired client and server artifacts preserve the server button and update the provider's state on successive clicks. An external property read does not receive literal delivery; the typed spread control uses its existing element boundary. Separate constant and aliased state controls exercise full-root and selective hydration. |

The return-site loop in `componentCallableDemand` enrolls component render returns under the `componentReturn` guard. It does not enroll every returned helper as invoked. Original Core and Theme requester cost still needs a bound consumer experiment before removing a return query. The original Core request subsequently completed on the integrated compiler at `083bed985` in 12.97 seconds, producing all 300 client and 300 server JavaScript artifacts. The earlier [forwarded getter controls](#discarded-helper-results-and-forwarded-getter-effects) demonstrate why.

The baseline native inventory lists 2,299 groups at `1b31bc5b0`. Of those, 506 failed and the depth-28 supplied-child group timed out. Isolated runs completed all 1,747 groups after the timeout in suite order. Some old controls request a summary for an unused ordinary export. Give those controls an actual component consumer where the asserted behavior is required. Native and SDK failures that already have such a consumer need independent disposition against the rule they exercise. The integrated revision `293f657a5` ran 2,311 groups, with 1,846 passes and 465 failures. Compared with `083bed985`, 34 previously failing groups passed, both new groups passed, and no previously passing group regressed. This snapshot predates the later receiver, context and server setup fixes.

Of the 465 failures, 176 occur in staged source tests, 196 in other source tests, 23 in session tests, 18 in component tests and 52 elsewhere. File ownership locates the failures. To settle a family, identify the component operation, reproduce its public outcome and compare the asserted fact with the seven rules. When a private assertion inspects graph state, verify the phase and cache lifetime in which that state is valid. Preserve a public control for any behavior still required after an obsolete assertion is retired.

The one-argument native `Object.create` conformance control makes the component
setup call and retain the created object. Its public effect summary checks that
construction leaves inherited getters and stored callables dormant. The emitted
ordinary helper separately verifies the supplied prototype, Proxy behavior and
native throw. Original staged source admission keeps its own phase-specific test.
The descriptor controls also use a component setup Call. Authored replacement,
key evaluation and eager descriptor conversion retain their browser effects.
A foreign invocation in a descriptor getter retains uncertainty beside its known
browser effect. The same component definition reports those effects in app and
library analysis.
Literal Freeze fixtures likewise anchor their EffectSources in component setup.
Their emitted helper probes check preserved object identity and call order, as
well as stored getters and callbacks that execute only when later consumed.

The follow-up native snapshot at `2d642dc7f` ran 2,318 groups with 1,874 passes and 444 failures. Compared with `293f657a5`, 24 former failures passed, eight new or replacement groups passed, and four former passes failed. A host JSX assertion was replaced by its ordinary-caller control. The four regressions identify ordinary host JSX and the receiver scope of three keyed collection paths. The derived and imported-key witnesses trace the receiver of a materialized map back to its authored occurrence.

The unified `da2de7f49` snapshot ran 2,321 groups with 1,885 passes and 436 failures. Eight former failures passed, including all four new failures from the previous snapshot. All three added groups passed. The same snapshot passed 22 focused SDK cases and 24 warm and fresh request pairs. Chromium preserved the authored assignment-list owner across fresh mount, retained mount, fresh hydration and retained hydration. Packaged enhancement adoption, recovery and disposal passed on Node, Bun, Deno and Cloudflare with retained providers. The wider runtime run reached the native deadline on `cancelled-task-catch.tsx`. The separate composition corpus also reaches the deadline on that source family.

The full native `43fa437ca` checkpoint ran 2,322 groups with 1,894 passes and 428 failures. Eight previous failures passed, including the seven staged delta groups and the returned-capture issuer control. The added standard writer-key group passed. Every prior pass remained a pass. The two subsequent Await fixture repairs also passed on the same native production source.

The full native `9898a1cba` checkpoint ran 2,329 groups with 1,903 passes, 425 test failures and one compiler panic. Relative to `43fa437ca`, three prior failures pass and all seven added groups pass. The prior render-effects suite reproduces the panic on a parenthesized Array `map` member. The source key lookup now unwraps that member and leaves absent source syntax to ordinary analysis. The complete render-effects matrix and the Map key placement tests pass on a focused rerun using the checkpoint plus that correction. The historical inventory still contains 131 failure families. Their exit status and source owners guide triage, while distinct public consumers require separate qualification.

The full native `db1cb6832` checkpoint ran 2,330 groups with 1,910 passes and 420 failures. Every prior pass remains green. Five prior failures pass, covering wrapped array calls, the captured-write consumer and three constructor and writer groups. Both added groups pass. The authored root-factory coverage replaces one former standalone assertion.

The full native `95e8059d1` checkpoint ran 2,332 groups with 1,911 passes and 421 failures. Two new groups pass. The frozen module Array test loses the browser effect of an earlier authored replacement of `Object.freeze`. After the selected initializer again retains that authored writer, the full `bd20a10bd` checkpoint passes 1,913 of 2,333 groups. The recovered test and the added direct Array member tests pass, and every previous pass remains green.

The full native `d1e404dd0` checkpoint passes 1,915 of 2,333 groups. Both added groups pass, two historical preparation assertions are replaced by component checks, and all prior passes remain green. The historical 131-family inventory still includes unresolved consumers.

The full `c031c7e6a` checkpoint passes 1,915 of 2,334 groups. The added scalar prop group passes. The collection authority group loses its placement distinction for a prop used as the receiver of a subsequent member operation. The prepared prop proof now leaves those receiver and key observations with their existing owners.

The full `07c7f1682` checkpoint passes 1,917 of 2,335 groups. The collection authority group recovers and the new immediate setup snapshot group passes. The full `23d0f07e8` checkpoint passes 1,920 of 2,336 groups. Both finite registry groups and the component construction-input group recover. The new registry key-effect group passes. The append optimization loses the distinct-array and replaced wrapper-field cases in the push placement group. Both pass in the focused `a5d4de984` replay. That correction is outside the full `23d0f07e8` checkpoint.

The authored root factory passes its parameter to a real component through the paired SDK artifacts. The binding lifecycle and collection identity suites pass all 45 cases with the wrapped Map correction. The root factory control renders distinct inputs, adopts the server DOM under strict hydration and updates the retained owner on new props. This replaces the native assertion about a particular receipt helper for a declaration without a component body.

The focused `7a85c2499` checkpoint passed 22 of 28 native groups, including the assigned-getter and recursive-projection controls. Six staged-source failures reproduced from `43fa437ca`. The checkpoint passed 21 paired SDK cases covering forwarded setup, context, retained props and host rendering. Direct browser and server task compilation also passed the scalar-or-thenable checking cases with rebuilt Core declarations. At this checkpoint, the canonical cancellation corpus reached the 30-second compile deadline.

The cancellation profile traced repeated receiver-writer scans to the local getter shared by the nested thenable's resolve and reject branches. The getter's receiver stays local, and the original Gets still run across the closure. Restricting the optimization to that named own getter brings the unchanged corpus under the default compile deadline. All 22 cases pass, including the authored Promise constructor Get and the thenable's real resolve, reject, and argument-throw paths. Native analysis of the original fell from about 70.7 million to 10.3 million estimated operations. Theme's writer-input preparation and Intl's descriptor writer recovery are separate open paths.

With `8e798aa87`, the broader runtime acceptance build completes the cancellation request and reaches the default native deadline on `collection-projection.tsx`. Each of its seven authored list regions finishes in isolation. Removing any single region still exceeds a 12-second analysis limit in the diagnostic run. The original combined collection fixture remains the acceptance case.

The collection profile traces the growth to repeated writer scans around the directly destructured literal `{ rows: [...this.state.items] }`. The temporary record has one unexposed own data field. Acquiring that field keeps the selected array and the dependencies of its later consumers. With `dff7ce6e9`, the unchanged cancellation and collection fixtures pass all 24 cases together at the default compiler deadline. The collection request uses about 5.93 million estimated operations per target.

The retained collection request also retries the earlier `count(rows)` call while looking for a writer to the selected array member. The immutable reader only accesses the native Array's own `length`. Reusing the direct binding proof excludes that call from writer recovery. The original retained analysis drops from 5.93 to 3.83 million estimated operations and takes 6.66 seconds in the matched replay, compared with 11.61 seconds on the control. The analysis is identical. The paired native controls retain effects of authored getters, Proxy traps and a replaced reader. Post-collection heap remains about 1.53 GB after forced collection. The retained allocations are concentrated in checker symbol-table instantiation, which remains a separate cost.

The fresh array's original named member can reuse the checker-resolved symbol. Both lookup paths continue to check its declarations. In the same retained request prefix, the post-collection heap drops from 1.53 GB to 0.80 GB after a forced collection. Analysis takes 4.44 seconds in that replay, with the same effect results, diagnostics and estimated work. Direct named, computed and optional calls retain the browser callback effect. The authored augmentation retains unknown placement. The matched Intl request uses other receiver shapes and still reaches its package deadline.

Both variants complete the same 70-request retained SDK replay through the final pair of collection artifacts. Client and server code, analysis and diagnostics agree. The unchanged cancellation, collection and mutation composition cases pass all 26 controls together within the default native deadlines.

The broader runtime build advances to the authored page that imports both fixtures. Two explicit server tasks gain the browser effect of the imported cancellation fixture's client-only `Promise.prototype.constructor` getter. A reduced pair reproduces on `7a85c2499` and `dff7ce6e9` with the writer in the same file or an imported module, on both artifact targets. The constructor reader now excludes descriptor writers in tasks with an established opposite execution target. Same-target writers and browser optimistic work retain their effects. The paired native controls exercise both targets, imported writers, local writers and the original constructor and state-write operations. A synchronized replay of the original page has no placement errors with this correction. The retained SDK build of the combined page graph reaches the default compile deadline on `mutation-contract.tsx`. Broad runtime acceptance remains open.

The later runtime run compiles that combined page and starts its Node host. The task-capture fixture supplies its own JSX settings, and the runner installs enhancement facades in the emitted JSX implementation. Empty browser compatibility declarations no longer make the event-responsibility fixture secret. The browser journey passes 32 controls with fresh paired artifacts and retained runtime providers. The broader run reaches the ordinary-invocation negative for the enhancement provider. `RuntimeScope` loses independent publication because placement is unknown. Reading a checked scalar prop in setup acquires a generic accessor obligation even though the component input receipt delivered the value. The original getter still runs at input issuance or at the authored JSX use. The runtime fixture now performs context lookup on the component and passes the value into its helper, in accordance with the context ownership contract. The unchanged Time package build still reaches the native compile deadline on `components.ts`.

Component placement now uses the already-delivered scalar prop while retaining the effects of its producing use. Application and library outputs agree with and without a local caller. The paired controls retain authored JSX getters and Proxy traps, the selected lifecycle key obligation, unresolved nested reads and branded-secret refusal. In Chromium the fixture mounts and strictly adopts the SSR output, then updates the retained element. The authored input getter runs once at issuance. The original enhancement provider now passes the renderer-owned use and rejects the function-valued prop in an ordinary server-parent use.

The retained Core server export lacked the existing task-publication correction. After rebuilding both Core targets, the same blocking task emits `26` in its state and context outputs and the wider Node run passes task capture HTTP checks. The next failure is the original setup snapshot in `source-normalization.fixtures.tsx`. Its synchronous server computation has no generation signal, but the common task lowering generated a pending transaction. The lowering now reserves that transaction for the actual task generation. In the original paired fixture, the snapshot and its helper control render `1` and `2`, adopt the same Chromium output nodes under strict hydration and update through `3, 6` and `4, 6` respectively. Updating only the helper's snapshotted input leaves its output unchanged.

The composed application next replaced its parsed DOM during hydration. The setup alias for a lazy registry entry made the application contract unknown, which caused the server shell to publish ordinary descendant controls as independent islands. The compiler now recognizes the registry entry as an own data field while retaining the effects of the original key expression. The application retains its mount-work template across buffered and streamed hydration. The separate server-only parent control publishes a registered island and preserves its parsed parent, child and sibling. All 14 SDK registry hydration cases pass. The application journeys pass on Node, Bun, both Deno abort modes and Cloudflare with the retained SDK and runtime providers and a rebuilt paired Core.

The separate installed-island gate fails all eight cases before browser activation. The source-removed producer receives EXACT2101 for the `createIntlEnvironment` initializer. The physical package contains both runtime artifacts, its checked declaration and component publication metadata. The metadata covers the published component graph. The ordinary factory has no record. A private `@exact pure` declaration experiment also admits an authored browser option getter into the server artifact, where the initializer fails. A Vite resolver-backed snapshot recovers effects for small portable and target-divergent installed helpers, including an option getter and an edited or removed runtime file. The original selected Intl implementation reaches the default deadline on both targets for both literal and getter inputs. Standalone library compilation currently has no authoritative consumer resolver for those unbundled imports. The installed gate and the original Intl package deadline remain open.

The stored-descriptor fixture now observes a typed task that publishes its result to component state. On both targets, the placement decision preserves dormant retrieval, absent properties, and the browser effect of direct invocation. A direct call through a single-use local const retains the stored getter or method's browser effect alongside independent unknowns. Adapter invocations through `call`, `apply`, or `Reflect.apply` and a Proxy descriptor-normalization getter still lose browser effects in the public task controls.

A typed task consuming a getter through an array exposes the capture-write consequence. After strict hydration, the client task updates the rendered result and the captured counter. A server task formerly returned the result while leaving the counter unchanged because the possible write supplied no performed remote lowering. The test now uses the actual component and checks refusal of the unsupported remote work. A direct scalar helper publishes both declared writes through the server handler. A reply containing a forged sibling field is discarded by the existing browser continuation validator, leaving both fields unchanged.

The pending constructor batch now observes the actual task that needs the constructed result. It covers a selected constructor callback beside a foreign alternative, dormant stored callbacks, invoked defaults, first-position rest selection, function constructors and an independently reached writer. Both artifact targets retain each known browser effect and deny explicit server placement where required. The Proxy, eager module initializer and setter delivery fixtures still need separate qualification.

The Object.create and Freeze batch replaces two standalone preparation assertions with paired component task placement. It covers native descriptor arguments, spread and module prototypes, saved and authored native alternatives, and an opaque freeze input. Six blocking task controls publish their construction result through SSR. The browser effects of a later Get or Call through a created object's prototype, including a getter reached after a composed freeze, are still missing in the corresponding component task controls.

The combined page's recorded SDK request sequence, replayed against `3086b3d9c` with the captured-write diagnostic, measures different costs on identical source. A cold synchronized client compile finishes in 9.93 seconds. One retained analysis takes 37.68 seconds, including 29.50 seconds in project linking and no new component source analyses. Later replays finish the same retained analysis in under nine seconds. A fast profile reaches receiver-writer discovery again. The slow link interval has no repeated cause measurement, so the broader runtime deadline remains open.

The staged delta family has separate observations at the component and operation owners. A task invoking an acquired callback publishes the browser effect through both ready callable summaries. Both the project collection and its source cache have no staged recipe or use for that MAY query. All seven focused delta controls use the original operation collector, which supplies the recipes for their delivery checks. The relative-input control selects its producer by the source request and retains the original Call use and read. These results distinguish graph purpose from loss of a required public effect.

The focused `3157ce705` checkpoint passed 29 of 36 native groups. The seven staged delta controls, byte-storage species and authored array iterator checks passed. Seven Promise and await groups failed at that checkpoint. The inherited-then fixture now declares the class at module scope to exercise the actual Await placement decision. A separate continuation control retains the refusal to transport a setup-local inherited class. The generation-signal fixture now exercises a resolved browser helper whose awaited value updates rendered state. Its old undeclared calls correctly refused opaque task placement before code generation. The remaining source-level Promise and await tests require qualification against the actual component operation and the standard built-in trust policy.

A typed component that returns a setup helper called with the same receiver used to compile with no diagnostics even when server output and client state disagreed with the receiving artifact. The two-argument helper has no standalone artifact and now uses the receiving owner's named state, ordinary returned render function, and tracked JSX reads. The paired-artifact test exercises SSR, hydration, client lifecycle, and prop delivery on a retained DOM node. A helper that also qualifies as a standalone component still reproduces the contract disagreement. A private experiment used a receiver-relative body for the authored function and retained the component's optimized artifact entry. It preserved the authored `.call` getter, strict hydration, mount and prop updates. The owned executor and portable contract agreed in application and library builds whether a local forwarded use was present. Adoption of the extra emitted entry requires architectural agreement.

The canonical SDK run used source and built adapters at `85cbeccc6`, native inputs equal to `2d642dc7f`, and retained runtime providers. It reported 2,535 passes, 364 failures and one skip. All 160 Time cases that failed on missing runtime entries passed on a focused rerun with the complete retained distribution. A fresh Time library compile reached the request deadline on `packages/time/src/components.ts`. The control compiler at `1b31bc5b0` reproduces native process exits in server-bundle isolation and task parameter defaults under the same SDK setup. Distributed continuation setup also failed when transforming Microfrontends.

The full original Core package build emitted 300 JavaScript modules per target at `43fa437ca`. Its 16.07-second elapsed time is one observation with retained providers and other audit jobs active. The deep placement test reported 1,863,065 JSON characters against a limit of 750,000 on both the control and unified compilers under the same SDK configuration.

The unchanged Theme package reaches the client `components.ts` request deadline in
31.71 seconds with `330af2ff4`, with no emitted files for either target. The focused
`createTone` control passes for application and library targets. Its selected map
callback retains browser effects from the reached getter, excludes an unvisited getter
when the lookup keys are known, and keeps the possible effect when the key array or
callback parameter can change.

Theme's reactive scope resolution requests `createTone` and `createThemeTokens` through
ordinary possible-effect collection. In `createTone`, writer discovery repeatedly
projects `resolveSolid(...).onSolid` to check receiver overlap. The source summary and
index are already available, and the live frames and read cuts differ. Privately
omitting the entire `createTone` inquiry moved the unchanged request to the separate
`themeSurfaceBundles.map` member read in `createThemeTokens`. Both reached the same
package request deadline.

Both maps read the same eagerly selected Freeze input in `token-contract.ts`. The
integrated trace measures about 0.22 ms at the initializer's own selection and 2.99 s
for the first reconstruction in `createTone`. The array input acquisition itself
takes under a millisecond at that first descendant read. The comparison reused
the confined primitive array's lexical endpoint for source member projection and
map-key discovery.

The captured request used the same endpoint three times in `createTone` and 307 times
in `createThemeTokens`. Both body extractions finished. The corresponding package
comparison still reached the client request deadline at 31.83 seconds with reuse and
32.42 seconds without it. The production-shaped replay reached the same deadline
at 31.73 seconds. All three emitted zero files on each target. The paired component
controls retain known, unused and uncertain getter behavior. A synchronized edit
reaches a browser getter on both targets and restoring the original key restores
the original emitted code.

The eager endpoint shortcut was withdrawn after `TestFrozenModuleArrayComponentEdits`
reproduced a lost browser donor. The initializer can select the standard Freeze when
analyzed alone, while an earlier sibling dependency selected by the component can
install an authored replacement before the initializer actually runs. Reloading
the source invalidates the old fact, but the provider's new fact still lacks that
initialization context. The reader now uses the original selection and writer
analysis. Reuse would require a matching selected initialization prefix or independent
evidence that the additional sources cannot replace the acquired method.

Constraining the receiver-history work on direct Throws of the original
`ThemeResolutionError` moved the private request to `copyThemeData(found)` in
`resolveTemperament`. The emitted constructor and thrown payload were identical in the
matched controls. A separate component exposed a correctness defect when an eager
import installed a browser setter on the error's prototype. The uncorrected server
artifact ran the setter and threw `ReferenceError`. With `b381e9a28`, SSR emits a client
boundary and the neutral setter still executes once and renders the caught error fields.
Application and selective library facts agree when the component owns the import and
when only its caller imports the installer. The unchanged Theme package reaches the
same client request deadline with that fix, at 31.76 seconds and zero target files.
The compiler still places the Set on the client when an own field shadows the setter.
A lexical-heritage shortcut failed the selected-import control in which an authored
replacement superclass returned a proxy and the Set reached the inherited setter.
The optimization needs the actual receiver's initialized own data field.

An imported copy helper can execute a browser getter even when the component uses
only a scalar result and discards the copied object. SSR of the unchanged nested
`copyThemeData` case and a shorter `Object.entries` loop both reached the getter
in a server artifact. The direct append control now retains the selected
`Array.prototype.push` argument at a direct element binding on the same confined
local array. The original argument acquisition supplies the bound value from
that callable. Inline wrapper fields keep their original writer and creator
checks, including separate arrays and field replacement after capture. The SSR
cases cover an authored `push` replacement and reassignment in both directions.
Ordinary read and invocation owners retain their effects and uncertainty.

The private dynamic-index comparison preserves browser placement for a reached
getter and renders the same server output when the element is unread, removed,
or never stored. Both it and the restored comparison reach the unchanged Theme
client deadline at 31.56 and 32.02 seconds, with zero artifacts on either target.
The nested copy still lacks an observed value origin for the child of a reached
`Object.entries` pair. A direct loop with no array append also loses that origin.
A cyclic copy containing a dormant class getter renders on the server.

Computed method and accessor names run in the surrounding evaluation region. A
setup-local name can call a helper that installs a getter before the component
reads the target. Writer discovery now uses the indexed region of that Call
and keeps the deferred member body separate. The SSR controls place the reached
getter on the client for computed methods, getters, and setters. A computed name
inside an uninvoked method remains dormant. The module-initializer case still
reports `EXACT2101` when the direct descriptor install retains opaque startup
effects.

The unchanged Theme package on `6172d820a` stops at the client `components.ts`
deadline in 32.16 seconds. Neither target has emitted artifacts. On the same
frozen source, nested writer-body discovery accounts for 13.02 of 23.95 sampled
CPU seconds. Replaying the captured request with an ordered Call list removes
most incidental syntax visits and leaves `components.ts` incomplete. On the
package run, the checked-arithmetic bound bypasses 12,304 selected candidates
before input preparation and reaches the same deadline. Suppressing all
selected nested writer expansion advances from palette
conversion to temperament and copy analysis, and the package still hits the
deadline. The bound omits real candidate work and stays private.

The cumulative private receiver-inventory cut also advances past `copyThemeData` to
the `resolveThemeScopeData` loop. During effect collection for its `resolveThemeData`
call, the local binding query reprojects an earlier destructuring acquisition through
the selected return body. The existing eager binder owns that acquisition's effects.
The matched original package runs still reach the client deadline at 31.62 and 31.66
seconds with zero target files. Both variants preserve the same getter controls.
A further private omission of captured local results encounters repeated Call-return
projection and a stack overflow in the unchanged package input. Its production
reachability remains unverified.

The reduced Intl reactive setter request completes in 0.91 seconds with `819594709` after
reaching the eight-second stop on the baseline. Active and dormant aliased setters preserve
their target effects, including a setter that installs a matching descriptor. In the recursive
projection control, `666f0e660` bounds the use of the same unresolved formal and preserves
known browser getters in nested actuals. Each of three component compiles finishes within
0.30 seconds. Their previous builds reach the six-second stop.

The earlier Intl SDK timings below used the package before `fee91a826`, which split
`initializeIntlEnvironment` from `createIntlEnvironment`. The captured native
requests below used the package with that split. A fresh SDK build of the checked-in
Intl sources on `be8603e50` reached the same `components.ts` deadline in 32.11 seconds
and emitted neither target.

The earlier Intl library build uses retained SDK providers and the native source at
`43fa437ca` with the recursive projection fix from `666f0e660`. TypeScript prerequisites
complete. The package command reaches the native request deadline on `components.ts` after
32.89 seconds of wall time and publishes no client or server artifact. Sampled reflective
writer recovery still acquires named data paths through the actual protocol record builder.
Those data slots can carry callable sources, so the remaining cost needs a source relationship
that retains applicable writer and captured callable effects.

On the frozen `7a85c2499` native source, setup placement for `IntlLocale` reaches the
formatter through default environment creation, descriptor validation and the pattern
callback. In a 24-second profile of the unchanged request, 18.39 seconds include candidate
Call collection and 18.46 include the full writer-input scan. Occurrence indexing alone
would address little of this cost. A source-scope observer saw repeated inputs at ten hot
call sites. After accounting for the active and pending context, one private replay retired
about 4,050 empty results before its stored-context limit and still reached the deadline.
The paired render control keeps a browser callback stored as descriptor data and the
independently unknown dynamic key. Removing only the default-locale calls in a diagnostic
source variant removes that formatter demand. The variant still stalls at the separate
eager freeze of `accentedCharacters` while recovering environment writer inputs.

The known-key data path also revealed a placement defect. A component stored a browser
callback from `Reflect.get` in a descriptor and invoked it during rendering. Its original
server artifact threw because the callback had been left available on the server. The
selected native read now carries its eager getter effects and any known callable value
through the original cut. The paired SSR test emits a client boundary for the browser
callback and renders the neutral callback on the server. The unchanged Intl SDK build
with this fix still reaches the request deadline on `components.ts` at 32.94 seconds.
An independent repeat reached the same request deadline in 31.99 seconds. A private
diagnostic also skipped recovery of the single `requireRecord` descriptor writer at
each queried member. The unchanged package request sequence still returned seven of
eight responses after 36 seconds. This confirms that eliminating that writer alone
would leave a further cost, even though its recovery dominates the sampled interval.
In that diagnostic the next sampled consumer was `initializeIntlEnvironment`. Its
`registry.current = next` batch writer prompted about 61,000 candidate acquisitions
across 4,633 reads without reaching that writer body. Three nearby environment writers
prompted about 57,000 more acquisitions over the same interval.
Skipping those four inventory paths as well still leaves the original request pending
at 32 seconds. The independent interference scan accounts for 14.91 of 29.95 sampled
CPU seconds in that diagnostic. Both routes need qualification for the original consumer.
Within that scan, the original setup lookup is the spread array’s `sort` in
`initializeIntlEnvironment`. It leads to repeated operand acquisition in deferred
catalog synchronization and lookup bodies. A bounded trace of six hot call sites
found no demanded receiver or active creator among more than 65,000 acquisitions.
The direct fresh-array shortcut leaves the package deadline in place and loses an
explicitly installed descriptor effect in its control, so it remains diagnostic only.

Another private comparison omitted the whole `initializeIntlEnvironment` demand from
canonical and late extraction and refused its dynamic body entry. With the checked-in
Intl sources and original SDK command, `components.ts` still timed out and emitted
neither target after 32.63 seconds. The remaining setup path visits
`createDefaultIntlEnvironment` and its `canonicalLocale(sourceLocales[0]!)` call.
Its reflective scan attempted about 341,000 original Call collections across 33,214
requests for `requireRecord` writer inputs without selecting that writer body. The
initializer’s own body cannot account for the cost under this consumer.

The placement consumer in `IntlLocale` needs the original setup effects, the eager
read of `sourceLocale`, and the later read of `state.locale`. The runtime environment
object carries the catalog and locale values. The paired server control renders plain
locale data and keeps an unread nested getter dormant. Reading an authored getter in
either setup or render instead produces a client boundary.

Private cumulative bounds kept the package source and SDK command unchanged. Skipping
generic interference alone still timed out in formatter validation. Skipping legacy
indexed writer recovery as well reached the independent measurement formatting path
through `IntlMessage`. It also lost a known installed getter in the paired SSR control.
Skipping cold return projection after the existing staged transfer reached the end of
initial component extraction and still emitted neither target at 32.11 seconds. This
last trace counted at least 311,296 cold member requests and 131,072 cold return
projections inside Intl, with zero staged transfers in those scoped counters.
Extending the same bound to all named effect owners left a separate pass in
`moduleDefinitionAnalysis`. That pass uses unnamed dependency queries to decide
whether the `intlPropertyNames` module binding can initialize on a requested target.
Removing its cold projections as well reached the compiler verdict in 11.25 seconds
and produced `EXACT2101` for the now-opaque initializer. The build emitted neither
target. Callable extraction and module availability both need a supported effect
result for the actual operation. The private omissions qualify neither path.

A private module-availability trial reused a neutral verdict only after the current
graph had settled the original standard `Object.freeze` of a fresh string array.
The paired SDK control retained the authored array at runtime and rendered a value
on the server. Synchronized edits introducing and then removing a getter selected
isomorphic, client and isomorphic placement in order. Lexical shadows, authored
selectors and opaque inputs remained under ordinary analysis. The unchanged Intl
package still reached the deadline at 32.96 seconds. With the earlier diagnostic
bounds held constant, the existing graph supplied the correct verdict to three
late queries, but the original request still timed out at 32.06 seconds with reuse
and 32.08 seconds without it. The render helper's module availability walk still
reached legacy writer recovery through dependency queries for that same binding.
This second pass belonged to the independent authored TypeScript proof. Its neutral
checking tree retains module definitions and checks authored types. The requested
executable target already owns module placement. With the earlier private bounds
held constant, removing module availability from the neutral proof completed
`components.ts` and reached the deliberately opaque `environment.ts` initializer
in 11.46 seconds. The client, server and public check controls kept matching source
diagnostics, generated code and maps. The unchanged package without those earlier
bounds still reached the `components.ts` deadline and emitted neither target.

An inline factory-result control independently exposed a lost callable stored in a
descriptor. The selected factory inputs and returned local object literal already
identify a possible writer for the inline member read. The compiler can retain that
source relationship without reacquiring the creator as a prior call. The browser
control now emits a client boundary, and the neutral control renders on the server.
The unchanged Intl build with this fix reaches the same deadline at 32.43 seconds
and emits neither target.

An independent SSR control reproduced a browser getter running on the server when
its factory returned the local receiver under a nested `state` field. The descriptor
writer now follows the literal receiver and the selected factory invocation through
that field. Both artifacts retain the reached getter. SSR emits a client boundary for
the browser case, which mounts with the browser value. Dormant, shadowed and
different-receiver controls still render on the server, and another invocation of
the same factory leaves the selected receiver's value intact. With the correction,
the unchanged Intl package still reaches the `components.ts` deadline and emits
neither target.

The corresponding copy control initially still ran its getter on the server when
`Object.assign` initialized the selected receiver. The initializer's normal result is
unresolved, and its enclosing factory supplies the local binding and the return cut
for the source writer. The compiler retains that writer in the nested read, and the
paired checks preserve the dormant getter and distinct copy.

The selected copy also reaches a getter when the returned field supplies a helper
parameter. The original argument acquisition had dropped its source term when the
copy result was unresolved. It now keeps the local initializer's source scope.
For literal receivers that already had a source term, descriptor recovery now
uses the receiver's saved factory scope. The paired artifacts preserve an unread
copy passed beside a distinct selected argument.

Acceptance also covers mounted reads, control bindings, lifecycle, portals, registry identity, task settlement, protected transport, paired artifact selection, selected host implementations and source inspection. Use the existing [composition corpus](component-composition-corpus.md) and [package decision audit](#requester-disposition-against-the-component-contracts) for their scoped evidence. Treat interrupted suites and original packages that still reach the request deadline as open.

### Acceptance by traversal rule

| Rule | Established on a component consumer | Remaining acceptance |
| --- | --- | --- |
| Start from the consumer | Forwarded definitions keep the depth-28 supplied-child proof and its replacement control within one second in the focused native suite. On both targets a server task can create a browser callback with no browser effect on the task. Calling it adds the original `document` requirement and refuses server placement. | Complete the original Theme and Intl requests and repeat the three package builds on the final integrated compiler. Trace costs against calls that change a component decision. |
| Visit what executes | Placement controls distinguish instance-key evaluation, metadata getter reads, generator advancement and closing, string interpolation, addition and strict comparison. | The async-from-sync and event dispatch suites now exercise thenable values, retained listeners and option getters. Verify nested conversion and species construction on both targets. |
| Carry relationships to their reader | Local binding controls preserve a destructured callback despite a subsequent property write. Registered cleanup can release a resource after cancellation on the mounted remote owner. | Resolve returned callback construction and component reads of selected module values. Verify known browser donors as well as positive portable paths. |
| Keep acquisitions and paths distinct | The constructor and iterator checks preserve the dormant path. Unchanged forwarding retains receiver changes and cycle boundaries. | Verify terminal module guards, guarded property acquisition and recursive actuals on the original request. |
| Emit the owner's minimum contract | Direct server task writes reach dependent HTML. Paired-owner runs deliver committed collection deltas and preserve the mounted owner through retries and cancellation. | Verify the original list with setup aliases, the installed host matrix and generated ABI fixtures on the integrated artifacts. |
| Choose the supported boundary outcome | Sibling module initializers have independent secret-consumer allowances. Positive and negative task controls check emitted code together with diagnostics. | Triage remaining SDK and native failures using reachable source, selected target, effect and runtime outcome. Resolve each consequential disagreement. |
| Give facts an expiry | The local-pattern edit/revert controls agree across warm and fresh application and library compiles. All 24 mixed-order fresh and retained compile pairs at `da2de7f49` agree on code, diagnostics, analysis and source maps. | Qualify the final integrated manifest and cross-package cases, including changes to returned and captured inputs. |

## Discarded helper results and forwarded getter effects

At `c61f59c9b`, a button invokes a server task whose synchronous block calls
`invoke(this.state, this.state.input);`. The wrapper returns
`service.forward(dest, text, actual)`. The method writes `dest.label = text` and
returns its third formal. The component renders `this.state.label`. Evaluating
the arguments reads the component input before the write. The method receiver
is `service`, the write destination is the first evaluated actual, and the
third actual is an object with a browser-only getter. Passing or returning that
object leaves the getter dormant. Both targets emitted with an exact input
read and a single exact component write to `label`.

Adding `.value` to the outer invocation leaves the call and write intact and
executes the getter afterward. The accessor requester passes the remaining
member selection through `projectSourceCallReturnsWithViews`. Its invocation
fallback keeps the selected body's input bindings installed while visiting
the return source. This associates the returned formal with the original third
actual. The getter's browser effect reaches the task's effect sources and
both target compiles refuse server placement with EXACT2001.

A diagnostic build withheld only the inner method's return projection,
reporting an opaque, incomplete value at that call. With a getter declared
on a returned object literal, the remaining analysis still delivered
`document`, with a changed diagnostic path and additional uncertainty. With
the getter on the returned actual, the same intervention lost `document`
and both targets emitted. The exact write survived in both cases. Moving the
getter read to the text argument made both builds refuse placement even with
the final result discarded. A conditional text argument selecting that Get or
`props.foreign()` retained both the known browser source and the independent
unresolved call.

Stop at the discarded outer result once the evaluated operands, executed
body and component write are accounted for. Preserve an intermediate return
source when a later Get uses it to select a receiver. Removing that source
requires equivalent delivery of every applicable getter, write and independent
uncertainty through the forwarding path. The discarded row did not exercise
the withheld projection, so it gives no evidence of redundant work there.
Native compile controls used both targets with and without an importing
module. Code, diagnostics and public analysis agreed across those contexts
and after reverting the reader and argument edits in the same session. This
control covers compile-time placement and write authority. Mounted updates,
package publication and package-level cost remain outside its evidence.

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

Direct property-assignment discovery can reuse the generation's private-definition
proof before reconstructing writer inputs for a member read. The indexed assignment
must belong directly to an ordinary top-level function, and the complete source-use
population must show that it cannot be invoked or exposed. The writer's own
activation keeps its ordinary analysis. Component entry, aliases, captures, recursion,
exports, dynamic scope and incomplete coverage retain possible writes. The proof
does not change the original source inventory or grant a completed write outcome.

On November 20, 2026, the original scaling fixture at `5f39cac3f` rose from about
11,600 to 1,363,000 estimated work units as 24 dormant writers were added. Its static
imports fell outside private-use syntax coverage at that revision, leaving that
scaling unchanged. A paired component control used an erased type import
and an ordinary event callback. With 24 dormant writers, the client compile fell
from 1,358,422 to 16,038 estimated work units and median process CPU from 1.313 to
0.263 seconds. Client and server code, diagnostics and public analysis agreed.
The uninstrumented hosts used the committed integration tree and that tree with the change
in this section, without the pending accessor edit. Each timing is a median of
three fresh native CLI processes with semantic diagnostics and installed Core
0.8.0 declarations. The exclusive coordinator used one CPU and 1 GiB with no
swap on a Ryzen 7 8745HS, Linux WSL2, Go 1.27.1 and the pinned TypeScript Go source.

A separate instrumented trial applied the proof earlier in the same direct
writer path. In the covered control it counted 16,288 writer-input entries before
exclusion and 256 after. The pinned 8,447-input Core package replay on Node
26.11.1 recorded zero eligible candidates through 655,360 checks in each observed
prefix. Both runs reached the client deadline compiling `error-boundary.tsx`.
This leaves Core artifact acceptance open. The prefix counts do not measure the
cost of a completed package build.

Ordinary static imports now participate in the source-use proof. The named import
in the original fixture reached the coverage veto at the import declaration,
clause, named binding list, and specifiers. The inline type specifier's
children are erased, but that erasure does not cover its enclosing import. The
existing source index checks the private binding's own checker symbol. A
dependency may execute as soon as it is loaded, including through a cycle or
barrel, but cannot name that binding from its own lexical scope. The proof still refuses local exports of the writer,
wrapper and callback references to it, top-level calls, and incomplete or dynamic
source coverage. Dependency resolution and initializer analysis keep their
existing responsibilities. The proof does not traverse the dependency graph or
assume an imported initializer is effect-free.

On the original import-bearing fixture with 24 dormant writers, estimated
analysis work fell from 1,363,157 to 16,089 on the client and from 1,363,122 to
16,017 on the server. Median process CPU fell from 1.280 to 0.265 seconds and
from 1.284 to 0.271 seconds, respectively. The comparison used three fresh
semantic-diagnostics CLI processes per row and target under the same exclusive
coordinator and installed Core declarations described above. The baseline was
the committed `99b414cde` tree. The candidate added only the static-import
refinement, excluding the integration worktree's pending accessor edit.

The pinned Core replay used the same instrumented host with the import rule
toggled between runs. Both variants recorded zero direct-assignment exclusions
through at least 13,312 admission checks. Both reached the first client
`error-boundary.tsx` deadline and left 1,200 prerequisite files. Other syntax
coverage vetoes remained, including binding patterns in the receipt
implementation. This sample gives no Core coverage or throughput gain and
does not justify extending the rule to exported writers.

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
  An ignored ordinary return does not read the returned object's `then`. An async helper
  settles its return even when the caller discards its promise. An explicit `await` also
  performs settlement. The task runtime settles a function-defined task's return, including
  a synchronous return. Placement must retain a known `then` getter beside an unknown
  alternative in each settling case. A later state assignment or render reader needs the
  actual fulfilled value at runtime. Placement alone needs no retained fulfillment payload.
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

At `f15345310`, a server enhancement chain using a module-local token rejected
consumer-before-provider with zero setups. Provider-before-consumer rendered
`<span title="provided">context</span>` and ran two setups and two disposals.
The order check compares token IDs before constructing peers. For an external
provider the instance resolves the token during the authored lookup. A separate
component with a local required token rendered an ambient value and raised the
ordinary missing-context error when that value was absent.

The ordinary helper can retain a private optional lookup. With the token installed it
renders true, and with the token absent it renders false. Required peer ordering needs
the actual token before either component starts setup. The compiler can use a named
import of the same default-policy token, or bind the component’s existing value re-export
for a direct initial provider registration. If a required dependency would instead read
metadata from an ordinary module that can be preserved verbatim, compile and check
report `EXACT6022` at the helper call. The unsupported private-token case previously
threw while importing the emitted page on both targets. The component can perform
the lookup or registration itself and pass its value to ordinary code.

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

The boundary owns a reactive error-list proxy created during setup. The
render closure reads the list from the context. The list lookup with `at(-1)`,
default-view iteration, report field reads, and parent-owned fallback and children
reads occur during render. The default button stores the reset closure and its
list mutation runs on click. A custom function fallback runs during render.

The source-only field consumer can name an explicit finite Get on a formal, such
as `props.children`, `props.fallback` or `errors.at`, and account for it against
the original supplied receiver. An unresolved alternative keeps its fallback.
That coverage supplies neither the callable from a member Get nor an invocation
of it. The relative formal Call planner handles a bare formal with no arguments.
It does not cover `props.fallback({ errors, error, reset })`. The collector
recognizes the standard `Array.from` mapper as an invoked callback. Iterator
acquisition and steps, the mapper's reads of each yielded report, and iteration
of `options.actions` have their own effect obligations.

The receipt constructor reads `key` and `__exactEnhancements` before copying
the remaining own enumerable properties. Source binding analysis visits those
Gets and the copy. The finite pattern Get can name a direct formal initializer,
but `props ?? {}` cannot currently name that input in the field demand. The
copy has no corresponding relative demand for ordered own enumerable Gets
with exclusions. The live binder describes ordered rest groups and preserves
unknown positions after a spread. Relative substitution can use that data for
an individual indexed invocation. It supplies neither call-spread iteration
nor whole-rest consumption by child normalization. A copied or stored
callback contributes invocation effects only at an actual Call.

The ordinary definition-edge admission currently requires a same-file
declaration. All six receipt Calls in `component/error-view.ts` also fail
the simple input-shape check because their selected implementation declares
`...children`. This includes calls with only fixed actuals, such as the
heading with literal children. The outer section Call has two spread actuals
and needs their eager iteration accounted for before binding. The same-file
`createDefaultBoundaryView(errors, reset)` Call also falls back in ordinary
MAY collection. Its formals are nonprimitive and the deeper Calls still need
separate effect and result consumers. The result of the metadata Get flows
into key coercion, so the Effects edge alone cannot retire that acquisition.

A probe based on `259f95661` used the writer input graph's formal-to-actual
relationship to reject a direct assignment writer whose actual receiver was a
distinct object or array literal. It retained eager evaluation with the original
collector. The frozen Core client request recorded zero such retirements across
105,434 entries into writer scope recovery by the 30-second sample. The probe and
its counter were discarded. The uninstrumented candidate ran the original
`node scripts/compile-exact-package.mjs packages/core` command under the fixed
one-CPU, 1 GiB service with Node 26.11.1 and the frozen package and SDK. It exited
after 31.58 seconds at the same client deadline as the 31.72-second baseline.
Neither run staged a new Core package. The instrumented candidate exited after
31.76 seconds. The repository's separate uncommitted accessor edit was excluded
from both candidate hosts.

The candidate agreed with the uninstrumented baseline on 26 paired client and
server component responses for emitted code, source maps, diagnostics and
analysis. Controls included disjoint and overlapping direct writes, an eager
getter in an otherwise unused actual, object copy with rest inputs, stored and
invoked callbacks, state effects, and secret rejection. A retained compile
also agreed with a fresh session after switching an imported helper from a
disjoint writer to an overlapping one and back, for each host and target.
These comparisons establish response parity for the fixtures. The Core counter
measures whether the receiver filter retired recovery work on the package path.

A phase-labeled replay at `3056827ef` reached all six receipt Calls in the
default error view on the frozen Core client request. Those Call roots accounted
for 13.46 of 29.85 sampled CPU seconds. The same-file default-boundary Call root
accounted for 2.88 seconds. The two receipt metadata binding Gets were active
for 7.24 seconds across the request, with 7.08 seconds also inside returned-source
projection. The enumerable-copy phase accounted for 0.14 seconds. These are
inclusive measurements of the original operations, including work nested
under them. They do not estimate savings from transferring effects. The
profile supplies no measured bound on rest consumption in a completed build.

On the same fixed one-CPU, 1 GiB service with Node 26.11.1 and the frozen package
and SDK, the uninstrumented `node scripts/compile-exact-package.mjs packages/core`
exited after 31.50 seconds at the original client deadline. The operation-labeled
run exited after 31.55 seconds. Both excluded the uncommitted accessor edit and
emitted no new Core package. A source runtime harness exercised the real boundary
with reactive parent props and error reports, both fallback branches, and the
stored reset handler. It also checked metadata and enumerable string and symbol
Get order against argument spread and child normalization. The harness does not
qualify a newly emitted package.

A follow-up at `09846cdee` tested a cross-file candidate in the existing
Effects planner. A module-level imported function can use the same graph edge
as a lexical function if the current executable owner identifies its body
and the graph has that producer. A prepared import slot and its re-export
chain determine the executable declaration under target selection. A
checker signature supplies typing, and an opaque executable slot cannot
borrow its body. Caller and callee checks must use their own source indexes
for binding writes and dynamic scope. Same-file identity still matters to
lexical nesting, relative source offsets and the existing return-source
proof. Each declaration and operation must belong to the current Program,
and graph deliveries must use the current generation. The import's module
initializers and the call's eager actuals keep their own effect producers.

Matched component wrappers with an invoked zero-argument callback formal
used the existing graph in both file layouts. The imported helper avoided
the original occurrence requester after admission, through a re-export as
well as a directly imported checker-resolved implementation without a host
snapshot. A direct formal
property read still entered the existing input fallback in both file
layouts. Direct imports, re-exports, both conditional selections,
edit/revert compared with fresh sessions, and app/library compilation
preserved emitted code, maps, diagnostics and component contracts against
the baseline for each fixture. Callable effect provenance changed where
the graph replaced the recursive requester. Opaque selection kept its
unknown outcome.
The eager module control retained its browser effect independently of
the component and emitted the initializer only on the client.

The probe widened only the definition Effects input planner
to a current named import. An observer at the existing requester entry
recorded all six original sites reaching their legacy requester. The frozen
Core client hit its original deadline in 31.52 seconds and produced no new
artifacts. The uninstrumented host from `3056827ef` repeated the same
client timeout in 31.44 seconds. Both runs excluded the pending accessor
edit and used the same frozen corpus and service limits. For the receipt
calls, the binder needs ordered rest and spread inputs, and their consumers still need
metadata Gets, enumerable copy and child-normalization effects. The
independent result projection must also retain the key value and its coercion
effects. The admission change alone therefore removes none of the six
observed requester entries. The inclusive profiles measure attribution
under the original request.

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

### Selective binding effects

The original source Call binder can settle the Gets and enumerable copy of a
terminal flat object binding when the supplied value is the call's own fresh
object literal. The binding must return a selected local and have no other body
work. The admitted reads have known own keys and an ordinary receiver that the
getters cannot expose. Each selected getter keeps its existing body effect
consumer. The call publishes coverage for the individual binding occurrences on
the existing effect graph. Acquired inputs and getter scopes stay local to the
request. Expressions that create the argument and later uses of the returned
value keep their original consumers.

In the stored-callback component, a scalar log made the getter order observable
without introducing the independent effects of an exported trace array.
The refined witness emitted both targets as isomorphic. The client mount and
SSR observed the named Gets followed by the enumerable symbol Get. The reset
closure stayed dormant during the copy. The invoked control observed the same
reset reference and could call it after copying. A separate foreign effect
remained unknown, and a browser effect in the symbol getter changed placement
to client through an open editor session. Reverting the edit restored shared
placement. The retained trace-array witness still had unknown effects.

A matched string-key copy compiled to the same code, maps and component
contracts with the cut enabled and disabled. Each target recorded two
completed binding entries. The number of entries into the legacy source-body
traversal declined from 30 to 24 per target, including the nested traversals
that belonged to the original binding path. These counts describe a completed
component request. They do not measure Core performance.

The frozen Core package still reached the original 30-second client deadline
in `error-boundary.tsx` under the fixed one-CPU, 1 GiB validation service.
The package command exited after 31.48 seconds without new client artifacts.
It builds the client first, so server compilation did not start.

An admission observer reached the live binder at all six receipt calls in
`component/error-view.ts`. Each selected the current implementation and
installed all three formal bindings. Each passed the invocation-context checks
and first failed the terminal-body check. The selected implementation has an
initial validation branch and calls another function with the destructured
values. No observed receipt call completed the selective path. The original
package command with this observer exited after 31.36 seconds at the same
client deadline.

A separate coverage observer found two unprojected object literal inputs and
four unprojected null inputs for `props`. The source effects consumer returned
five completed argument relationships and one completed callee relationship
for each call, plus an incomplete, opaque body contribution. It returned zero
field outcomes for the metadata Gets or copy. The existing edge solver requires
coverage for the matching operation and input slot. The relation for a
binding Get expects a direct input and does not name `props ?? {}`, and the
ordinary copy consumer publishes no corresponding field outcome. The checked
input facts can select the nullish arm at these sites. They supply neither
missing effect coverage nor the acquired values passed to the downstream key
coercion and child normalization. The coverage run exited after 31.42 seconds
at the same client deadline. Neither observer run produced client or server
package artifacts.

A forwarding trial at `d05399be7` let the original body walk evaluate the
validation and downstream Call. At the binding it selected the installed
literal or the empty nullish default, issued the named Gets and enumerable
copy, and installed the acquired locals for the downstream invocation. The
trial kept the separate return consumer. On the frozen command without
pre-emitted support files, the observer saw all six receipt sites publish three
matching field outcomes apiece. The downstream `issueIntrinsicReceipt` and
`normalizeRenderResult` bodies still reported incomplete coverage, so those
field outcomes did not settle the full edge. The
instrumented client and server requests returned in 26.48 s and 0.17 s,
respectively. Export inspection failed because the command expects pre-emitted
support modules and no staged client `index.js` was available. The
uninstrumented command reached the same failure in 28.21 s.

The package acceptance run first emitted the standard TypeScript support files
from the same frozen inputs using `tsc6 -b packages/core`. With the unchanged
30 s host deadline, one CPU, 1 GiB and Node 26.11.1, the stock command then
exited after 32.30 s at the client request, without publishing either target.
The matched baseline exited after 32.34 s at the same deadline. The observed rerun reached no forwarding binding. A separate stack sample at
25 s was in receiver writer recovery during ordinary callable extraction,
before the forwarding trial could supply any field outcomes. A separate
entry observer reached the definition's
`createOpaqueOperation(executeIntrinsicOperation, { key, domain })` call in
`issueIntrinsicReceipt` and remained there at the deadline. The writer
recovery sample and entry trace came from separate runs.

A forwarding component's emitted client mount and SSR both observed the key
and copied callback getters before key coercion, left the stored callback
dormant, and observed the supplied rest-child count and the nullish case. Its
invalid-tag control threw before the metadata Get. The runtime fixture retained
unknown placement in both hosts. In a separate matched
invoked-callback control, six alternating cold requests per target agreed on
code, source maps, diagnostics and component contracts. Median callable
analysis fell from 2.81 to 2.25 ms for client and from 2.87 to 2.30 ms for
server. A second six-pair run measured 2.92 to 2.27 ms and 2.82 to 2.30 ms,
respectively. Retained and fresh compilation agreed across helper edits and
reverts, and the client secret control retained its rejection. The timings
cover completed component requests only.

The acceptance test is a usable paired package under the original deadline.
From the frozen workspace with its SDK installed, use Node 26.11.1 and run:

```sh
node node_modules/typescript/bin/tsc6 -b packages/core
node scripts/compile-exact-package.mjs packages/core
```

Use the fixed coordinate-validation service with one CPU, 1 GiB and the
unchanged 30 s native request deadline. The matched corpus manifest identifies
8,447 inputs and has SHA-256
`958e586c6817e51a1b64698c0a1f4c3c552a42a1c26e73bb854ca0f7fe232051`.
The SDK synchronized one source and requested `component/error-boundary.tsx`
for the client first. Neither run supplied an executable selection snapshot.
The native Program had the same 300 configured roots, 300 callable source files,
1,806 callable facts and 54 initial body demands before and after pre-emission.
Pre-emission resolved 89 Core import slots to Reactive declarations and added
46 Program files. A fresh diagnostic copy with only those declarations added
reproduced the supported build's first blocked operation. Core's emitted
JavaScript and declarations were absent from that control. The evidence gives
no basis for pruning project roots or changing conditional executable resolution.

On clean integration `8ac90ad52`, the client reached ordinary MAY callable
extraction before component placement linking. At 24 seconds it was in
`visitImplicitAccessors` → `bindInputPatternUsing` → `bindingProperty` for
`createCompiledIntrinsicReceipt`. Receiver writer recovery was nested under
that read. This definition had a current canonical source identity, a stable
formal `props`, a fresh empty nullish arm, two finite named Gets and a separate
rest copy. No actual `props` value was installed. The earlier Call sample came
from the forwarding variant and does not establish the first owner on clean
integration.

An owner-level trial treated the unbound formal's Gets and copy as the existing
relative input-effect obligations. The observed definition extraction finished
in 0.13 ms. The request then stopped at the ordinary Call collector for
`createOpaqueOperation(executeIntrinsicOperation, { key, domain })` inside
`issueIntrinsicReceipt`. The project had already extracted the imported
callee's canonical body. The caller had a lexical executor and a fresh
metadata literal, but the direct declaration-effects admission still rejected
the imported binding. Its separate `receipt` value is used as the WeakMap key.
The uninstrumented owner trial exited after 32.32 s at the original client
deadline, compared with 32.34 s for the matched uninstrumented baseline.
Neither produced a new Core target. Six completed component requests across
the two targets preserved code, maps, placement and top-level diagnostics.
Their component diagnostics changed the provenance reported for an unknown
binding. The concrete call lost the `receipt` edge and pointed into its caller's
object literal. The nullish call retained the edge but lost the source location.

The binding now keeps a separate field obligation for each named Get and for
rest. Its fallback names the authored binding occurrence. Actual invocation
analysis records Copy coverage at that same occurrence when it can account for
every receiver alternative. An external input keeps its authored Get diagnostic.
Concrete and nullish inputs in the two-target control settle the obligations
and emit paired component artifacts. Getter and source-edit controls retain
the reached browser effects and agree between retained and fresh compilation.

The prerequisite-complete Core command still exits at the first client request
after 32.32 s with this binding change. A separate counterfactual kept the
current imported `createOpaqueOperation` body on the original Call edge and
skipped local traversal of that Call. It left `intrinsics.set` and the key
consumer active and also exited after 32.32 s. Neither run produced a new Core
target. A separate observer confirmed that the `intrinsics.set` collector
returned. The last entered collector was the outer `createCompiledIntrinsicReceipt`
call in `createDefaultErrorView`. A stack sample in the counterfactual found
receiver writer recovery under an instantiated binding. An effects-only
transfer for the imported body needs to carry reached metadata hooks and
other input-relative effects at the actual call. The WeakMap key use separately
requires the allocated operation identity under its original creating context.
Both contracts still require independent validation.

The landed binding tree was rerun with the same prerequisite-complete inputs
and service limits, using a CPU sampler and a separate Call observer. Neither
observer changed the Call dispatch. Both commands exited at the first client
deadline in 32.39–32.40 s. The CPU profile covered the first 28 s of the
request and attributed 20.29 of 27.21 sampled CPU seconds to stacks containing
`memberWriterInputs`, 20.26 s to native member lookup, and 6.76 s to source
return projection. These inclusive samples overlap and exclude the end of the
request.

The Call observer covered the intrinsic receipt, opaque operation and error
view modules. It recorded 34 placement roots, of which 33 finished, and 40
placement invocation entries. No placement invocation at the same operation
under the same root repeated in the observed prefix. The stalled root was
`createOpaqueOperation` inside `issueIntrinsicReceipt`, which entered
`operationPrototype` with an installed receiver and input context. The
enclosing error view receipt calls had yet to start in this run.

Earlier body results were compared with later requests naming the same
operation. The two shared-store calls requested placement from separate
initializers, kept opaque and incomplete body contributions, and were later
encountered during projection or writer recovery under another requester. The
completed `currentComponentDomain` effect analysis shared the project
generation and lexical requester with later visits, but those visits occurred
under the factory root during receiver recovery at different protected
members. Its effect result does not supply the input and writer relationships
those reads require. The receipt allocation also has a separate return/key
consumer at the WeakMap write, and enclosing calls supply their own ordered
actuals, including the rest children and the result of the binding copy.
Reusing a declaration result would require evidence from the original input
and evaluation cut for the requested relationship, with any unresolved
effects retained.

The observed prefix gives no qualifying repeated placement obligation to
coalesce. The largest measured cost remains rediscovery of receiver writers
through nested native lookups and return projection. Neither run emitted a
client or server package artifact.

A clean host rebuilt at `879ede513` verified all 8,447 frozen inputs, emitted
the TypeScript prerequisites, and ran the stock Core package command in the same
coordinate-validation service. The package command exited after 32.29 seconds at
the first client request for `error-boundary.tsx`. The files in `dist` came from
the prerequisite stage. Core still needs a usable client/server artifact pair.

The preceding CPU profile uses the same native source. Assigning each writer
sample to its innermost writer recovery separates work that otherwise appears in
several inclusive totals. Of 20.29 sampled writer seconds, roughly 0.79 s went
to scanning and eligibility, 6.30 s to eligible invocation, 3.42 s to selected
wrapper descent, and 9.33 s to fallback callee and argument exposure. The rest
was other recovery work. Formal-value projection accounted for only 0.11 s
inclusively. The graph already shares the immutable call and actual recipes.
The repeated expensive part acquires what a callee or argument can expose with
the bindings, creators and receiver at that occurrence. In particular, a
refused invocation can still expose a captured writer through an argument.
The earlier receiver-role probe matched zero candidates. Indexing the same call
scan again or narrowing the final binder projection would leave this cost in
place.

A different decision is available at the authentic private WeakMap method
request. In `operationPrototype`, the lexical `operationPrototypes` allocation
has two uses as a receiver, `get(execute)` and `set(execute, prototype)`.
Test whether the existing construction and private-use source inventory can
route the method's no-direct-input-invocation effect to the ordinary MAY
collector before generic receiver-writer reconstruction. The current early
constructed-member transfer requires a live staged request with no installed
inputs or creators. Share only the indexed lexical-use inventory for the current
source generation and keep proof delivery in the ordinary request. Each original Get
still needs its own receiver, ordering and source coverage. The key and value
retain their evaluation effects. Downstream prototype construction still needs
the possible stored payload with its original origin and capture. An escaped
receiver, an own method write, or a receiver supplied by another Get can require
more coverage and fall through to ordinary recovery. This first experiment
covers the direct `operationPrototypes` path. Measure reconstruction in the
pinned client request. Package acceptance still requires paired output from the
unchanged command.

The private method experiment used native source at `879ede513`, the frozen
8,447-input manifest above, fresh prerequisite-complete copies, and the
same coordinate-validation limits. Both original Calls had a current standard
construction and passed the existing private-use and receiver proof. The two
direct lookups took 21 and 27 microseconds in the observation run. Ordinary
MAY collection issued no staged method transfer for either Call. Each Call
nevertheless reached generic writer reconstruction at least 14,000 times
before the deadline. All those entries reached refusal recovery.

A trial reused the existing proof before writer-callee reconstruction and
kept argument recovery, original operand evaluation, and result and storage
consumers in place. At 14,000 writer requests per method, aggregate elapsed
time in the instrumented reconstruction and refusal interval was as follows.

| Call | Observation | Skip repeated callee recovery after refusal | Route before reconstruction |
| --- | ---: | ---: | ---: |
| `get` | 1.55 s | 0.93 s | 0.03 s |
| `set` | 3.42 s | 3.22 s | 2.43 s |

These are single-run, matched-count timings of the writer interval. They
include nested work and describe neither total compiler CPU nor end-to-end
build savings. The early trial avoided generic writer selection at least
17,000 times per method. The remaining `set` interval was almost entirely
argument recovery. The unchanged package command took 32.29 s on the clean
host, 32.23 s with observation, 32.26 s with the refusal-only cut, and 32.22 s
with the early cut. Each hit the 30 s first-client request deadline at
`error-boundary.tsx`, leaving prerequisite output without a client/server
artifact pair. The trial remains outside the compiler.

The trial matched baseline DOM and SSR checks for key and value evaluation
order, returned and stored payload identity, and a subsequent invocation.
An own-method override and a lexical subclass retained their browser effect,
as did eager key and value work and later callback execution. The alias,
escape, and opaque existing-store cases retained baseline unknown placement.
In the language session the own-method edit changed placement from unknown
to client, and reverting the edit restored unknown in the next generation.
The private fixture itself also had baseline unknown placement and an analysis
cost diagnostic, so those controls establish behavior parity within the
observed paths.

The next investigation belongs at `memberWriterScopes` and
`prepareInvocation`. Measure the second callee acquisition against the
already acquired alternatives from the same Call and the later
`originsAt` recovery of the receiver. Check which paths have identical
bindings, creators and cuts and which still need a separate recovery. For
arguments, distinguish work that evaluates an expression from work that
recovers a callable value the selected operation could invoke. Only the
latter can yield to a current no-direct-input-invocation result. The original
operand and downstream data consumers still own their effects and values.

Initial selection and refusal recovery use the same Call node and compiler
generation. The collector passes the same binding map and restores the creating
scopes before recovery. Their requests have different cuts.
Initial selection uses the enclosing member reader and installs its writer
request. Refusal recovery resets the read and initialization to the Call,
clears the return cut, and runs after the installed request has been restored.
Both callee lookups use the Call for source order. The later `originsAt` lookup
collects receiver provenance for invocation input binding and carries no
selected member alternatives. In the pinned Core samples neither callee
lookup shared the other's read or installed requester. Replaying the acquired
alternatives across those boundaries would need a new equivalence check and
would still pay for the first reconstruction.

Writer discovery now reuses the standard method selection and private source-use
proof for a direct, unsubstituted receiver of a reached module allocation. The
memo holds only the indexed-use classification for the current Program. The
writer scan can omit both callee reconstruction and recovery of callable
argument values because the selected operation cannot invoke or forward them
during the Call. Eager evaluation, membership, storage, return values, and
later invocation keep their existing owners. An override, escape, unknown
receiver alternative, or an incomplete contribution keeps ordinary recovery.
This adds one source-use memo shared with the method-storage consumer and one
admission check at writer discovery, without adding a transfer protocol.

A matched run used one instrumented native binary with only the early route
toggled. At 14,000 writer requests per Call, `get` fell from 1.54 s of
aggregate writer reconstruction and recovery to 0.037 s, and `set` fell
from 3.56 s to 0.038 s. The candidate retained one original `get` recovery
and excluded all 14,000 `set` requests in that interval. The aggregate time
includes nested work and the cost of the candidate's proof. Both variants
reached the same first-client deadline, so these timings establish a local
saving only.

The uninstrumented candidate based on `60363e175` used the same 8,447-input
manifest, limits, prerequisite and deadline, with the unrelated accessor
worktree edit excluded. The package command stopped after 32.28 seconds at
the first client request for `error-boundary.tsx`. It produced no paired Core
artifacts. The completed fixture emitted both targets and ran in DOM and SSR.
The compiled fixture preserved eager getter order, a throw before the value
write, the successful write, and stored callback identity. A client artifact
for the authored method override invoked its callback once. The language
session retained unknown placement for the original and reverted source, and
selected client placement for the authored method override.

The request-wide follow-up compared `60363e175` and `66dc05d2f` from tracked
native source, with the accessor worktree edit excluded. Each stock command used
a fresh copy selected by the 8,447-input manifest and ran the TypeScript
prerequisite first. The CPU sampler started inside the first client compile
request and stopped after 28 seconds. Writer reconstruction appeared on stacks
accounting for 21.58 of 27.87 sampled CPU seconds before the change and 21.67 of
27.85 after it. Native member lookup remained at 20.47 and 20.45 seconds
respectively. The inclusive totals overlap. Assigning each sample to its
innermost writer recovery put 9.50 and 9.55 seconds in eligible invocation,
9.42 and 8.38 in fallback exposure, and 1.38 and 2.09 in selected wrapper
descent. Those are costs of the respective prefixes at the cutoff.

Separate phase-labeled runs completed the same 33 callable extractions and 44
observed source Call queries in the same order. Both remained in extraction of
`issueIntrinsicReceipt`, at its Call to `createOpaqueOperation`. This body
accounted for 21.76 of 27.86 sampled CPU seconds before and 21.55 of 27.85
after. The labels identify the phase even when recursive stacks omit the
outer frames. The earlier matched savings were absorbed by work inside the
same source Call query. The observed prefix never advanced to a later
extraction or Call root.

The CPU-only commands exited after 32.22 and 32.29 seconds of package command
wall time. Both hit the unchanged 30-second native deadline for the first
client compile of `error-boundary.tsx`. The 1,200 files in Core's ordinary
`dist` are prerequisite output. This comparison establishes no completed
client or server package result.

A separate observer on `66dc05d2f` attributed wall time to completed writer
collection entries by indexed write and candidate Call. It subtracted each
completed entry's nested collection time and excluded active entries at the
last checkpoint. At 786,432 completed entries, the twelve highest-cost pairs
accounted for 8.08 of 28.91 seconds of measured self wall time. Eleven pairs
involved `domains.set(domain, owned)` in `domainOperationPrototype`, accounting
for 7.47 seconds across 14,570 entries. The other pair involved
`domains.get(domain)`, accounting for 0.62 seconds across 1,757 entries.
These are observer-domain wall times and cannot be added to the CPU profile.

A second observer applied the existing named path key predicate without
changing dispatch. At the same checkpoint, the twelve highest-cost pairs all
had disjoint assignment keys. Their 16,327 entries accounted for 7.73 of
29.09 seconds of measured self wall time. This identifies candidate
reconstruction work within a fixed observed prefix. It does not estimate all
nested work dependent on those entries.

The `a693a97e9` trial applied the key predicate before reconstructing writer
inputs for an acquired source value or a terminal named Get. This excludes a
direct RHS on that path, but it also excluded the input recovery that could
discover an escaped callback and its setter effects. Computed, structural and
matching keys stayed on their recovery route.

A phase-labeled trial changed only that admission test. The previously
blocked `createOpaqueOperation` query completed in 0.50 s wall time.
`issueIntrinsicReceipt` accounted for 0.43 of 27.87 sampled CPU seconds,
compared with 21.55 of 27.85 seconds on the censored `66dc05d2f` run.
The trial completed 55 callable extractions and 88 observed source Call
queries. The stock command completed both targets in 34.64 s wall time and
left 3,598 output files including TypeScript prerequisites. This is a full
package result under a per-request deadline, whereas the prior timings
are censored first-client attempts.

The uninstrumented host with the same guard completed the pinned command in
34.54 s and produced the same output inventory. The emitted Core client
artifact mounted ErrorBoundary, reported an owned child event failure, restored
the child after reset, and invoked the custom fallback. The emitted server
artifact rendered the child and preserved receipt operand order and stored
callback identity. The harness bundled the corresponding Core target's
artifacts with the existing neighboring runtimes. The LSP's retained component
placement followed an imported helper edit from unknown to client and
returned to unknown on revert.
The installed-SDK native comparison passed the same 22 focused tests on both
hosts, including matching getter donors, emitted writer behavior and retained
versus fresh sessions. The standalone reflective evaluation fixture failed
on both hosts because its request supplied no callable summary for `invoke`.


### Captured setter effects and package qualification

The pinned Theme audit at `3024421b7` records a `66dc05d2f` pass and an
`a693a97e9` failure of `TestMemberKeyAcquisitionRetainsCapturedSetterUnknown`.
The fixture passes `install` to an opaque function. When invoked, `install`
assigns `box.other`, whose setter writes `this.field`. The disjoint key
excludes the direct RHS from `box.field`. It does not exclude the setter or
the uncertainty discovered when recovering the escaped writer's inputs.

A compiled component that saves `box.field` and then uses `selected.value`
to update its task's state shows the same difference on both targets.
`66dc05d2f` and the correction report incomplete accessor provenance at
the original field Get. `a693a97e9` reports the opaque call itself but
drops the separate field effect. The explicitly placed task emits on all
three hosts with the same diagnostic codes. This witness establishes
preservation of uncertainty. A separate analysis with a directly invoked
setter retained the browser getter when the later field read used the
assigned object. A direct disjoint data write contributed no field effects.
The neighboring `TestSetterModuleGetKnownBrowserAndUnknown` still fails
on both `66dc05d2f` and the correction. The later `selected.value` read
retains the unknown effect, but its browser donor remains unresolved.
The setter invocation uniqueness controls passed on both hosts.

The member read now keeps input recovery while it can still contribute
uncertainty. It skips direct RHS projection for a disjoint key and retains
the cheap reconstruction cut where opacity has already been established.
Matching setter-body writes and staged transfers keep their existing routes.

A matched rerun rebuilt the exact `a693a97e9` and `7b3ae6c8b` hosts and
used fresh copies of the same pinned Core inputs. The fast host completed
the package command in 34.68 seconds and produced 3,598 output files. The
corrected host reached the first client deadline in 32.28 seconds of package
wall time and produced only the 1,200 prerequisite files. Both used the
same 30-second per-request deadline. In retained client and server sessions,
the corrected host recovered the field Get uncertainty after editing away
the setter and reverting. The fast host omitted that uncertainty on both
visits. Client code emitted by the corrected host, mounted against the
fresh fast-host Core runtime, showed the browser getter result for both
escaped and direct setter invocations and the original field value for a
disjoint data write.

The reopened work is the indexed assignment's input scan. For a disjoint
named acquisition or terminal read whose result has yet to become opaque,
the correction runs `memberWriterInputs` before dropping direct RHS
projection. That scan selects and binds candidate Calls and follows reached
wrapper Calls before refused-scope recovery can establish whether the
original writer was exposed. An indexed key or receiver type alone cannot
establish that those Calls or a setter have no relevant effect.

The Core observer located the first reopened entries within the
`createOpaqueOperation` Call from `issueIntrinsicReceipt`. While acquiring
`domain` from the inline `{ key, domain }` argument for
`domainOperationPrototype`, the writer scan entered the indexed assignments
to `view.data` and `view.factory` in `readComposableIntrinsicReceipt`.
Those writes are in the dynamic receiver bucket because `view` comes from
`compositionViews.get(value)`. Neither key can directly supply the
`domain` value. The second writer entry was the final logged event before
the request deadline. The existing private standard call filter can retire
particular candidate Calls, while the Set disposition applies to its exact
original issuer and observation. Neither establishes that these dynamic
writes have no setter relevant to this Get. A private trial gated the
disjoint cut on an authenticated standard global acquisition. It still
timed out at the first client request in 32.29 seconds of package wall time.
The trial was discarded from integration. The blocked metadata receiver is
an ordinary object literal and needs its own proof or a narrower effect
collector.

The disjoint-key branch discards reconstructed writer inputs. Refused
scope recovery can make the original Get opaque, and staged transfers can
leave registered compiler work pending. The Put and callable-effect
edges still own concrete setter effects. A matching write in a selected
setter body can independently supply a value to a later Get.

The client and server component controls cover uncertainty at the read
through an escaped alias, an aliased write after the read, and a known
browser effect in a setter alongside an independently unknown call.
A separate observation on the corrected host found that a getter passed
through a setter argument and read back afterwards ran on the client
without being reported as a browser effect. This is a separate value
projection gap in the corrected baseline.

The compiler delta between the matched hosts is confined to the
disjoint-key gate and its recovery at the original Get. A diagnostic
replay of the same first client request with the fast host completed
in 29.821 seconds, with 29.65 sampled CPU seconds. A separate replay with
the corrected host did not complete even with a 180-second diagnostic
deadline. That replay hit the 1 GiB limit without an OOM kill. The package
acceptance deadline remains 30 seconds.

A 28-second corrected request profile labeled the interval introduced
by the disjoint-key recovery, including nested work. Of 27.84 sampled CPU
seconds, 21.54 carried the label. Assigning each labeled sample to its
nearest identifiable phase gives 10.87 seconds for callee receiver and
member selection, 4.22 for remaining invocation selection and
consumption, 3.24 for refused input exposure and staged component
recovery, 2.18 for wrapper descent, 0.80 for argument binding, 0.16 for
staged candidate enrollment, and 0.07 for actual projection and
initializer sealing. The 6.30 seconds outside the label include ordinary
request work and background GC. The earlier saved profile combines
matching and disjoint writers. Neither profile measures the entire
corrected request or isolates downstream work after the labeled interval.

A scratch trial replaced the disjoint-key input scan with an opaque
Get and retained the matching RHS path. With the original deadline it
completed the Core package command in 30.64 seconds and emitted 3,598
files. Its paired ErrorBoundary artifacts passed mount, error delivery,
reset, authored fallback and SSR. The server check also preserved eager
operand order and callback identity without invoking the callback.
Retained native requests on both targets still reported the captured
setter's field uncertainty and denied the known browser setter under
server policy. They also changed three public controls from neutral to
unknown: a neutral setter, a disjoint data write, and an aliased write
after the read. The fallback was discarded. Published effect sources
consume opacity directly, and staged Get publication uses it when
deciding whether the original effect work is complete.

The separation point is the original Get. Direct value acquisition can
ignore a disjoint RHS. An interference check needs evidence that an
earlier operation can expose a writer and that its selected setter or
trap may reach the observed receiver. The source write inventory,
selected Set effects and writer exposure recipes already describe
parts of this question. They do not currently represent a complete
population for the dynamic Core writer at the metadata read. A known
literal allocation alone does not prove confinement through a call or
past an earlier potentially effectful Get. A proof that closes those
routes can answer the interference question without recovering writer
values. Unresolved routes still need the existing effect and compiler
obligations.

The original Core command used the same 8,447-input manifest
(`958e586c6817e51a1b64698c0a1f4c3c552a42a1c26e73bb854ca0f7fe232051`),
with one CPU, 1 GiB and the original 30-second per-request deadline. On
the corrected host, the TypeScript prerequisite completed in 6.53 seconds.
The package command took 32.33 seconds and timed out at the first client
request for `error-boundary.tsx`. Its 1,200 output files were the TypeScript
prerequisites. Paired Core artifacts and their behavior remain unqualified
on this host. A separate phase-labeled run took 32.27 seconds and
completed 33 callable extractions and 44 source Call queries. It reached
`createOpaqueOperation` in `issueIntrinsicReceipt`, the same internal
frontier as `66dc05d2f`.

After the forwarded and imported getter fixes at `d49eb5d88`, the same
Core manifest and service limits reproduced the timeout. The TypeScript
prerequisite took 5.78 seconds. The uninstrumented package command took
32.37 seconds and timed out on the first client request for
`error-boundary.tsx`, with 1,200 prerequisite output files.

A separate run counted at least 19,456 entries into disjoint writer input
recovery before the same deadline. The first 24 entries and every 1,024th
entry were sampled. All 43 samples lacked the live staged member owner
required by the existing Set transfer. The periodic samples were at the
`intrinsics.set(...)` call in `issueIntrinsicReceipt`, where source input
acquisition revisits earlier receiver and writer relationships. Staged Set
transfer coverage elsewhere therefore cannot establish avoided recovery at
this consumer. A cut at this site needs evidence that the original Call
and Set effects cover the particular writer-exposure question, including
authored or unresolved alternatives.

The qualified intrinsic-registration trial compared the same instrumented
host with the classification enabled and disabled. Both reached the same
first writer candidate at entry 3,344, while acquiring inputs for
`createOpaqueOperation` in `issueIntrinsicReceipt`. The candidate asked
whether processing the receipt registration could expose a writer from
`readComposableIntrinsicReceipt`. With the classification enabled, that
candidate completed with zero nested writer visits. With it disabled,
the candidate remained active at entry 802,816, a lower bound of 799,472
nested visits avoided at that occurrence. The enabled run completed
13,877 such writer exclusions. The separate method Get and Call cuts
recorded no hits. Both package commands reached the original first-client
deadline and left 1,200 prerequisite files. These counts describe the
matched occurrence and the observed prefix of the enabled run.

The trial remains outside the compiler. The initializer body check also
accepted a generator with the same body and an authored `set` on its
iterator prototype. Restricting the initializer to a synchronous
ordinary function addresses that case. The local use index still cannot
establish ownership of a realm-shared receiver. A second call to the
initializer with the same key passed qualification after replacing
`set` through the other binding. The runtime control confirmed that the
original call reached the replacement and installed a getter. The
writer-only trial with the initializer category guard also reached the
original deadline at 32.37 seconds. The installed LSP control retained
unknown, client, and unknown placement across an edit and revert.

The remaining samples in the enabled run still belong to the original
`createOpaqueOperation` input requester. The component decisions separate
into three groups:

- Core owns receipt registration, dispatch prototype caches, and active
  domain bookkeeping. The compiler's interference question is whether
  the selected operation can expose a writer to the observed receiver.
  The runtime owns allocation, storage, and domain identity.
- Original eager operations can execute authored code. Receipt metadata
  binding reads `key` and `__exactEnhancements`, copies enumerable
  properties, and may coerce a key. Child normalization and the default
  error view can run iterators and read authored properties. A selected
  fallback callback runs during render. These effects can affect placement,
  policy, or reactivity at their original evaluation sites.
- The stored receipt payload, the selected domain and prototype objects,
  and the reset callback's identity feed runtime construction, dispatch,
  and reconciliation. The reset callback runs on interaction. A
  composition factory runs on explicit redemption. Preserve those values
  and their execution sites. The constructor's placement query needs the
  reached effects of acquiring them.

The existing private standard construction proof can supply a
writer-discovery answer for a selected method and its original receiver.
Share that answer where receiver ownership and the method selection are
complete for the source generation and read cut. A realm slot requires
separate evidence about what can reach the receiver through the slot.
Eager operand effects and later value consumers retain their original
owners. Prototype cache and domain bookkeeping are possible consumers of
this answer. Theme's indexed
background reads and Intl's option validation still require input-relative
getter effects. The earlier cross-package admission trials supplied evidence
for those distinctions and left all three package deadlines unresolved.

The writer-only receipt exclusion uses the current selected Core issuer and
store implementation revisions. A matching body or WeakMap annotation alone
cannot establish this identity. The original second-binding witness adds a
call to the internal store helper and assigns the same table's `set` method
inside a modified issuer. Core's package exports provide receipt operations
without exporting the store helper. A selected override or generator
replacement therefore retains ordinary analysis. Unmodified Core copies
share the table and redeem one another's receipts. Direct modification of
the private realm slot from outside Core is outside that contract.

On the pinned 8,447-input Core workload at `c3fc9ca1f`, the same instrumented
host reached the first matching writer candidate at entry 3,344 in both
runs. With the exclusion, it ended at entry 3,344. Without it, the candidate
was still active at entry 802,816, a lower bound of 799,472 nested writer
visits avoided at that occurrence. The exclusion applies only to writer
discovery. Eager operands, stored values and later invocations keep their
existing evaluation sites.

Package qualification remains open. The original package command with the
uninstrumented candidate reached the first client `error-boundary.tsx`
compile deadline after 32.24 seconds and left 1,200 prerequisite files.
Both instrumented runs reached the same deadline under the same resource
cap. These runs establish avoided discovery work at one occurrence.

On `02dd9e92a`, the component's highest shared receipt boundary is
`createCompiledIntrinsicReceipt`. It retains authored property reads and
copying, key coercion, spread iteration, and child normalization. Inside
that boundary the selected issuer calls `createOpaqueOperation` with an
already acquired key and domain, a fresh metadata record, and the Core
executor reference. The reviewed allocation performs private cache and
descriptor work and stores the executor for later dispatch. Ordinary
callable extraction and the instantiated dependency query use that Effects
contract. Writer discovery can skip the same allocation since its operands
cannot expose a writer. Explicit result queries remain independent. The
runtime retains the original allocation, registration, identity, dispatch,
and callback execution.

Replacing the full receipt body in a diagnostic replay completed both
targets in 5.58 seconds. Replacing only the opaque allocator completed in
6.18 seconds with the outer eager operations still present. Those
counterfactuals changed runtime semantics and were used for attribution.
Spelling the private operations as explicit standard WeakMap calls and
isolating only the prototype-cache routines each left the first client
deadline unresolved. The effects-only implementation completed the same
capped package command in 11.74 seconds on the original corpus and
produced 3,598 files including both target trees and the TypeScript
prerequisites. The stock command reached the first client deadline in
32.28 seconds and produced only the 1,200 prerequisite files.

The private dispatch cache ceiling at `5f39cac3f` supersedes the proposed
next cache-specific trial. The matched diagnostic forced direct writer exclusions for the
six tagged reads and writes across the outer and nested WeakMaps, preserving descriptor
requests and the normal Get, Call and value routes. It passed roughly 76,000 forced exclusions
by the 524,288-entry checkpoint. Both runs still stopped during the same `createOpaqueOperation`
input request in `issueIntrinsicReceipt`, at 33 started callable extractions and 44 started
invocation dependency queries. The phase runs exited at 32.32 and 32.30 seconds (stock and
ceiling), before Core component emission. These are prefix counts and times to failure.
The assumption about the selected receiver was deliberately stronger than production proof.
The trial bounds that writer-discovery route only. Source runtime controls confirmed cache
hit and creation identity, eager evaluation, and deferred callbacks independently of fresh
package emission.

The original 20-source Theme command used its pinned 8,447-input manifest
(`948120dcfb9df7537b23211f31d39a085720973c0e8650d40b2491ef5c48b6f5`).
With the corrected compiler and the preserved paired Core provider artifacts
from the prior successful build, Theme's TypeScript prerequisite passed.
The package command took 32.02 seconds and hit the same client deadline at
`components.ts` as `a693a97e9` (32.16 seconds). Neither target emitted.
The separate phase-labeled run took 32.12 seconds. It completed the prior
`color.ts` client request, passed `parseThemeColor` and completed the
indexed `map` query in `createTone` in 27.85 seconds. Extraction of
`createTone` remained unfinished at the deadline, the same recorded
extraction frontier as the `a693a97e9` observer.

The private Theme audit profiled the `a693a97e9` request after it passed
`parseThemeColor`. The blocked `createTone` query collects dependencies for
`themeSurfaceBundles.map((bundle) => surfaces[bundle]!.background)`. Reading
an indexed background can invoke an authored getter, and the result supplies
ThemeScope's contrast calculation. The private prefix trial moved past that
query and timed out later in the same request while analyzing
`structuralTokens(tokens, source)` in `createThemeTokens`. It inherited the
captured-setter regression and emitted neither target. Its focused emitted
controls executed client updates and server initial renders. Paired Theme
artifacts, including mounted resolution and hydration, remain unqualified.

### Cross-workload decision audit at `5f39cac3f`

The audited source is the committed tree. The pending accessor edit is outside this binding.
Earlier profiles establish where work accumulated on their recorded inputs and revisions.
For requests that stopped before emission, the decision column names the downstream consumer
in source. It does not claim a completed placement result or measured artifact cost.

| Workload and material query | Component or tooling decision | Eager effects, runtime values and later identity | Evidence and gap |
| --- | --- | --- | --- |
| Core ErrorBoundary → receipt Call, metadata Get/copy, child iteration, prototype/cache writer discovery | Render dependencies constrain the portable target and whether known authored donors must remain in its graph. Receipt construction and redemption keep their existing component ABI and identity. | Acquire the original metadata `key` and `__exactEnhancements`, preserve enumerable Gets, coercion and iteration, and account for the selected render fallback. Payload, prototype and domain values belong to runtime. The reset callback runs on interaction and the composition factory at redemption. Discover writers only when required to settle an actual receiver read. | The six receipt roots accounted for 13.46 of 29.85 sampled CPU seconds at `3056827ef`. The binding Gets accounted for 7.24 seconds, including 7.08 overlapping returned-source projection. The selected registration exclusion and the cache ceiling establish local savings or exclusions. Neither settles the remaining input request or qualifies fresh paired artifacts. |
| ThemeScope → color parser, `createTone` indexed `map` callback, structural token fields | The placement graph needs the reached getter and callback donors. Reactive lowering needs the component's definition, presentation and resolved readers and the paths that can update them. | Keep the checked primitive parser edge and standard Number predicate where already admitted. The returned color field Gets and `surfaces[bundle].background` can execute authored getters. Keep the live context/token identities and the runtime color, contrast and CSS computations. | Older Theme stacks put member/Call/return work on 65.3% of CPU samples. The corrected retained-provider trace took 27.85 seconds through the indexed `map` and stopped inside `createTone`. The structural-token frontier came from a separate, regressing prefix trial. Fresh Theme resolution, mounted updates and hydration remain open. |
| Intl component graph → formatter validation and record capture | Reached donors affect component placement and retained render availability. Protocol validation and finite formatter policy still apply where their existing consumers require them. | The initial `formatter.options` Get and the capture of enumerable and supported nonenumerable fields are distinct. Account for proxy/reflective effects where possible and preserve validation errors and order. A keys-only observation does not execute a value Get. The copied record and formatted text belong to runtime; a selected render target or structure factory is invoked at its actual use. | In the retained shared-demand client capture, of 26.92 sampled CPU seconds, 16.83 were inclusive in `accessorsAtGetOutput`, 15.63 in writer inputs and 15.02 in return projection. These overlap. Focused keys/Get and mixed-donor controls discriminate effects. They do not prove forwarded coverage for `requireRecord` or completed Intl artifacts. |
| ShippingCalculatorPage → blocking `loadInitialRates`, provider registry, array callbacks and await | Preserve the server task and credential containment, cancellation, and authorized model state publication to `CalculatorWorkspace`. The setup invocation returning `void` and the task's internal awaited `Promise.all` have different output consumers. | Keep environment and provider method reads, actual map callbacks and thenable effects, and carrier and signal identity where invoked. Provider selection, quote cache contents, cooldowns and quote payloads are runtime data. Their concrete values are unnecessary to select this explicitly server-owned task. State path and transport decisions still need policy and reachable writes. | The full-page protocol replays returned 43 of 44 responses and reached the 90-second external stop during default Analyze of `components/page.tsx`. A local array trial reached a registry Get but supplied no measured contribution to completed Page cost. Reduced imported server-task controls emit and execute; paired credential controls reject client use with `EXACT2001` and `EXACT3004`. Full task HTTP, cancellation and fresh Page artifacts remain open. |
| All four → effect graph and inspection publication | The same graph supplies placement, policy and reactive facts to lowering and SDK consumers. Public Analyze and inspection can also consume callable facts, source locations and diagnostics. | Use canonical definition/source identities and known donors with independent uncertainty. Text, settings, prices and quotes need no concrete preview value for inspection. Preserve existing report contracts. | Theme and Intl still stalled in graph rebuilding with the serialized callable array suppressed. Shipping's blocked request is Analyze with inspection instrumentation enabled; the replay does not isolate the cost of instrumentation. No material inspection-only cost has been established. |

The highest shared effect requester is `appendArgumentAccessorEffectsObserved`, reached
during direct extraction and from the forwarded-input fallback in
`prepareSourceInputConsumerDecisions`. It publishes accessor donors, state writes and
opacity, then the graph resolves them; it does not publish normal runtime output.
`sourceMemberDependencies` is the sibling requester for original Gets. In a normal-input
frame the Call appender can first acquire results, then ask `refineSourceDependencies` to
instantiate the same source operation again for effects. The Get appender already has a
narrower refinement predicate when the original read accounts for effects. Source proves
this possible repeat at the Call requester and shows the legacy input fallback deduplicates
by operation within its own path. The retained profiles do not pair deliveries across the
direct and fallback paths or identify equivalent receiver contexts. Counting repeated AST
locations or merging graph-local authority would overstate the removable work.

In the unchanged Intl package request at `c031c7e6a`, public MAY collection reaches
`requireRecord` and visits its copy, allocation and descriptor definition. The first
observed recovery of the descriptor writer comes from its own `ToPropertyDescriptor`
field Effects on the fresh descriptor literal. At that point no staged member source
is active. Moving the existing nonnative source-order test ahead of writer inputs
removes that recovery site. The same writer is then reconsidered while selecting
`Reflect.get` in the descriptor value initializer. The original key is a loop binding,
the target requires the selected copy's first-argument relationship, and the initializer
requires its own reflected value Get. The existing staged collector needs those
independent inputs before it can replace the legacy Effects walk. The trace shows work
before staging, with no registered backedge required to explain it.

Private promotions using the existing native operation owner, and the separate
source-order comparison, each still reached the native `components.ts` deadline.
The public MAY collector and the staged member scope independently gate native
operation admission. Lending the two original Calls the existing protocol purpose
registered source and algorithm recipes. Create retained a native alternative beside
incomplete callee coverage. DefineProperty selected its callee but lacked an eager
input plan. Neither operation was adopted or queued. The unchanged package's command
exited in 32.10 to 34.15 seconds in those runs and
published neither target. The ordering comparison passed 14 accessor and recursive
placement controls. A separate copy-alias trial retained some reached getters, but
over-attributed getters to unrelated receivers and lost the known getter beside an
unknown source alternative. No trial qualified a production throughput change.

Ranked follow-up by measured reach and available proof:

1. **Qualify effect coverage at the original Call and Get requesters.** The shared
   member/Call/return families dominate the retained prefixes. Start with one original
   effect-only call to an already selected operation and identify which residual caused a
   fresh traversal. The first candidate rule is to keep the current contribution and defer
   its value gap when the same original operation already covers the needed effects.
   Use the existing refinement predicate and publisher, with proof for the operation's
   receiver, argument association, read cut, executable source and generation. Require the
   rule to retain known donors, state writes and execution uncertainty independently.
   Theme's parser data/Get contrast and Intl's keys/Get contrast are controls. Neither
   currently demonstrates a material matching Call-refinement hit on an original workload.
2. **Discharge one forwarded input operation.** If the first matching residual is a
   missing input read, use the existing source-relative consumer at the original Get
   before retiring its fallback. A named Get with a complete receiver and read-cut
   association is the smallest candidate. Confirm that it retires the legacy traversal
   where the cost was sampled. Keep rest, spread, iteration, dynamic enumeration and
   mixed-callable DATA on their current producers until each has evidence of complete
   coverage. Earlier call-admission trials reached the same package deadlines and one
   lost publication of a known browser donor beside a foreign callback.
3. **Investigate normal async or inspection work only on a demonstrated hit.** The
   async function-wide trigger in `sourceValueRefinementRequired` is broader than an
   ignored result consumer, but changing it can lose thenable assimilation or task
   continuation facts. The Shipping replay supplies no attributable async-result cost.
   Likewise, suppressing response serialization leaves the measured Theme/Intl graph
   demand in place.

The recursive writer cuts at `c3fc9ca1f` do not qualify a shared rule. The broad diagnostic
returned opacity and no inputs for nested writer discovery. It emitted 3,598 staged
files in 26.10 seconds, while its stock observer exited deliberately at 400,000 visits.
That comparison has no matched completion timing or proof of known donors for the
broader cut. The narrowed exposure-only variant cut 13 requests and still reached the
Core deadline. Its corrected installed client controls matched the baseline for direct,
escaped and disjoint setters, but do not qualify the broad variant. Separate server
controls demonstrate why known captured browser getter donors matter even alongside
opacity. The private-cache ceiling tested a different, much narrower path and left the
same parent requester active. Neither provides a reason to add a depth limit, force a
private receiver proof, or repeat package runs with the same inputs.

Before changing the first shared rule, require one retained or newly observed source occurrence
to identify both the effect delivery and the subsequent fallback, with their original owner,
cut and reason for re-entry. Record counts at that requester and compare the existing response
and behavior oracles for eager getters, known plus opaque alternatives, overlapping writes,
stored versus invoked callbacks, and later value or policy use. Include app/library and
edit/revert controls when the rule shares a definition across requests. Proceed to one matched
original-workload replay only if the focused change demonstrably retires work, preserves those
decisions, and has a reason to change the sampled frontier. Bind any such replay to the fixed
coordinator and fresh positive-selection scratch roots. This audit did not establish that
precondition for a production change or a new heavy run.

#### First criterion closed without a qualifying Call pair

The retained Intl and Theme client profiles charged 0.12 of 26.92 and 0.15 of
27.85 sampled CPU seconds, respectively, to
`appendArgumentAccessorEffectsObserved`. Both report the same inclusive time
under its dependency-only route. Those figures put the larger Get and return
totals in context. They provide timing attribution without matching effect
deliveries.

An observation-only overlay of `5f39cac3f` timed normal acquisition and
dependency refinement separately at that requester within each occurrence.
The fixed exclusive one-CPU, 1 GiB coordinator ran the Core client prefix from
a fresh copy of the pinned 8,447-input corpus. The package command stopped at
the `error-boundary.tsx` client deadline in 32.29 seconds. It had started 45
dependency-only requests and finished 44 in 16.31 ms combined. It recorded
zero normal entries and zero paired refinements. The unfinished request was
the original `createOpaqueOperation` Call in
[the intrinsic receipt issuer](../packages/core/src/component-abi/intrinsic-receipt.ts#L159).
It entered with no normal frame, and its completion time is unknown. These
counts apply to the observed prefix of this requester.

The normal Call branch runs with a frame and the refinement branch currently
opens a separate dependency query without that frame. The dependency-only
path can also deliver a staged input association to the graph. Sharing an AST
occurrence and generation alone cannot establish equivalent receiver and
argument associations, input obligations, uncertainty, or publication. This
run supplied no candidate for component parity controls or a payoff replay.

Rank the original named Get input obligation next. Core's two metadata
binding Gets have the strongest direct attribution, with 7.24 inclusive
sampled seconds and 7.08 overlapping return projection at `3056827ef`.
The dependency path can name the formal behind `props ?? {}`, but the
initializer is outside the normal direct-slot proof. Qualify one original
read and its receiver and cut before
attempting to discharge the forwarded request. Preserve the returned-value
consumer and measure whether the input traversal actually retires. The
retained Theme `colorSpace` case reached an unresolved input before a concrete
receiver scan, and the async and inspection rows still lack attributable
removable work.

#### Named Core metadata Get closed at the current frontier

The `key: authoredKey` binding in
[`createCompiledIntrinsicReceipt`](../packages/core/src/component-abi/intrinsic-receipt.ts#L91)
owns the read. Its receiver is the second actual, `props`, or the fresh empty
object selected by the nullish initializer. For example, the
[article receipt](../packages/core/src/component/error-view.ts#L21) evaluates
`error.id` while building its props object. That is an earlier, separate read.
After the actuals and tag check, the binding reads `key`, then
`__exactEnhancements`, then copies the remaining enumerable own properties.
An earlier getter can affect the later reads. On the default
[ErrorBoundary render path](../packages/core/src/component/error-boundary.tsx#L44),
the Get contributes reached getter donors, writes and unresolved alternatives
to the render dependency graph used for portable placement. No final Core
placement was observed in the timed-out request.
[`issueIntrinsicReceipt`](../packages/core/src/component-abi/intrinsic-receipt.ts#L149)
separately reads the acquired value through `unwrap(authoredKey)` and, for a
non-nullish result, `String(rawKey)`. Those operations can themselves invoke
authored code. The key is then carried into the opaque operation and stored
receipt data.

The original dependency Get can account for a forwarded field obligation
once within a matching root instantiation. `flatPatternReceiver` names the
formal for this pattern, and the bound-pattern collector emits separate
obligations for the two Gets and Copy. `sourceObligationCoveredOnEdge`
requires a complete dependency instantiation at the actual root and checks
the original binding, slot and key under that root's consumer and use.
Every matching alternative must be fulfilled. This requires the current
executable source and generation, the same substituted receiver alternatives
and ordered read cut, and publication of reached donors and writes alongside
independent uncertainty. The direct-edge `fieldFallbackFulfilled` check
rejects forwarded obligations. Neither a declaration-local outcome nor a
returned-value projection with the same AST location supplies the missing
root instantiation. The current dependency instantiation can resolve the
obligation, but its own result cannot justify skipping the traversal that
produced it. The later key value and separate Copy obligation still have
consumers.

The 7.24 sampled CPU seconds at `3056827ef` aggregate both metadata binding
Gets. The 7.08 seconds inside returned-source projection are part of that
total. Neither number measures a second, removable effect delivery. The
landed binding change at `3c5cfeade` deferred unbound effects and preserved
binding provenance. The later imported installer change at `d49eb5d88`
preserved forwarded getter writes without demonstrating a Core payoff.
The Theme `colorSpace` experiment recorded one unresolved forwarding entry
and zero concrete interference scans at the original Get. The earlier
mixed-receiver controls required retaining a known browser donor alongside
foreign uncertainty, and the installed-getter experiments showed that
pending producer work cannot substitute for a published placement effect.

A single observation-only replay at `5f39cac3f` excluded the pending accessor
edit. Under the fixed exclusive one-CPU, 1 GiB coordinator, a fresh copy of the
pinned 8,447-input corpus completed the TypeScript prerequisite in 6.38 seconds.
The original package command reached the first `error-boundary.tsx` client
deadline in 32.32 seconds and left 1,200 prerequisite files. The observer
recorded zero entries for the selected `key` at the ordinary binding Get
requester and zero fallback dispatches targeting
`createCompiledIntrinsicReceipt`. A small observer control on the same host
recorded two complete dependency Gets for concrete and nullish actuals. The
terminal flat-binding shortcut cannot match the three-formal receipt issuer.
The adjacent Call observation at the same base located the unfinished
`createOpaqueOperation` dependency request. These counts cover the client
prefix and selected requesters. They place no bound on work after that deadline
or on a fallback dispatched for an ancestor declaration.

There is no matching, materially reached pair to retire at this frontier.
Keep the current publishers and the authored getter, mixed donor, provenance
and edit/revert controls. This observation introduced no compiler behavior
change, so no candidate parity, LSP replay, equal-work timing or completed
package payoff comparison was run. Close this named Get as a Core optimization
candidate at the measured frontier.

### Requester disposition against the component contracts

Use the [necessity tests](compiler-architecture-completion-plan.md#necessity-tests-for-component-decisions) before selecting a requester. Source review at `97951da4e` covers the decisions below. The local accessor implementation edit is outside this review. “Traced” identifies a control-flow path in source. The workload observations above retain their own revision and execution limits.

| Requester and scope | Demand, authority and discrepancy |
| --- | --- |
| Original Get and Call effect extraction; forwarded input preparation (previously traced) | `sourceMemberDependencies` and `appendArgumentAccessorEffectsObserved` request reached accessor donors, writes and residual execution effects. A later selected callee or read can separately need return origin. Concrete normal output exceeds the first demand if all possible outputs induce the same obligations. The named Core Call/Get repeat hypotheses above have no matching observed retirement. Neither a general return cut nor a new fallback is justified. |
| Module initializer diagnostic (source traced) | The session asks `moduleInitializerDiagnostics` about the current file and target. It joins reached sources with browser/server requirements of referenced definitions. Mixed known requirements produce EXACT2101. For an opaque unknown initializer it examines host preservation, explicit artifact targets, then server secret-consumer policy within the initializer's source lines. Default analysis skips this diagnostic. The result owns this diagnostic only. It cannot authorize a capture or publish a write. The same-line component control above disproved line-only matching. The corrected check uses the consumer source and the initializer’s half-open source range. |
| Task capture and mutation lowering (source traced, bounded) | `taskOptimisticCaptureDiagnostics` resolves declaration origin, including shorthand value symbols and destructured inputs. It can reject an unavailable server-local capture at its use. `taskNeedsPendingState` selects server helper enrollment or client blocking work with a pending helper or collection write. It needs operand ownership and task phase. Actual branch outcomes belong to the active generation. The retained direct-helper controls leave escaping accessor ownership open. |
| Setup, reactive render, callback invocation and composition (inventory and scoped earlier controls) | State readers and guarded DOM lowering need invalidation relations; context ordering needs required token origins; receipt creation/redemption needs creation origin and occurrence. Hidden required tokens lack established delivery. Optional lookup is no substitute. Registration effects and later execution have separate readers. Complete event and disposer paths, nested mounted dependency switching, cross-site keys and paired hydration ownership have no new end-to-end trace here. |
| Public Analyze, SDK artifact selection and inspection | The paired SDK decision below consumes callable neutrality. Analyze also promises published records independently of that decision. Live inspection and all individual tooling fields have not been traced back to their producers. Suppressing their serialization has not isolated inspection-only analysis. |

**Published task concurrency.** For a button invoking a component-owned function task, changing the final parameter policy from `TaskContext.client().latest()` to `TaskContext.client().queue()` must change three independently observable results. Changing only the number assigned to component state inside the queued task from 1 to 9 must preserve its concurrency. Omitting the concurrency facet on this invoked task selects parallel.

| Decision | Trigger, minimum fact and stopping rule |
| --- | --- |
| Client emission | When lowering the invoked task definition, pass the effective concurrency string to the task helper. The scheduler uses it when invocations overlap. Stop once the policy is known. Computing the assigned number or predicting overlap adds nothing to this option. |
| Public Analyze | When publishing the component's task, retain its native concurrency field on the corresponding SDK task. The SDK structurally copies a present value and omits an absent one. No overlapping invocation, generated code or runtime outcome is needed. |
| Editor inspection | When projecting the authored region, associate the component's native task with its source range and show its effective mode in the task hover. Source inspection matches the native work range and falls back to component task order. Classification uses the native mode, falling back to parallel for an invoked record and latest otherwise. Stop at the matched record and mode. |

`applyFunctionTaskPolicy` defaults invoked work to parallel and other work to latest. It validates the policy root and reads concurrency facets along the final parameter initializer's call chain. Invoked-task lowering, `nativeModuleAnalysis`, and `createExactSourceInspection` → `entityFacts` all yielded latest, queue, queue and parallel in the four controls. Each native Compile and Analyze request returned zero diagnostics. Native execution reused the instrumented `97951da4e` host. Source comparison at `f15345310` found the same concurrency producer and invoked-task option. SDK and editor projections ran from integration source. These checks cover the client helper option and the matching single-task hover text. Runtime overlap, server continuations, unmatched or multiple regions, live LSP synchronization, other policy fields and inspection cost remain unaudited here.

**Initial component-key adoption.** At `f15345310`, an ordinary button component compiled separately for server and client retained its server DOM under strict element-root hydration for both `saved → saved` and `saved → different`. Subsequent client deliveries retained the button for the adopted client key and replaced it on a changed key or a changed client domain. The native host used the committed overlay, excluding the pending accessor edit. The SDK sources matched this revision and the runtime bundle resolved integration provider sources. These controls exercise a marked component root, with no claim about list-item reconciliation, islands or document adoption.

The marked adopter checks the complete comment pair and artifact ID. Live component receipt compatibility also compares the normalized key and domain object. A domain belongs to the execution root and has no identity token in the component marker. JSX accepts string and number keys. Numeric 1 and string "1" share a receipt key. Keyless and empty-string component markers coincide, and UTF-8 conversion collapses lone surrogates to the replacement character. Markers escape separators in well-formed strings. Markerless roots and omitted nested wrappers lack an independent component-key field. Released fixtures exercise live keyed DOM identity and hydration without specifying first-delivery component-key disagreement. The public mismatch policy specifies default element replacement and strict rejection once a root mismatch is identified. It leaves initial key agreement unspecified.

An initial agreement requirement needs a product decision. Retaining artifact/shape adoption leaves current recovery and wire behavior intact. Comparing the existing marker representation can classify distinguishable keys as mismatches, changing strict and default behavior without a layout change. Exact normalized-string agreement additionally needs a lossless representation, an explicit absence rule and a compatibility policy for old and omitted markers. Nested adoption already distinguishes local replacement from root mismatch and can encounter a child's marker where a parent wrapper was omitted. Any change belongs with SSR marker production and DOM adoption, with no new compiler analysis.

**Mounted reactive reads.** A child renders `props.left ? props.a.n : props.b.n` alongside `saved.n`, where setup saves `peek(() => props.a)`. The first expression observes the selector and the current branch. The second retains the original object and observes its field. Starting at `1/1`, six parent button writes incremented inactive `b.n`, selected B, incremented the saved object's field, replaced A, selected A, and changed unrelated state. After each click and synchronous flush the same output element read `1/1, 9/1, 9/2, 9/2, 5/2, 5/2`. Counters added at entry to the two emitted child readers observed respectively zero, first only, second only, zero, first only, zero executions on those writes, on mount and after strict adoption of server HTML.

The scalar control binds the conditional to `selected` and renders `twice = selected * 2`. With no direct input in the multiplication, the local-symbol dependency walk in `collectReactiveBindings` records `twice → selected → props`; its classification fallback propagates derived provenance. Both targets reported these edges. Client planning fused both safe calculations into one slot reader, where indexed prop reads and ordinary conditional evaluation subscribe to the selected object's field. All six writes delivered the doubled first value. In the existing reactive-provenance fixture, `peek(() => state.value) + state.other` instead needs its own subscription boundary: the emitted slot reads `mixed.get()`. Two value increments left mixed at 11; setting other to 20 sampled the then-current value 3 and produced 23. The aliased helper version agreed. These controls required the executed reads and preserved identity, without reconstructing the selected object or the helper's numerical result.

Controls used a native build of the local integration overlay at `97951da4e`, separate client/server compile requests, the corpus runtime source aliases, and explicit compiled root input receipts. The installed SDK's protocol mismatch precluded using its Vitest transform. All three component controls passed mount and strict hydration. Reader counts apply only to the direct conditional control. These pairs establish neither complete effect delivery through arbitrary getter/callback fallback paths nor a redundant production requester that can be removed.

**Function-defined task placement.** For a component-owned task invoked by a button, the decision concerns work reached when the task executes. The following obligations precede capture, residency and transport checks.

| Reached task work | Inferred | Explicit client | Explicit server |
| --- | --- | --- | --- |
| Neutral | Client by default; a component state write selects isomorphic scheduling | Client | Server |
| Opaque invocation alone | Refuse | Client | Server |
| Browser, with or without an opaque invocation | Client | Client | Refuse |
| Server, with or without an opaque invocation | Server | Refuse | Server |
| Indivisible browser and server work | Refuse | Refuse | Refuse |

Storing an arrow that reads `document.title` imposes no browser requirement. Calling the saved arrow introduces it at the Call. A getter returning that arrow runs at Get, but the browser requirement still arrives at Call. Moving the document read into the getter moves the requirement to Get even if the result is an ordinary number. Changing that number alone cannot change placement. The value of an opaque Call can also remain native when the chosen target is legal and existing result transport suffices. A subsequent property selection, callback invocation, state write or boundary crossing has its own input obligations.

In `collectTasks`, callable sources supply transitive donors after exclusion of owned child-task work. Source-specific browser/server flags survive an unknown aggregate. The inferred scheduler consumes these flags, opacity and neutral writes; explicit placement consumes conflicting donors. `applyTaskPolicies` then joins body, state-path, context and capture policies. A client request reading a server-kept state field failed on both targets. `task_diagnostics.go` promotes placement errors to EXACT2001. For invoked declarations, `lowerInvokedTaskDeclaration` substitutes the server-side callable for client work. Server work retains its executor on the server and a continuation on the client. The SDK transforms both targets and publishes only after preparation succeeds.

Paired SDK controls on the local overlay at `97951da4e` exercised the stored/invoked arrows directly and through a getter, the getter-body read, neutral inference, the state-policy conflict, and all three placement requests for opaque-only work, each platform joined with opacity, and both platforms joined with opacity. Accepted pairs produced two files. The executing body containing `document.title; return foreign()` or `process.cwd(); return foreign()` appeared only on its selected target. Each refused pair also failed both individual target transforms. These were compile controls with workspace dependency declarations. Separate native component controls passed for scheduling with and without writes, suspension and nested tasks, private captures, context ownership, returned-getter effects, held adapter refusal and application/library parity for a standard-call activation. Mounted behavior and parity of every SDK pair remain unverified.

The public task record previously explained both explicit server work and opaque refusal as a client scheduling decision. Recording a default reason where the scheduler actually selects it corrects the common producer. At the original Get/Call boundary, a concrete return prediction exceeds placement demand for the stored callback and ordinary result. The controls showed no missing platform donor on those ordinary paths. The no-summary fallback walks body identifiers and lacks the graph's invocation edges and independent opacity evidence. Native adapter receiver admission shares this walk. A held activation reaches the session coverage gate before emission, but dependency analysis in `project_components.go` also consumes collected tasks. The necessity of its platform scan and a reachable no-summary misplacement through that route remain unverified; these controls do not justify retiring it.

**Server task submission and publication at `2214cc83a`.** A mounted button invokes a latest server task that consumes a mocked credential and writes a public label. The [task contract](tasks.md) gives each activation its own arguments, pending state view, signal and lifetime. The discriminating pairs are a default argument versus a state-derived read after a helper write, a read-only versus a conditionally writing helper, a taken versus skipped write under the same declaration, an authorized label versus a label accompanied by an undeclared sibling, and a current versus superseded reply. Changing only the credential or the public text needs no new placement or path authority. [Item 5](#item-5-disposition-at-a5c584b62) supplies the default/live and reader/writer pairs at its recorded revision. Its constructed POST tests server projection; it does not measure browser submission.

[Native continuation construction](../native/typescript-go/overlay/internal/exactcompiler/continuations.go) assigns ordered dependency slots, state reads and separate possible writes to the component-owned operation. During dispatch, the [client](../packages/hydrate/src/runtime/operations.ts) takes the projected state after the optimistic prelude and sends the activation dependencies and generation. The [executor](../packages/server/src/continuation/execution.ts) checks identity and dependency arity, links cancellation to the request-local frame and projects exact scalar writes after success. For an already-present input path it requires a recorded set on the final receiver; a newly present authorized output can be projected directly. The [response planner](../packages/hydrate/src/runtime/continuation-response.ts) validates the response before staged application. State-only publication checks component write ordering. A generation number alone grants no write authority.

Two strict-hydration controls used the integration SDK source, a freshly built exactc with the committed integration Go overlay, workspace dependency declarations and source runtime aliases. The SDK version handshake passed and `compileFileArtifacts` produced both imported target files. An unbatched fetch mock passed the actual serialized requests to the generated server handler. With no state read, three clicks sent the same opaque operation ID, empty dependencies and generations 1, 2 and 3, with no state field. The credential acquisition call appeared in server code only. The mock credential stayed out of rendered resumption data and request and response bytes. The unmodified reply published “Public result” to the hydrated output. Holding the first response across the next click aborted its signal. Distinct mock reply labels made the second generation observable; releasing the first response preserved the second label. Adding an undeclared sibling to the third reply produced `invalid-response` and left the same output node and second label intact.

For the computed-read fallback, selecting a lane after the server await required the submitted `lanes` record. The request included both lane values and omitted an unrelated state sentinel. The server returned only the selected public label (“Ground”). This matches [native read-prefix selection](../native/typescript-go/overlay/internal/exactcompiler/continuation_state_reads.go): a dynamic segment can require the containing record, while the output still has finite scalar authority. These controls showed neither a missing input nor a removable acquisition for this decision. They do not establish minimal input for every selector. Full Shipping Page emission, collection correspondence, context/progress publication, batched cancellation and broad root reads remain open here. The run excludes the pending accessor edit and does not qualify a published SDK/native installation.

**Setup-owned unmount registration at `2214cc83a`.** For a component returning a static output, compare `this.onUnmount(make())` with `const owner = this; owner.onUnmount(make())`. The factory records acquisition and returns a callback that records release. Definition-time planning needs the component receiver, the unmount phase and a teardown-capable target. During setup the factory runs once and the owner stores the actual callback. Its return value at release and the identity of the particular closure need no compiler prediction for this decision. Effects of evaluating the argument still belong to setup. Effects inside the callback belong to teardown and must survive projection on every target that creates the owner.

The direct server helper stores the callback on the request frame and disposes it at the end of rendering. Strict hydration establishes a separate client registration while claiming the server element. A second receipt for the same component kept that element and registered nothing more. Rendering a different component released the first registration once, including after disposal of the stale hydration handle. These decisions use the renderer’s existing component identity and lifetime. They require no callback transfer in resumptions.

The paired SDK artifact route on the committed integration compiler passed the direct control. The alias retained an authored method lookup on a direct server frame without that method and threw before producing HTML. Server surface projection and lifecycle lowering now recognize this immutable receiver for a plain unmount call and pass the evaluated owner to the existing registration helper. Repeating the same controls on both generated targets passed. Both builds used the integration SDK source and committed Go overlay, with only the lifecycle correction added in the second build; mounted checks used integration runtime sources. This evidence covers synchronous factories, same-component receipt updates, replacement and repeated disposal. It leaves mutable receivers, dynamic keys, asynchronous cleanup and callback placement under their existing contracts. It does not establish that an analysis traversal can be removed.

**One complete output decision.** The SDK paired artifact route acquires base analysis and both target transforms. Preparation erases adapter helper types and links enhancements before comparing target code. Source maps bypass sharing. Otherwise unequal code, an asset, a boundary, an invocation continuation, component tasks/contexts/islands, any non-neutral callable, a secret or non-shared policy subject, or a runtime import suffices to select separate files. Once any exclusion holds, this decision has no demand for further exclusions. That short circuit says nothing about other consumers of base analysis. If all checks pass, preparation retains the shared client result and both target records. Publication writes a shared implementation and two relative re-export facades, including a default re-export when declared. On the separate path publication writes each target's code with its applicable map URL and schedules removal of an obsolete shared file in the same transaction. Validation precedes publication. This traces selection through both filesystem outputs; it does not verify the completeness of native effect or policy inputs to that selection. [Paired entry points](../packages/compiler/src/compilation/artifact-compilation.ts), [eligibility and facade](../packages/compiler/src/compilation/shared-artifact.ts), [preparation and publication](../packages/compiler/src/compilation/artifact-entry-output.ts).

**Priority and closure.** First distinguish a missing known effect or relative write from genuine uncertainty at the shared Get/Call input boundary. The installed-getter and mixed-receiver controls above demonstrate what an incomplete delivery can lose. Establish the original executing operation, phase, possible receiver/callback associations and intervening writes. Show which observable decision would differ if the known alternative disappeared. Then distinguish normal result demand by following its next reader. Retire stronger analysis only where preserving native evaluation and the existing effect delivery discharges every remaining obligation, including the forwarded fallback. A repeatable failing pair warrants a correctness repair; a matched redundant request with unchanged decisions warrants removal. Neither has been established for the current original Core frontier.

Use Core's saved versus redeemed child, Theme's indexed callback versus primitive parser result, Intl's keys versus value Gets, and Shipping's ignored invocation versus awaited server effects as independent counterchecks. None defines the rule. Acceptance needs paired target outputs or diagnostics, source reasons, reachable updates and authorized writes for the affected boundary, plus app/library equivalence and edit/revert where definition facts are reused. Hydration, lifecycle, policy or inspection closure requires exercising the corresponding consumer. Existing prefix profiles and reduced controls do not close those rows.
