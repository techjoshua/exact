# Compiled component artifacts

Library publication keeps inferred placement separate from inspected executable selection.
An unknown component can have a real target-local compiled artifact while its inferred
`artifactTargets` remain empty. Published export targets and direct relative-edge destinations
record the binding inspected from the completed generation. They do not assert that every
helper can execute on either target. Known target constraints, package authorization and concrete
registration owners still apply. A focused interactive range can coexist with the complete client
artifact used for direct mounting. Empty inferred targets alone cannot turn that owner into a
server-boundary reference. See [component library trust](component-library-trust.md) for
publication and consumption requirements.

Render-program version 4 requires the matching SSR operation provider. Its generated preparation
prefix asserts the provider version before reading prepared slots or writing output. Core rejects
older render-program descriptors. The SSR provider owns its generated version independently, so
combining new core with an old SSR implementation cannot silently ignore required preparation.
The local breaking prerelease migration retains released fixtures as rejection evidence, without
maintaining a parallel implementation of their render-program contract.

Server continuation executors reconstruct referenced task definitions synchronously
inside the existing request task frame. A reconstructed task definition uses the
server task helper facade's `bindTask` export so status and cancellation retain
that request owner. Child invocation keeps its explicit parent task context across
await boundaries. Direct SSR component construction can precede a task frame and
does not acquire this executor binding. Its existing parent task work instead
binds references to the stable setup-owned child definitions when that parent
enters its task frame. Child work binds its own referenced children in the same
way. Repeated activations retain definition and owner-lane identity.
Shorthand task properties resolve the authored value symbol for ownership and task
selection, preserving the authored property key with the selected facade value.

Server projection checks liveness against the authored checker tree. Updated nodes resolve through
their original source identity before a symbol query. Compiler-created import aliases have no
checker symbol and retain the existing conservative reachability fallback. Shorthand references
use their value binding, so a retained object member also retains the local value it reads. This
keeps reachable setup effects and data while allowing dormant client closures to be omitted.
Reference ownership follows the declaration and body in the projected tree. An authored source
position alone cannot attribute a moved transport capture to its former, erased closure.

New compiler output that imports this helper requires a core provider exporting
`bindTask` from `@exactjs/core/framework/server-task-helpers`. This is an additive
provider capability. Existing helper signatures and artifact fields are unchanged.
Provider selection and package metadata must account for the new import before
publication.

## Status

Target architecture and migration contract. Native eXact components are compiler products; raw
functions are not a second component authoring model.

Portable optional-enhancement imports carry adjacent generated type declarations. Keep those files
beside the generated TypeScript when checking or distributing source artifacts. The declarations
permit ordinary TypeScript checking without installing a disabled provider; runtime selection and
authorization still belong to the consuming build adapter.

## Direct finite component roots (prototype)

The private direct-output prototype selects a component-local final return of a concise render
arrow containing one finite intrinsic root. It excludes child/component ranges, spreads,
`root-attributes` program contributions, keys and enhancements on that returned intrinsic. Outer control flow
that can select another return representation is excluded. Saved, supplied, inspected or reused
values retain the existing composition path; the compiler does not specialize a component for its
application callers. An enhancement or text presentation at a caller does not change the selected
component implementation.

A selected client artifact imports `attachExactCompiledDirectProgramComponent` from
`@exactjs/dom/runtime/direct-component`. Its typed `ExactRenderProgramInvocation` carries the
actual component owner and readers into the existing finite DOM mount, adoption and update code.
That fixed region does not issue an intrinsic receipt or enter the generic operation executor.
SSR retains its existing generated writer. Preparation, text presentation and enhancement adoption
share one typed output union. Existing captured enhancement bindings, supplied-target claims and
rollback retain the original invocation during adoption; a claimed binding cannot reapply its
own enhancement. Arbitrary authored objects do not acquire an execution path from this union.

The DOM facade requires core to export both `attachExactCompiledDirectProgramComponent` and the
`exactCompiledDirectProgramAttachment` cursor. New output therefore needs a matching core/DOM
provider capability, including in a published component library. Existing helpers and the prior
component/render-program layouts remain unchanged. The prototype uses component version 6 and
render-program version 4; that fact does not select a released provider minimum or establish
whole-artifact ABI compatibility. The local `0.8.0` manifests alone do not distinguish old and new
prototype provider sources. Publication must select an available matching provider cohort under
[release readiness](release-readiness.md). Frozen released fixtures remain unchanged and keep
their existing generation-acceptance or rejection role.

The bounded consumers cover fixed DOM updates/events, SSR hydration identity, text projection,
authored enhancement disposal and failed-adoption cleanup, and saved-child Activity parking and
creation-origin transfer. The keyed move retains one source occurrence; cross-source-site
key/program compatibility remains unqualified. Application/library comparison uses the same
component source, logical identity, target and configuration. These source-bound checks do not
establish a compiler-analysis timeout or performance improvement.

## Invariant

Every value accepted as a native component by DOM rendering, hydration, SSR, or a component
registry must carry a target-local artifact produced by the eXact compiler. A package may publish
precompiled artifacts, so consuming an eXact library does not require recompiling its source.
When an authored function declaration is referenced earlier in its module, the compiler attaches
its artifact before that first executable reference so the generated contract preserves ordinary
JavaScript function-declaration hoisting.
The artifact definition always carries its compiler-selected capability ABI; an absent ABI is an
invalid artifact, not a request for a universal compatibility runtime.
The ABI bit assignments have one repository-owned JSON contract. Generated Go compiler constants
and TypeScript runtime constants are checked into the tree and verified against that source during
build-script tests, so neither side can advance the protocol independently.

The initial public 0.5.0 release resets component records and render programs to version 1.

Server positional projectors register the initial traversal contract version 1. Its active ancestry
capability provides `has`, `add`, and `delete`; generated code must not depend on the tracker being
a native `Set`. This replaces the earlier unreleased version-one requirement in place. Schema
tuples and hydration bytes are unchanged. Unknown projector versions use the ordinary interpreter.
Published artifacts are a compatibility surface: incompatible helper signatures, layouts,
capability meanings, lifecycle behavior, or hydration formats require a new ABI epoch and provider minor-version
advances at 0.x, or major-version advances at 1.0 and later. Frozen client/server artifacts exercise current
runtimes without recompilation. See [release readiness](release-readiness.md) for the release gate.

Component spread ranges use an additive, independently imported helper. Deferred key resolution
is optional opaque operation metadata. Existing artifacts without that metadata retain their
existing identity behavior, so this addition does not change the ABI epoch. New artifacts require
a provider version that exports the new helper. Client-only child operations also carry an
optional compiler boundary identity through an additive decorator. The DOM adopter consumes only
that matching server placeholder and leaves unrelated parent ranges intact. Ordinary paired
components retain their existing operation and adoption path.

An eager module initializer may freeze an object or array literal, including a named constant
initialized with that literal, before supplying a component. Standard freeze reads own
descriptors. An accessor body runs when a later operation reads its value. Freezing a Proxy
can execute authored traps and retains its separate placement requirements.

A callback passed through a helper can capture that helper's parameter. Its known platform
requirements apply when the receiving helper invokes it, along with the contribution of any
callback that it calls. Passing or returning the closure alone preserves its deferred body.

A task that destructures a local object acquires the current field value, including the result
of an authored getter. Calling a known function from that binding imposes the function's
platform requirements even if the original field is subsequently replaced. A direct dense
array literal, or a private constant used only as the pattern input, can supply positional
values through the standard iterator. Custom iterators require separate effect analysis.

Core's `createOpaqueOperation(executor, metadata)` stores the executor. Evaluating the arguments
and reading metadata happen during construction. A metadata getter can therefore require a
specific execution target even when the executor remains dormant. Looking up the domain can
run an inherited getter. When construction snapshots keyed metadata, it reads enumerable own
values, including additional fields. An ordinary unkeyed domain alone needs no such copy. A later
`executeOpaqueOperation(operation, target)` calls the stored executor with the operation as its
receiver and the target as its argument. When the compiler resolves the public Core declaration
and traces a direct operation or immutable local reference to a known executor, its platform
requirements apply at that later call. Dynamic operation origins and metadata hooks whose
execution depends on a runtime value can retain unknown effects. An explicit server task with
such inputs must still use server-compatible hooks.

Compatibility adapters may own foreign functions and explicitly bridge them into a compiled eXact
boundary. Genuinely runtime-dependent children remain supported inside compiler-declared dynamic
ranges. Neither case makes an arbitrary function a native component.

React compatibility uses one fixed client island and one fixed server island. React component
values remain opaque props of those artifacts; the runtime does not manufacture a native artifact
for each value. Native children that pass through React ownership cross as opaque supplier
operations with no type, topology, or VNode-materialization surface. The supplier retains range,
update, Activity, and disposal ownership regardless of whether its output is text, an intrinsic,
another component, a collection, or empty.

The runtime currently calls the opaque compiler-issued component operation a `ComponentReceipt`
in several private identifiers. That value is a claim ticket for an already selected artifact's
construct, attach/adopt, receive, and dispose operations; it is not a rendered-node description.
This is distinct from a **prop receipt**, which is one atomic delivery of finalized parent-owned prop
values to the retained child instance.

Component-input version 6 marks compiler-created prop readers separately from authored reactive
values. Acquiring a marked reader removes exactly its compiler layer. A returned reactive value
keeps its identity and is neither read nor structurally compared during acquisition. Ordinary public
reactive and scalar-child behavior retains its own contract.
Eager child recipes preserve marked compiler operands as atomic values until receiving acquisition.
The receiving DOM or SSR occurrence samples that layer before flattening its authored array result.
Ordinary authored child arrays continue to flatten in source order.

A compiled prop receipt also carries the actual lexical supplier instance. Its exact artifact
update contract validates that instance, while the rendering parent continues to own placement and
context. Wrappers and multiple instances of the same definition do not change the supplier. A
consumer acquires new supplier membership provisionally, commits after input delivery, and retires
the previous membership. Reentrant replacement and disposal invalidate obsolete preparations.

DOM and SSR import the required private component-input operation capability and validate their
independently generated provider version before receipt redemption, direct adoption, or server
output. The previous private operation export is removed. Render-program version checking alone
does not cover component-only artifacts. Matching compiler, core, DOM, and SSR providers are
required at version 0.8.0 or a compatible later release for this unpublished contract.

Version 5 gives every component operation an eager children recipe or a private children-input
reader. A closed native operand plan, including a closed zero-dependency plan, keeps the eager
path. An incomplete plan uses the receiving occurrence's acquisition scope. The public rendering
and hydration roots still require a component operation, including when its output is a range.
No component kind is replaced with a range operation to make a fallback mountable.

Inspection exposes only inert component identity metadata. Every eager or reader acquisition
requires independent provider generation and target admission before constructors, readers,
hydration markers or output effects. Matching duplicated core modules share the existing
version-isolated receipt table and server-reference brand. Incompatible issued inputs carry a
realm-stable failure discriminator that nested adoption paths must propagate. An authored object
with matching-looking fields cannot redeem a private recipe. The old unrestricted payload reader
and old issuance/root entry exports have no compatibility aliases.

A receiving consumer captures a local attempt identity before authored reads, even if the incoming
receipt and reader are unchanged. Post-read, delivery and flush fences prevent an obsolete outer
attempt from publishing over a newer handoff. Hydration distinguishes supersession from markup
mismatch, and an obsolete client handle cannot dispose the newer renderer.
Mismatch reporting and form-focus restoration recheck the same receiving attempt before
subsequent fallback, control or ownership writes. Application reporting callbacks may render a
newer root and return without authorizing the obsolete attempt to resume. Scheduled SSR sibling
preparation retains cleanup ownership before acquiring any later reader or nested slot.
A failed preparation preserves accepted inputs only
before delivery. Unused provisional attachments abort their own scopes, without rolling back
ordinary authored side effects. Actual output sequences carry one-use receiving entries through
preparation and construction. Operation identity validates an already selected entry, rather than
recovering an occurrence after an arbitrary authored pick or reorder.

SSR writers retain an ordered slot cursor with their prepared output. Each component position
carries its selected occurrence into traversal, including child slots normalized into an array.
The source handle validates that carried position. Component execution gives its descendants a
separate preparation frame, so an opaque selection has its own receiving occurrences. A writer
that prepares component inputs must forward occurrences through the existing traversal target.
Abandoned entries remain owned by the program cleanup boundary.

SSR occurrence records retain the accepted effective children input through same-execution copies
and intentional resumption views. A delegated `props.children` getter is sampled once for that
occurrence, including an explicit undefined result. Explicit recipe children suppress that getter.
Other prop accessors keep their original prepared-props receiver. Their authored nested
`this.children` reads remain ordinary reads, while the execution view's direct children property
retains the captured value. Callable data values stay exact and unbound. A fresh final stream execution owns fresh inputs and pairs
its publication with its output. See [child composition](child-composition.md) for the observable
children-getter and supplied-placement limits.

Opaque operations carry a realm-stable identity brand so two distinct handles are never collapsed
by structural reactive equality merely because their public objects are empty. The brand is not a
discriminator and exposes no operation kind, output shape, topology, or target payload; those inputs
remain in issuer-private storage.

DOM sibling selection reserves an unchanged opaque handle only when it appears once in both the
old and new unkeyed lists. This happens before positional fallback can consume its range. Authored
keys remain authoritative, and repeated handles retain their existing positional or refusal policy.
The reservation is local to that sibling pass and grants no cross-parent relocation authority.

That private storage uses a protocol-versioned realm registry. Equivalent duplicated runtime
modules share redemption authority within the realm, so package duplication does not require a
public `kind`, `type`, topology field, or materializer. Reactive props and collections retain the
handle itself as opaque identity; they do not proxy its empty public object.

An explicitly selected React compatibility operation installs the complete private interpreter its
foreign tree may require. The compiler cannot know whether an imported React package will produce a
host node, Suspense, Activity, a portal, or another React component. Owning those cases inside the
precompiled island does not make their interpreter reachable from native-only artifact graphs.

During unfinished document hydration, an explicit `render(operation, document.documentElement)`
starts a render update. Accepted scalar bindings on the matched nodes receive the new values,
including coalesced and empty text. Ordinary document hydration still checks the server values
strictly. This does not permit replacing an incompatible document structure.

## Artifact responsibilities

Application roots are assembled by the build adapter, not discovered as a singleton by the
component compiler. The compiler returns component-local IDs, import edges, target reachability,
registrations, operations, and boundaries out of band. The adapter combines those facts with the
bundler's configured entry points and resolved module graph, so an application can mount or hydrate
several independent roots without giving any component special global status. Descriptive build
inventories are consumed and erased; runtime chunks retain only the selected executable artifact
data and transport registrations they actually execute.

Every authored mount call is still compiler-owned. After JSX lowering, the compiler redirects the
call to the focused root entry for the emitted operation: component artifacts use the component
root ABI, compiler-closed static trees use the render-program root ABI, and dynamic intrinsic trees
use the intrinsic root ABI. A local alias or parenthesized JSX expression does not reopen the public
renderer. Calls whose value was not issued by the compiler remain untouched and cannot accidentally
enter one of these private root entries.

The compiler's internal `root` implementation role means the public implementation at the root of
one component partition. An artifact graph's `exposureRoot` means a module export. Neither is an
application or page root.

A target-local artifact owns the component-specific decisions for:

- stable component and implementation identity;
- state layout and initialization;
- prop inputs and dependency edges;
- DOM creation or hydration claims;
- event and binding installation;
- child-artifact construction;
- lifecycle, context, ref, list, localization, task, and inspection capabilities;
- SSR emission and hydration publication for the selected target;
- cleanup and ownership transfer; and
- explicit generic regions whose shape cannot be proven during compilation.

Component discovery is independent of a module's JSX extension. `.ts`, `.tsx`, `.js`, and `.jsx`
source modules can all define native components. Published packages emit separate client and server
module trees and select them with package export conditions; they do not publish a manually branded
universal function as a substitute for compilation.
Vite development may serve browser modules and load SSR modules through one plugin instance. The
adapter selects the target for each Vite request: browser transforms use the configured client
projection, while `ssrLoadModule()` transforms use the paired server projection. Imports of
compiler-owned `.exact.client` and `.exact.server` modules are positive native ownership evidence;
React compatibility must not wrap those physical artifacts as foreign components. Installed
`@exactjs/*` packages stay in Vite's SSR module graph so renderer facade redirects, server export
selection, and enhancement registration share the same catalog. Vite's default dependency
externalization would bypass those resolver hooks; applications do not need to register
renderers manually or add an eXact-specific `ssr.noExternal` rule.
Bun resolves renderer facades to physical modules using the build target and export conditions.
On Bun versions without a working plugin `build.resolve`, one bounded resolution-only worker process per build generation
selects the provider without evaluating its source. Resolution decisions belong to the build
generation; completion, failure, and plugin disposal close the worker. Generated `.exact.client` and `.exact.server` artifacts retain their authorization
facts even inside `dist` or installed packages; they are not recompiled as authored components.
Webpack preserves generated artifact code and erases any remaining TypeScript without lowering
components a second time. The loader carries optional-facade provenance back to the owning plugin,
which authorizes the original provider edge before loading the facade. Exclusion replaces the
whole facade with a callable pass-through implementation, not an empty provider module. The
inspection catalog and component-authorization manifest share one build identity by default.
All three adapters use shared adapter support to restore compiler-marked physical enhancement
facades to optional edges in the consumer's graph. Publication-time provider presence cannot
force execution or prevent activation in a later consumer. Missing requested providers select the
pass-through implementation; malformed exports and missing nested dependencies remain errors.
Webpack preserves its target's default export conditions alongside eXact's conditions, so a browser
bundle selects client artifacts. Its normal resolver handles `.exact` imports, and its loader
erases ordinary TypeScript bootstrap code as well as compiler output.
The package root and every public or framework subpath select the same conditional tree. A server
entry cannot resolve the root through `dist/server` while a narrow helper silently resolves through
an untargeted `dist` graph, because that would duplicate capability registrations and retain both
target implementations in one bundle. Compiler-selected registration modules are declared as
package side effects; ordinary unselected modules remain tree-shakeable.
Published component-library facts preserve both the resolver-selected package facade and the
target-local compiler artifact that owns each component. Consumers authorize the facade but attach
the compiler facts to the owning artifact, so relative component imports, target placement, and
transitive authorization retain the same module base used during compilation. These facts are
emitted from the successful client and server compiler results; package builds do not reconstruct
component graphs by importing built JavaScript or scanning for legacy runtime brands.
The protocol-1 facts are inert JSON: they contain component identities, target-local module paths,
imports, and enhancement edges, but no executable functions or source text. A nested installed
dependency publishes the same conditional client/server exports and facts as a direct dependency.
Consumers resolve and validate those files without recompiling or recursively reading dependency
source, then compose the selected executable through the same ABI used by a local component. A
component library does not publish an executable target-neutral fallback.
When a component delegates setup through a local helper, the compiler follows a direct call or a
receiver-preserving `helper.call(this, ...)` edge to the lexical render arrow created by that helper.
The helper's lifecycle, context, ref, reactive, list, localization, and task requirements widen the
calling component's selected ABI. The generated component invokes the setup helper once and uses
its returned render closure directly; it does not add another callable or a generic render lane.
Direct compiler and CLI calls that omit a target emit the specialized client artifact. Executable
compilation accepts only `client` or `server`; target-neutral structure remains private compiler
analysis and cannot be published or passed to a renderer.

Shared runtimes provide narrow operations such as setting text, installing an event, claiming an
element, managing a range, or running one selected task policy. They do not rediscover the
component's topology or interpret a universal component plan when the artifact already knows it.

Optional authored component methods install descriptors once on the shared compact component base
when a genuinely dynamic or extracted access keeps that surface reachable. Concrete component
classes do not register their prototypes during ordinary module evaluation. Canonical compiled
`this.map()` sites call the focused list operation directly. The compiler-selected list module also
retains the authored method descriptor for valid unstructured or reactive expressions that cannot
yet use that direct lowering; this compatibility within the native authoring surface does not add a
per-class registry.
Browser-target artifacts carry only their specialized template, claims, readers, bindings, and
update program. They do not embed a second generic VNode description of the same region; a same-build
hydration mismatch is recovered at the owning root boundary.
Claim opcode 8 describes a compiler-proven whole-intrinsic text run as literal strings and scalar
slot indices. Initial bindings supply the scalar values, and hydration validates and splits the
server text before assigning the independent slot nodes. This additive unpublished-baseline
extension requires a matching DOM runtime for new output; existing claim semantics are unchanged.
Durable component setup installs its component domain and reactive ownership scope through one
focused call around the compiler-selected setup operation. It does not allocate an adapter closure
whose only work is entering the second ownership context. General output and fallback functions
remain executable and retain their existing watched or compiled output owners.
The artifact also stores the selected render-only, task-only, or durable instance constructor
directly. That shared constructor reads the artifact's immutable `instantiate` member through the
artifact-method ABI; generated modules do not add wrapper arrows whose only work is selecting the
same instance class and forwarding construction arguments.
Fresh mount and same-build hydration invoke the same artifact-owned `attach` operation with an
explicit mode. The DOM supplies either a placement target or a bounded hydration cursor, while the
artifact supplies its already-normalized output and generated claims. Successful hydration does
not decide component ownership from the JavaScript type of the authored value, and a failed claim
re-enters that artifact through `mount` mode after the stale root range is retired.
Client-island registries resolve compiled components, but activation still issues the same opaque
component operation as compiled parent composition. Both empty-boundary mount and markerless
adoption consume that operation directly. Hydration does not manufacture a function-typed VNode as
an intermediate component representation.
All compiler-proven direct updates belong to the component artifact. Each dependency identifies
its compiler-indexed component storage slot, and each dirty bit selects a generated
text, property, or structural-child call. Forwarded reactive props join that exact field binding
rather than forcing the child program through a general render watcher. The compiler emits as many
32-operation mask words as the component requires; a large component does not fall back to a
runtime lane registry, per-region subscriptions, or a render-program updater. JSX outside a native
component can use ordinary expression bindings, but it cannot manufacture a second implicit
component update owner.

Dependency setup resolves every indexed group and forwarded reference before acquiring subscriptions.
A missing group refuses the binding without installing a listener or target. Publication storage is
initialized before acquisition, and owner state and target membership commit only after acquisition
succeeds. Failure attempts every acquired cleanup and preserves the original error. A version scan
after commit includes mutations caused by forwarded-value evaluation during preparation. Replacing
a live forwarded source acquires the new subscription before releasing the old one. Authored evaluation
can replace that source again or dispose its owner. A pending replacement commits only while its
captured binding record and current input still agree, so nested publication retains the newer source
and every superseded provisional subscription is released.

An exported operation factory therefore finalizes its ordinary function parameters when it creates
the operation. It does not wrap those parameters in forwarded-reactive readers because no durable
component instance owns such a reader. When a compiled component passes one of its props to a
child, the parent artifact instead emits the normal receiver-owned prop receipt and update route.
Scalar expressions composed from several top-level state or prop slots share one generated update
operation whose mask is attached to every input slot. Arithmetic, comparison, logical, and
conditional composition therefore reruns through the component artifact without allocating a
retained watcher per DOM binding. Nested object reads, arbitrary calls, and deferred functions stay
on the reactive lane unless their complete dependency semantics are separately proven; a top-level
slot change cannot safely stand in for an observable nested mutation. A nested prop selection retains the complete reader,
including selection of its receiver, so replacing that receiver rebinds the member dependency.
Parentheses, type assertions, non-null assertions and `satisfies` preserve that dependency.
Only a stable declarative callback receiver uses the compact receiver/key operand. A nested reader
also retains its compiler layer when it returns an authored reactive value or callable. Acquisition
preserves that payload's identity without reading or invoking it.
Static native-component slots are installed through the referenced client artifact. The parent
publishes one final value per compiler-indexed prop slot; the receiving artifact compares those
values, owns prop dirtiness, and applies at most one atomic update without allocating a partial
props object. Construction, attachment, receipt, and disposal therefore do not classify the
child's interior or route child operations through a generic function-component lane. The same ABI
applies whether the child eventually owns text, intrinsics, other components, or a focused dynamic
range. Dynamic component identity and unresolved authored dependency surfaces continue to own an
explicit structural reaction selected by the compiler.
When a compiler-created synchronous relationship is exactly one prop read and one direct indexed
state write, the client artifact also carries an immutable input-update plan. The read may be the
whole prop slot or an exact property path below it: in both cases, replacement of that indexed root
prop is the complete invalidation identity. Its initial operation remains at the authored setup
position, while later prop receipts collect exact changed slots and apply the receiver's plan once
after the complete batch is staged. Authored calls, multiple dependency roots, observable nested
mutation, and other computations retain their reactive owners; the plan contains no
component-instance values and is not a general expression interpreter.
Compiler-created enhancement providers remain ordinary semantic parents for contexts, refs,
lifecycle, and inspection, while their descendants retain the authored component as the owner of
compiler-indexed update targets. This prevents a transparent provider's unrelated state layout
from receiving a descendant operation's dirty mask.
Optional `hasContext()` probes resolve the original context token when the authored call executes.
An ordinary imported helper's probe does not need a pre-activation metadata attachment. Available
component-owned token identities and explicit `markExactEnhancementContexts()` optional metadata
remain intact. Enhancement peer ordering uses `provides` and `requires` before setup; optional
probe metadata does not impose an ordering dependency.
For a component whose sole ordering dependency is an ordinary helper's single read or write,
the attachment can use a named value import of the same shared context constant. The compiler
checks the declaration behind import aliases and re-exports. This direct path covers constants
initialized with the public `createContext` default policy. Other dependency compositions keep
their existing order and metadata source.
Both ordinary and wide update programs resolve that owner through the same rule. A child receipt
can supply its owner directly, without a render-program wrapper. Programs with more than 64
operations preserve the same ownership and cleanup behavior as smaller programs.
An authored render helper that returns opaque output owns the component's observation range. The
compiler only treats a helper call as a one-time finite program when its same-project implementation
is proven to return JSX that is compiled for the same target.
The dependency source is itself part of target specialization. An update artifact whose complete
dependency set is component state imports a state-only binder with one indexed target/version
table. Mixed artifacts encode a counted prefix of prop slots followed by state slots; they do not
repeat source or property-name strings, rebuild binding-index tables, or resolve the component's
property layout per instance. Only artifacts that read props import the forwarded-reactive prop
subscription lane; state-only applications do not retain that machinery merely because the
framework supports reactive props elsewhere.
Foreign-namespace template construction preserves the authored intrinsic tree, including tags
that would otherwise trigger HTML parser namespace changes. Compatible templates retain the
native parsing path, and repeated programs clone a namespace-specific cached template. The cold
fallback preserves case-sensitive attribute spellings and literal whitespace, and uses native HTML attribute setters when
constructing elements at integration points.

Standalone component render programs inherit the namespace of their physical attachment. Explicit
`svg` and `math` roots establish their own namespace. Lexically nested dynamic regions retain that
inheritance, and SVG `foreignObject` and MathML text integration points restore HTML children. MathML
`mglyph` and `malignmark` retain their namespace within text integration points. Static HTML
`annotation-xml` encodings can use planned attachment. Dynamic encodings use ordinary intrinsic
attachment, which resolves the initial encoding before constructing children. Later range
construction reads the current owned encoding, including when visibility and encoding change in
one batch or an intrinsic receives new props. This uses the existing value without an additional
observer and releases its retained input with the element. The same
component can attach under HTML or SVG without being specialized to a consuming application.

Native intrinsic property groups keep spreads and explicit properties in source order. Literals
remain in the ordered writer when any spread is present, including literals that precede a
spread and must become effective again after a key is removed. Spread copying observes the
reactive object's own fields and keys rather than enumerating its raw backing object.
The same observation rule applies to generic property bindings and compiled text projection.
Inside a text-only host, intrinsic spread bags are copied under the host's retained observation.
Their serialized markup updates while the host's DOM identity and live control value remain owned
by that host. Ordinary component invocation children retain their existing prop receipt contract.
Text projection omits renderer identity attributes on both the server and client. A compiled
component used inside a text-only host produces the same inert attributes as an ordinary
intrinsic, so strict hydration can retain that host.

The component list capability follows the same rule: `this.map()` returns one focused child-range
operation whose entries are opaque keyed child operations. Native component prop spreads retain an owned child range that
republishes the copied prop bag when its source reads change. Its outer operation resolves the final
authored component key from the current cached copy, including keys supplied or overridden by
spreads. Evaluation waits until the owning provider prepares its environment. Obtaining sibling
identity does not repeat authored evaluation. Server copies use a cached deferred range without
allocating a reactive observer. Normal SSR and island fallback
SSR emit matching ranges for hydration; stable keys retain child instances across publication. Every cached key owns a reactive effect
scope, DOM reconciliation transfers that scope with the keyed range, removal stops it, and
hydration claims the corresponding server item range. Native list execution never creates a
Fragment VNode or exposes its cached child topology to the component.
Pure locals declared inside a rendered map callback belong to that retained item scope. When such
a local derives from component state or props, the client artifact emits an item-owned computation
so counts, branches, and nested keyed collections observe the same current result rather than the
callback's initial snapshot.
When a render arrow returns an otherwise unstructured value such as `props.children`, the client
artifact marks that authored render function as its component-range output operation. The existing
component boundary owns its dependency subscription and child reconciliation; the artifact does
not allocate a nested generic dynamic VNode, import a wrapper helper, or emit another marker pair.
Dependency changes still publish even when the resulting VNode is structurally equal, because
ownership refreshes such as a remote-domain replacement are semantic operations rather than value
memoization. This is a compiler-selected boundary lane, not the universal watched-render fallback
used by explicit compatibility and test artifacts.
When the client artifact selects this focused component-output range, the paired server artifact
emits the matching range topology even though the server does not install the client's update
subscription. Hydration can therefore claim the same structural boundary without asking what the
opaque output contains or reconstructing a client-only classification.
Framework-owned renderer roots likewise use an explicit compiled render operation. The renderer
invokes that operation when the public root value changes, so no compilerless component watcher or
additional dynamic marker is required around the application.
Compiler-proven top-level state reads use the artifact's deterministic numeric state slots rather
than re-entering the inspectable state's property proxy. That numeric lane tracks the same
target/key dependency graph as ordinary property reads, so computed freshness, transactions,
rollback, scheduling, and teardown retain one set of reactive semantics. A checker-proven,
non-invalidated alias of the complete state facade uses the same indexed lane; nested aliases,
dynamic keys, external consumers, and DevTools continue through ordinary property semantics.
Direct server frames use their plain request-local state records and do not import this client-only
access lane.
Compiler-proven top-level props reads use a separate deterministic layout on the reactive props
facade. Initial construction seeds that layout without publishing false changes, and later parent
updates reconcile through the same numeric dependency identities. Every compiled definition emits
state and props layouts, including empty layouts, so component construction never infers a generic
storage lane from missing metadata. Dynamic property access extends the same facade, while
`children` preserves its renderer-owned passthrough identity. Generated client islands retain the
parent state layout instead of renumbering a serialized subset; their synthetic transport props
receive a separate compiler-owned layout. Direct server artifacts carry the metadata for target
contract consistency but continue to read plain request-local state and props without constructing
client reactive storage.
Island ownership follows rendered state consumers, including references reached through chained
setup-derived bindings. Intentional setup snapshots do not expand the JSX boundary. Conditional
and short-circuit list expressions retain the same keyed item boundaries in server output and
client adoption as directly rendered maps.

Replacing a live prop source must rebind its consumers even when its current value equals the old
source's value. Indexed and general props preserve the identity of independently observable sources.
Indexed props also preserve compiler property
operands, including the operand's source object and property. Reconciliation can retire an old
keyed item's source scope only after retained children receive the replacement source.

Native array iterator reads establish sequence dependencies even when their elements are objects
whose fields have not been read. Shared shallow copies must react to insertion, removal, replacement,
and reordering. Element field subscriptions remain separate from that sequence dependency.

Canonical top-level client assignments, updates, and deletes use the same numeric slots directly;
compiler-generated intrinsic and component binding callbacks preserve that slot proof even when
their handlers move into a generated client island. A checker-proven alias of the complete state
facade retains the same numeric identity inside nested callbacks. Nested-state aliases and dynamic
references retain path-based operations because their final target is runtime data.
Compiler-synthesized computation and task wrappers consume the same analyzed write identity; they
do not reconstruct a string path merely because the authored assignment moved into managed work.
Selected scalar references retain the actual parent and raw computed key across RHS evaluation.
Existing write and delete helper signatures serve those references through a single-key path,
with numeric slot commits retained for proven top-level client fields. Logical skip arms perform
no commit. Lean server task artifacts import those existing operations only for publishable task
work. Setup-only storage remains plain. Key conversion at the native operation supplies the
canonical successful publication key without changing the helper signature or wire schema.
This direct-property repair does not instrument separately compiled ordinary helper bodies.
An authored function task referenced by an interaction owns one durable compiled definition at its
declaration. A setup call to that function invokes the same binding and does not create a second
task transition or clone its work and dependency readers.
Client render programs use only dense, zero-based compiler indexes in immutable component-local
claim and binding tuples. Shared focused DOM operations execute those tuples; the compiler no
longer emits one structural binder closure per program, and hydration does not build a node table
or string-identity map. A scalar text binding whose complete value is one compiler-proven indexed
state or prop read carries `[source, slot]` in that immutable wiring (`0` for state and `1` for
props). Its focused text operation reads the durable component instance's existing indexed facade;
the invocation does not allocate a reader closure or an operand array. Derived values, nested reads,
structural work, and arbitrary authored expressions retain executable readers and their existing
reactive computation ownership.
The compiler owns the `data-exact-id` attribute. This reservation also applies to native `_` and `_target` host contributions. Authored native attributes and known spread properties using it are errors. Opaque physical-host prop bags are merged normally before the compiler installs an enumerable symbol-keyed physical address, preserving string and symbol getter effects without accepting that bag as protocol authority. Physical metadata is installed last. Native renderers ignore reserved ASCII-case-equivalent string keys and serialize the physical address once. Structural contributions neither supply nor override the selected host address, including during target composition. This metadata is not operation authority.

`data-exact-id` remains a separate identity only for operations that must address a live DOM target,
such as authorized server patches and interaction replay. It is not a second render-program ABI.
Generated server writers preflight each dynamic input into a compiler-named local and pass that
value directly to its serialization operation; the runtime does not rebuild a per-region slot
table or allocate a receiver merely to replay the compiler's ordering. The initial public
render-program ABI baseline is version 1 and includes the direct stateless operations and
statically selected server-child operation. A final static write in a compiled body may supply
its closing-tag UTF-16 offset as the optional third argument to `static`. This is a buffering hint:
ignoring it preserves the exact markup and hydration protocol. The SSR runtime applies it only
inside the normalized document body and only when the destination supports retained boundaries.
Pre-baseline development versions are not public
compatibility targets. Server artifacts return a branded
prepared invocation directly to the SSR component lane; they do not allocate a render-program
VNode and send it back through ordinary child normalization and kind dispatch. Durable fallback
components likewise preserve raw compiler output until SSR has selected that invocation or the
ordinary child path. The SSR walkers therefore do not retain a second executor for client
render-program VNodes; reaching one is an invalid target artifact rather than a compatibility
selection. Prepared server invocations can also appear as compiler-owned children inside a
dynamic or keyed range; those ranges execute the same direct server ABI instead of coercing the
invocation as authored data. When a server render-program component slot selects a compiler-known
callable and needs only finalized plain props, the generated writer retains that callable in its
immutable module-level plan and carries only the request-owned props through slot preparation. The
synchronous target issues the selected child artifact directly without first allocating a prepared
component reference. Child-bearing, keyed, enhanced, spread, dynamic, and lazy forms retain the
general prepared-reference operation, and deferred execution reconstructs that operation before
leaving the focused writer. Direct server components capture
compiler-known child slots during request-local task issuance, allowing independent child work to
start before the writer publishes those slots in authored order. Generic components retain lazy
slot evaluation where reactive stabilization remains observable. A compiler-closed server region
omits its generic VNode recovery factory. JSX interoperability is decided at the rendered component
graph rather than for the whole module: a local direct graph can remain closed even when another
component in the module uses a foreign boundary. A graph with a generic, imported, client-owned,
enhancement-owned, or general-child descendant retains the ordinary renderer.

Each generated synchronous server program also carries the exact UTF-8 byte total for its
compiler-owned static spans. The request-owned output sink charges that immutable fact once, counts
dynamic escaping and known ASCII delimiters as they are produced, and restores the ledger with the
component attempt checkpoint on failure. Imported artifacts compiled before this optional fact are
charged at their individual static writes. A lane whose output provenance is not compiler-closed
invalidates the partial ledger and receives one exact scan when the completed root is committed;
it does not install a second renderer or weaken the output limit.

Server-only attribute planning can serialize native URL literals with proven safe prefixes into
the existing static markup fields. Dynamic URLs and target overrides retain runtime policy;
client attribute plans are unchanged. This uses the existing writer ABI and does not change the
artifact epoch. Static stylesheet links can coalesce into a document head without losing the DOM
structure that the paired client adopts.

A direct document child that is an empty external script with fully static safe attributes may
also be serialized into the document writer. Its generated element identity remains in that
markup so the client intrinsic adopts the same script. This uses existing static writer fields;
scripts requiring runtime attribute or content handling remain independent operations.

Portable UTF-8 accounting skips long ASCII prefixes with a native string search, then counts the
remaining Unicode code units, including paired and unpaired surrogates, without allocating an
encoded buffer. Short strings use the scalar counter directly. This is an internal counting
optimization; generated byte facts, hydration limits, and the compiled-component ABI are unchanged.
Adapter-supplied native counters also handle long dynamic text without HTML escaping and escaped
hydration payloads. Complete synchronous response producers can publish their final byte size
through the optional `setBodyByteLength` environment capability. Node reuses that size after
production and request cleanup, without changing emitted component helpers or artifact semantics.

Low-level progressive render responses retain the same ordered component output but expose it as an
asynchronous produced body instead of first routing every span through a Web byte stream. A Node
adapter writes those strings directly to its response and awaits transport drain before allowing
the producer to continue. Fetch-compatible adapters receive a demand-driven UTF-8 stream whose
encoding remains at that environment boundary. Request handlers that must settle status, headers,
or preload metadata before publication continue to buffer that decision; the produced body is not
a second component execution path or a promise that every server response can commit immediately.
Lazy response body and stream views use shared accessors over each response's own body source.
They remain enumerable own properties and preserve single-consumer claims and request cleanup;
constructing a response does not allocate an accessor closure for each view.
When a synchronous component still requires a recoverable boundary, the executor checkpoints the
request-owned sink and temporarily suspends direct publication while that component completes. It
then commits the finalized range or restores the byte ledger and buffered-span length on failure.
Compiler-accounted synchronous component, child, and keyed ranges retain their valid byte ledger at
successful commitment rather than rescanning the completed string. Generated marker delimiters are
charged once as a combined byte-closed ASCII total. Opaque callbacks retain the rescan, as do ranges
whose provenance was invalidated or whose surrogate boundaries may have been reordered by late
wrapping. The latter guard remains conservative even if a subsequent delimiter flushed the pending
surrogate. Output limits and rollback remain enforced, without adding a compiled-component ABI method.
The sink does not allocate a callback wrapper for that transaction, and adding compiler-owned
markers to already-finalized output does not re-enter the renderer through another closure.

Hydratable execution reserves each compiler-selected resumption as its final request-owned indexed
tuple. The synchronous executor carries an opaque numeric capture token, publishes state and
context values by their cached schema indexes, and rolls the tuple list back with the component
attempt. Scheduled artifacts carry the same token on their issued request frame so stabilization
and replay retain construction order. Hydration validation allocates its registered-collection
encoding map only after encountering a collection that needs encoding. Positional conversion still
checks each field's current ownership: an earlier authored getter can invalidate an enumerated key
list before later fields are read. The normal hydration envelope consumes these tuples directly;
it does not construct named records and compact them afterward. An application that observes
`HydratableStringResult.resumptions` still receives the documented named activation shape through a
lazy request-local projection, and hydration output extensions retain that generic named-record
boundary. Neither projection is retained by the immutable artifact.

The compiler specializes authored `renderToString()` and `renderToHydratableString()`
when the root is a proven native component and the options cannot replace it or enable foreign
markup. These helpers retain root-marker proofs, not separate execution engines. Every helper
returns a promise through the shared renderer, which handles available output directly and
suspends for actual pending work. A literal `markers: false` selects an unmarked root; runtime
marker choices retain the request's marker policy. Non-empty output extensions and unproven roots
use the ordinary entry point and its output-processing boundary.

Direct component execution and compiler-closed serialization are separate proofs. A component
whose authored output forwards children or constructs VNodes through a typed helper can still run
on a compact request-local frame, even when the universal serializer must inspect that output.
Only a root whose complete reachable output graph has generated server writers selects the
compiler-closed renderer. This lets libraries publish flexible component output without forcing a
durable SSR component instance or overstating what the compiler knows about the resulting tree.

Context-bearing direct frames carry only their logical parent, request ambient contexts, and a
local context map. Generated `getContext()`, `hasContext()`, and `setContext()` calls therefore keep
normal nearest-provider semantics across direct and durable descendants without allocating an
effect scope, state proxy, lifecycle registry, or generic context capability. The frame is passed
as the descendant owner during serialization and is discarded with its request. Direct SSR stores
provided values as request-local snapshots rather than client reactive proxies: the server has no
later observation pass, while descendants still receive the same authored object identity and the
latest nearest-provider value. Built-in error state is allocated lazily per request domain and held
through a weak key, so one request neither observes another request's reports nor leaves a durable
request-owned heap root.

Canonical server logging is also a direct-frame capability. A logging-only component receives its
component identity, logical parent, request domain, and ambient contexts without allocating the
context map or any durable instance machinery. A context-bearing frame already has that ownership
and serves both capabilities. The shared logging operation checks the current request logger and
level before evaluating generated message or data readers, so disabled logging remains inert while
logger changes inside a request remain observable.

Canonical component localization uses that same context-bearing direct frame. The compiler lowers
`this.intl` and recognized native Intl operations to the same component-owned localization operation, and the operation caches one stable facade
against the request frame while resolving the current localization policy through ordinary nearest-
provider context semantics. A localized server component therefore does not allocate a durable
component instance, effect scope, state proxy, or generic localization surface solely to format
output.

Canonical server ref operations use a separate request-local ref lane. Because SSR cannot publish
a DOM target, `readRef()` and `refs.get()` initially return `undefined`, while `ref()` still returns
one stable binding per key and preserves explicitly authored `fulfill()` calls. `refs.root()`
returns a stable empty server lifecycle and enforces the same owned-binding and single-explicit-root
invariants as the browser runtime. This lane allocates its binding map only when a binding is
created and does not install reactive ref storage, the generic ref capability, or durable component
ownership. Extracted, dynamically selected, and forwarded ref APIs remain conservative because the
compiler cannot prove which operation they eventually invoke.

Canonical `this.reactive()` values also have a direct server representation. The compiler links
setup-time calls to a small request-local readonly value whose observations execute the generated
reader against the current direct-frame state. Reads intentionally do not cache: generated server
tasks mutate plain frame storage, and caching without a dependency graph would preserve stale
pre-task state. The value retains ordinary `get()`, unwrapping, JSON, and primitive-conversion
semantics without constructing a computed node, dependency sets, scheduler hooks, or effect-scope
ownership. Extracted or dynamically dispatched reactive factories remain on the durable lane.

Canonical server-visible lifecycle operations are linked through the same artifact rather than
forcing durable component construction. `onRender()` observers and `onUnmount()`/`own()` cleanup
use a lazy sidecar keyed by the request-local frame; the artifact exposes the renderer hooks that
run them after each render attempt and after the complete component subtree. Cleanup removes the
sidecar before invoking authored work, runs every registered callback, and preserves a primary
render failure when cleanup also fails. Context and logging frame selection remains independent,
so lifecycle does not create a matrix of combined frame constructors. Extracted, optional, or
dynamically selected lifecycle operations retain the generic lane because their registration
semantics are not compiler-closed.

Static SSR capability installers use one bundle-local ESM registry. It contains only
module-lifetime functions selected by reachable server artifacts; request state and component
instances never enter it, and omitting an installer still lets bundlers remove the corresponding
implementation from specialized targets. Server builds must deduplicate `@exactjs/ssr`; duplicate
package copies are a build-graph defect rather than a reason for framework modules to mutate
`globalThis`.

Every SSR lane uses the request's single normalized stabilization budget. Direct writers, generic
instances, enhancement planning, boundaries, and task drains therefore fail at the same configured
limit instead of carrying lane-specific retry counts.

An interaction-only client boundary is valid only with a compiler-emitted lazy loader and its
bounded activation target metadata. An already-loaded component is an eager registry entry; the
runtime does not infer a blanket event policy from an interaction marker or reinterpret that entry
as a deferred artifact. This keeps listener selection and replay authority in generated output.
Each compiled registry key is itself a target-local render artifact. An eager key reuses the
selected component's compiled constructor and target operations while retaining the registry key
as selection identity. A lazy client key owns one generation-fenced readiness range; its finite
candidate is already compiler-proven and is not reclassified as an open component value. A lazy
server key resolves once, then invokes the selected server artifact through the same ABI as an
eager key. Registry selection therefore does not inspect component kind or choose an execution
lane at render time.

Capability planning is target-local as well as component-local. The compiler keeps authored
surface facts separate from requirements propagated through receiver-forwarding helpers, then
projects only expressions which survive each target's lowering. For example, a `ref` attribute and
its binding expression are client behavior and do not select ref storage or durable component
construction in the paired server artifact. Canonical server-observable ref operations select the
focused direct-ref lane. A dynamic component member, extracted ref method, or unresolved forwarded
helper remains conservative and retains the generic capability.

Client construction is linked by the artifact rather than inferred by the runtime. The compiler
imports one target-local constructor and stores it in each component definition. An artifact with
no lifecycle, runtime-managed list, or task ownership selects the compact render record: state,
props, scope, render operation, activity state, and inspection identity only. Artifacts that
own tasks or interactions without lifecycle and list ownership select the task record, which adds
only task ownership and teardown. Artifacts that declare lifecycle or list ownership select the
full durable record. The common mounting
entry invokes the linked constructor without importing either implementation or branching on ABI
bits. All three records implement the same observable component-instance contract and share
process-local diagnostic identity, but each narrower lane cannot accidentally allocate capabilities
owned only by a wider record.
The native function value is itself the carrier for that prepared target artifact. DOM mount and
hydration adoption read its definition once and invoke the linked constructor directly, without a
separate identity probe or an identity-only construction fallback. Dynamic selection must choose
another compiled callable; foreign functions enter only through a compiled compatibility boundary.
Compiler-closed server artifacts instead link a fail-closed construction entry: they execute their
generated request-local frame and do not retain either durable client record merely to populate a
contract field. Sending such an artifact through generic instance construction is an error.
The SSR owner resolves the current server artifact at each native component boundary. A
compiler-proven synchronous JSX root executes setup and its prepared server program directly into
the request-owned sink; the compiler folds away the returned render closure, and execution owns
checkpoint, hook, rollback, and disposal cleanup without projecting an issued result. Forwarded or
arbitrary output retains its component-local callable contract. Scheduled artifacts separately use
`issue`, `write`, and `dispose`: issuance establishes the request-local frame and starts eligible
task work, writing publishes that frame in authored order, and disposal releases task, preparation,
context, and lifecycle ownership exactly once. A child imported from another module or package is
composed through the same ABI as a local child; the parent and renderer do not inspect or require
the child's source graph. These lanes behave identically on Node and Bun and construct no
client-style durable component instance.

Hydratable compiler-closed renders reserve request-local resumption tokens and publish their
compiler-indexed state directly into final compact tuples. Hydration publication places those
tuples into one request-owned, versioned positional envelope without reconstructing named records
or passing through the optional output-extension host. A presence mask fixes the order of optional
framework fields; unknown bits, missing values, and trailing values fail closed. Framework-created
envelope and tuple containers are structurally known to the validator. Compiler-declared positional
fields are read once with ordinary property semantics while their getter-free tuple representation
is constructed; nested open values retain descriptor-safe traversal. Selecting an output extension
retains the explicit generic transformation boundary, keyed envelope, and named public resumption
view.

Server artifacts can associate a version-one positional projector with a repeated finite record
schema through `@exactjs/ssr/runtime/positional-projection`. The compiler emits fixed property
reads for array-element object shapes with at least four fields. Registration occurs during module
evaluation, uses schema identity, and leaves the existing tuple representation intact. Client
artifacts retain only the inert schemas; the generated functions do not enter the browser bundle.

The SSR validator selects a supported projector once for an array of at least sixteen elements and
uses a separate loop. Short arrays, unregistered schemas, unknown projector versions, and diagnostic
traversals use the interpreter. These thresholds are implementation choices, not application
contracts. Each generated function preserves node and depth limits, active-path cycle tracking,
prototype and key-count checks, live ownership checks, and authored read order. Generic leaf values
still cross descriptor-safe validation. The runtime supplies object and array intrinsics so the
projector cannot capture similarly named application bindings.

The version-one context carries the traversal budget, active path, validation callbacks, and failure
sentinels. That version fixes their semantics; a future incompatible context must use a different
version and fall back for unsupported projectors. Components compiled without projectors continue
to work. This optimization does not change the hydration payload or require a new client decoder.

## Runtime inventory

| Existing path                                     | Classification                    | Required replacement                                                          |
| ------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| Compiler-attached component contract and identity | Compiled foundation               | Mandatory target-local artifact                                               |
| `markExactComponent()`                            | Ad hoc native fallback            | Removed; compatibility and fixtures use complete scoped artifacts             |
| `contract?.definition?.instantiate ?? type`       | Ad hoc native construction        | Removed; native construction requires artifact wiring                         |
| `ComponentInstanceImpl`                           | Universal native host             | Replace with artifact-selected compact storage and capability sidecars        |
| `defineTask()` in compiler output                 | Generic task fallback             | Emit compiler-selected computation or task lanes                              |
| `defineTask()` as an advanced runtime API         | Internal/advanced primitive       | Move out of the normal compiled runtime graph                                 |
| Generic VNode component mounting and adoption     | Dynamic/compatibility fallback    | Retain only for compiler-declared dynamic ranges and compatibility boundaries |
| `createComponentRegistry()` source declarations   | Native dynamic selection          | Compiler-only syntax; execution requires target-local facade artifacts        |
| Accessibility components                          | First-party native components     | Migrated to target-paired package artifacts                                   |
| Internationalization components                   | First-party native components     | Migrated to target-paired package artifacts                                   |
| Request provider                                  | First-party native component      | Migrated to target-paired package artifacts                                   |
| Theme components and enhancements                 | First-party native components     | Migrated to target-paired package artifacts                                   |
| Application theme preference components           | Repository application components | Migrated to target-paired package artifacts                                   |
| Form components                                   | First-party component library     | Migrated to target-paired package artifacts                                   |
| Gesture components                                | First-party component library     | Migrated to target-paired package artifacts                                   |
| Physics components                                | First-party component library     | Migrated to target-paired package artifacts                                   |
| Gravity components                                | First-party component library     | Migrated to target-paired package artifacts                                   |
| Motion components                                 | First-party component library     | Migrated to target-paired package artifacts                                   |
| Router components                                 | First-party component library     | Migrated to target-paired package artifacts                                   |
| Theme fixture components                          | First-party acceptance fixture    | Migrated to target-paired package artifacts                                   |
| Testing mount host                                | Framework testing infrastructure  | Migrated to a target-paired package artifact                                  |
| Microfrontend remote host                         | First-party native component      | Migrated to target-paired package artifacts                                   |
| Native third-party state providers                | First-party native components     | Migrated to target-paired package artifacts                                   |
| Time components                                   | First-party native components     | Migrated to target-paired package artifacts                                   |
| DOM root support                                  | Opaque runtime VNode boundary     | Migrated to a narrow target-local dynamic-boundary artifact                   |
| Testing mount host and fixtures                   | Test infrastructure               | Migrated to compiled hosts and explicit internal fixture artifacts            |
| React compatibility boundaries                    | Foreign compatibility             | Migrated to explicit target-local compatibility artifacts                     |
| Unsafe HTML, Activity, Suspense, opaque children  | Explicit dynamic operations       | Keep narrow region-local runtime capabilities                                 |

## Current rules

1. New framework code must not add an identity-only native component path.
2. New compiler output must not introduce a generic runtime operation when its policy and topology
   are statically known.
3. Native artifacts, hydration markers, render-program tables, and runtime capability records use
   only their current compiler ABI. Missing or obsolete shapes fail at the owning boundary.
4. A generic operation remains only for a compiler-declared dynamic region or an explicit foreign
   compatibility boundary, never as an implicit fallback for uncompiled native code.
5. Development inspection metadata may be richer than production artifacts, but production state
   must remain coherently inspectable through the artifact ABI.

## Completion conditions

The migration is complete when production first-party code contains no manual native branding,
native entry points require artifacts, simple compiled applications do not retain generic component
construction, and benchmark coverage confirms that only explicitly selected dynamic capabilities
execute or remain bundled.

## Array completion capabilities

Component revision 4 carries exact structured `arrayRoots` checker facts separately from write
authority and transported reads. Member-only facts require browser correspondence without granting
a server Array read or a root mutation. Generated client artifacts import capture, parse, plan and
apply from the narrow reactive Array patch entry. Root-writing server executors import capture and
comparison from the separate Array diff entry, plus the patch parser. Type-only core links retain
no engines. Generic codec retention for opaque nested values is independent of engine selection.
Closed validators require the corresponding executable function records before composition.

Array invocations require `arrayCompletion: 4`, including member-only operations. Allowlist dispatch
checks the scoped discriminator before state preparation, application payload decoding, executor
work or progress. Security and bounded envelope decoding retain their existing preceding order.
Success echoes it even for a net-empty completion. Unexpected or absent tokens reject. Each active
batch item owns its parser, and the same cancellation-filtered vector selects both request and
result context. Validated stream indices select that context for mutation and terminal events.
A non-Array sibling cannot borrow another artifact's parser. This discriminator grants no authority.

Standalone owned helpers call `assertArrayCompletionVersion(4)` before their fenced callback.
The Array completion discriminator remains 4 independently of the component input/provider generation.
The obsolete `taskMutation.selectedArray` response witness is removed. There is no unpublished
compatibility alias. Mixed providers fail module admission, helper capability admission, or scoped
request admission before authored operation effects. Render-program revision 4, library facts 1,
compiler process 1.0.0 and capability bit assignments are unchanged.

Compressed structural spans are charged for their materialized sequence slots through the existing
response `maxJsonNodes` resource policy before application. Defaults warn, while an explicit
positive cap rejects. This prevents a short sparse frame from bypassing the configured allocation
budget. Member-only frames do not materialize a sequence and retain ordinary graph accounting.

Generated event and function-task calls supply their admitted component executable binding.
Explicit root-state integrations select `continuations` and `continuationArrays` from
`composeExactComponentContracts([ClientPage], 'client')`. Pass both into `createExactClient` or
register them later with `client.registerComponents()` before invoking the opaque operation ID.
The client retains these target-local callbacks outside serialized document configuration.
Missing bindings reject before transport. See the [explicit root-state setup](ssr-hydration.md#state-transfer-ownership)
for ownership and publication behavior.
