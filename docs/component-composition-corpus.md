# Component composition corpus

The component composition corpus is the normative acceptance suite for native eXact compilation.

It lives in `packages/component-composition-corpus` and protects semantics that otherwise tend to
surface as isolated application regressions after compiler changes.
The ordinary package declaration build excludes native TSX fixtures and their test-support
harnesses. The compiler and Vitest configuration own checking and executing those authored sources.
The corpus keeps its Vitest root in the corpus package and explicitly declares `packages` as its
compiler application root. This shared test application includes the DOM and SSR fixtures it imports,
so host-selected local helpers remain inside the declared compilation and authorization domain.
Its compiler include set owns both the TSX fixtures and the ordinary registry control module they
call. These declarations cover the complete compiler-owned test application, including helpers
whose bodies participate in placement analysis.

Reactive ownership tests also protect synchronous observer handoff. A last-observer callback may
attach a replacement observer to the same dependency before cleanup returns. That replacement
must retain its subscription, including when other keys on the target remain observed.

Reactive property-creation tests protect key enumeration, membership, array length, and rollback
when a new own property has an unchanged read value. Missing `undefined` properties, array holes,
array extension, and inherited-value shadowing still publish structural changes. General and
compiler-selected object/array proxies share this contract. General proxies also cover custom
Map and Set fields. Raw-receiver method/accessor fixtures distinguish own-property enumeration
from native collection entry iteration and preserve rollback and unchanged-write controls.
Component prop tests protect TypeScript's shallow readonly checks, permitted nested mutations,
writable aliases, and retained reactive reads without runtime readonly enforcement.
Gravity's shared readonly journey covers writable field, attractor, metadata, vector, and sampled
array aliases, independent sample results, copied preparation inputs, and retained numeric
validation. The same journey uses source owners in package tests and public package exports in
native Node, Bun, Deno, workerd, and Chromium acceptance. Numeric policy and force failure/recovery
controls also run at the physics registration boundary.
The shared chart numeric journey checks finite extreme positioning and bounded tick progress
through the public scales entry in native hosts and Chromium. The simulation journey also checks
Physics writable aliases and independent inspection copies.
The shared Time value journey checks captured plan and binding getters, ordinary instant and
plan observations, synchronous wall-clock sampling, and a future finite deadline at large values.
The shared Time lifecycle journey crosses stale timer and wake callbacks, replacement, reentrant
subscription disposal, failed setup retry, and one captured timestamp across due registrations.
It also checks falsey wake cleanup failures, disabled and replaced timer fencing, reentrant
cancellation and scheduling disposal, and progress on the next timer. The shared Reactive settlement
journey checks independent callbacks after first and subsequent failures, callback coalescing,
reentrant later generations, exact falsey error identity, and subsequent progress in native hosts
and Chromium.
The shared Intl budget journey checks finite captured configuration, empty-artifact and zero
controls, Unicode normalization expansion, input getters that mutate caller limits, and one-time
limit capture across multi-message validation. It runs in source, native hosts, and Chromium.
The shared Intl protocol journey checks captured binding fields, strict string discriminants,
dense arrays, canonical serialization, companion validation, and prepared structure identity in
native hosts and Chromium through installed package exports.
The shared `theme-derivation-journey.mjs` exercises public deriver aliases, caller-owned nested
outputs, writable helper envelopes, independent data-color results, and ancestor-cycle rejection
in native Node, Bun, Deno, workerd, and browser runtime acceptance. The same journey also checks
private palette and CSS cache ownership, current scope definitions, captured temperament fields,
sparse interval rejection, and authoritative token validation despite public metadata aliases.
Scope ancestry controls reject cycles, capture each parent link once across CSS branches, and
resolve deep inheritance. Source controls include a 20,000-level chain. Structured color
controls reject unsupported spaces, null opacity, and authored map substitutions. Custom source
checks capture typography and inherited temperament getters once and preserve opaque class
metadata identity without putting it in shared palette caches.
The shared measurement journey checks ordinary presentation aliases, copied options, direct
locale writes, restored public generation values, reactive rollback, reentrant resolution, and subsequent formatting
through public Intl exports in native hosts and Chromium. Invalid unit names, including
inherited object properties, fail both presentation resolution and identity conversion. Public
environment method replacements and independent writable locale metadata supply additional
TypeScript readonly controls. Preference policy checks additionally cover caller-array isolation,
independent observations, one captured input across locale scopes, coherent publication, reactive
rollback, superseded propagation, and complete rollback when a scope rejects an update. Catalog ownership controls cover captured manual inputs, rejected-history
poisoning, replay after reactive rollback, and complete rollback when a locale scope rejects a
catalog update. Source controls also reject conflicting generated replacements while retaining
the prior registry and preserve catalogs added reentrantly during input capture. Existing generated locale scopes adopt lazy
catalogs and later revisions, preserve scoped manual overlays, and retain explicit-source
isolation in the shared native/browser journey. The shared pattern observation journey checks
writable projections, nested selector and element plans, formatter options and binding arrays,
opaque structures, cached lookup isolation, and pseudo-localization without mutating descriptors.
Package metadata observations remain writable and independent of captured inputs. Editor-only
Node controls separately cover Unicode source positions, half-open hints, hover containment,
interior task cursors, adjacent diagnostic attribution, and writable editor observations.
The shared inspection session journey checks shared pending connection results, independent
connected descriptions, writable local and remote observations, and private cleanup after public
method or subscription aliases change. Native hosts and Chromium execute the same public runtime
controls. DOM source and browser journeys check writable, independent partition snapshots through
marker updates and removal, including a 3,000-level tree. Compiler source controls preserve readonly
types while checking independent writable correlation data and unchanged source IDs. The shared
native descriptor journey checks equal and changed writes through general and compiler-selected
reactive objects and arrays, plus collection public properties. Strict compiler writes and unchanged
descriptor definitions retain native acceptance. Indexed controls cover membership after failed
creation or deletion, accessor receivers, data-only reads, and descriptor-preserving rollback.
Synchronization controls preserve matching fields and mutable child merges while checking rejected
writes, deletion, undefined creation, setters, and atomic rollback through both indexed providers
and both general providers. Retained reflection readers cover value definitions, missing reads,
membership, enumeration, enumerability changes, rollback, diagnostic callbacks, and disposal.
Fixed native object descriptors retain exact supplied references. Equal-shaped replacements through
native Array methods and raw custom properties reconnect field readers to the new reference and
release the old one. Fixed-length arrays can retain same-size updates or accept a new array
through a writable owner when their size changes. Compiler
session statistics and invalidations remain caller-owned observations. Build reports and decoded
enhancement requests retain validation after an observation changes. Native filesystem hosts execute
the shared build and projection controls, while compiler process ownership is checked separately
through public Node and Bun sessions.
The shared client inspection values journey uses an installed optional inspector and its public
component owner in native hosts and Chromium. It checks visible state, props, secret-qualified
contexts, and resource-qualified contexts already delivered to the page. Obsolete selectors in
older client registrations remain inert. Server controls separately preserve protected contexts,
catalog redaction, and authorization before inspection crosses the transport boundary.
The shared server catalog journey checks private registration capture and exact build retirement after caller mutation, accessor rejection without
execution, and source redaction with a valid pre-redacted control in native hosts. A source test
additionally registers a 20,000-level tree and rejects a subsequent cycle.
The shared server security journey checks strict boolean approvals, inherited private-state
policies, buffered and streamed batch rejection, forwarding-host checks, debug boolean and callback
controls, and request cleanup after configuration capture fails. It runs through public Server
exports in Node, Bun, both Deno cancellation modes, and workerd. Server-only checks remain outside
the browser asset.
The shared task native-options journey compares ordinary native calls with managed and cleanup
signal adapters. It checks inherited listener flags and private-state request getters, one-time
signal reads, nested mutable header aliases, native virtual-field lookup, original cancellation
reasons, and cleanup without an authored signal in each native host and Chromium. Capture flags
are compared with native host behavior, including workerd rejecting `capture: true`.
The shared request inspection journey checks revocation, expiry, cancellation, runtime shutdown,
reentrant capture, supported inherited identity options, and independent application completion.
It checks UTF-8 observation suffix selection against valid and fallback response limits in each
native handler host. Near-limit 16 MiB fallback responses additionally run in Node source tests.
The shared DOM root options journey checks inherited render-work bounds and profiling callbacks
with inspection absent, explicit, and ambient. It covers initial component and intrinsic roots,
retained node identity, updates, and removal in source tests and Chromium built-package acceptance.
The shared accessibility fixture checks native relationship attributes, passive adoption of
server element/ref identity, nested composite keyboard ownership, retained updates, and disposal
of the published owner. The same authored component supports source and adapter browser controls
for initial focus, following mounts, and relationship deactivation.

The compiled mount-work fixture checks explicit initial-mount caps for native intrinsic trees
and static programs, failure cleanup, following mounts, and retained identity. The same owned
subtree participates in buffered and streamed full-root and island hydration journeys, with
ref ownership and disposal checks. Native HTML template contents retain the parsed server
element, nested content, and current component owner across adoption and updates. Source controls
also cover foreign-namespace templates, cross-document container selection, and a following mount.
Unchanged static patches remain separate from initial work
accounting.
The shared hydration options journey checks inherited callbacks, initial markerless adoption,
live callback aliases, retained root and DOM identity, the next update, and disposal through basic,
full, enhanced, and compiled-root source entry points. Built Chromium acceptance runs the enhanced
entry. Native Server security journeys exercise the shared configuration derivation in every
handler host.
The shared inspection event journey checks detached client/server event inputs, ordinary public
observations, reentrant replay/live ordering, clear fences, and server disposal during capture.
It runs the client path in native hosts and Chromium, and the server path in each native host.
The shared inspection observation journey covers writable previews, component/task snapshots,
method handles and pages, isolated task history, data-only component names, private method
authority, copied redaction paths, and fail-closed malformed redaction decisions across native
hosts and Chromium.
The shared inspection failure journey binds tasks to a durable host, preserves an unprintable
failure with inspection attached and detached, checks its event, and executes subsequent work
through built native and browser package exports. Source controls also cover metadata failures
and protocol-bounded reasons.
Compiled ref facade regressions compare direct, literal-indexed, and extracted method dispatch
in client and SSR artifacts. The shared compiler-closed adapter fixture also replaces a facade
method and checks output and direct-component ownership across Vite, Webpack, and Bun.
Keyed ref values additionally pass strict authored and emitted TypeScript checks across direct,
literal, receiver-preserving extracted, binding-current, and root-current access before paired
runtime execution. The adapter fixture reads a typed value through a bound registry method.
The shared ref/root value journey checks writable SSR methods, owner-local observations, copied
release metadata, private generation authority, and reactive rollback in source, built native
packages, and Chromium.
The simulation journey also crosses overflowing collision and constraint corrections, queued
force, impulse, and torque before kinematic transitions, rollback, repair, and later progress.
Clock controls cover empty small-interval calls, decimal catch-up planning, and each finite
accumulation, simulation, and discarded-time boundary.
The shared physics force-recovery journey checks thrown and non-finite contributors, a single
retry without duplicate force, catch-up rollback, optimistic command rebasing, and accessor-backed
coordinate snapshots. Native hosts and Chromium execute it through public package exports.

The shared adapter provider journey lives in
`framework-adapters/test-support/microfrontend-provider-journey.ts`. Vite, Webpack, and Bun build
real remote entries that combine a page-owned watcher with specialized remote state. The journey
loads emitted JavaScript under Node's browser export conditions and observes the initial value,
the next mutation, and watcher disposal. This is artifact execution evidence, not a browser DOM
or server-runtime check. A Rollup producer regression also isolates the shared dependency graph.
The journey also imports the public runtime root and verifies that an unbound producer page has
no provider bootstrap. A browser-root bundle check rejects Node preparation and TypeScript
compiler code in that runtime graph.

The acceptance matrix crosses supported value families with publication boundaries, rather than
using only the data shape from the latest application report. Collection checks include Maps,
Sets, nested values, ordering, invalid keys, cycles, accessors, and graph limits across document
state, indexed resumptions, and island payloads. The shared adapter fixture carries collections
through SSR, hydration, repeated local or remote updates, and disposal. Native host acceptance
also observes server error logs during disconnect: cleanup and absence of browser errors alone
do not prove correct cancellation classification. Deliberate application failure remains observable.
The native host page reads a nested state field through a work-local key before publishing an
update. Its browser round trips verify receiver inputs across Node, Bun, Deno and workerd.

Compiler-closed bundle guards also run in each build adapter's ordinary integration suite. The
fragment corpus checks async contribution settlement, owner disposal, and hydration identity;
native runtime acceptance verifies settled task values in target attributes before and after hydration.

The inventory records the known compiler paths and their intended scenario coverage,
including shared setup/interaction invocation of one durable function-task definition and
receiver-owned indexed input updates across client replacement and hydration. Compiler-created
intrinsic identity is also protected as immutable server data outside the request-local dynamic
attribute plan, and compiler-known root openings publish through one focused server operation.
Exact synchronous server value propagation also emits direct assignments while authored
calculations retain their executable setup boundary.
Compiler-proven single-slot task inputs subscribe directly to the receiving component's indexed
state or prop dependency; arbitrary task expressions retain their executable tracked source.
The captured-task-input fixture also protects literal key types, callback inference and dynamic
selector evaluation inside task work. Compiler acceptance executes local mounting and local or
server-task hydration, retained prop updates, repeated invocations and removal. All three build
adapters compile the same source in both targets and reject unauthorized computed state writes.
The activation-capture fixture pairs direct SSR with client invocation through the actual server
request handler. It covers local helper closure reconstruction, public defaults with body-only
server contexts, shared context publication, repeated captures, retained prop updates, returned
values, removal, and retired event cleanup. Its Node/jsdom journey uses a trusted request provider
and explicit public context projection. Adapter checks compile both targets and reject direct
private-context defaults and protected helper inputs. The same adapter fixtures compile awaited annotated factories, guarded nullable collections,
adjacent reactive setup assignments, and reject erased collection publication and known object Map keys.
Native runtime acceptance also executes captured helper constants, helper context reads, publication, and awaited annotated resource disposal through
Node, Bun, both Deno cancellation modes, and workerd. Those host checks cover direct SSR and
repeated request-adapter execution with exact disposal counts, destructured task contexts,
local resource-return helpers, optional manual release, and generated binding collision controls. The full capture and DOM removal journey remains Node/jsdom
evidence rather than browser evidence.
That fixture also invokes ordinary and optional private methods from task-local class field
initializers. Adapter checks compile its client-task and server-task forms. Pending expression
journeys cover deletion, copying, iteration, template tags and private receiver/accessor order,
with repeated updates, retained DOM identity and disposal.

The native host fixture also invokes local callbacks that shadow named and namespace SSR imports,
and a local callback named `unsafeHtml`. Node, Bun, both Deno cancellation modes and workerd verify
that these calls retain their arguments and ordinary results. The shared adapter identity fixture
executes named and namespace renderer callbacks in client and server builds through Vite, Webpack
and Bun. Compiler source tests separately cover virtual dependency generations, runtime export
metadata, module replacements and authored source locations.
The namespace JSX regression compiles lowercase and uppercase core namespaces into matching
isomorphic artifacts. Its Node/jsdom SSR and hydration journey protects input edits, retained
input and button identity, reactive updates and disposal. Plain custom-element tags remain hosts.

Finite nested root props also carry the same immutable positional publication schema in client and
server artifacts; behavioral tests independently protect round-trip decoding and named fallback.
Compiler-proven indexed state and prop reads used by intrinsic properties are encoded in the
component-local `wire`; mixed property groups retain executable writers only for their arbitrary
expressions and callbacks. Fully reconstructible transition-free components omit their resumption
contract and value record rather than shipping an empty activation protocol.
Captured component aliases retain their state facade when ordinary object methods write through
a context. The public testing harness exercises child mounting, repeated events, instance identity,
and exactly-once cleanup. Installed-library acceptance exercises the same method receiver through
each adapter and native runtime.

Checker-proven whole-state aliases also retain indexed reads inside derived authored expressions;
invalidated, nested, dynamic, and broad alias paths keep their general property semantics.
Direct properties of stable keyed-item receivers use compact component-local operands.
Nested reads through replaceable indexed props retain the complete receiver/member reader, so
member mutation and receiver replacement both update the retained child. The nested-forwarding
journey checks initial state, member updates, replacement, detached receiver silence, the next
update, element and leaf identity, and disposal. SDK tests cross standalone receipts, render-program
component slots and literal indexing with mount and strict hydration. Transparent receiver wrappers,
optional absent/null transitions and changing computed keys share the same dependency checks, alongside coherent mixed inputs,
scalar fast paths and unread authored payload identity. The shared `nested prop forwarding` adapter
contract builds wrapped-receiver client and server artifacts, renders server output and runs that same journey through
browser mount and strict adoption on Vite, Webpack and native Bun. These are declared checks whose
execution results belong to each qualification run.
The grouped derived-collection and indexed outer-list fixtures use literal-indexed map calls
and a type-wrapped callee. Their existing membership and identity transitions protect
collection recognition and item-local capture across these source forms. SDK artifact journeys
also cross mount and hydration with inferred destructured and quoted-field keys. Shared adapter
contracts build both targets, execute server output, and reject eager callback state writes.

Nested keyed cells beneath an indexed native map also retain each outer callback's values instead
of reusing the first row's closure through a shared list-site cache.
Exact prop snapshots expressed through `peek()` also remain compiler-known resumption inputs: the
server verifies equality before omitting redundant nested state, while those server-only source
paths do not ship in hydration artifacts.
The reactive provenance journey pairs ordinary mounting with strict hydration. Imported snapshots,
namespace access, captured helper aliases, and same-named application helpers cross repeated state
updates while retaining DOM identity. Calculations mixing snapshot reads with live inputs keep their
own subscription boundary, including when an immutable helper alias supplies the calculation.
Framework reactive value reads cross readonly aliases and finite member keys. A callable Array
`thisArg` stays dormant while its surrounding computation updates. The shared adapter counter
checks that same declaration and callback-slot contract through SSR, hydration and two retained
updates.
Compiler-closed single-scalar text runs also retain adjacent authored text in one focused operation,
while multi-expression runs keep their independent reactive owners. Whole-intrinsic scalar runs
omit server comments and split the adopted text into independently updated nodes. Focused hydration
coverage protects element identity, empty values, UTF-16 boundaries, and mismatch recovery.
Compiler-proven native `maxLength` literals and bare `required` attributes are protected as static
client, server, and hydration structure; dynamic values and custom-element properties retain their
runtime operations.
A compiler-known intrinsic can bound an immediately preceding opaque native child's marker-free
range at the program root or beneath a direct parent with a stable forward claim path. The corpus
protects multi-node output, prop updates, hydration identity, the deeper explicit-marker fallback,
and generated client and server structure; focused DOM coverage also protects the empty-output
boundary case.
Fixed intrinsic children crossing a component boundary retain compiled rendering while exposing a
lazy structural view. Coverage checks immediate intrinsic selection, derived children, exactly-once
construction and disposal, reactive updates, and hydration identity. Derived locals in focused
component output ranges must remain available inside their generated reactive callbacks.

The component dependency journey uses one authored direct-owner fixture in source tests and the
Vite, Bun and Webpack Chromium adapter checks. It checks retained parent inputs, the next state
interaction, native ref release and a fresh owner after disposal. The same authored fixture also
executes marked strict root adoption in the source harness, retaining server nodes and refs before
prop delivery and another state interaction. This is separate from the adapter mount journeys and
does not establish streamed or island adoption. Focused DOM tests separately exercise failed
dependency preparation, partial acquisition rollback, reentrant forwarded-source replacement and
version catch-up. These checks do not establish lexical supplier authority for children forwarded
through an authored component.

The retained-operation journey supplies unchanged native handles through a direct parent and checks
conditional removal/restoration, scalar insertion, native button/ref and instance identity, next
interaction, exact cleanup and a fresh following owner. Vite, Bun and Webpack execute the same journey
in Chromium. A source-harness marked strict root adoption control retains the server nodes before
these sibling updates. Repeated-handle controls preserve existing positional ownership. These checks
do not establish recreated-handle identity or cross-parent relocation, or repair compiler child
admission and lexical supplier authority.

Project-isolation checks additionally include unrelated client and server initializers in the same
TypeScript program. Native partition tests protect file-local pruning and preserve the owning
initializer's target restriction. Compiler helper tests cover parameter forms, imported rendering,
updates, and call-effect collisions at identical source offsets. The shared adapter fixture in
`framework-adapters/test-support/project-source-isolation.ts` executes retained helper exports from
both client and server bundles through Vite, Webpack, and native Bun. It verifies ordinary
TypeScript, JavaScript and CommonJS helpers with private configuration and supplied state inputs, native
binding, readonly aliases, discard, and subsequent publication. Each
adapter's integration suite runs it in CI. Native pattern ownership checks in
`packages/compiler/src/compilation/native-pattern-references.test.ts` cover captured receivers,
default selection, native result identity, abrupt iterator close, partial descriptor writes,
and per-put cancellation. `helper-owned-publication.test.ts` checks callable and lean HTTP
publication for defaults and destinations without defaults, including sibling-preserving merge.
The shared source-normalization adapter fixture executes the finite default pattern through
paired Vite, Webpack, and Bun builds. These focused checks do not replace native host-runtime
acceptance. The helper-publication suite also compares in-project
helpers with untouched source-removed ESM and CommonJS helpers installed as physical package dependencies. Shared
component assertions cover synchronous/asynchronous calls, latest/parallel tasks, pending visibility,
subsequent publication, retained DOM, cancellation and disposal. The helper-call-selection corpus
journey exercises lexical shadowing, aliases, explicit extracted-method receivers and higher-order
calls in blocking component tasks. Mount and full-root hydration assert evaluation order, returned
values, native callable identity/name/arity/prototype shape, pending invisibility, repeated publication,
retained DOM and disposal. The Node 24/26 compatibility jobs also run the complete compiler test suite
through `npm run test:compiler`, including helper rendering and portable placement checks.

The same owner checks the unchanged projected-closure module and its safe RHS control
through each adapter's client/server build hooks. An exact absolute `include` declares
ownership of the plain TypeScript entry without adding a component importer. The fixture
has no Core or mounted-runtime imports. Vite uses finite library and SSR builds,
Webpack uses its production module-library build, and Bun uses native `Bun.build`.
Each emitted module executes in a fresh Node process, or native Bun for the Bun
adapter. Assertions check the stable export, browser title value with one getter read,
server omission of that value with zero getter reads, and safe replacement values with
zero getter reads on both targets. The environment profile registers this named test for
all three adapters. Registration does not establish successful execution of that profile.
Vite and Webpack use the maintained
`framework-adapters/test-support/module-builds.config.ts` configuration, which omits
component-runtime setup because these fixtures enter through adapter build hooks.
Run it with `vitest run --config framework-adapters/test-support/module-builds.config.ts`.
The confidence runner groups witnesses by configuration and still requires the
remaining adapter, native Bun and runtime checks. This is source-adapter module
coverage, separate from installed packages, Core regeneration, mounted components,
hydration and HTTP runtimes.

Library publication regressions reject opaque component placement, shadowed portable globals,
application-added collection methods, and declarations with standard-library lookalike filenames.
Each failed generation preserves the previous artifacts. Native source controls pair those failures
with standard methods, aliases, and literal or narrowed computed member keys. They check execution
placement alongside emitted artifacts, and keep method ownership distinct from receiver spelling.
Intl receiver controls repeat this contract across seven standard formatter interfaces and both
compiler targets. Shared Vite, Webpack and native Bun builds render a formatter whose interface has
an unrelated application-added method, preserving the selected standard method's placement.

The compiler's project-context invariant suite recompiles the existing fundamentals, state,
structure, registry, and task fixtures under bounded, semantics-preserving perturbations. It
injects unrelated client/server initializers at selected declaration offsets, reverses project
and entry order, removes unrelated roots from the program, shifts source trivia including UTF-8,
extracts a parameter type into a named alias, and restores the original context. Each variant runs
in fresh and reused compiler sessions. Hand-authored SSR, repeated update, identity, lazy loading,
and cleanup expectations accompany comparisons of exports and placement. Generated IDs and emitted
code bytes are not equivalence oracles. This suite runs in the compiler CI job and uses no browser
automation. Expand the owned scenario set as new contracts warrant it; passing this bounded set is
not evidence that every program-context interaction has been explored.

Reevaluation checks pair accepted built-in reads and truthful helper assertions with rejected
external mutations, callback effects, and misleading type names or annotation text. Paired
artifact tests exercise imported helpers, and compiled DOM checks observe Map updates, deletion,
restoration, retained identity, and disposal. The shared
`framework-adapters/test-support/compiler-diagnostics.ts` fixture requires Vite, Webpack, and Bun
to preserve the operation, imported filename, diagnostic code, and supported annotation guidance
in both target builds, then accept the corrected source. Diagnostic tests also check Unicode
spans and imported locations independently of the caller's normalization map. Recursive helper context
controls check termination for cyclic effect propagation and reject request-only context access
from client tasks through each adapter's client and server builds.

The single `Number foreign coercion target projection` regression is explicitly skipped in
Vite. The observed Vite 8.1.5/Rolldown 1.1.5 optimizer assumes unchanged built-ins through
coercion and folds a later `Number` lookup despite the fixture's earlier replacement.
The native compiler and SDK retain the original source and projection oracle. Webpack and
native Bun keep this row enabled, with acceptance required independently. Other Vite
checks, including `Number module target projection`, remain enabled. This is an intentional
adapter compatibility exclusion, not a passing Vite result or a framework semantics repair.

The secret-containment corpus fixture uses a credential in a server-owned component task and
passes it through a declared secret parameter using computed native `call`, consumes the preserved
secret explicitly at its server call site, and renders a public service result. Buffered HTML,
hydration records, and ordinary and hydratable progressive stream bytes exclude a recognizable credential before any client code
executes. A generated paired-artifact loopback check also invokes a server task twice in batched and
unbatched transport modes. It checks request and serialized response bytes before hydration receives
them, while the server resolves a qualified credential and publishes only a public service result.
These are source-runtime Node checks. They complement compiler rejection of protected
captures and do not establish acceptance across every adapter or native execution runtime.

The render-attribute-order fixture crosses literal and spread precedence with retained DOM updates,
boolean and numeric control properties, removed and restored keys, inline function readers, and
serialized direct, fragmented, and compiled children inside a text host. Scalar roots include
static attributes and event-bearing descendants. The fixture also checks generation-owned waiting
and staged publication. It rejects framework error reports and checks
matching hydration before subsequent interactions. Its nested property fixtures check
prototype-named conditional classes on compiled and general hosts, MathML attributes without
reflected DOM properties, plus event arguments for
reassigned handlers. The same authored component is built through Vite, Webpack, and Bun for
executable client and server checks. Its event journey also runs in the
native runtime page across Node, Bun, Deno, and workerd. Deep contextual claim fixtures separately
verify that cursor fallback retains SVG and MathML integration namespaces during mount and hydration.

The nested-input relationship journey checks direct, optional, literal-indexed, and computed
reads through retained parent mutations, replacement, removal, obsolete-object isolation, and
disposal. The applied-component surface fixture checks context capability through a helper’s
`apply()` argument tuple. Both have strict hydration tests, shared adapter execution, and
checks in the native runtime page.

## Contract model

The corpus has two independent layers:

1. Handwritten behavior expectations define what authored TSX must do during client mount, indexed
   updates, final disposal, SSR with ready and pending tasks, streaming, progressive output,
   matching hydration, and compiler-owned root recovery after a structural mismatch.
2. Generated-structure predicates verify compiler-owned properties such as target-local artifact
   emission, attachment ordering, enhancement dependencies, and exclusion of native VNode or
   runtime-artifact fallback paths.

Expected HTML, DOM identity, state transitions, cleanup counts, and recovery boundaries are authored
framework contracts. Tests must not derive expected values from current compiler output or replace
these assertions with whole-output snapshots.

Enhancement coverage includes the framework's server pass-through projection and activation of the
bundle-local implementation after adopting the authored target. The shared workbench also hydrates
output produced with the server implementation present. Enhanced interactive hosts must retain the
same child topology across targets and keep enhancement namespace props out of serialized HTML.
Separate SSR scenarios cover target contributions across native component boundaries.
The shared motion integration runs through Vite, Bun, and Webpack and applies the same adoption, repeated-update, identity, and
disposal expectations across buffered and progressive document shells. It distinguishes
task-placed and explicitly annotated server-only pages with independently bootstrapped islands
from client-capable applications
that adopt their whole subtree. These built-bundle checks run in jsdom; the installed workbench
adds Chromium coverage for the whole-application path. Installed-package development SSR checks
exercise theme scopes and fields from authored and paired artifacts, including module invalidation.
The Bun and Webpack installed-package fixture executes emitted SSR bundles with enabled and explicitly excluded
theme providers, and consumes paired artifacts with the optional provider absent. Its packages are
physical copies outside the workspace, so parent dependency resolution cannot hide absence. Paired
artifacts live under `dist` to verify that source filters preserve their authorization facts.
Excluded providers throw if evaluated. Bun resolver checks also exercise server/browser conditions and
aliases without evaluating provider code. The installed-package cases also consume published library modules with physical enhancement
facades, checking enabled, excluded, and absent providers independently of the producer process.
The shared hydration runner executes emitted server and browser bundles in an isolated jsdom process.
Both bundles also exercise producer cancellation before a queued observation flushes: the task
rejects, cleanup runs once, coalesced committed state remains observable, and the next update works
without inheriting the cancelled frame. The same probe runs through all three adapters.
The lazy-registry variant uses an entry named `lazy` to distinguish the property key
from the scoped loader function through compilation, SSR, hydration, updates, and cleanup.
The browser bundle also mounts a compiled task beneath Activity, resolves its source while parked,
and verifies deferred publication, retained DOM identity, and resumption through the bundled runtime.
It checks two updates, retained DOM identity, and disposal across 21 common modes, including buffered
and progressive document shells and two real continuation requests through the server dispatcher.
The wrapper modes add intrinsic, ordinary-fragment, and theme-enhanced transparent roots under a
server-only page, with captured labels and forwarded server content. They verify theme updates,
pre-hydration input edits, retained child identity, nested server continuations, and handler disposal
in buffered and progressive output through each adapter.
Bun's native integration executes both the shared hydration verifier and installed SSR bundles
in Bun. Theme-enhanced wrapper cases also assert custom typography inheritance, inverse appearance,
empty-rule adoption, and retained descendants across source updates. The wrapper fixtures also cross child-expression forms with absent, null, false, zero, empty-string,
text, and element values. Each case combines a dynamic data prop, local interaction, and an
independent server descendant. Assertions cover authored order, adopted identities, edited inputs,
two updates, disposal, and computed-key evaluation during SSR and subsequent updates. Initial
hydration may evaluate expressions while establishing dependencies; it is not asserted to execute
an authored render exactly once.

`npm run check:framework-mutations` verifies deliberate compiler faults against shared
behavioral fixtures: dropping dynamic props, replacing the authored client layout, misrouting
computed children, and losing an observed task’s reactive activation. It also changes the runtime
in an isolated Vitest module graph to exclude nonblocking work from pending status. The working
source and built runtime packages remain untouched. The native CI job builds these binaries using
Go's filesystem overlay, without
editing compiler sources or replacing the normal executable. The Node 26 compatibility job runs a
passing baseline followed by each faulty compiler and requires assertion failures. Locally, run
`npm run build:native-compiler`, then `node scripts/check-framework-mutations.mjs --build`, before the
verification command. Both commands require the usual built workspace prerequisites for integration
checks; mutation output stays in `.tmp/native-artifact/framework-mutations`.

`npm run test:task-observation` runs the task coverage in the Node 24 and 26 compatibility jobs:

- Equivalent compiled components expose no status, `taskStatus()`, direct task status, or an event
  callable. Mounting and SSR/hydration each verify initialization, repeated input changes,
  supersession, stale completion, DOM retention, and cleanup. Client tasks render idle status on
  the server, then report their browser work after hydration. The shared Vite, Webpack, and Bun
  island fixture
  also checks that status views stay with their task owner and numeric status output adopts the
  existing DOM.
- Controlled promises distinguish visible pending status from Suspense readiness for blocking
  and nonblocking tasks, including the next update after initial settlement.
- Two fixed seeds exercise 48 transitions each across parallel, latest, and queue policies, crossed
  with blocking, nonblocking, and deferred work. An independent list of issued and settled calls
  predicts aggregate and keyed pending counts for two owners. Failures include the seed and operation
  prefix. These are bounded examples of interleavings, not exhaustive scheduling coverage.
- Mutation witnesses first require the unmodified implementation to pass. A compiler fault must
  fail the rendered task journey; the runtime fault must fail its pending assertion. Compilation
  errors, process or test timeouts, missing anchors, and missing test results fail the check rather
  than counting as detection.

These are scripted build/SSR
and jsdom checks; the installed-workbench suite supplies separate Chromium coverage.

## Inventory discipline

`src/compiler-path-inventory.ts` is the maintained ledger of known specialized paths, supported
general paths, explicit compatibility boundaries, diagnostics, and forbidden legacy paths.
`src/scenarios.ts` assigns each path to at least one scenario and declares the rendering modes in
which it must be exercised. The inventory tests fail for unknown paths, missing paths, duplicate
inventory identities, or missing required rendering modes. These checks validate declarations,
not execution coverage. A listed mode is evidence only when a behavioral test executes it and
asserts the relevant contract. The ledger is not proof that every compiler path has been discovered.

When compiler behavior changes:

1. Add or update the inventory entry and its required modes.
2. Add the smallest independently meaningful component scenario that exercises the behavior.
3. State the normative observation before running the fixture.
4. Compose the scenario with related capabilities when the interaction creates additional risk.
5. Run `npm test -w @exactjs/component-composition-corpus`.

Compatibility components remain owned by their explicit renderer. They may be represented in the
inventory as a boundary, but they must never be used to justify a VNode or runtime-created artifact
path for native eXact components.

## Shared interaction workbench

The private corpus owns a small report workbench in
`src/test-support/repeated-interactions.fixtures.tsx`. It has no dependency on another project's
source, data, or availability. Grow this application with minimal, independently authored examples
of new failure classes instead of importing an application's workarounds.

`src/repeated-interactions.test.ts` executes the same assertions for each combination below.
The loops generate executable tests, so adding an entry runs the complete transition contract.

| Authored control form                    | Client mount       | Server render followed by strict hydration |
| ---------------------------------------- | ------------------ | ------------------------------------------ |
| Direct callback prop                     | Shared transitions | Shared transitions and DOM adoption        |
| JSX spread plus callback prop            | Shared transitions | Shared transitions and DOM adoption        |
| Intrinsic enhancement plus callback prop | Shared transitions | Shared transitions and DOM adoption        |

Every cell checks the first interaction, replacement of callback inputs, a second interaction,
conditional removal and restoration, keyed row retention and removal, empty derived output,
handler removal, and exactly-once row cleanup. Expected labels and interaction observations are
handwritten. SSR uses the server enhancement implementation, and hydration uses the client
implementation. Enhancement attributes are asserted so accidental no-op resolution cannot pass.

The keyed-spread workbench in `src/test-support/keyed-spread-updates.fixtures.tsx`
compares direct and copied JSX prop spreads, ordered overrides, explicit props, and
intentional `peek()` snapshots. Its state-backed rows exercise element replacement,
whole-array replacement, in-place mutation, reordering, optional-prop removal, edited inputs,
and cleanup during mounting and strict hydration. This complements the original workbench's
fresh derived row objects: passing one collection source shape does not establish the other.
The shared adapter continuation-shell cases also compile this workbench as a separate local
application module, then verify buffered and progressive SSR adoption and repeated updates
through Vite, Webpack, and Bun. Local application modules use the shared provenance
classification and must not require third-party component-library authorization.

The replacement journey additionally changes an independent parent prop after replacing a
projected keyed collection, retains the matching child DOM, removes it, and inserts it again.
Reactive package checks cross scalar, object, and array results with indexed and general proxy
storage, independently observable object replacements, and compiler property operands whose source
objects initially compare equal. Changing
the new source must update consumers after the old source is retired.

The localization projection fixture compares native date-method defaults with compiled output,
reads Date subclass internal values, retains invalid-date text and custom list iteration, and checks native unit formatting of nonfinite
numbers and large BigInts. It also distinguishes absolute temperatures from signed temperature
differences and converts reciprocal fuel-economy endpoints before subtracting. Its owned component retains DOM identity across two updates and is
disposed after mounting and strict hydration. Shared Vite, Bun, and Webpack checks build both
artifact targets and execute server output. The native-host journey executes the prepared value
contracts through Node, Bun, both Deno modes, and workerd alongside browser hydration.

The same adapter journey exercises a shared Map iterator snapshot consumed by another derived
helper and a superseded optimistic task whose `catch` writes state. Focused compiled-task checks include current-failure recovery,
`finally`, assignment expressions, aliased writes, return values, scalar updates, array and Map
mutation, subsequent tasks, and disposal. Returned promise callbacks receive the same cancellation
checks as await continuations. Island capture crosses named, arrow, and function-expression task
definitions. Native runtime acceptance carries the shared journey through buffered and streamed
documents, ordinary hydration, and islands. These are maintained regression contracts. Broader
exploratory generation remains a local command. Compiler checking-projection tests additionally
require semantic success in checking, client, and server outputs for shared Map/Set snapshots and
array projections, including invalid argument controls. Successful artifact execution alone does
not establish that the generated types are correct.

The shared adapter and native-runtime journey includes an independently owned manual clock.
It checks a finite time window through initial provider observation, completion of its schedule,
a changed reactive anchor, the next boundary, retained DOM identity, removal, reinsertion, and
owned timer cleanup. Its anchor uses a literal computed record key, with finite computed `Date` and `Math` clock
and rounding members. A separate explicit-accuracy
range checks reactive named-policy progression, disable, reenable catch-up, retained DOM and timer
release without automatic quantization. The same retained component publishes a synchronous
client task result selected through a destructured local task-table member at initialization and
after repeated reactive input changes, preserving the output element. Its defaulted argument before
a required input checks that available `undefined` reaches capture without becoming an unresolved
execution dependency. Focused forwarding checks preserve clock transitions through ordinary wrapper
components. Focused compiler journeys also compare all nine Temporal rounding modes with native Temporal values
through mount and strict hydration, including negative offsets and tie boundaries. Half-even
plan deadlines receive a separate native-value oracle. These checks use local runtime hosts.

The mutation-contract journey also invokes a returned helper immediately, assigns a collection
element through an ordinary helper's destructuring pattern. An ordinary helper receives explicit
state inputs, and a copied local getter supplies a Map update. The same retained-update and
identity assertions run through mount, hydration and native runtime acceptance.

The collection-projection journey additionally shares a shallow object-array spread with a
calculation, an event, and a task. It checks insertion, replacement, sorting, field updates, removal,
and reinsertion through mount, strict hydration, all three adapters, and native runtime acceptance.
Inline Map-key transformations and wrapped keyed JSX arrays follow the same identity assertions.
Rendered nested arrays and spreads also verify annotated key inference without authored JSX keys.
Reactive unit checks cover native array iteration by spread, values, entries, and keys, including
quiet unchanged key sequences and subscription disposal. Grouped destructuring additionally
crosses aliases, computed keys, dependent defaults, nested patterns, rest bindings, explicit
snapshots, and island capture. These journeys retain focused examples from local source-form exploration.

### Evidence boundaries and remaining gaps

This workbench runs compiled source in jsdom. It does not establish real-browser event behavior,
CSS or layout correctness, independently installed package resolution, or split-build server
component and client-island equivalence. The corpus's query-selected server artifact is full-root
SSR, not proof of those separate build paths. Existing focused suites remain necessary.

When expanding coverage, distinguish these axes explicitly:

- authored form and selected compiler specialization or supported general path;
- initial creation, retained updates, replacement, removal, and final cleanup;
- client mount, full-root SSR/hydration, and split-build islands;
- workspace source, separately compiled components, and installed release artifacts;
- simulated DOM behavior and browser behavior.

Extend the installed production workbench below with additional split-build island transitions next.
Reuse the same observations through adapters where possible. Confirm that an adapter actually
selects its claimed path with focused compilation or build assertions. Do not label one successful
source-fixture run as evidence for the other axes, and do not expand every trivial scenario into
the full Cartesian product.

## Installed production workbench

`npm run test:packed-workbench` is a deterministic acceptance command, separate from `npm run build`.
It uses npm tarballs, an operating-system temporary directory outside the checkout, and Playwright
Chromium. No agent, screenshot interpretation, or manual browser operation is involved.

The runner packs the candidate framework dependency closure, builds and packs an independent
control library with an optional enhancement provider, then installs those packages into generated
consumer applications. The application source imports only the control library. Provider activation
must therefore be discovered through the packaged library's build facts. Compiler overrides and
`NODE_PATH` are removed from subprocesses, and installed package paths must remain inside the
consumer's own `node_modules` tree.

One browser journey runs against four production configurations: single-file browser output and
paired server/client output, each with the optional provider installed and absent. It checks
callback replacement, second interaction, retained control and row identity, derived output,
handler removal, row cleanup, focus, and edited form values. For SSR it delays the entry script,
records server DOM and edits the input before hydration, then asserts adoption without replacement.
The source corpus remains responsible for final explicit unmount observations; closing a browser
context is not evidence that a component's unmount callback ran.

### Running and maintaining the command

Install repository dependencies, build the candidate packages, and install Chromium with
`npx playwright install chromium`. Supply a native compiler tarball matching the host platform and
architecture in `.tmp/native-artifact/native-package-artifacts`, or set
`EXACT_NATIVE_PACKAGE_DIRECTORY` to its containing directory. There must be exactly one matching
tarball. To prepare one locally, run `npm run build:native-compiler -- --package`, create the artifact
directory, and run `npm pack ./.tmp/native-packages/compiler-native-<platform>-<arch>
--pack-destination .tmp/native-artifact/native-package-artifacts`. The compiler build requires Go.
Then run `npm run test:packed-workbench`.

Fixture source lives in `scripts/test-support/packed-workbench`; browser assertions live in
`scripts/packed-workbench-journey.mjs`. Extend the shared journey for new failures rather than
adding manual reproduction steps to the release procedure. Consumer builds execute installed
packages. The provider build uses the repository's component-library build script, resolving the compiler
from the provider's own installed dependency graph. It must not depend on a native executable
built in the repository checkout.

CI runs this command in the existing acceptance job for relevant framework, packaging, toolchain,
or acceptance changes on pull requests, and unconditionally on main and manual release runs.
Git comparison errors fail the job. The release publication job depends on acceptance succeeding.
The selection and process-lifetime tests run in the dependency-free build-script suite.

Successful runs delete temporary projects and discard browser traces. Failed browser journeys save
traces under `.tmp/packed-workbench-failures`; CI retains them for seven days. Failed builds print
captured command diagnostics. Servers, browser contexts, and temporary installations are released
on either success or failure. These generated outputs must never be committed.

This adds installed-package and browser evidence for the listed transitions. It does not establish
coverage of every component, streaming boundary, island arrangement, or browser engine. The wider
execution-path inventory still requires explicit scenario-by-scenario evidence.

## Installed shipping continuations

`npm run test:packed-shipping` complements the workbench with Parcel Lab's generated server
continuations. It copies authored shipping-app inputs into an isolated temporary installation,
installs packed candidate packages, generates artifacts, builds both production targets, and
runs the app's Playwright suite against an owned Node host. It uses the same native-package and
Chromium prerequisites as the workbench command above. The isolated Playwright runner uses the
checkout's locked Playwright version so it matches the installed Chromium revision. No agent
browser operation is involved. The shared host owner gives readiness a 30-second startup deadline,
with up to five seconds per HTTP probe so cold SSR can finish. It releases probe bodies and includes
the last probe error and last received HTTP status when readiness fails. Shipping runs also report startup time;
readiness probes do not replace the browser behavior assertions. Source-only host-owner tests cover
slow and hung responses, transient and persistent HTTP errors, streaming-body cancellation, failed
journeys, and forced shutdown of a host that ignores graceful termination.

The suite checks server DOM adoption without an initial quote redispatch, repeated route and
price updates, transport-failure recovery, and superseded response handling across three viewport
and appearance configurations. The delayed-response test holds a real server response while a
newer edit completes. It proves that an obsolete reply cannot replace current browser output;
it does not prove that a carrier cancels its upstream request. Provider cancellation and request
lifetime remain responsibilities of the app's focused tests.

Only the deterministic fictional DOOP provider participates. The runner never copies environment
files and removes live-carrier credentials from build and server environments. Browser failures
retain traces in `.tmp/packed-shipping-failures`; temporary installs and servers are cleaned up on
success and failure. CI runs this command in the acceptance job for pull requests, main, and manual
release runs, and retains failure evidence for seven days. Publication depends on that job passing.

## Task progress acceptance

The public paired-harness tests in `task-progress-testing.test.ts` hold server results behind explicit
gates. They cross startup and event invocation, synchronous and asynchronous progress receivers,
and transport batching. Four pairwise combinations run in ordinary CI. For a local extended run,
`EXACT_EXTENDED_TESTING=1 npm run test:task-progress:contracts` executes all eight combinations. A separate overlapping-write case verifies that an older
response cannot overwrite a newer result. Each journey checks progress
before completion, supersession, an unrelated continuation, retained DOM identity, a later
invocation, and disposal. Unexpected client error reports fail the journey even when the visible
result succeeds. Recorder tests split UTF-8 and line boundaries and preserve consumed events
across completion, cancellation, and errors.

Core frame tests cancel before and after releasing a shared await, then verify that unrelated
work and subsequent synchronous and asynchronous tasks succeed. Native runtime acceptance also
cancels a waiting task synchronously from another task and verifies a subsequent invocation
succeeds without inheriting a closed frame.

The owned `test-support/task-progress` fixture exercises asynchronous snapshots, receiver failure,
server failure, supersession, late publication fencing, disposal, and a subsequent interaction.
`npm run test:task-progress` compiles production client/server artifacts and drives Chromium against
a real Node HTTP endpoint. `npm run test:task-progress:contracts` checks protocol authorization,
bounded coalescing, unsupported fallback, full hydration, and generated islands registration.
Build-adapter acceptance runs the shared gated HTTP fixture through Vite, Webpack, and native Bun.
The gate only releases server work after the client receives progress, making buffering observable.
Node HTTP, Express, Fastify, Koa, and Hapi use real HTTP checks. Portable Fetch contract checks also run under Node.
The native runtime suite below carries the same progress journey alongside the other server
boundaries. Validate deployment buffering separately with the deployment probe.

## Ownership and ordering sequences

`npm run test:ownership-contracts` combines paired server responses with local edits, optimistic
rollback, nested writes, Map and Set deltas, and two identical component types in separate roots.
Each cycle verifies task cleanup, SSR and client disposal counts, retained DOM identity, and disposal
while an island implementation is loading. Normal runs use four cycles per batching mode. Scheduled
runs use twenty. Expected hydration cancellation is asserted explicitly.
`keyed-island-ownership.test.ts` additionally reorders task-owning rows, removes one during
a pending invocation, and recreates the same key. It checks independent cancellation, fresh
component identity, stale-result rejection, and exact cleanup counts under both batching modes.
The same journey covers direct imports and eager or lazy registry entries. Switching registry keys
that share an implementation must replace the task owner and retain the unaffected sibling.
Lazy selections also run beneath Suspense. Root hydration checks retain the original DOM,
preserve edits made while imports are pending, resolve nested lazy registries, and isolate shared
imports across disposal and root replacement. The shared adapter fixture exercises lazy selection
adoption and subsequent local tasks through Vite, Webpack, and native Bun.

The registry source fixture also exercises a wrapped factory, an immutable registry alias, a
renamed scoped loader, exact quoted and escaped keys, and literal template imports and export
selections. Client checks retain same-key DOM and replace different-key ranges. SSR and hydration
checks use the same roots. Compiler artifact tests relocate this fixture's emitted modules outside
the source directory and verify deferred loading, DOM adoption, retained updates, and replacement.
Shared adapter controls build both targets, render the selected registry component on the server,
and reject entry assignment or deletion through type assertions and immutable aliases.

Seeded reference models compare reactive mutation journals and task status with independently
recorded command histories. They exercise completion, failure, cancellation, queueing, owner disposal,
and subsequent work. Task generations also account for cleanup and owned disposables. Normal runs
use two seeds with 48 commands. Scheduled runs extend the task model to four seeds and the reactive
model to six seeds with 160 commands. Reactive failures print the seed and a reduced failing command
sequence. Reduction has a bounded replay budget.

`npm run check:runtime-mutations` first requires each witness to pass, then deliberately breaks stale
response rejection, producer cancellation, owned cleanup, or cleanup error propagation in an isolated
module graph. Each fault must produce the intended assertion failure. Startup errors and timeouts do
not count. The framework mutation command includes these checks on ordinary PR builds.

The shared remote-loader journey checks already-cancelled callers, independent shared-load
cancellation, exact reasons, last-owner release, late settlement across replacement generations,
65 concurrent loads, invalid component rejection, and valid retry. It uses a genuine compiled
client component in source tests and in all native hosts and Chromium. Source browser tests
add a simulated 60-second pending wait, integrity-script cleanup, and recovery membership.

Hydration option controls mutate observation aliases across hydration-only, general, enhanced,
and compiler-direct roots. Native browser acceptance additionally observes island notifications and
response metadata through writable aliases. The partition observation journey checks ordinary
nested arrays and records, independent later snapshots, and live generation/build validation.
These controls preserve TypeScript readonly declarations while exercising ordinary JavaScript values.

Core child-composition controls mutate writable aliases to partition records and child arrays,
then reread the original children. Gateway controls decorate its writable forwarding method and
annotate rejection observations while retaining transport errors. Component Intl facade controls
preserve independent component methods, and publication receipt aliases retain scheduled work.

The authored-configuration journey checks callback identity and mutable callback-owned state,
untouched executable metadata getters, ordinary data aliases, and retained schema rejection.
Source configuration tests and all native hosts and the browser execute the same public helper
journey. Node loader controls additionally cover TypeScript/ESM files, writable loader data, and
fresh static enhancement declarations.

The shared event responsibility journey runs 32 compiler-backed controls through delegated,
capture, direct, and same-element contribution listeners. It checks authored focus, blur, and selection, writes retained after
a handled exception, explicit atomic rollback, subsequent events, and listener removal. Source
jsdom and the native acceptance browser consume the same journey. Renderer-owned focus preservation
remains covered by keyed movement and hydration controls.

The shared motion ownership journey checks cancellation before a placement frame, exact abort
reasons, stale-frame isolation, subsequent playback, and cancellation-listener cleanup. It also
checks mutable definition values and handles, independent static inputs, finite negative delays,
and retained invalid timing rejection. Motion source tests and native host/browser acceptance
execute the same controls.

The client request byte-policy journey sends single and batched envelopes through real server
dispatch. It checks default warnings at both ends, explicit rejection before fetch, exact UTF-8
byte limits, and lossless non-ASCII payloads. Hydrate source tests and the native host/browser
matrix execute the same controls.

The SSR output-policy journey renders 17 MiB of markup through all five public output modes
in source tests and native Node, Bun, Deno, and workerd acceptance. Document-event and
progressive modes include physical document output. The neighboring options journey retains
explicit limit rejection and inherited configuration controls. Source stream lifecycle tests
also consume more than 100,000 spans or events and verify producer completion and cleanup.
The same source and native journey checks a broad finite tree beyond 100,000 render values,
including complete output without an implicit quota and retained explicit node-cap rejection.

The neighboring SSR result-observation journey edits preload links and compact hydration
field names through writable aliases. It checks later responses and ongoing field selection
against the private schema cache. Source tests retain readonly type checks and invalid finite
boundary identity rejection. Native Node, Bun, Deno, and workerd execute the same alias controls.

The React context-observation journey replaces fields in a paired context observation and
checks that previously held views retain their native token identities. React compatibility
source tests and native Node, Bun, Deno, workerd, and Chromium execute the same helper.
Build-engine tests separately edit returned configuration, rewrite, and report records for
React 18 and 19 while checking independent engine decisions. Adapter declarations retain
ordinary JavaScript export names and readonly TypeScript types.

The assignment identity journey compares ordinary JavaScript replacement with native reactive,
compiler general-path, numeric-slot, and parent-reference writes. Equal and changed objects and
arrays retain the supplied underlying storage, leave old aliases intact, migrate observers, and
keep same-storage writes quiet. Source reactive tests execute these controls. The authored
`assignment-identity.fixtures.tsx` fixture uses the same equal and changed case selection. Its
shared journey checks object and array RHS storage, old aliases, replacement notifications,
observer migration, the next nested update, durable owner identity, unexpected reports, and
cleanup through compiler output. The representative four-case writer table and eight pending-selection
cases also run through `test:runtimes` in Node, Bun, both Deno cancellation modes, workerd, and
Chromium. Source tests and native SDK bundles share the same assertions. The source-removed
installed-package consumer repeats both tables through its existing native-host and Chromium
journeys. These declarations describe runner coverage, acceptance still requires a fresh successful
runtime receipt. The pending table checks inserted Map.get values, late raw property acquisition,
Map A-B-A aliases, Set clear and external detachment, later publication failure, discard, closed
selection fencing, next publication, and observer cleanup. Raw storage identity, observer delivery,
and actual rollback values have separate assertions.

The shared `assignment-identity-contract.ts` adapter harness builds the authored fixture through
both client and server targets. It uses the existing adapter build owner, including native
`Bun.build`, and executes the built artifacts. Server output includes the framework hydration
publication. The client adopts the original section before executing the same replacement
journey, with the bootstrap beside the application root. This is source-fixture acceptance
against workspace package outputs, separate from the source-removed installed consumer above.

| Adapter | Client mount                       | Paired SSR and hydration                 | Execution host        |
| ------- | ---------------------------------- | ---------------------------------------- | --------------------- |
| Vite    | Equal and changed object/array RHS | Equal and changed RHS, retained SSR host | Node with jsdom       |
| Webpack | Equal and changed object/array RHS | Equal and changed RHS, retained SSR host | Node with jsdom       |
| Bun     | Equal and changed object/array RHS | Equal and changed RHS, retained SSR host | Native Bun with jsdom |

All three rows execute in their maintained compiler-diagnostics integration tests. Vite and
Webpack run through Vitest. Bun runs through its native `test:bun` path. A passing declared
mode is still subject to the exact source receipt. These adapter checks do not establish
assignment-specific HTTP publication authority or released artifact ABI compatibility. Those remain separate release gates.
The source DOM keyed-list journey separately checks retained nodes, durable child instances,
live labels, item-scope retirement, the next nested update, and final cleanup for fresh same-key
objects and retained row references. A fresh item recreates its list operation scope while the
keyed DOM and child instance remain mounted.

The authored `assignment-list.fixtures.tsx` journey additionally runs actual compiler output in
Chromium. A keyed `li` owns a native child with local interaction state and module-owned mount
and unmount observations. The same assertions run against source providers in jsdom and paired
client/server artifacts bundled against built workspace providers by the native acceptance runner.

| Row replacement                       | Source mount | Source strict SSR/hydration | Chromium mount | Chromium strict SSR/hydration |
| ------------------------------------- | ------------ | --------------------------- | -------------- | ----------------------------- |
| Fresh object with the same key        | Executed     | Executed                    | Executed       | Executed                      |
| New array retaining the row reference | Executed     | Executed                    | Executed       | Executed                      |

Each journey compares the exact host and input nodes, parent and child identity, local child
state, live labels, independent old aliases, the next nested edit and event interaction, and
final removal and disposal. Hydration also retains an input edit, focus and selection made
before adoption. Unexpected framework reports, hydration diagnostics and browser faults fail
acceptance. Lifecycle observations establish that the durable child remains mounted and unmounts
once on removal. Private list expression scopes are not inspected through the authored fixture.
Their retirement remains covered by the separate DOM runtime control above.

Run `npm run test:runtimes:assignment-list` after building compiler and runtime providers for the
bounded Chromium check. `test:runtimes` includes the same runner in its default Chromium execution.
The runner closes pages, its Node HTTP server and Chromium, and retains ignored paired artifacts
and a source-fingerprinted receipt under `.tmp`. This browser cell uses the native acceptance
runner's direct paired compiler and esbuild host. Vite, Webpack and native Bun resolution remain
covered by the adapter table above. This adds browser execution of shared list lowering and
built DOM/hydration providers without repeating unrelated adapter or native-host groups.

The array property-journal journey checks direct and compiler writes and deletions, property definitions,
sparse extension, accepted equal length assignments, refused writes, and writes to another
receiver. It retains numeric subscribers and overlapping journals while reusing holes and moving
entries. Source tests and native Node, Bun, Deno, workerd, and Chromium execute the same controls.
Full-clear inverse controls use authored descriptor callbacks for later writes, exact primitive
failures, and conservative refusal of old positions. They verify current observers and a following
journal in source tests and through installed reactive exports. The corresponding mounted array-task
probe is included in the continuation fixtures. Its adapter and native runtime acceptance remains open.
Collection hash controls cover Map and Set clear with independent and overlapping mutations,
native and subclass ordering, object and primitive keys, and later observation. Keyed transport
controls encode during optimistic work, settle it, and replace the selected receiving field. Ordinary,
nested, and indexed aliases cross accepted, refused, unchanged, and reversed property mutations.
Map value controls retain supplied object identity through native and compiler writes, pending
commit and discard, optimistic reversal, and subclass methods. Same references, getters, NaN,
and signed zero provide adjacent controls in source, native hosts, and Chromium.

The gesture ownership journey checks ordinary definitions and samples, detached private pointer
geometry, one timestamp per sample, and retained invalid recognizer rejection in source and native
hosts. Source jsdom, native Chromium, and authored/paired Vite, Bun, and Webpack client bundles
add clock lease disposal, same-clock installations, mutable drag/pinch/keyboard/hover observations,
subsequent movement, and disposed-target listener removal. Live inherited threshold controls
distinguish unchanged values from changed drag/press policies, verify cancellation signals and stale
pointer isolation, and start another gesture after each change. Motion and gesture preparation
controls use changing getters to distinguish captured validation from rereading caller fields,
including valid and invalid timing outcomes. Gesture controls retain inherited declared fields,
original getter receivers, and rejection of an inherited invalid threshold. Imperative motion changes its caller-owned options
while placement is pending and verifies that the browser receives the previously validated timing.

The secret-provider ownership journey runs in source tests and native Node, Bun, and Deno
filesystem preflight. It covers all accepted dictionary names, ordinary provider handles and result
aliases, independent later loads, empty required values, and exact file-load cancellation reasons.
Context controls cover inherited metadata and getter receivers, independent provider observations,
queued and in-flight signal ownership, original getter failures, shared pending identity, and
subscription release after completion. Workerd continues to use its existing custom provider
because the owned host exposes no filesystem binding.

Wide transaction controls run small and 140,000-write nested batches through source, native
hosts, and Chromium. They preserve the original failure, restore atomic state without publishing
intermediate values, roll back retained journals, fence later authoritative writes, retain ordinary
event publication, and verify the next update and reader disposal. Source cleanup controls retain
140,000 leases across both commit and rollback. Node, Bun, and Deno filesystem preflight loads a
9.24 MB valid catalog array, rejects malformed JSON, and loads another file afterward. Source
publication controls register the same catalog count. Internal collection appends preserve data
order without using a variadic function call as a capacity bound.
Array segment controls cover small and 140,000-entry coerced deletions, original error identity,
retained rollback, sparse suffixes and authoritative appends. Reordering with retained removed
entries, discarding their journal, and another rollback execute on the same native hosts and
Chromium. The ordinary sequence rollback scaling frontier remains separate from these controls.
Wide collection controls exercise style updates and removals plus configured inspection pages at
3 and 140,000 entries on native hosts and Chromium. Inspection controls also capture changing
page getters once. Browser hydration controls invoke a public client twice with those boundary-key
counts, verify accepted operation observations, and dispose the client. Source controls retain
oversized-page rejection and nonadvancing-cursor cases alongside those success paths.
DOM range controls mount opted-in raw HTML, inspect its root and tree, edit observation aliases,
replace the output, and unmount. Source journeys use 3 and 1,000 raw nodes, with a separate
140,000-node traversal control. Chromium executes the full journey at 3 and 140,000 raw nodes.
Both configured root reports and the fallback error context are checked, so a handled framework
error cannot hide missing output. Type controls retain readonly diagnostics for inspection fields
and lists. Observation edits preserve component identity and private renderer ownership.
Construction-error controls compare direct roots and parent-owned children, with and without
a healthy predecessor. They preserve original failure identity, route reports to the owning root,
avoid the global fallback context, release replaced owners exactly once, and mount and dispose
another healthy root afterward. Source and Chromium use the same journey with freshly compiled
fixtures. Existing nearest-parent and retry boundary controls remain in the DOM error suite.

Finite inspection controls visit 3 and 256 empty owners with and without a final value, and resume
retained remote offsets beyond 128 source pages. Existing controls retain requested page sizes,
malformed and out-of-range cursor rejection, and rejection of stalled or cyclic source cursors.
Source, all native hosts, and Chromium execute the same finite-source journey.

Computed observation controls edit diagnostic aliases while preserving invalidation and scope
cleanup. Registry controls edit snapshot records and lists while private identity and membership
remain stable. Source controls use owned registry artifacts, and native hosts and Chromium inspect
a freshly compiled named registry. Protocol recorder controls edit recorded header and context
metadata copies without changing transport inputs. Both compiled recorder variants run on native
hosts and Chromium. Readonly diagnostics remain protected by source type controls.

Server contract controls edit helper result aliases and context observations while retaining
TypeScript readonly diagnostics, nested mutable aliases, independent records, request-local
context values, and inspection identity captured before application callbacks. Alternating public requests pair shared executor implementations with separate
write-authority contracts and pair a shared contract with different implementations. Source,
Node, Bun, Deno, workerd, and Chromium execute the same controls.

State selection controls pair accepted, rejected, nested, and whole-state outputs through the
public server handler and hydration merge kernel. Source, Node, Bun, Deno, workerd, and Chromium
check that ignored array methods cannot grant or remove authority. Shared lookup controls cover
3 and 2,000 flat and nested selections, rejection before unauthorized getter reads, depth-first
read order, reserved names, and native array keys. Output and deletion controls retain exact and
enclosing value writes, distinguish collection authority, and reject whole-state deletions.

Intl observation controls execute actual native-analyzed descriptor companions and linked
catalog/requirement modules. Source, Node, Bun, Deno, workerd, and Chromium controls mutate
generated data aliases and runtime snapshot lists while preserving accepted private membership,
stale-generation fencing, and same-generation disagreement rejection. Source type controls retain
readonly diagnostics. Build controls also replace writable interchange methods and retain independent
catalog lists. Lazy and published-package adapter journeys retain translation and relinking behavior.

The JSON-only response reader journey runs through single and batch invocation in source, all
native hosts, and Chromium. It pairs ordinary parsed responses with rejected accessor and `toJSON`
values, under default and explicit byte caps. Failed response bodies retain unsupported-build
classification only for valid plain data, with no rejected hook execution. Existing exact encoded
byte, malformed UTF-8, cancellation, and metadata observation controls remain in their owners.

Bun native producer controls build default, nested, and dot-prefixed hashed output names.
They load the actual published entry, retain page-owned provider behavior, and verify emitted CSS,
assets, and lazy chunks. Source controls check absolute and relative metadata keys against the
same output ownership rule. Native test registration normalizes Bun module namespaces before
selecting the shared API, including older hosts that expose dynamic imports through `default`.

The public package-export journey runs against source and built packages in the native filesystem
preflight on Node, Bun, and Deno. It checks public exports beneath a `..name` directory, imports
the selected module, rejects private exports and a mismatched physical owner, and captures the
package-name getter once. Configuration, component participation, and translation source controls
exercise the same child-path distinction. These tooling APIs have no browser or workerd entry.

Plugin configuration controls mutate context metadata and report aliases while retaining canonical
discovery provenance, actual contributor order, and private execution indexes. Preparation controls
cover application-selected expiration, exact abort reasons, queued signal capture, inherited option
getters, explicit deadlines, and subsequent-stage fencing. Contributor planning controls retain
sorted ready batches, transitive paths through noncontributing packages, cycle rejection, and bounded
graph reads. Root metadata aliases also run during real Vite, Webpack, and Bun remote builds.

The shared plugin metadata journey runs through source parsers and all native hosts and browsers.
It checks independent ordinary records, captured forwarding flags and trust prefixes, selector
validation that cannot be bypassed by caller array methods, and sparse-array rejection. Package
provenance controls mutate result and manifest observations and then resolve the unchanged files again.

## Public testing workflow acceptance

The testing surface needs protection at the same package boundary application authors use.
Server render tests must release owned application resources even when request initialization
or disposal fails. Render and initialization failures survive failing request and application
cleanup, with both cleanup failures retained when the primary error can carry diagnostics. Failed mounts must remove harness-owned containers while retaining
caller-owned containers.
`npm run test:packed-testing` installs candidate tarballs in temporary projects outside the
workspace. It runs the testing guide's exact Counter source and test through Vitest and Bun,
and runs the paired progress, ownership, and lazy registry hydration journeys through installed Vitest
packages. Only the test-runner
import changes for Bun. No workspace aliases or compiler executable overrides are retained.

The shared protocol-observation journey uses identical concurrent requests and verifies client
results, value-free context callbacks, both completion orders, grouping, streaming, cleared
history, and edits to recorded metadata. The in-memory harness executes the full client journey
in source tests and Chromium. Native Node, Bun, Deno, and workerd execute the same transport-owner
bridge with actual invocation and server dispatch, including single and grouped stream responses.
Manually fabricated observations without local transport ownership retain legacy latest-match
behavior and do not establish concurrent request correlation.

`npm run test:packed-mixed` verifies that the installer rejects published reactive 0.6.2,
SSR 0.6.3, server 0.6.3, and JSX 0.6.1 where the coordinated 0.7.0 candidate requires ^0.7.0.
It fetches the exact registry manifests and checks the dependency rejection rather than overriding
incompatible ranges. This is a negative compatibility check, not a passing mixed runtime journey.
Once a compatible 0.7 patch is published, restore a positive mixed-version Counter and progress
journey alongside this rejection coverage. Candidate-only workflows remain covered by
`test:packed-testing`, and frozen released-artifact ABI checks remain independently required.

The guide imports the displayed files directly from `packages/testing/test-fixtures/documentation`.
Changes to those examples therefore change executable acceptance inputs.

Retained element handles reject reads and interactions after removal or view unmount, before
native value mutation or event dispatch. The shared `testing-control-lifetime-journey.ts` checks
replacement and unmount across ordinary and paired views for every interaction helper, then verifies that newly mounted controls
remain usable. Removed component handles also reject state writes and update callbacks. All query families reject
after view unmount, including paired views whose server HTML remains in the container. Context
preparation happens before attaching an owned test container, so a failed iterable leaves no
container behind and borrowed containers remain usable. Source component tests and the installed Vitest and Bun journeys execute these controls.

Role-name queries distinguish omitted filters from the exact empty name. The public paired-view
control checks hidden exclusion, missing matches and repeated regular-expression queries through
source and installed runners.

Existing suites own the remaining public testing workflows:

| Workflow                                                                 | Owned checks                                                                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Mounting, props, context, state inspection, event settlement and cleanup | `packages/testing/src/component-testing.test.ts`                                                       |
| Accessible controls and user interactions                                | `packages/testing/src/query-semantics.test.ts`                                                         |
| Queried class assertions and retained control identity                   | `packages/testing/src/class-matcher.test.ts`                                                           |
| Generated server factory props and authored state type preservation      | `packages/testing/src/server-types.test.ts`                                                            |
| Installed helper imports across typed-array realms                       | `packages/vitest/src/runtime-import.test.ts`                                                           |
| Server state and context inspection after rendering                      | `packages/testing/src/server-testing.test.ts` and `server/component-capture.test.ts`                   |
| Concurrent protocol ownership, batches, streams and clearing             | `packages/testing/src/protocol-concurrency.test.ts`, `packages/testing/src/protocol-transport.test.ts` |
| Streaming protocol observation, cancellation and errors                  | `packages/testing/src/protocol.test.ts`                                                                |
| Compiled child task ownership through timers, mount and strict hydration | `packages/compiler/src/compilation/task-callback-child-ownership.test.ts`                              |
| Compiled paired tasks, progress and intermediate state                   | `packages/compiler/src/compilation/task-progress-testing.test.ts`                                      |
| Event-owned assignments of server task results                           | `packages/testing/src/awaited-task-result.test.ts`                                                     |
| Per-root locale policy across SSR and server task calls                  | `packages/testing/src/intl-workflow.test.ts`                                                           |
| Installed runner compilation and documentation examples                  | `scripts/test-packed-testing.mjs`                                                                      |
| Jest transformation and component mounting                               | `packages/jest/test-fixtures/component.jest.tsx` and Jest package tests                                |

For a new public feature, add a representative author-facing test using the public testing API
to its owning fixture. Include pending state, failure and cleanup when the feature owns work.
Internal regression tests alone do not establish that an application author can test it.
Keep combinations bounded by distinct ownership and scheduling paths. Use producer gates to
control ordering rather than arbitrary delays. Global errors, framework error reports and
unexpected acceptance diagnostics must fail the test. Expected failures need specific assertions,
as in the native runtime suite's deliberately failing server task.

## Shared native runtime acceptance

`npm run test:runtimes` executes one owned application and shared assertions over actual loopback
HTTP in Node, Bun, Deno, and Cloudflare workerd. Install its pinned tools with
`npm ci --prefix scripts/runtime-acceptance`; Bun and Playwright Chromium are also required.
Missing runtimes fail the suite. CI runs the shared application on Linux with both Deno cancellation
modes. The installed-package extension uses default Deno cancellation and jsdom client assertions.
The resource callback journey starts a held child from owned timeout and interval callbacks,
using both original and adapted cancellation signals. It checks that the parent cannot publish
its result before that child completes. The same public framework frame API runs in every native
host, alongside the request-origin and stream-cancellation journeys. Environment-file providers
execute owned filesystem controls alongside public package resolution, wide catalog loading, and
compiler fact projections from an actual captured native response
in Node, Bun, and Deno before the HTTP hosts start.
The owned workerd host uses a custom secret provider and has no filesystem binding.
Debug-origin requests exercise the public HTTP adapters with a configured origin resolver,
accepting the trusted browser origin and rejecting a forged one. Express, Koa, Fastify, and Hapi
have paired adapter tests for the same contract, including one resolver evaluation per request.
The readiness journey checks failure-complete registration cleanup, waiter settlement,
asynchronous publication errors, new-generation recovery, and logical-owner disposal in every host.
The hydration handoff fixture supplies a real list to a packaged stateful receiver with a theme
action enhancement. Strict source hydration checks retained button and list identity. The shared
Vite, Webpack and Bun production journey checks independent package activation, the next
interaction, close and reopen, permitted shell recovery, valid and stale partition authority,
unreferenced ranges, receiving-attempt ownership, and disposal. The same five controls run
with SSR served by native Node, Bun, Deno and workerd in `test:runtimes`. Server markup and
browser observations are captured before
assertions when an evidence destination is selected. Supplied-placement, prepared-fragment and
independent-target cases retain their separate occurrence and lifecycle checks. The independent-target
collection crosses empty-first sibling fallback, a selected component forwarding its child through
`_target`, strict hydration with retained server nodes, and queued structural peer placement.
Prepared-route tests check that captured routes leave the active lookup after successful and rejected
claims. Placement tests check dependent range assembly and cancellation before enclosing moves. Nested authority
controls cross rejected outer partitions with ID-only and versioned inner references in both prop
orders. The packaged Vite plan controls observe the actual pending Target branch and cancel
before commit or after Target adoption, including reentrant replacement and provider cleanup.

The Chromium hydration journey selects a native file before root and island adoption and checks
retained element identity and selection in every HTTP host. Native disclosures and dialogs closed
before root and island activation remain closed. Its shared recovery controls cover
replacement file inputs, modal and modeless dialogs, explicit editable text attribute forms, and
single and multiple select option reordering, missing or ambiguous replacement identities, and
wide nested forms with intervening text and comments under a fixed work budget. A retained
editable range keeps its unchanged markup and native selection. Changed checkable option values
and noneditable replacement targets cannot acquire old control state. Reordered radio controls
with shared form names and stable IDs retain their unchanged option selections.
Vite, Webpack, and Bun also build paired artifacts for the shared form-state adapter fixture.
Its emitted client adopts the emitted server HTML and recovers a mismatched wrapper, checking
file path ownership, draft text, focus, selection, select values, and controls closed relative to
their server defaults. Lowercase and uppercase authored baseline metadata cannot override the
server default. Exact UTF-8 output limits include the generated marker bytes. The adapter checks run
through the existing build-adapter and native Bun CI suites.
After every host and final cleanup succeeds, the runner writes fresh structured evidence under
`.tmp/runtime-acceptance/evidence.json`. The runner removes the previous report before starting
the scenarios and publishes no success report when a scenario or cleanup fails.
Chromium runs on ordinary builds. Local extended checks can run Firefox and WebKit against
the same native hosts using `EXACT_ACCEPTANCE_BROWSER=firefox` or `webkit`. Browser selection changes
the engine, without changing the fixture or assertions.

| Boundary                                                                                                                                                                                        | Node                                     | Bun                          | Deno                         | workerd                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------- | ---------------------------- | ----------------------------------------------------------- |
| Source-removed installed paired components, UTF-8 documents, retained edits, continuation updates, lazy replacement and disposal                                                                | Separate Node HTTP/jsdom adapter journey | Bun.serve HTTP and jsdom     | Deno.serve HTTP and jsdom    | Native HTTP and jsdom                                       |
| Environment-file provider values, empty strings, and startup cancellation                                                                                                                       | Native filesystem                        | Native filesystem            | Native filesystem            | Owned host has no filesystem provider, custom provider used |
| Public package exports, dot-prefixed child paths, private subpath rejection and physical ownership                                                                                              | Native filesystem                        | Native filesystem            | Native filesystem            | Node tooling excluded from workerd                          |
| Wide catalog file arrays, malformed JSON rejection and later file loading                                                                                                                       | Native filesystem kernel                 | Native filesystem kernel     | Native filesystem kernel     | No filesystem binding                                       |
| Compiler inspection, build-fact and explanation projections, mutable observation isolation and refactor descriptions                                                                            | Native tooling projection                | Native tooling projection    | Native tooling projection    | Compiler process and Node tooling excluded from workerd     |
| Secret resolver shared startup, disposal cancellation, and isolated reinitialization                                                                                                            | Native HTTP                              | Native HTTP                  | Native HTTP                  | Native HTTP                                                 |
| Authorized public-context writes in single/batch, buffered/streamed responses                                                                                                                   | Native HTTP                              | Native HTTP                  | Native HTTP                  | Native HTTP                                                 |
| Owned timeout and interval callbacks retain child settlement with original and adapted signals                                                                                                  | Native HTTP                              | Native HTTP                  | Native HTTP                  | Native HTTP                                                 |
| Eager island module delay, selection replay once, subsequent change and disposal                                                                                                                | Native HTTP                              | Native HTTP                  | Native HTTP                  | Native HTTP                                                 |
| Equal-valued prop source replacement, shared Map snapshots, and cancelled catch writes                                                                                                          | Native HTTP and browser                  | Native HTTP and browser      | Native HTTP and browser      | Native HTTP and browser                                     |
| Nonce-only bootstrap authorization, single/multiple scripts, string/stream output                                                                                                               | Native HTTP                              | Native HTTP                  | Native HTTP                  | Native HTTP                                                 |
| Inert hydration JSON, escaped property names, mixed Unicode, dense escapes, repeated serialization and retained following markup                                                                | Native HTTP and browser                  | Native HTTP and browser      | Native HTTP and browser      | Native HTTP and browser                                     |
| Hidden JSON hooks and array indices, native collection iterator rejection, sparse-cell budgets, shared siblings versus ancestor cycles, and browser decoding                                    | Native HTTP and browser                  | Native HTTP and browser      | Native HTTP and browser      | Native HTTP and browser                                     |
| Checked URL coercion, buffered/streamed publication, browser property updates and removal                                                                                                       | Native HTTP and browser                  | Native HTTP and browser      | Native HTTP and browser      | Native HTTP and browser                                     |
| Captured task arguments, local context-reading/publishing helpers, direct SSR and repeated invocation                                                                                           | Native HTTP                              | Native HTTP                  | Native HTTP (both modes)     | Native HTTP                                                 |
| Progress before completion, computed collection selection, terminal failure, fallback diagnostics                                                                                               | Native HTTP                              | Native HTTP                  | Native HTTP                  | Native HTTP                                                 |
| Task pending status across blocking, nonblocking, deferred, completion and cancellation                                                                                                         | Native HTTP                              | Native HTTP                  | Native HTTP                  | Native HTTP                                                 |
| Overlapping optimistic task failures, moved array entries, and a subsequent successful task                                                                                                     | Native HTTP                              | Native HTTP                  | Native HTTP                  | Native HTTP                                                 |
| Default resource disposal chooses one method and preserves subsequent owners                                                                                                                    | Native HTTP                              | Native HTTP                  | Native HTTP                  | Native HTTP                                                 |
| Repeated and changed theme SSR, system CSS, typography and independent rendered content                                                                                                         | Native HTTP                              | Native HTTP                  | Native HTTP                  | Native HTTP                                                 |
| Lifecycle enhancement providers with local callback props, buffered/streamed parity and ordinary island serialization rejection                                                                 | Native HTTP                              | Native HTTP                  | Native HTTP                  | Native HTTP                                                 |
| Disconnect cleanup and subsequent invocation                                                                                                                                                    | Native HTTP                              | Native HTTP                  | Native HTTP                  | Native HTTP, detection on a later write                     |
| Allowlisted dispatch, invalid payloads, authorization and CSRF rejection                                                                                                                        | Shared HTTP assertions                   | Shared HTTP assertions       | Shared HTTP assertions       | Shared HTTP assertions                                      |
| JSON round trips, private error redaction, unsafe HTML rejection                                                                                                                                | Shared HTTP assertions                   | Shared HTTP assertions       | Shared HTTP assertions       | Shared HTTP assertions                                      |
| Retained application context, concurrent request isolation, trusted origins with authority-shaped paths, and disposal                                                                           | Shared HTTP assertions                   | Shared HTTP assertions       | Shared HTTP assertions       | Shared HTTP assertions                                      |
| Application-owned SSR expiration, active response cancellation, document-event, progressive and task-progress reader cleanup settlement, and the next successful request                        | Shared HTTP assertions                   | Shared HTTP assertions       | Shared HTTP assertions       | Shared HTTP assertions                                      |
| Buffered and progressive SSR followed by hydration                                                                                                                                              | Chromium against native host             | Chromium against native host | Chromium against native host | Chromium against native host                                |
| Authored target attributes, changing classes/styles/token lists, native properties and retained identity                                                                                        | Shared browser journey                   | Shared browser journey       | Shared browser journey       | Shared browser journey                                      |
| Literal and spread precedence, reconciled key removal/restoration, control properties and text-host serialization                                                                               | Shared browser journey                   | Shared browser journey       | Shared browser journey       | Shared browser journey                                      |
| General-runtime expression props entering direct SSR, retained after hydration                                                                                                                  | Shared browser journey                   | Shared browser journey       | Shared browser journey       | Shared browser journey                                      |
| Deferred intrinsic spreads, enhancement preparation and keyed intrinsic/fragment hydration with retained updates                                                                                | Shared browser journey                   | Shared browser journey       | Shared browser journey       | Shared browser journey                                      |
| Nested transparent enhancement contexts, ordinary helper parameters, marked children beneath omitted wrappers and sibling isolation                                                             | Shared browser journey                   | Shared browser journey       | Shared browser journey       | Shared browser journey                                      |
| Captured task defaults and collection inputs, computed member key order, iterator-derived updates, ordered local reads, suspended mutations and ordinary helpers receiving explicit state views | Shared browser journey                   | Shared browser journey       | Shared browser journey       | Shared browser journey                                      |
| Awaited task return values assigned by the invoking event                                                                                                                                       | Shared browser journey                   | Shared browser journey       | Shared browser journey       | Shared browser journey                                      |
| Component locale policy in SSR, hydration and repeated server continuations                                                                                                                     | Shared browser journey                   | Shared browser journey       | Shared browser journey       | Shared browser journey                                      |
| Numeric and currency message ranges, equal endpoints, strict hydration and retained local updates                                                                                               | Shared browser journey                   | Shared browser journey       | Shared browser journey       | Shared browser journey                                      |
| Date prototype defaults, invalid dates, list iterator behavior, hydration and retained local updates                                                                                            | Shared browser journey                   | Shared browser journey       | Shared browser journey       | Shared browser journey                                      |
| Typed controls, temporal units/types, Date task helpers, nullable groups, retained edits and modal closure                                                                                      | Shared browser journey                   | Shared browser journey       | Shared browser journey       | Shared browser journey                                      |
| DOM identity, edited input, out-of-order independent updates and disposal                                                                                                                       | Shared browser journey                   | Shared browser journey       | Shared browser journey       | Shared browser journey                                      |

Native-host hydration acceptance also checks browser-coalesced scalar arrays. Buffered, progressive
and island journeys retain the server host and first Text, then exercise replacement, empty output
and reinsertion through local updates.

The browser journey also covers generated-island descendant resumptions in buffered and
progressive output, including a lazy registry-selected task owner. It preserves edited inputs and child DOM identity through activation,
remote updates, and disposal. Its TSX client entry imports a source-removed library stylesheet
alongside a JSX helper. Vite, Webpack and native Bun must emit the stylesheet, and Chromium checks
its computed appearance. The Vite, Webpack, and native Bun fixture checks that descendant
records remain in the parent island payload with the selected component's activation identity.

The suite also checks default after-load and normal bootstrap loading in buffered and streamed
HTML on every native host. Browser checks execute ordered module and classic descriptors under
a nonce-based CSP and verify that deferred descriptors run only after window load.

The fixture lives in `test-support/runtime-acceptance`.
The source-normalization fixture checks inferred setup calculations through two retained updates,
strict hydration identity, and disposal. Its async setup fixture combines an awaited state write
with an independently scoped collection callback parameter. Both run through the native hosts'
shared browser journey. Snapshot-only helper captures remain untracked and refresh when an
independent input changes. Zero-argument policy tasks retain one startup run while awaiting
producer availability. The suite checks subsequent input changes and disposal. Shared paired-artifact
loopback tests exercise reactive async setup and named snapshot callbacks through server dispatch.
Native Node, Bun, both Deno modes, and workerd also exercise synchronous plugin output
rejection with promises, object thenables, and callable thenables. Each result settles under host
ownership, and the next valid synchronous output still publishes. Application and request resource
rollback also preserves the original initialization failure alongside failed cleanup, continues
reverse disposal, and permits a fresh initialization. Native hosts additionally check first thrown
cleanup values across task frames, component unmount, context disposal, and stream cancellation,
including `undefined` and `null`. The native browser journey also checks DOM inspection ownership
across retained updates, detach, reattachment, and removal, rejecting mismatched session, side,
binding, build, execution root, component type, and instance identities. Its factory is registered
twice with the same function, and an older cleanup cannot clear the current registration. The built client query
service repeats those checks, rejects a retained service after reattachment, and filters component,
root, and microfrontend lists by their browser ownership. Each native server also checks authorized
catalog-root filtering before pagination, with a selected second root and missing-root controls.
Malformed debug requests, nested-array capabilities, invocation fields, and unknown query fields
are rejected over native HTTP. Debug envelope validation precedes authorization, and query
envelope validation precedes query dispatch. The built browser transport opens an authorized
session, validates a filtered query response, and closes that session against each native HTTP host.
The shared `invocation-collection-journey.ts` preserves nested Maps and Sets, literal records shaped
like collection envelopes, keyed-list metadata, and an ordinary sibling result through single and batch operations in
both JSON and streamed responses. Source parsers check value, state and context payloads. Native
HTTP transports and the actual acceptance browser run the same collection controls against each host.
The shared `continuation-state-journey.ts` exercises the public client with invalid scalar state
and valid collection deltas, valid state and invalid deltas, both valid parts, each valid part
alone, and a following valid invocation. It checks that failed validation publishes no state.
A collection delta through a sparse local array preserves unrelated holes and the prior snapshot.
Source tests, the native acceptance browser, and installed browser bundles execute these controls.

The shared `router-fetcher-form-journey.ts` checks prevented submissions, independent action state,
retained form and input identity, a following submission, cancellation on unmount, and late completion.
GET controls cross record, URLSearchParams, and FormData inputs with fetcher loading and navigation,
checking query replacement and fragment preservation. Source tests and the native acceptance browser
execute the source compatibility facade. These checks do not establish rebuilt or installed router
package acceptance, which remains blocked by the placement gap in the release-readiness reference.

The shared `router-fetcher-target-journey.ts` loads and submits to another route without changing
the owning page or its output identity, including a relative lazy destination and action-owned
revalidation. Data-target controls distinguish parent and index URLs, pathless layouts, repeated
index query values, explicit route IDs, missing handlers and unmatched destinations. Source
facade tests and native browser acceptance execute both journeys. Native HTTP hosts also execute
the data-target controls. These retain the same rebuilt-router publication limitation above.
The adjacent `router-fetcher-publication-journey.ts` crosses synchronous release, disposal and
replacement at pending-state publication with GET, POST and lazy handlers. It checks following
work, replacements begun from abort callbacks, and notification failures with ordinary, frozen,
null and undefined thrown values. Source, native HTTP and browser acceptance execute the same
controls, retaining the rebuilt-router publication limitation above.
The shared `router-operation-ownership-journey.ts` starts newer navigation from an abort callback
during navigation, initialization and submission, then verifies following work. Independent
revalidation controls retain only the newest handler and result when cancellation starts another
revalidation. Source, native HTTP and browser journeys execute these controls, with the same
rebuilt-router publication limitation above.
The shared `router-request-cancellation-journey.ts` also checks incoming loader headers and GET/HEAD
methods, GET action revalidation, and caller-signal cancellation for direct submit and fetch calls.
Caller controls preserve work started by abort callbacks and fence late handler results. These
controls execute through native HTTP and both Chromium page modes on every owned host.
The shared fixture checks initial and pending GET, HEAD and POST
cancellation through both static query methods, including exact null reasons, ignored signals,
handler Request cancellation, and a following live query. Controller controls carry disposal into
loader, action and fetcher Requests. Source, native HTTP and browser journeys execute those controls.
Submission encoding controls use browser-native Request and FormData to check default URL encoding,
JSON and text bodies, multipart boundaries and file contents, preserved caller inputs, and rejection
of unsupported encodings before dispatch. These retain the rebuilt-router publication limitation above.
The shared `router-matching-journey.ts` checks parent and descendant branches, omitted and present
optional parameters, matching generated paths, effective precedence, prototype-named captures,
encoded splat bases, and bounded ambiguous-pattern controls. Native HTTP runs those controls and
loader transitions on every host. Chromium buffered and streamed pages additionally retain the
parent host while child presentation appears and disappears. Source tests use the same fixture.
String and location-object compatibility matcher controls enforce complete basename prefixes,
including case-insensitive and trailing-slash normalization. These run through source, native HTTP
and both Chromium page modes. They retain the rebuilt-router publication limitation above.
The shared `router-record-journey.ts` preserves prototype-named parameters, URL generation, loader
data, successful and thrown response headers, and error entries. Missing own parameters reject
generation, optional missing parameters remain optional, and inherited data cannot select an error
boundary or satisfy compatibility readers. An explicitly thrown undefined value does select its
boundary. Source and native HTTP execute the record controls, while source and native browser
journeys execute the reader and boundary controls, retaining the rebuilt-router publication gap.

The shared `router-relative-journey.ts` checks route paths separately from browser href formatting
in history and hash modes, with and without a basename. It compares form actions with hrefs,
checks unencoded destination fields and active link presentation, and follows a path-relative link
through navigation while retaining its anchor. Source facade tests and native browser acceptance
execute these controls, with the same rebuilt-router publication limitation above. Adjacent source
controls check pathless and index routes, splats, parent component ownership, query and fragment
destinations, immutable object inputs, and pinned upstream path utility behavior.
Network-relative href controls preserve the destination authority, omit basename and hash-mode
prefixes, and check that a cross-origin link leaves router state unchanged without interception.
Independent memoized consumers check that href and resolved-path hooks each observe a retained
route's parameter change without relying on another subscribing hook.

The shared `router-form-action-journey.ts` retains forms and submit callbacks through parameter
changes in both modes, with and without basenames. Index controls distinguish omitted and explicit
actions, preserve nonempty index query values, select parent and index actions, retain index
selection during fetcher GET replacement, and keep caller input parameters unchanged. File fields
use filenames and repeated fields retain their order. Source and native browser journeys execute
these controls. The data-target journey additionally checks action selection and rejection before
publication through native HTTP hosts, retaining the rebuilt-router publication limitation above.

The shared `static-route-query-journey.ts` verifies read and mutation route selection, metadata and
body preservation, invalid-route rejection before side effects, exact responses and thrown values,
and lazy selection without ancestor loader execution. Source, native HTTP and both Chromium page
modes execute it. Delegated caller cancellation controls cover returned and thrown redirects,
fetcher revalidation and revalidation redirects across those same paths.
The shared `static-router-query-journey.ts` checks request cleanup through whole-page
GET redirect-loop rejection, direct single-route redirects, successful GET, HEAD and POST data,
and redirects. It asserts request context,
body, data and response headers, and canceled loader/action signals after every settlement.
Source facade tests and native Node, Bun, Deno and workerd HTTP acceptance execute the source
static handler. These checks retain the same rebuilt-router publication limitation above.

The shared `router-navigation-journey.ts` checks direct redirects, returned and thrown action
redirects, and redirects during action-owned revalidation. It verifies rejection, idle settlement,
signal cleanup and following work. Publication controls cover pending data across `sync()`, failure
before commit, rejected history writes with and without an intervening sync, and failure after
commit. Stale rejection cannot settle newer work, and cleanup preserves ordinary, frozen and
non-object primary errors. Source facade tests, native HTTP and browser acceptance execute these
controls, retaining the rebuilt-router publication limitation above.

The shared `react-event-journey.ts` crosses intrinsic and component roots with fresh mounting and
DOM adoption. It checks synchronous errors, returned rejections, following work, replacement and
root release. React 18 and 19 source tests and actual browser realms run these controls. The form
journey also checks one owned navigation-failure report followed by a successful submission.
Browser acceptance consumes only exact console error identities registered by the public root
reporters and validated by these journeys. Duplicate logs, unrelated logs and page errors remain
failures. Positive journeys continue to reject all unexpected reports.

The shared `react-cleanup-journey.ts` checks throwing ref release across direct unmount and
replacement, including `undefined` and `0` failures. Both sibling refs release once, detached
elements lose their listeners before ref callbacks, accepted replacements remain releasable,
and the retired container can be mounted again. Source and actual React 18 and 19 browser realms
execute these controls through the runtime acceptance suite.

The shared `react-ref-journey.ts` checks callback-returned cleanup for host elements, class
instances, and imperative handles. A callback shared by two attachments retains two independent
leases. Removing one keyed attachment releases only its lease, and the remaining lease releases
once on unmount. Object refs and void-returning callbacks supply legacy controls. React 18 and
19 browser realms execute the same journey. Queued class-ref updates also check unmount before
commit and rapid replacement, rejecting retired or superseded assignments. Throwing class
lifecycle and ref cleanup preserve the first report and clear instance ownership, including
non-object failure values. Its configured parent logger forwards every failure and preserves an
explicit `undefined` console argument so browser acceptance can verify that report identity.

The shared `react-hook-cleanup-journey.ts` crosses insertion, layout and passive effects with
external stores. Cleanup preserves `undefined`, `null`, zero and ordinary errors, attempts every
release, and releases a throwing unsubscribe once. Activity hide/show controls start new leases
after failed deactivation, retain DOM identity, and deliver the next external-store update.
React 18 and 19 source and native browser acceptance execute the same controls. Configured
parent logging preserves exact console report identity without suppressing other failures.

The shared `react-effect-error-journey.ts` checks initial passive errors and update-time creation
and cleanup errors across all effect kinds. Reports reach the owning context once, following
interactions retain DOM identity, successful replacement resources release, and retired initial
or update microtasks neither execute nor report. Source tests and actual React 18 and 19 browser
realms execute these controls across native acceptance. A nearest-boundary control verifies
local `componentDidCatch` and root `onCaughtError` reporting with recovery, without an uncaught
root report.

The shared `react-preparation-journey.ts` crosses root siblings, retained host children, fragments,
components and portals with successful and throwing rollback. Ordinary, frozen and zero primary
failures survive rollback. Both acquired refs release, listeners retire before ref callbacks,
prior DOM and ref ownership remain intact in these scenarios, foreign portal content remains,
and the next render and unmount leave no orphan ranges. Class and imperative ref attachment
failures and a failed value-factory control are included in the ref journey. React 18 and 19 source
and native browser controls execute these paths.

The shared `react-suspense-publication-journey.ts` crosses immediate and promise-backed
transition candidates with successful and throwing prior ref cleanup. It checks subsequent
interaction identity, every prepared resource's release, listener retirement and disposed retry
fencing. React 18 and 19 source tests and native browser realms execute the shared controls.

The shared `react-child-array-journey.ts` checks 20,000 nested arrays through public child
utilities, native contribution projection, function and class props, client rendering,
synchronous and all-ready SSR, and hydration. It crosses sparse cells, shared siblings,
getter order, species constructors, authored map overrides and cycle rejection with iterator
cleanup. Nested keys and empty slots preserve DOM and input identity through updates, removal
and cleanup. The adjacent `react-bounded-hydration-journey.ts` checks text, transparent and
empty native-owned ranges, preserving delimiters and foreign siblings on update and disposal.
React 18 and 19 source and browser realms execute these controls. Native hosts publish the
shared server result for the browser's actual hydration check. The shared
`react-server-cancellation-journey.ts` checks pre-aborted falsey reasons, pending Suspense,
direct promise cancellation before settlement, successful values and child failure identity.
Both React source targets and native hosts execute these server controls. Node, Bun and both Deno abort modes also run
`react-pipeable-settlement-journey.ts` before serving requests. Ordinary and resumed Node
streams retain early and late falsey failures, caller cancellation, successful output and
one-destination ownership. The Node stream facade is outside the workerd and browser surface.
The shared `ssr-prop-cancellation-journey.ts` checks already-canceled and pending
compiler-forwarded props, exact cancellation reasons, and subsequent generations. It also
checks that a later getter or dependency failure releases earlier waits without canceling
shared sources or leaving unhandled rejections. Source and built Node, Bun, both Deno
abort modes, and workerd run ordinary and direct prop preparation through the same ports.

The shared `ssr-cancellation-reasons-journey.ts` checks native string-output, progressive
HTML and document streams before and after stream creation, exact falsey and Error
reasons, and successful completion. Source and all native hosts execute the controls. The adjacent
`ssr-scheduler-grant-journey.ts` receives the real built scheduler constructor used by
SSR and checks cancellation between permit grant and invocation, work exclusion and
subsequent permit availability. It runs in source and every native host.

The shared `react-children-semantics-journey.ts` compares absent roots with present empty slots,
callback order and receivers, scoped and replacement keys, mapped array flattening and empty
result omission. It verifies source elements and props remain unchanged, callback failures
retain their identity, and invalid source objects are rejected. Public API source tests run
both React targets, and the child-array native and browser journeys execute the same controls.

The shared `react-hydration-ownership-journey.ts` pairs matching and mismatched raw HTML,
retained host and child identity, authored comments and expected recoverable reports. It
transfers raw content back to ordinary children without rereading old payload getters.
Portal markers move inside their adopted parent, keyed updates retain target nodes, and
removal releases refs and listeners while preserving foreign target content. React 18 and 19
source tests and native browser realms execute the same owned controls.

The shared `hydration-cancellation-journey.ts` checks cancellation before client task
dispatch, exact null, false, zero and TypeError reasons, response-reader lock release,
invalid and truncated UTF-8 rejection, undefined and TypeError receiver failures, and valid
event delivery. Source and built browser readers execute
the same controls across native hosts.

The shared `express-cancellation-journey.ts` drives the public Express handler with controlled
transport callbacks. It checks upstream cancellation inside a write and during a pending
drain, exact reasons, and listener cleanup in source and every native host. These are
callback-boundary controls, rather than an installed Express application test.

The shared `request-redirect-journey.ts` checks rejected URLs and header values without
partial response mutation, recovery with a valid redirect, and post-commit fencing. Source
tests and native Node, Bun, both Deno abort modes, and workerd use the public request API.

The shared `server-stream-cancellation-journey.ts` checks pre-aborted and pending request
body reads, progress reader errors, pending and subsequent producer writes, queued production
canceled before invocation, single disposal, and batch cancellation before dispatch or
between dependent operations.
The source owner and native Node, Bun, both Deno abort modes, and workerd execute the same
controls with actual built request/progress owners supplied by the native runner.

Progressive producer unwind controls preserve an earlier signal cancellation even when
rendering subsequently throws another error, and reject publication after cancellation.
They execute through source and built native SSR producer ownership.

The shared `dom-partition-inspection-journey.ts` exercises a deep marker tree on a mounted
inspected root. It checks ordering, immutable retained snapshots, updates, malformed and
foreign markers, and removal. The DOM source fixture and the acceptance browser share
these controls.

The shared `inspection-query-limits-journey.ts` validates configured parser budgets,
including absent optional fields, nonfinite and fractional values, safe-integer boundaries,
and zero explicit-kind limits. Source, the actual acceptance browser, and every native
host execute the same public parser controls.

The shared `task-progress-cancellation-journey.ts` checks exact originating cancellation
reasons, active cleanup, and pending snapshot fencing. Source Core and every native host
execute the same receiver controls. The fixture also checks that discovering a disposed
task owner preserves a controller cancellation that happened earlier and never enters work.
Existing receiver controls also cover owner disposal,
latest pending snapshot selection, failure recovery, and sibling isolation.

The shared `produced-response-cancellation-journey.ts` checks synchronous and asynchronous
body cancellation, retained scope release, demand-blocked writer failures, and successful
stream completion. Native Node, Bun, both Deno abort modes, and workerd execute the same
public body factories as the source test.

The shared `server-context-cancellation-journey.ts` uses public request owners to check
initialization cancellation, retained stream read failures and producer cancellation, exact
null, false, zero and TypeError reasons, and a successful subsequent request. Source and
every native host execute the controls. Self-canceling request factories and
custom fetchers also reject after cancellation, with no unhandled failure. The server
controls include a pre-aborted request that never invokes its factory.

The agent's `connection-failure-journey.ts` checks malformed page sessions, failure during
binding, event registration or connection, and disconnect cleanup with falsey failures.
Source tests and native Node, Bun and both Deno modes use the public injected-transport
boundary, independently of the real-socket journeys.

The agent's `cdp-journey.ts` uses an owned loopback discovery service and real WebSockets
to check exact connection/request cancellation, pending request limits and capacity recovery,
closed request rejection, malformed frames, event subscription cleanup, request failures,
timeout recovery, UTF-8 message and discovery byte limits, and operational ceiling validation,
explicit missing-target rejection, default page selection and explicit target selection. Source
tests and separate native Node, Bun and both Deno abort modes in preflight executions verify the same transport
contracts. This automation transport is outside the workerd server surface. The native runner
records these four preflight executions separately from framework-host and installed journeys.

The shared `inspection-query-journey.ts` checks detached request, subscription, debug and response
snapshots, own data fields, accessor rejection without execution, custom iterator isolation,
shared graphs, malformed values, safe rejection IDs, exact graph bounds and pagination
progress under bounded positive result limits. Native inspection
and browser serialization acceptance execute this journey through built protocol exports. The
adjacent `inspection-catalog-data-journey.ts` crosses catalog envelopes, root dictionaries,
files, entities, locations, redactions, runtime identities and array slots with authored
accessors. Valid data controls, inherited records, custom iteration and revoked identity
inputs are included. The source and native journeys share `inspection-catalog-fixture.ts`.

The shared reactive protocol journey preserves literal collection-tag records alongside real
Maps, Sets and keyed arrays. Malformed escape rows, duplicate keys and inherited required fields
are rejected. The reactive protocol journey also checks constants in top-level values, object
fields, arrays, Maps, and Sets on each native host. `hydration-record-journey.ts` publishes reactive
document state, own `undefined` values, and numeric constants through SSR, verifies decoded types and encoded graph limits on the native host, and supplies that script
to the browser's public hydration reader. Native Node, Bun, both Deno abort modes and workerd run
this endpoint and browser control. The native endpoint also compares a valid ordinary island
array with the same array after keyed metadata pushes its encoded graph over the default limit.
Installed acceptance executes the shared codec journey. The invocation collection fixture also
preserves own `undefined` values and numeric constants in single and batch responses, contexts,
collection deltas, progress, and decoded patches. Browser acceptance verifies that DOM state-patch
publication preserves collections and constants when its stored attribute is decoded again.
The compiled task-capture fixture distinguishes property deletion, array-cell deletion,
input-only skipped branches, performed equal-value assignments, array pushes, descendant updates
with skipped parent assignments, complete parent replacements, owned child Map publication,
Map replacement after an earlier delta, owned child-task deletion, assignment to undefined, and a skipped conditional write after an
await. Each native host invokes the generated executors through buffered and streamed transport.
Each native host also binds a task from a separately bundled provider through its host provider,
checks settlement and status, and invokes it again under the same explicit owner.
Provider-copy source controls hold ordinary and detached children at a gate, cancel their parent,
and check settlement, cancellation, subsequent progress, and restoration of setup ownership.
Native hosts repeat the ordinary and detached child settlement and cancellation controls through
the same separately bundled provider fixture.
The shared `task-failure-ownership-journey.mjs` checks primitive and frozen primary failures,
complete cleanup, appended diagnostics, cleanup-only `undefined` failures, subsequent success,
and settled-child cancellation isolation. Source tests execute general frames and flat server
slices. Each native host repeats both execution owners through the task-capture endpoint using
the framework frame and server-component execution entry points.
The shared `external-source-lifecycle-journey.mjs` exercises ordinary and selected source bridges,
accepted snapshot identity, reentrant connection, disposal during acquisition, failed connection
rollback, retry and cleanup. Source tests and each native host execute the same journey. Chromium
also imports its browser bundle from each host and checks the client behavior independently.
The shared `task-cancellation-contract-journey.mjs` covers reasons with throwing string-conversion
methods, getters and primitive hooks, active cancellation, cleanup, next execution and primary
failures with hostile prototype traps. Native hosts additionally cross physical provider copies
and confirm that foreign cancellation does not enter application task error status. Chromium
executes the reason and ownership journey through the same client bundle on each host.
The shared browser continuation-state journey checks deletion-only publication, unauthorized
deletion rejection without partial state or collection changes, and subsequent successful work.

The compiler's `helper-owned-publication`, `helper-owned-execution`, and
`helper-owned-lifecycle` tests protect source-backed scalar helper ownership. They execute real
compiled bodies, individual and batched Node HTTP publication, equal versus skipped writes,
consumed async aliases, ordinary callable identity and arguments, overlapping lexical signals,
cancellation after suspension, following work, and cleanup. Native helper source tests separately
check finite eligibility, resolved import identity, and incremental binding changes. These checks
do not establish source-removed server helper support, escaping method ownership, or array alias
publication. The shared publication fixture also carries synchronous and asynchronous scalar
helper cases for adapter and native-host execution. Its declared modes require separate executed
acceptance, including the supported host and build-adapter matrix.

The shared `state-publication.fixtures.tsx` and adapter publication contract build client and server
artifacts through Vite, Bun, and Webpack. Each server artifact executes individual and streamed
requests against a separately loaded handler. Assertions cover skipped input-only branches,
equal-value and undefined assignments, deletion, finite array mutation, descendant versus parent
selection, owned child Map deltas, final Map replacement, and task-owned resource disposal. These
checks exercise duplicated provider code within one realm rather than assuming bundle-local
identity stores can serve an external handler.
The declared `detached-child` mode awaits a detached server child through an ordinary async helper
and expects its performed label write in the same response. Its paired native project artifacts are
qualified. Adapter and runtime execution of this mode remains open until normal core/server provider
publication succeeds.

The shared `list-marker-journey.ts` checks empty marker data, literal escape-looking keys,
canonical lookup, insertion, removal, ordering, and invalid batch rejection. Each DOM transition
runs against compact and legacy item markers and checks retained node identity. Removal followed
by reinsertion also checks the next interaction. Nested receipt snapshots exercise repeated inner
keys, an outer key matching an inner key, and consecutive moves after reindexing. Native hosts
produce real SSR keyed snapshots and diffs, which the browser applies through the built patch
reader. Installed-browser acceptance repeats the codec and marker-format transitions.

The shared `array-end-mutation-journey.ts` checks partial native push and pop failures,
accessor side effects, inherited destination constraints, authored argument reads,
ordinary return values, and optimistic rollback of removed or appended slots. Source tests, native HTTP, ordinary browser hydration, and
installed-island browser acceptance execute the same controls. Descriptor-sensitive arrays use
the existing general mutation path rather than duplicating exception recovery in the fast path.

The shared `reactive-protocol-journey.ts` checks nested reactive keyed arrays, Maps and Sets,
validated-array metadata lookup, explicit undefined values, shared siblings, and ancestor cycles.
Malformed-envelope controls reject missing own slots in Map pairs, Set members, and keyed-list
keys, hashes, and items, including inherited indices. Source tests and the native HTTP endpoint
execute the same assertions. Both ordinary browser hydration and installed-island acceptance
execute the collection journey through their built reactive package.

Native value-preview controls preserve Map and Set contents without executing authored iterator
getters or callbacks, derive type labels without executing constructor or name accessors, and
retain undefined, non-finite numbers, and negative zero as distinct constants through validated
JSON event transport, with identically named strings kept separate. Empty keys remain
valid, overlong or over-budget UTF-8 keys stop traversal before their values are inspected, and
Error details mark the preview truncated when the entry budget is exhausted. Native response
validation accepts supported failure strings and rejects both single and nested array selectors.
Native catalog validation accepts a 20,000-level source tree, rejects a cycle at its deepest
entity, and pairs valid records with sparse-array rejection across source files, components,
children, reasons, redaction lists, and classification metadata.
The same native controls register that deep catalog, query its deepest entity, reject a missing
identity, and receive `limit-exceeded` for a subtree that exceeds reactive transport depth.
The shared response-encoding journey checks that snapshot limits and auditing use the body
actually sent. It covers changing getters with auditing enabled and disabled, encoded collections,
ASCII and multibyte byte budgets, unencodable values, and failed audit observers. The focused
server tests and all native hosts execute the same owned journey.
The same native session also pages combined browser metadata and server catalogs through the built
query service, retaining every record across the source boundary. Retained browser services cannot
list newly attached component identities, and malformed legacy cursor escapes preserve subscription cleanup.
The built DevTools installation shares concurrent opens, closes a late server session after
disconnect or disposal, allows reconnect after disconnect, rejects reconnect after disposal,
and restores detached owned highlights while preserving foreign markers and later changed
authored outline values and priorities. A disposed hook cannot borrow the replacement session
to highlight retained DOM.

The compiled portal event fixture and shared browser journey check independent roots sharing
a target, retained state during retargeting, listener release while roots remain mounted,
reacquisition after portal removal, nested renderer roots, and redispatch of the same native
event. These controls run against each native host with ordinary hydration and installed event
islands. Focused DOM controls additionally cover two portals owned by one root, nested portal
targets with reactive handler replacement, targets inside the root, native propagation stopping,
and failed placement rollback followed by recovery.

DOM inspection, DevTools connection lifecycle, and portal event ownership journeys repeat
after same-build hydration with extracted event islands, retaining the setup activation owner.
Native source controls separately reject synchronous and async feedback
cycles and setup locals that escape their managed continuation.

Named task definitions remain definitions:
state feedback inside their bodies must not enter setup-derived cycle analysis. The shared browser
journey holds an older continuation while two independent updates complete, then checks that
its disjoint state write still publishes. A prop-dependent nested write also verifies capture
transport and write-only parent preparation. The browser invokes a named server task twice, so
successful compilation alone cannot mask eager execution or lost state updates. The Vite, Webpack
and native Bun shared HTTP fixture checks the same capture and nested-write executor behavior.

These are runtime boundaries. Vite, Webpack, and Bun build integration and Node host-framework
middleware retain their separate suites. Generic serverless response buffering is an explicit
unsupported live-progress path, checked by the existing adapter contracts. Cloudflare network
buffering, provider execution limits, and deployment configuration still require deployed probes.
The matrix records representative checks, not exhaustive execution of every unit test in each host.

The debug-audit journey also runs through each native HTTP invocation endpoint. It checks
synchronous session and runtime closure, request cancellation, throwing callbacks, rejected
promises and thenables, and throwing `then` accessors. Live queries and the next owner remain
usable after notification failures. Expiry during an audit callback uses an owned source-test
clock.

The debug-query lifetime journey runs inside each native host through its HTTP invocation endpoint.
It holds an inspection service query pending, revokes its session, shuts down the debug runtime,
or cancels the owning request, then settles the query with a result or rejection. Retired results
remain unavailable and produce no result audit. A subsequent live owner still queries normally.
Runtime shutdown and cancellation also cross forwarded request-local sessions. Source tests add
an owned clock to cover expiry without another request triggering session pruning.

The dormant-island journey also places one or two eager hover children inside a server-owned
slot under a parent with a different interaction policy. A controlled parent-loading gate checks
shared ancestor loading and settlement. It retains the ancestor, slot and buttons, delivers two
hover rounds, rejects unexpected reports and verifies disposal removes handlers. Removing an
ancestor during pending activation fences its children, and a new registered owner then progresses. The same portable
journey runs in hydration unit tests and Chromium across every native host.

The root-cancellation journey runs through complete, hydration-only, and compiler-selected
hydration in Chromium on each native host, for buffered and streamed pages. It cancels before
loading and while loading, checks exact null readiness rejection, preserves inactive server DOM,
and verifies a sibling sharing the load retains its target and becomes interactive.

Eager-island acceptance holds module loading behind an explicit gate, selects an SSR control before
adoption, and verifies the value and one handler invocation after release. It also checks the next
change and disposal. This runs through buffered and streaming responses on all native hosts. The same browser pages
also exercise the shared island-generation journey. A retained boundary changes generation while
its module import remains pending, with and without registry refresh. Only the replacement
interaction replays, the next interaction works, and the shared import executes once. Capture
ownership controls cover initial cancellation, replacement by a canceled owner, and a subsequent
live owner. Hydration source tests use the same portable controls.
The shared Vite, Bun, and Webpack wrapper fixtures exercise the generated replay metadata and
compact descendant DOM identities. Timing sleeps or hydration-readiness waits before the first
interaction cannot substitute for this loading-window check.

The owned native page also reuses one component under HTML and SVG, including property-only
claims beyond the compact path depth, and verifies retained updates. MathML text and reactive
annotation encoding integration points produce HTML children. Changing encoding while inserting
and removing a child range checks namespace construction against the current input. A client-only child mounts in its
compiler-identified server placeholder while parent hydration retains edited input and focus.
Spread-key rows retain
edited inputs through prop copying, overridden-key changes, replacement, reorder and removal,
including helper return types that omit a key present at runtime.
The native progress fixture calls an ordinary helper named `optimistic` on the server, protecting
placement independently of task-context capability names. These checks execute in each native
host journey rather than relying on a declared corpus mode.

## Local extended discovery

Extended exploration is explicitly invoked locally. CI retains representative contract and regression
checks and has no scheduled discovery run. After the normal build and acceptance prerequisites,
these commands expand the investigation without adding work to the regular pipeline:

```sh
EXACT_EXTENDED_TESTING=1 npm run test:task-progress:contracts
EXACT_EXTENDED_TESTING=1 npm run test:ownership-contracts
npm run test:packed-mixed
npx playwright install --with-deps firefox webkit
EXACT_ACCEPTANCE_BROWSER=firefox npm run test:runtimes
EXACT_ACCEPTANCE_BROWSER=webkit npm run test:runtimes
```

Turn discovered defects into focused regression tests after fixing their owning framework contract.
Keep raw exploratory captures local.

The [compiler confidence workflow](native-compiler.md#compiler-confidence-workflow) connects a
bounded set of language families and contract edges to fresh, exact test executions. Its inventory
records producer and consumer obligations and preserves scope limits and known evidence gaps.
The environment profile, `npm run test:compiler:confidence:environments`, reruns the existing
Vite, Webpack, native Bun and HTTP/browser acceptance journeys and registers exact executions
alongside the compiler evidence. It keeps installed enhancement SSR, workspace split-build
hydration and native runtime acceptance separate. The default compiler profile leaves those
environment edges explicitly unexecuted.
The installed enhancement fixture also exercises ordinary JSX helper imports, separately built
libraries using transparent JSX fragments, and duplicate physical runtime packages through Vite, Webpack, and Bun. Its controls
check active providers, denied optional implementations, absent providers, and providers installed
only by the library. The paired test-helper fixture checks default Vitest, Jest, and Bun test
hosts with server rendering and a subsequent client counter interaction in the same test process.
The installed-library Vitest fixture separately renders generated server artifacts and theme
providers under Node and jsdom, invokes server progress through the same task authority, and
checks that a retained reporter stops after settlement. Authored client/server enhancement
projections and their bundle catalogs remain separate in the existing transition matrix.
Compiler artifact test bundles preserve their target even when their temporary filenames differ.
Discovery controls cover physical linked roots, participating
transitive dependencies, cycles, absent optional packages, and malformed manifests.
Application-root fixtures build an unpublished application outside the process working directory.
Vite's resolved root, Webpack's compiler context, and Bun's build root must select the application's
own configuration and authorization boundary. Each adapter also checks an explicit application-root
override. These are executable build and SSR checks, independent of source-placement analysis.
These checks complement this corpus's path declarations. They do not treat those declarations as
execution or claim that workspace hydration witnesses cover independently installed split-build islands.

The shared `framework-adapters/test-support/partition-island-contracts` source also runs through
compiler artifact emission and the Vite, Webpack and Bun workspace hydration journeys. Its finite
fallbacks retain DOM identity, custom event data requires eager activation, a dormant nested await
permits interaction replay, and nested methods keep captured native events eager. Literal and nested
state keys update independently. An opaque derived callback spread activates in its client
placeholder, invokes its reconstructed callback twice and releases its owner on disposal.
The shared form binding journey includes finite string union radio selections and checkbox
collections. It checks repeated selection, removal, clearing and reset while retaining each control.
Its shared fixture also crosses asserted intrinsic targets, computed component notification
targets, ordinary asserted assignments, and writable copies whose receivers become derived
cells. The next event selects the current state member and preserves its sibling. These checks
run through mount, strict hydration, installed adapter consumers, and native runtime acceptance.

The owned target-attribute fixture also checks authored overrides, class/style/token replacement,
native properties, retained DOM and disposal through mount, strict hydration and the shared
adapter journeys. Native-host acceptance carries its transitions through both buffered and
progressive output. Workspace checks remain separate from independently installed package evidence.

The shared `framework-adapters/test-support/installed-islands` journey builds a library separately,
copies its paired artifacts and runtime dependencies into an isolated consumer, and removes producer
source. Its client uses the consumer's generated hydration registration, including the library's
aliased public root and private component closure, rather than manually composing library roots.
Portable event dispatch also crosses this boundary through a `Readonly<EventTarget>` alias.
Vite, Webpack and native Bun execute buffered and progressive server-parent hydration,
continuation updates, a private eager/lazy registry child, retained DOM and input, key replacement
and disposal. Consumer builds reject missing metadata, incompatible metadata and a missing client
target. A stateful library context provider without a local event handler retains its server-authored
children and DOM identity through two descendant control updates. The control resolves the same
provider before and after each update. The provider also uses a motion enhancement, whose activation
registration must be discovered through the library's enhancement edge without framework reports. A spread-attribute class map also crosses SSR, strict hydration and retained
updates, preserving native integer-key order and prototype setter semantics. Initial documents and task dispatch travel over an owned loopback HTTP server. The
installed child also crosses explicit and defaulted destructured props. Its typed event receiver
retains a Boolean capture option, removes listeners after successful settlement and owner
replacement, and verifies that explicit symbolic disposal of a published native helper class
and explicit task-context ownership each run once. Conditional disposal preserves fallback
ownership when its branch does not execute. Native lexical disposal runs once, including
cancellation. Fixed tuple spread setup follows retained prop updates without replacing the row. It verifies listener isolation on the next invocation and final disposal. It starts controlled blocking
client work, cancels it on registry replacement, makes subsequent progress in the new owner and
cancels unfinished work on final disposal. Releasing retired work must not publish into its successor.
jsdom client preserves the existing identity and cleanup assertions, and the host verifies the
initial GET and four operation POSTs without unexpected transport errors. Progressive fixture
output is assembled before the initial HTTP response, so it does not prove progressive document
delivery. Registration is composed eagerly from executable component contracts.
`npm run test:runtimes` also runs the installed journey using Vite-built consumer bundles on
Bun.serve, Deno.serve and local workerd. The same jsdom assertions verify both buffered output and
assembled progressive output, including UTF-8 text, initial input edits, four remote operations,
retained DOM, eager/lazy replacement and disposal. Native hosts own their Fetch requests and
responses. A fresh named-test report is required before the runtime runner records success.
These host combinations complement the adapter matrix rather than replacing it.
Automatic package bootstrap discovery, real-browser behavior and other adapter/native-host
combinations need separate evidence.

The installed provider and report fixtures add separately published, typed library controls.
Vite, Webpack and native Bun verify transparent provider children through two appearance changes,
with retained DOM identity and no hydration reports. Report fixtures verify keyed and scalar prop
spreads, explicit and spread callback props beneath a continuation owner, two hover updates and
listener disposal. They check buffered and assembled progressive SSR before hydration. Enhanced
render programs retain the authored component as their reactive owner when adopted inside SSR
marker ranges. Vite also runs explicit-prop and unenhanced controls. A Chromium development fixture
uses a custom cache directory and automatic library handling, without authored SSR inlining,
optimizer exclusions or a shell event anchor. It checks two appearance changes and cookies.

The Vite library-watch SSR fixture waits for initial publication before loading the consumer. It
checks authored consumers and regenerated paired consumers through repeated valid edits to an
internally imported sibling component, retention
of the last successful output after an invalid edit, recovery on the next valid edit, and
watcher/server shutdown. This edit/reload journey checks the Vite development host separately
from the shared library builder's serialization and lifecycle tests. Native watch diagnostics
independently cross declaration checking, JavaScript checking, disabled checking, and retained
reverse-dependent source errors, unchecked JavaScript, diagnostic directives, and producer-owned
paired targets. Sibling-project source and declaration edits also cross scalar/list lowering in
both targets, linked physical paths, recovery, and unchanged notifications. Emitted artifacts are
checked semantically and execute client mounting and buffered/streamed server rendering. The SSR
watch fixture checks normal Vite invalidation and explicit full-module reloads. Authorization
generation tests also reload a published child with its consumer cached, before and after the
first commit. They check cycles, fresh metadata after removing an internal import, revoked
application dependencies, denied policies, and recovery. Bun and Webpack independently repeat
root and delegated package authorization across fresh generations. Vite controls also replace
an authorization generation during an active resolver request, preserving current-policy denials
and final disposal. A published source transform before root replay cannot replace published
authority. The configuration watch journey checks this through five enable/remove/restore
transitions. Installed enhancement fixtures render newly loaded authored and paired pages
through a retained renderer after full graph invalidation, assert status and field output without
unavailable-provider warnings, and repeat four reloads. Catalog controls check application and
target isolation, stale provider completion, same-evaluation conflicts, explicit caller catalogs,
and owner cleanup. An owned Chromium development fixture mounts an enhanced button with
optimized dependencies, clicks it, and repeats source edits with enhancement and interaction
assertions. Run it with `npm run test:development-browser` after building workspace packages
and installing Chromium. The compiler browser acceptance job executes this check. Browser catalog resolution remains the core entry used by optimized dependencies.
Vite SSR and Webpack watch fixtures execute unchanged consumers through scalar/list declaration
edits and recovery. Native Bun repeats the same transitions with one retained plugin. Native watch
input tests cover erased imports, transitive types, ambient declarations, source scoping, unresolved
imports, default-library exclusion, and reset.
The library watcher separately verifies that asset edits do not rebuild components
while JSON and authored edits still do. Output transactions protect unchanged file identity alongside
rollback and overlapping publication. Library replacement additionally protects unchanged file
identity, changed and removed files, permission changes, unsupported links, and fresh publication
markers. Hydration registration checks private runtime exports against
a library declaration surface that intentionally omits them.

The shared adapter diagnostic fixture also builds object and array state assignments in strict
projects through Vite, Webpack, and native Bun, for both executable targets. Native semantic
checks own the valid and incompatible-type assertions. Bundler build acceptance alone does not
establish TypeScript type rejection.

Imported helper write-authority controls build both targets through each adapter. A static member
write is accepted, while a dynamic member destination cannot grant finite server publication
authority. The source corpus's `pending-owner-overlap` journey independently crosses ordinary
helper mutation, captured/defaulted props, retained enhanced hosts, keyed replacement and disposal
through mounting and full-root hydration. It asserts pending isolation, abort signals, subsequent
progress, stale handler removal and exactly-once cleanup without unexpected framework reports.

The pending-owner journey shares observable assertions between jsdom and Chromium. Both mount and
full-root hydration cross plain/enhanced hosts. Two fixed seeds each execute 48 steps across latest
and parallel tasks, prop rebinding and replacement against a model of committed state and current
ownership, then verify disposal. Browser
acceptance repeats these journeys on each native runtime's paired output. The installed-library
journey also executes in Chromium against an owned Node HTTP server and Vite consumer bundles for
both buffered and assembled progressive output. Native Bun/Deno/workerd installed delivery remains
independently checked with jsdom. Browser execution does not establish deployed-provider behavior.
Imported bare-value policy controls include actual and type-only client references through all
three build adapters, with public sibling controls.

The computed-component-member fixture checks finite resource ownership, lifecycle key evaluation,
optional ref calls, extracted reactive methods, and ordinary object receivers. Mount and strict
hydration retain DOM across two interactions and release component resources exactly once without
unexpected framework reports. The native runtime page shares these assertions across Node, Bun,
both Deno cancellation modes, and workerd. Paired Vite, Webpack, and native Bun builds also execute
computed ownership, lifecycle, ref, and reactive SSR through the shared source-contract fixture.
The shared owned-protocol island source crosses generated island hydration in the adapter journeys
and every native-host browser journey. Direct and finite-spread refs are ready for the first
interaction, reactive methods retain captured props, two updates preserve DOM, and disposal
removes interaction authority. Native paired-target source witnesses check the equivalent ownership and lowering contracts.

The shared `framework-adapters/test-support/compiler-state-alias-contract.ts` fixture builds both
targets through Vite, Webpack and native Bun. Its server execution checks nested array holes, a
setup state alias mutated by an ordinary helper inside a blocking task, renamed DOM teardown
placement, and an imported component with an inferred browser computation under package-scoped
enhancements. Neither browser-only component executes during SSR. The emitted SDK controls
additionally check retained client DOM identity after the next
interaction, direct and object aliases, lexical shadowing, defaulted receiver rejection and rest-copy
validation. Native runtime acceptance exercises the same nested alias and helper publication through
Node, Bun, Deno and workerd in the owned task-capture journey.

The shared `framework-adapters/test-support/compiler-intl-structure-contract.ts` fixture builds
localized client and server artifacts through Vite, Webpack and native Bun under strict TypeScript
checking. It combines element and opaque message structures with a reactive time value. Analyzer
tests also compile both generated targets directly, protecting callback input types independently
of bundler execution.

## Source representations at build-adapter boundaries

The shared `framework-adapters/test-support/source-representation-contract.ts` fixture imports
one authored component as executable TSX, raw source text, and a URL. Vite and Webpack build
client and server outputs. Native Bun runs the same contract with a host asset plugin that owns
a separate namespace, since Bun does not implement Vite’s query conventions. Each runner
asserts exact source bytes, combined-query equivalence, executable component identity, and server
rendering. `packages/vitest/src/source-representation.integration.test.ts` separately executes
component-only controls and mixed executable/raw/URL imports in client and server test graphs
through built packages. `npm run test:build-adapters` executes these adapter and Vitest checks in CI.
Explicit Webpack loader checks preserve asset bytes without creating compiler owners.
Positive diagnostic-build journeys retain every host warning and its structured receipt.
Rolldown’s bundler-owned `PLUGIN_TIMINGS` code is printed as nonfatal timing advice, separately
from correctness diagnostics. Plugin-authored warnings and unknown warning codes still fail the
positive contract. These journeys do not establish a compilation performance budget.
Authorization tests retain stale executable generation rejection and
denied-library pre-evaluation controls. No runtime protocol or native lowering change is involved.

The task-closure fixtures share authored repeated-activation, method/default evaluation, escaped
callback cancellation, ordinary async closure and independent child-task programs with the native
and compiler HTTP tests. Shared state-publication adapter journeys also exercise task-created
methods and async closures with input-present writes. Render-property and native runtime journeys
check client closure publication alongside existing generation state. Detached child ownership is
checked separately from its unresolved parent-response publication contract.

The `nested-evaluation` task fixture adds an accessor-selected method with two awaited arguments.
Its first argument replaces the method after the original reference has been read. The HTTP test
requires one original Get, the original receiver and callee, argument order, and catch/finally
behavior. Cancellation must stop the remaining argument and invocation, release once, and admit a
following activation without reviving canceled work. Strict TypeScript 7 qualifies the source.
On the current integrated analysis source, its initial Analyze request exceeds the unchanged
30-second deadline, before transformation or runtime execution. Those runtime assertions remain
unexecuted. The existing synchronous method/default fixture passes. Its harness ignores only
warning-level `EXACT_ANALYSIS_COST` and retains all other diagnostic obligations.

## Form submission lifetime

`test-support/forms/submit-lifetime.fixtures.tsx` uses the Form and Field source owners
without depending on the separately unresolved Input component placement. Its shared journey
checks held validation and native submit callbacks across disposal, retained refs, detached
listeners, synchronous cancellation, already-started callbacks, rejection reporting and following
progress. The Forms package tests also check superseded Field validation. The adapter integration runs the authored source in Chromium through
Vite, Bun and Webpack. These source-graph checks do not establish normal Forms package publication
or installed-package acceptance.

The Array completion source family lives in `test-support/array-completions`. Its compiler runtime
owner is `array-completion-runtime.test.ts`. It exercises real paired module helpers and direct
Array mutation, caught partial native writes, unchanged and reverted completions, retained moves,
equal scalar assignments, root replacement, next interactions and cleanup. Independent keyed lanes
finish out of order through actual state admission while preserving Array, member and output
identity. Child cancellation distinguishes already performed effects from fenced later work.
Pure Array grammar tests and hydrate ordering tests protect sparse slots, duplicates, canonical
member fields and symmetric indexed-scalar versus structural ordering. Operation-local batch and
stream parser controls include canceled queue items and non-Array siblings.

The shared adapter diagnostic contract `Array completion publication` builds the member-only
corpus through both client and server targets with the installed Vite, Webpack and native Bun
plugins. Its HTTP journey invokes direct and helper appends, a helper member update and a following
append through generated root registration. JSON and stream controls assert compact publication,
retained Array and record identities, empty reports and disposal without another request.
The compiler stream owner `array-completion-stream.test.ts` crosses generated Array and scalar
executors in one cancellation-filtered batch. It checks terminal completion admission by actual
stream index, including member-only success and absence of the token on the scalar sibling.
The native runtime runner uses the generated client binding from its paired state-publication
artifact for each submission, including parser admission and capture release. It retains the
scalar, deletion, Map and performed-assignment controls. These are executable acceptance owners,
not evidence that every host or adapter has passed. Each affected environment requires its own
normal provider execution before release.

The `test-support/symbol-state` family owns symbol-keyed island snapshot rejection and its named
property correction. `symbol-state-diagnostic.test.ts` checks the public paired SDK boundary and
retained named-state hydration across interactions. The shared `symbol state snapshot` adapter
contract builds the same CLIENT source, admits an explicitly client-only component on both targets,
and rejects the isomorphic SERVER snapshot with
`EXACT2232`, then builds the named correction through both targets on Vite, Webpack and native
Bun. Existing reactive property semantics tests own client-local unique-symbol identity and
private island parameter naming. Adapter build checks and runtime hydration checks are distinct
acceptance layers.

The shared `controlled-select-contract.ts` journey runs within the component-child-input adapter
selector on Vite, Webpack, and native Bun. Its owned controlled-select fixture checks literal,
prop-derived, context-derived, enhanced, and multiple selections. Each host checks selected option
markup in string, streaming, and hydratable SSR output, then browser mounting, strict same-node
hydration, and dirty single-select preservation. DOM owner tests separately cover retained option
replacement, implicit text values, removal, failed and superseded placement, and disposal. These
checks do not establish progressive document cancellation or every adapter's development HMR path.

The `component child inputs` adapter contract uses the owned
`test-support/component-child-input.fixtures.tsx` source through both executable targets. It
checks a fallback component root containing an authored conditional and a fixed sibling, plus an
opaque selector that chooses one occurrence from duplicate raw input recipes. Chromium mount
and strict hydration exercise subsequent input delivery, retained node and component identities,
reader cleanup and empty report channels. Server execution uses Node for Vite and Webpack and
native Bun for Bun. The corresponding runtime and package tests separately own eager acquisition,
provider skew, reentry and invalid supplied-placement transitions. These declared owners do not
establish execution on an environment until its actual build and runtime gates pass.

The component-input SSR observation owner also covers retained inherited accessor receivers,
ordinary accessor-owned nested children reads, captured array identity, explicit child precedence,
captured undefined, exception identity and two actual occurrences of one raw recipe. The
`component-input-execution-children-snapshots` native runtime check calls that same owner through
its real generated server artifact on each native host. The host journey records its HTTP output
before assertions. These cross-host checks require native runtime execution. The
compiler's component-child-input runtime test separately protects a live late callback through a
component-only public root, subsequent updates, fixed sibling identity and cleanup.

## Shared capture composition acceptance

`native/typescript-go/overlay/internal/exactcompiler/source_shared_composition_contract_test.go`
owns dependency flow through object, argument, return and conditional destinations. It
contrasts live bindings with acquired arguments, independent factory captures, prior reads,
unrelated fields and deferred getter bodies. Current-read facts must retain both known
browser dependencies and uncertainty after an opaque overlapping writer. Returned
getter and Proxy bodies remain deferred through container storage. The unchanged array/current-write anchor
remains in `TestModuleWriteProducerDependencies`. Unknown runtime values do not by
themselves establish unknown placement or permission to emit an artifact.

`packages/compiler/src/compilation/shared-composition-runtime.test.ts` owns paired
client/server execution of that anchor and its safe RHS control. Its authored
`shared-composition.fixtures.tsx` component carries a state-reading returned closure
through a nested container. The public testing harness checks two retained updates,
state and instance identity, affected output, absence of unrelated consumer replay,
mount ownership and exactly-once disposal. Paired SSR is checked separately. The module
consumer counts `document.title` getter calls without rereading it for the oracle.
Client browser initialization must read it once, the safe control must not read it,
and the server artifact must not read it.

The existing compiler-confidence runner includes these three emitted tests as
`shared-capture-composition`. Its `capture-dependencies-to-consumers` contract edge
requires all three current executions to pass exactly once. Declaring the witness does
not grant execution credit, and its Node-hosted scope does not replace the environment
matrix below.

Baseline execution on 2026-11-01 used production checkpoint `e50c3c860`
(native inputs unchanged from `b30c50e45`) with these
new tests, pinned TypeScript source `1f70213d4922b434345f639b441681e470c7cfc1`
and official TypeScript 7.0.2. Native destination/capture tests expose nine failing
placement observations. Live-binding and deferred-getter controls pass, as does the
opaque eager Call denial on both targets. The current export initializer after an
unknown overlapping writer retains unknown effects but loses its browser donor.
Returned getter and Proxy phase controls pass. The emitted mounted component and paired
SSR pass through Node-hosted Vitest/jsdom with workspace source aliases. The original module and
safe RHS control both fail compilation with EXACT2101 before runtime execution.
This is baseline regression evidence, not integrated repair acceptance.

Rebound verification on 2026-11-01 used coordinated checkpoint `09925238a`,
merged locally as `8a6772c9` with an identical source tree. The standalone native host
was rebuilt from that overlay and the same pinned upstream with an isolated Go cache.
The selected native corpus passed: original module-write producers, shared capture
composition, current unknown overlap, returned deferred bodies, opaque denial and
existing ordinary-module authorization controls. The existing SDK test passed all
three cases with unchanged oracles. The original client initializer reads the title
getter once, the server reads it zero times, and the safe RHS reads it zero times.
Mounted nested capture updates, instance/state/DOM identity, unrelated consumer
isolation, once-only lifecycle and paired SSR pass in Node-hosted Vitest/jsdom using
workspace source aliases. This does not establish installed-package, build-adapter,
Chromium, cross-runtime, performance or native branch/condition-audit acceptance.
The coordinated checkpoint remains unaccepted work in progress.

Current compiler artifacts are separately rebound on 2026-11-02 to native production
`b0f2c5808` and the rebuilt compiler SDK. The ordinary paired-artifact API compiles
the exact projected-call source and safe RHS control. The browser client observes
the correct value with one title Get, while its server artifact omits that export
and performs no Get. The safe case retains its value on both targets with no title
Get. Node executes the esbuild-normalized artifacts.

The unchanged mounted source also passes with these current component artifacts
in Node/jsdom: two updates, stable instance/state/DOM identity, no unrelated consumer
replay, one mount, one disposal and paired SSR. This check uses retained workspace
runtime providers. Their sources are unchanged from `09925238a`, but their package
builds have not been regenerated with the current compiler. It is not installed-package,
hydration or adapter acceptance. The original module-write and shared destination/mapping
native controls passed at `6f70066b8`. The subsequent member-callee integration passes
full `Policy|Secret` without exclusions and the focused binding/member controls.
Source-matched command and harness bindings remain ignored under `.tmp/current-architecture`.

Direct framework-fixture harnesses must retain the runtime capability installation
owned by `packages/core/src/test-support/runtime-surfaces.ts` and a complete standard
DOM environment. A missing task capability can render a default error view before
the Testing harness reports a missing mount host. Inspect the captured construction
error before attributing that symptom to generated component identity. Correcting
these harness prerequisites does not change the component or its assertions.

The unchanged `task-closures/nested-evaluation.tsx` source passes official strict
TypeScript with `jsxImportSource: '@exactjs/jsx'`. Current SDK analysis reaches its
transport timeout before semantic compilation or HTTP execution. Its required method,
receiver, operand order, Throw/finally and cancelled-publication assertions remain
unexecuted. Runtime-only source profiles identify member/array/writer-input preparation,
not a proven source-context equivalence or an accepted continuation repair.

Installed Linux/Node compiler-only acceptance also passes against native production
`b0f2c5808`. A clean external consumer installs local `0.8.0` SDK dependency tarballs
and the Linux x64 platform package. It selects that installed executable without a
workspace override and runs browser, safe and browser source revisions in one session.
All six paired rows pass explicit generated semantic validation, exported-value and
pruning assertions, stable exports and title-Get counts. This does not regenerate
Core or qualify installed mounted framework providers.

The affected-environment matrix below records the remaining acceptance obligations.
Chromium, hydration, adapters, other native hosts, installed framework providers and
the native branch/condition audit for the mounted fixture remain open.

| Boundary                                    | Required evidence                                                                                | Scope                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Native analysis and both executable targets | Session source witnesses and fresh branch/condition audit                                        | Capture relationships, current writes, placement and target projection                                    |
| SDK artifacts in Vitest/jsdom               | Paired module values and server projection, mounted updates and SSR                              | Compiler SDK test above, with actual generated artifacts                                                  |
| Browser mount and hydration                 | Retained update, unrelated consumer isolation and cleanup                                        | Required integration follow-up for changed reactive dependency plans                                      |
| Vite, Bun and Webpack                       | Both target configurations using the same authored source                                        | Required because adapters select executable sources and artifact targets before bundling                  |
| Node, Bun, Deno and workerd                 | Existing runtime corpus plus new shared contract when runtime or emitted server boundary changes | Node execution alone does not establish cross-host acceptance                                             |
| Installed packages                          | Clean built consumer using published export resolution                                           | Linux/Node SDK plain modules pass via local packed exports. Mounted framework providers remain unverified |

An analysis-only repair that preserves emitted helper signatures and runtime contracts
has no independent runtime implementation change. That classification must be verified
against the integrated patch. Changes to shared server/runtime boundaries require
`npm run test:runtimes` and actual results on all four supported hosts. The matrix
must be rebound to the integrated source before acceptance.

### Existing environment runners and prerequisites

Use a source-matched native executable through `EXACT_COMPILER_EXECUTABLE`. Build
workspace declarations and JavaScript with official TypeScript 7 before running the
normal `scripts/compile-exact-package.mjs` steps for paired packages. A plain TypeScript
build does not populate their client/server export directories. Keep those providers
in one physical workspace graph. Source aliases used by SDK tests do not qualify a
built adapter or installed package.

The existing compiler diagnostic suites own shared state-alias and assignment-identity
fixtures. The latter includes client mount and paired SSR/hydration with retained
ownership. Run their focused selectors through the actual host:

```sh
node node_modules/vitest/vitest.mjs run framework-adapters/vite-plugin/src/compiler-diagnostics.integration.test.ts framework-adapters/webpack-plugin/src/compiler-diagnostics.integration.test.ts -t 'preserves setup state aliases and DOM declaration placement|preserves authored assignment through mount and paired hydration' --maxWorkers=1
bun test framework-adapters/bun-plugin/src/compiler-diagnostics.integration.test.ts -t 'preserves setup state aliases and DOM declaration placement|preserves authored assignment through mount and paired hydration'
```

The Bun suite skips under Vitest, so the native Bun command is necessary. For the
broader suite use `npm run test:build-adapters` and the native Bun package's
`test:bun` command. The `component child inputs` diagnostic selector additionally
owns Chromium mount and strict hydration across all three adapters.

| Boundary                    | Existing command or setup                    | Qualified baseline outcome                                                                                         |
| --------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Browser mount and hydration | `npm run test:runtimes:assignment-list`      | Paired fixture compilation completed, then bundling failed on missing paired core/DOM runtime exports              |
| Vite and Webpack            | Focused diagnostic command above             | Both suites stopped before test collection on missing `@exactjs/intl/internal`                                     |
| Native Bun                  | Native diagnostic command above              | Stopped before test execution on the same missing Intl paired export                                               |
| Runtime tools               | `npm ci --prefix scripts/runtime-acceptance` | Installed successfully, Deno 2.9.6 and workerd 2026-09-23 execute, Miniflare v5 dispatch and disposal smoke passed |
| Four native runtime hosts   | `npm run test:runtimes`                      | After dependency and TypeScript prerequisite setup, stopped on missing paired core `framework/error-format` export |
| Installed testing package   | `npm run test:packed-testing`                | Stopped before installation because the candidate native compiler tarball directory was absent                     |

These setup observations were executed on clean `f5f2e8c39` on 2026-11-01, using
the same baseline native inputs described above. Chromium launch and close passed,
and native Bun was 1.4.3. Adapter startup probes used workspace source aliases for
the test runner, with ordinary package resolution inside adapter builds. They never
reached those builds and do not establish adapter behavior. No new capture fixture
has executed in Chromium or on the four native runtime hosts yet.

The runtime package owns its locked Deno and Miniflare/workerd provisioning separately
from the root workspace. Its existing Deno `runInstall()` resolves the platform binary
from that installation. Miniflare v5 uses the runner's existing
`convertV4MiniflareOptions()` conversion. No alternate host harness is needed.

The baseline normal paired core build's source-identifying timeout names
`packages/core/src/component/error-boundary.tsx`, the 81st of 300 sorted client
inputs. Earlier requests returned, but the batch had not published. Its bounded
fresh-project probe sampled repeated accessor and writer-interference traversal
during callable-effect analysis, before lowering.

Integrated-host replays use the preserved 300-source synchronization and the same
client compile request, semantic diagnostics, `traceAnalysisCost` and 30-second deadline.
The `c2a7829ea` host synchronizes without diagnostics but gives no compile response
within the unchanged 30-second deadline. It is deliberately interrupted and reaped.
The earlier `4e40d2d27` host also missed that deadline after repairing the reproduced
writer-precondition cycle. Before that repair, `efb6cf1da` stack-overflowed in 11.50 seconds.
These source-bound outcomes do not establish request-wide termination or a performance
improvement. Private relation comparison `72dd7b70a` also misses the unchanged deadline
at 30.049 seconds and remains unaccepted.

The requests retain the saved acceptance workspace's project root and configuration,
so these are bound source replays, not clean installed-package builds. Private query-graph
variants remain separate comparison evidence.
Core compilation remains a product blocker before lowering. The mounted SDK and
transformed-continuation rows require fresh execution after it is repaired. The
earlier Intl timeout's current input is still unidentified. Preserve the normal
package builder and verify the integrated repair against both package builds.

Installed acceptance uses `createPackedAppInstaller` to install candidate tarballs
without workspace links. The coordinator stages the coherent native candidate through
`stageNativeCompilerPackage` and `npm pack`. Set `EXACT_NATIVE_PACKAGE_DIRECTORY` to
that tarball directory when it differs from
`.tmp/native-artifact/native-package-artifacts`. The packed testing runner deliberately
removes `EXACT_COMPILER_EXECUTABLE` from installed consumers. A workspace binary or
historical paired output cannot substitute for the packaged candidate.

`npm run test:packed-testing -- --compiler-only` selects the installed SDK/plain-module
slice, which also runs in the default packed testing CI job. Build the Compiler SDK
and its workspace dependency closure first, then supply a coherent native tarball as
above. This slice requires no Core build, browser, adapter or mounted runtime.
The isolated consumer imports the public Compiler SDK export, requests generated
semantic validation and runs the unchanged projected-call and safe RHS modules.
One session replaces browser source with safe source and then browser source again.
Each target checks the exported value or its pruning, the stable export and title
getter count. Installed workspace package realpaths must stay within the consumer,
and the session must select its installed platform executable. These checks establish
installed compiler/plain-module behavior only. They do not complete the installed
framework/runtime matrix. The consumer, generated artifacts and tarballs are removed
in the runner's `finally` block. Prerequisite package builds and the supplied native
tarball remain owned by their producing build jobs.
