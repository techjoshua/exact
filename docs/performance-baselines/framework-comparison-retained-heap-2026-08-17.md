# Framework-comparison retained-heap investigation — 2026-08-17

## Question and scope

This investigation asks which live browser objects account for eXact's higher post-interaction,
post-GC heap in the controlled framework comparison and which reductions are viable without
weakening eXact's durable component ownership, precise reactive updates, hydration integrity, or
server/client contracts.

The analyzed route was `/incidents/inc-100` after hydration, live-service connection, an
optimistic claim, and authoritative version-2 settlement. The comparison harness forced a full
Chrome heap collection before reading memory. Additional Chrome heap snapshots were captured at
the same state for eXact, React, and SvelteKit. Estimates below are directional engineering ranges,
not release budgets. V8 object layout, compilation tiering, and shared ownership prevent source
bytes or shallow sizes from converting exactly to retained heap.

## Measured inventory

The seven-sample framework run reported these retained-heap medians:

| Participant | Post-GC retained heap |
| ----------- | --------------------: |
| eXact       |           2,847,044 B |
| React       |           2,296,660 B |
| Nuxt        |           2,327,580 B |
| SvelteKit   |           2,072,272 B |

The independent heap snapshots included Playwright's common injected machinery and therefore had
higher absolute totals, but reproduced the relative gap: eXact held about 603 kB more shallow live
heap than React and 1.07 MiB more than SvelteKit. The eXact-minus-React shallow difference was:

| Heap category                  | Difference | Principal evidence                                                      |
| ------------------------------ | ---------: | ----------------------------------------------------------------------- |
| V8 code and execution metadata |  323,924 B | Instruction streams, bytecode, scope metadata, feedback, constant pools |
| Objects and closures           |  128,120 B | Component/render records, reactive ownership, readers and callbacks     |
| Native objects                 |   69,977 B | Principally source backing and 209 additional comment nodes             |
| Arrays                         |   56,932 B | Render records, dependency and ownership collections                    |
| Object shapes and strings      |   24,104 B | Additional runtime shapes and source/runtime strings                    |

The minified eXact entry was 221,147 B, versus React's 200,425 B. V8 retained 442,220 B of external
source backing for the eXact script, almost exactly two bytes per minified source character. This
explains about 41 KiB of the heap gap directly. Executed-code metadata explains much more: precise
coverage observed 98,445 B of the eXact entry exercised by the scenario, versus 61,629 B of React's
entry. The remaining 122,702 B of eXact source was loaded but not exercised by this scenario; that
is an upper bound, not a claim that all of it is optional.

Rollup attributed 451,876 rendered pre-minification bytes in the eXact entry:

| Owner                  | Rendered bytes | Share |
| ---------------------- | -------------: | ----: |
| `@exactjs/core`        |      138,605 B | 30.7% |
| `@exactjs/dom`         |      126,721 B | 28.0% |
| `@exactjs/reactive`    |       86,419 B | 19.1% |
| `@exactjs/hydrate`     |       41,230 B |  9.1% |
| Comparison application |       57,546 B | 12.7% |
| Instrumentation        |          150 B | <0.1% |

The live renderer contained 139 `Mounted` records and 140 active effect scopes. Every mounted
record effectively had one scope. Of those scopes, 90 had no reaction collection, 58 were leaves,
and only 34 were both leaves and reaction-free. The scope records themselves occupied 7,280 B;
82 child collections and 50 reaction collections added backing storage. No scope had allocated
cleanup or resume-waiter storage.

The hydrated DOM retained 216 eXact comment markers:

| Marker family      | Comments | Pairs |
| ------------------ | -------: | ----: |
| Cell               |      132 |    66 |
| Dynamic expression |       58 |    29 |
| Component          |       14 |     7 |
| Fragment           |        6 |     3 |
| Keyed item         |        6 |     3 |

They accounted for about 21 KiB of additional native shallow heap plus wrappers, marker strings,
and references. Temporary hydration indexes were not retained: the live render-program records
held their resolved nodes and property maps, while local indexing maps had collected.

## Recommended changes

The ranges below are estimates against this comparison route. They overlap where one change makes
another module unreachable and therefore must not be added mechanically.

### 1. Add a closed compiler-planned render-program path

**Recommendation:** distinguish a compiler-proven closed render program from a program that may
fall back to arbitrary VNodes. A closed program should import a compact adoption/binding executor
that:

- validates the compiler-owned element and slot identities;
- binds scalar text and intrinsic-property readers directly;
- retains direct slot-node references;
- patches those slots without importing generic child mounting, adoption, or reconciliation; and
- fails hydration locally to a separately loaded recovery capability when an integrity check fails,
  rather than statically retaining the entire fallback renderer in every successful page.

The existing `adoptRenderProgramOrFallback` statically reaches both the planned path and generic
fallback. Relevant generic adoption, mounting, patching, and child modules contribute roughly
31–45 KiB rendered before minification in this build. Not all can disappear because components,
lists, and non-program regions still need ordinary ownership. The compiler should emit the closed
entry only for regions whose readers cannot produce VNodes, arrays, promises, portals, structural
boundaries, or arbitrary spreads.

**Estimated impact:** 15–35 KiB retained heap for the current route; 30–70 KiB for an application
whose complete hydrated tree is eligible. Expected minified transfer reduction is roughly
6–15 KiB. The lower bound assumes only the 22 retained render-program regions become closed.

**Risk and acceptance:** medium-high. Integrity failures must still recover deterministically, and
malformed or version-skewed SSR must never be silently accepted. Protect exact hydration output,
malformed-marker recovery, focus/form preservation, keyed identity, component-root ownership,
teardown, and server refresh behavior. Measure mount/hydration CPU because moving fallback behind a
dynamic boundary must not impose a normal-path async transition.

### 2. Split production inspection and diagnostic execution from the component/task hot path

**Recommendation:** extend the existing compiler-authored runtime capability selection so an
inspection-free production artifact does not statically retain diagnostic frame inspection,
performance tracing, component logging adapters, inspection history, or inspection contexts. Keep
the fields optional on durable instances and install the capability before construction when
DevTools or explicit profiling is enabled. Do not make component state inaccessible; this removes
diagnostic execution machinery from builds that did not request it, not the inspectable component
model.

Included diagnostic-oriented modules contribute about 12 KiB rendered before minification in this
entry, excluding ordinary error reporting and required security diagnostics.

**Estimated impact:** 12–30 KiB retained heap and 4–7 KiB minified JavaScript in an inspection-free
production build. The estimate includes source backing plus uncompiled/compiled metadata and small
runtime objects.

**Risk and acceptance:** medium. Explicit inspection builds, application-provided logging, error
boundaries, task status, and production fault reports must remain supported. Verify that enabling
inspection before root creation restores the full event stream and that a late DevTools connection
has an explicit, documented limitation or loads a compatible capability.

### 3. Use a trusted compiler-contract fast path while retaining validation at open boundaries

**Recommendation:** generated same-build component artifacts should carry a private frozen brand
and normalized contract record. Component construction can consume that prevalidated record
without loading the general contract normalization and duplicate-validation closure. Continue to
load and execute the full validator for foreign bundles, lazy/microfrontend registrations,
untrusted serialized records, version mismatch, and public compatibility boundaries.

Contract validation, boundary validation, continuation validation, metadata validation, and the
contract cache contribute about 13 KiB rendered before minification in the current entry. Some
validation remains necessary because this route has compiled tasks and hydration authorization.

**Estimated impact:** 8–20 KiB retained heap and 3–6 KiB minified JavaScript for a closed same-build
application. Open component ecosystems will realize less.

**Risk and acceptance:** high at the trust boundary. The brand must be compiler-owned and tied to
build identity; authored casts or object shape must not bypass validation. Add adversarial tests
for forged brands, mixed builds, conflicting registrations, malformed continuation contracts, and
lazy package loading.

### 4. Separate reactive Map/Set support from ordinary object/array proxies

**Recommendation:** split collection proxy handlers from the ordinary object/array proxy closure.
The compiler's runtime capability facts should select Map/Set support when component state or an
opaque dependency can produce those collections. An object/array-only state artifact should use a
proxy creator that does not statically import collection method wrapping. Keep keyed array
metadata and array reconciliation independent; this application uses reactive arrays and keyed
rendered lists, so those systems are not removable here.

The Map/Set collection handler alone contributes about 8 KiB rendered before minification. A broad
removal of keyed metadata or reconciliation would be incorrect for this fixture.

**Estimated impact:** 8–18 KiB retained heap and 3–5 KiB minified JavaScript for object/array-only
applications. The current comparison route is likely near the middle of that range if its compiler
facts can prove that authored state remains object/array-only.

**Risk and acceptance:** medium-high. Opaque values, contexts, compatibility adapters, and dynamic
imports may require the general path. Verify Map/Set identity, aliasing, transactions, readonly
behavior, nested replacement, and late capability registration. Prefer a compiler-selected entry
over a mutable global handler registry.

### 5. Rebase eligible hydrated render programs and release redundant marker pairs

**Recommendation:** after a closed render program validates and resolves all slot nodes, rebase its
mounted range onto its stable intrinsic `programRoot`. Remove the outer cell pair when the program
has one non-empty intrinsic root and no server-refresh protocol requires that outer address. Remove
dynamic text marker pairs once their direct text-node slot is retained and the compiler proves the
slot cannot become structural content. Preserve markers for empty ranges, keyed identity,
component replacement, streamed/server patches, fragments, raw HTML, and any dynamic value that
can change node shape.

This route has 66 cell pairs and 29 dynamic pairs. Only the subset owned by 22 retained render
programs is an immediate candidate; removing every marker would violate range ownership.

**Estimated impact:** 10–18 KiB retained heap for the current route. The strict upper bound from all
216 marker nodes is roughly 25–35 KiB, but that bound is not viable because several marker families
remain semantically necessary.

**Risk and acceptance:** medium-high. Test hydration mismatch recovery, server refresh addressing,
empty-to-nonempty transitions, scalar-to-structural rejection, keyed moves, component replacement,
form state, focus/selection, inspection markers, and teardown. Marker removal should be a final
commit after ownership has transferred to direct node references.

### 6. Make effect scopes optional for inert mounted leaves

**Recommendation:** make the mounted record's scope optional and carry an inherited owner scope.
Do not allocate a child scope for a leaf that owns no
reaction, cleanup, pause boundary, component instance, resource, replacement range, ref lifecycle,
or independent event subscription. Teardown should stop only an owned scope; inert leaves continue
to release their ordinary DOM properties through the mounted record. Begin with compiler render
program leaves and statically adopted text/intrinsic leaves, not components or structural ranges.

Only 34 of 140 scopes are both leaf and reaction-free in the measured page. Removing all 90
reaction-free scopes is not immediately safe: parent scopes provide subtree stop and pause
boundaries even when they own no reaction directly.

**Estimated impact:** 3–6 KiB retained heap for the conservative 34-leaf implementation; 6–12 KiB
if ownership analysis safely eliminates 50–70 scopes and their parent-set entries. This is smaller
than the executable-code opportunity.

**Risk and acceptance:** medium. Verify independent subtree disposal, Activity pause/resume,
Suspense candidates, keyed replacement, refs, event cleanup, component errors, and nested root
teardown. Avoid one shared scope per component if stopping one child could stop sibling work.

### 7. Specialize hydration-config decoding by compiler-emitted field inventory

**Recommendation:** preserve the bounded fail-closed decoder, but let the compiler select a
field-inventory-specific configuration reader. A hydration-only page with no islands, operation
transports, resumptions, public contexts, or endpoint maps should not retain normalization and
merge logic for those absent record families. The generic reader remains mandatory for universal,
late-registration, and microfrontend builds.

Hydration configuration and validation modules contribute about 15 KiB rendered before
minification before counting shared protocol decoding. Form-state adoption is independently used
and must not be grouped into this removal.

**Estimated impact:** 5–15 KiB retained heap and 2–5 KiB minified JavaScript for a genuinely narrow
hydration artifact.

**Risk and acceptance:** high at the serialization boundary. Limits, authorization identity,
duplicate conflicts, prototype-safe decoding, and unknown-field rejection must remain identical.
Use generated static field selection, never unchecked parsing.

### 8. Do not pursue a general compact `Mounted` representation yet

The page retains 139 mounted records with only 4,568 B of shallow record storage. Their child arrays
and auxiliary state add overhead, but a prior 100,000-cell compact-record experiment improved heap
22.4% while regressing construction 35.1% and failing DOM placement/component-root correctness.
The current evidence does not justify repeating a global representation rewrite.

A later compiler-only record for closed render programs may be viable after recommendation 1,
because it can replace several generic mounted leaves with one proven program record. Treat that as
part of the closed executor and require at least a 15% target-population heap improvement without a
5% mount, patch, or teardown regression.

## Priority and expected combined result

| Priority | Change                                      | Current-route estimate | Confidence  |
| -------: | ------------------------------------------- | ---------------------: | ----------- |
|        1 | Closed compiler-planned render-program path |              15–35 KiB | Medium      |
|        2 | Inspection/diagnostic capability split      |              12–30 KiB | Medium      |
|        3 | Trusted compiler-contract fast path         |               8–20 KiB | Medium-low  |
|        4 | Release eligible render-program markers     |              10–18 KiB | Medium-high |
|        5 | Object/array-only reactive proxy entry      |               8–18 KiB | Medium      |
|        6 | Optional scopes for inert leaves            |      3–6 KiB initially | High        |
|        7 | Hydration-config field specialization       |               5–15 KiB | Medium-low  |

After accounting for overlap, the realistic combined target is **55–105 KiB** on this route,
approximately **10–19% of the measured eXact-versus-React gap**. A broader application in which the
compiler can close most render regions and omit more runtime capabilities could save **120–220
KiB**. Claims above that range require evidence that currently exercised renderer, reactive, or task
machinery can be specialized away; bundle reachability alone does not establish that.

The work should be implemented and measured in this order:

1. add retained-heap snapshot attribution and marker/scope counters to an opt-in diagnostic command;
2. prototype the closed render-program executor on this comparison fixture;
3. measure complete-build bytes, post-GC heap, hydration CPU, interaction medians, and malformed-SSR
   recovery;
4. land marker rebasing only after the closed executor owns direct node references;
5. split inspection and trusted-contract capabilities independently so their results remain
   attributable; and
6. pursue scope elision last, because its measured ceiling is small and its lifecycle risk is
   disproportionate.

No recommendation removes support for generic VNodes, open component packages, runtime inspection,
Map/Set state, or recovery. Each moves that machinery behind the compiler-visible capability or
trust boundary that actually requires it.

## Implementation measurements

### Recommendation 1: closed hydrate render-program fallback

The hydrate/client component-contract projection now omits each compiler-closed intrinsic
program's generic VNode fallback closure. Complete, universal, and server-capable projections keep
the fallback because they can enter SSR, React-compatible markup, or local recovery. A failed
closed-program adoption still reaches deterministic root hydration recovery; fresh mounting fails
explicitly if a compiler-owned closed program cannot mount.

The full controlled comparison passed all 28 browser checks after the change. Seven-sample medians
and complete client artifacts changed as follows:

| Metric                   |      Before |       After |            Change |
| ------------------------ | ----------: | ----------: | ----------------: |
| Post-GC retained heap    | 2,847,044 B | 2,843,044 B | -4,000 B (-0.14%) |
| Navigation               |     35.4 ms |     33.1 ms |           -2.3 ms |
| First contentful paint   |       48 ms |       44 ms |             -4 ms |
| Optimistic feedback      |      1.8 ms |      2.2 ms |           +0.4 ms |
| Authoritative settlement |     13.5 ms |     13.9 ms |           +0.4 ms |
| Clean comparison build   |  4,649.7 ms |  4,148.9 ms |         -500.8 ms |
| Client artifact, raw     |   225,662 B |   221,651 B | -4,011 B (-1.78%) |
| Client artifact, gzip    |    66,856 B |    66,290 B |   -566 B (-0.85%) |

The sub-millisecond interaction movements and single-run build movement are not treated as causal
performance claims. The reproducible code-size and retained-heap reductions are smaller than the
original estimate because generic structural regions still make the ordinary renderer reachable;
this first implementation removes duplicate per-program factories rather than the renderer itself.
Raw runs: `raw-1786983123299.json` and `raw-1786986398296.json` under the ignored comparison `.tmp`
directory.

### Recommendation 2: optional task-frame diagnostics

Task execution now depends on a compact optional inspection capability rather than importing task
snapshot projection, retained history, value-preview integration, and event publication directly.
Creating an inspection owner installs the full capability before an instrumented root runs. The
focused inspection suite passed all five tests, and the controlled comparison again passed all 28
browser checks.

The independent seven-sample comparison against the recommendation-1 result was:

| Metric                   |      Before |       After |            Change |
| ------------------------ | ----------: | ----------: | ----------------: |
| Post-GC retained heap    | 2,843,044 B | 2,838,644 B | -4,400 B (-0.15%) |
| Navigation               |     33.1 ms |     35.5 ms |           +2.4 ms |
| First contentful paint   |       44 ms |       48 ms |             +4 ms |
| Optimistic feedback      |      2.2 ms |      1.9 ms |           -0.3 ms |
| Authoritative settlement |     13.9 ms |     13.6 ms |           -0.3 ms |
| Clean comparison build   |  4,148.9 ms |  4,602.6 ms |         +453.7 ms |
| Client artifact, raw     |   221,651 B |   219,061 B | -2,590 B (-1.17%) |
| Client artifact, gzip    |    66,290 B |    65,687 B |   -603 B (-0.91%) |

Browser and clean-build timing changes remain within the variation seen between these short runs;
the accepted effects are the smaller artifact and retained heap. The realized reduction is below
the original estimate because component-domain checks and ordinary optional logging remain in the
hot path: they preserve late owner lookup and application-provided logging without retaining the
heavy task projection implementation. Raw after-run: `raw-1786986648026.json`.

### Recommendation 3: trusted compiler-contract fast path not implemented

The current component artifact model has no runtime-private, build-scoped credential connecting a
compiler-emitted JavaScript contract literal to the runtime that consumes it. Deep freezing,
non-enumerable properties, `Symbol.for` brands, generated string tokens, and an exported trust
helper are all reproducible by authored JavaScript. Treating any of them as validation authority
would allow a forged or mixed-build contract to bypass continuation, boundary, and metadata
validation.

No runtime change was made and no performance delta is claimed. A viable implementation first
requires an artifact-loader capability that creates an unexported per-build credential, proves the
component module belongs to that build, and rejects cross-build registration before populating a
runtime-private `WeakMap`. That is a component artifact protocol change rather than a local
contract-cache optimization and must be designed and adversarially tested independently. Until
then, generated and foreign contracts continue through the same validate-once cache.

### Recommendation 4: object/array proxy entry deferred pending capability facts

Map/Set member interception is already isolated in `proxy/collections.ts`, but the general
`reactive()` contract and reactive component-context APIs synchronously accept opaque values. The
component runtime statically retains those APIs even when the authored state on this route happens
to contain only objects and arrays. Adding a second object-only export would therefore add surface
area without making the collection module unreachable or changing measured heap.

No runtime change was made and no performance delta is claimed. A viable implementation must first
add a conservative compiler fact for collection-bearing state and reactive contexts, treat
`unknown`, `any`, external contexts, and compatibility inputs as collection-capable, and carry that
fact into component construction. Only then can the runtime select an object/array proxy entry
without silently returning an unobserved nested Map or Set. The public general `reactive()` API
must continue to support collections unchanged.

### Recommendation 5: scalar marker release experiment rejected

A closed-program adoption experiment removed generic dynamic marker pairs only after direct scalar
Text-node ownership was established. The focused hydration behavior passed, including generic
fallback preservation. On the controlled route, however, compiler-planned SSR already writes
scalar slots directly and therefore supplies no dynamic marker pairs for this path to release.

The seven-sample experiment changed retained heap from 2,838,644 B to 2,843,136 B (+4,492 B), and
the client artifact from 219,061 B / 65,687 B gzip to 219,446 B / 65,758 B gzip. Navigation was
effectively flat (35.5 ms to 35.3 ms), FCP moved from 48 ms to 52 ms, optimistic feedback remained
1.9 ms, settlement moved from 13.6 ms to 13.4 ms, and clean build moved from 4,602.6 ms to
4,311.1 ms. The cleanup added code without serving the measured DOM, so it was reverted. Raw
experiment: `raw-1786987111923.json`.

The remaining cell, component, fragment, and keyed markers are structural ownership or protocol
addresses, not redundant scalar-program markers. Removing them still requires the broader mounted
range rebasing and server-refresh proof described in the original recommendation; recommendation
1 alone does not establish that proof.

### Recommendation 6: inert-leaf scope experiment rejected

The experiment created an ordinary child scope, then allowed the reactive runtime to detach it only
when it had acquired no children, reactions, cleanups, or pause waiters and the mounted leaf owned
no manual stop, resource, range, or structural state. The leaf borrowed its parent's active scope
for later patching while teardown explicitly avoided stopping that borrowed owner. Typechecking,
21 focused scope tests, eight render-program tests, and all 28 comparison checks passed.

Against the recommendation-2 baseline, retained heap moved from 2,838,644 B to 2,839,248 B (+604
B), while the client artifact grew from 219,061 B / 65,687 B gzip to 219,574 B / 65,840 B gzip.
Navigation moved from 35.5 ms to 36.0 ms, FCP from 48 ms to 52 ms, optimistic feedback remained 1.9
ms, settlement moved from 13.6 ms to 13.0 ms, and clean build from 4,602.6 ms to 4,373.0 ms. The
proof and ownership bookkeeping cost more than the eligible scope records saved on this route, so
the implementation was reverted. Raw experiment: `raw-1786987577328.json`.

### Recommendation 7: hydration-only configuration projection

The hydration-only entry now selects a bounded decoder whose accepted field inventory excludes
operation endpoints, continuations, islands, and transports. Those fields remain supported by the
complete hydration runtime. The narrow decoder rejects an unexpected complete-runtime field rather
than ignoring it, and retains byte/depth/node ceilings, reactive protocol decoding, build and
authorization matching, resumption validation, and compact hydration-table validation. All 28
comparison checks, typechecking, and focused root/config tests passed.

Against the recommendation-2 baseline, retained heap moved from 2,838,644 B to 2,836,420 B (-2,224
B, -0.08%). The client artifact moved from 219,061 B / 65,687 B gzip to 222,356 B / 65,896 B gzip
(+3,295 B raw, +209 B gzip). Navigation was effectively flat (35.5 ms to 35.6 ms), FCP remained 48
ms, optimistic feedback moved from 1.9 ms to 1.8 ms, settlement from 13.6 ms to 14.0 ms, and clean
build from 4,602.6 ms to 4,209.9 ms. The result is retained because it removes executed general
decoder work with neutral normal-path timing; the 0.32% gzip increase and duplicated schema surface
remain costs to revisit if a generated decoder can share more primitives without restoring general
field reachability. Raw after-run: `raw-1786987873152.json`.

## Final committed result

The final committed-state run passed all 28 browser checks with a clean worktree. Relative to the
original baseline, the three retained changes produced:

| Metric                   |    Original |       Final |             Change |
| ------------------------ | ----------: | ----------: | -----------------: |
| Post-GC retained heap    | 2,847,044 B | 2,836,420 B | -10,624 B (-0.37%) |
| Navigation               |     35.4 ms |     33.6 ms |            -1.8 ms |
| First contentful paint   |       48 ms |       48 ms |               0 ms |
| Optimistic feedback      |      1.8 ms |      1.9 ms |            +0.1 ms |
| Authoritative settlement |     13.5 ms |     13.1 ms |            -0.4 ms |
| Clean comparison build   |  4,649.7 ms |  4,313.8 ms |          -335.9 ms |
| Client artifact, raw     |   225,662 B |   222,356 B |  -3,306 B (-1.47%) |
| Client artifact, gzip    |    66,856 B |    65,896 B |    -960 B (-1.44%) |
| Client artifact, Brotli  |    58,060 B |    57,269 B |    -791 B (-1.36%) |

Short-run timing differences remain descriptive rather than causal claims. The accepted cumulative
result improves retained heap and transfer size without a measured FCP regression; interaction
medians remain within sub-millisecond variation. Final raw run: `raw-1786988056665.json`.

## V8 function-count follow-up

The compiler now combines expression-bodied readers for a multi-slot render program into one
invocation-local indexed reader. Zero- and one-slot programs retain the direct array representation,
and readers requiring a block body remain separate so materialized derived-local semantics do not
move into a conditional expression. The DOM and SSR executors accept both the historical reader
array and the combined representation, preserving compatibility with existing generated output.

An earlier experiment hoisted all 28 render-program descriptor factories to module scope. Although
that reduced V8-visible functions by 28 and improved the 6x CPU stress profile, it eagerly retained
descriptors for cold conditional programs. Post-GC heap increased by 6,900 B even after eliminating
a duplicate branded graph, so the hoisting experiment was reverted.

The accepted combined-reader version passed the native compiler suite, focused core/DOM/SSR tests,
and all 28 comparison scenarios. Against the prior committed baseline it produced:

| Metric                         |      Before | Combined readers |    Change |
| ------------------------------ | ----------: | ---------------: | --------: |
| V8-visible functions           |       1,312 |            1,292 |       -20 |
| Invoked functions at readiness |         705 |              690 |       -15 |
| Post-GC retained heap, p50     | 2,836,420 B |      2,833,392 B |  -3,028 B |
| Compile trace, 1x p50          |   21.867 ms |        22.020 ms | +0.153 ms |
| Evaluation trace, 1x p50       |   30.312 ms |        30.382 ms | +0.070 ms |
| Compile trace, 6x p50          |  265.538 ms |       259.273 ms | -6.265 ms |
| Evaluation trace, 6x p50       |  384.976 ms |       380.060 ms | -4.916 ms |
| Navigation, p50                |     32.6 ms |          33.4 ms |   +0.8 ms |
| Optimistic feedback, p50       |      1.9 ms |           2.0 ms |   +0.1 ms |
| Authoritative settlement, p50  |     13.8 ms |          13.5 ms |   -0.3 ms |

The unthrottled CPU differences are noise-sized and the 4x profile was mixed; this change is retained
for its deterministic function/closure reduction and small heap improvement, not as evidence of a
broad desktop startup win. Raw profiles: `startup-cpu-functions-20.json` and
`step1-dispatch-startup-20.json`. Raw 50-pass comparison: `step1-dispatch-framework-50.json`.

### Prototype conversion experiment rejected

The durable component instance and reactive effect scope on this path already use shared-prototype
classes. The remaining component activation helper was converted from an instance-owned object to
an internal prototype-backed class, saving its `update` and `deactivate` function objects per
component while retaining the three private-state predicate closures.

All 28 comparison scenarios and focused lifecycle tests passed, but the trade was unfavorable.
Against the combined-reader baseline, retained heap changed from 2,833,392 B to 2,833,152 B (-240
B), while the client artifact grew by about 490 B raw and 140 B gzip. V8 reported two additional
emitted and invoked functions. At 1x, compile moved from 22.020 ms to 22.444 ms and evaluation from
30.382 ms to 31.092 ms; at 6x those metrics improved by 7.496 ms and 8.760 ms respectively. The
ordinary-startup and artifact costs outweigh the negligible fixture heap saving, so the class was
reverted. Raw profiles: `step2-activation-class-startup-20.json` and
`step2-activation-class-framework-50.json`.
