# Release readiness

The local library selection-evidence candidate adds optional inspected targets to published public
export selections and inspected destinations to direct package-relative component edges. Inference
can remain unknown with no inferred targets. New consumers retain legacy known-placement facts,
including libraries without registration products. Existing consumers reject new unknown records,
so protocol 1 alone is not a compatibility promise for this capability. Before publishing any such
library, establish an enforceable minimum consumer/compiler-policy/adapter requirement from the
release dependency graph, or explicitly review a feature/protocol gate. A compiler development
dependency does not constrain downstream consumers. No package version or protocol change is
selected for the local candidate. Runtime helpers and native artifact contracts are unchanged,
but published metadata acceptance and target selection remain semantic compatibility surfaces.
Released 0.5.0, 0.6.0 and 0.7.1 artifacts remain compatibility inputs and must not be regenerated.

SSR 0.8.0 removes the automatic 30-second task deadline and the `maxTaskDurationMs` render option.
Applications that need response expiration pass `signal: AbortSignal.timeout(durationMs)`
or another application-owned signal. Cancellation still combines with request disconnection
and runtime shutdown and releases render-owned work. This is a source configuration change,
not a compiler-emitted helper or artifact schema change. Consumers accept SSR ^0.7.0 or ^0.8.0
when their existing calls work with both. Instrumentation 0.7.1 removes runtime freezing without
changing its public types.

Server request bytes no longer have an implicit 4 MiB rejection cap. Without
`limits.maxRequestBytes`, larger bodies warn and continue. Explicit byte caps still reject
before dispatch and cancel oversized streaming reads. Hydrate applies the same warning default
before sending single and batched requests, with explicit `streamLimits.maxRequestBytes` caps
still rejecting before fetch. Deployments relying on the former
implicit cap should configure it explicitly. Profiling observations retain TypeScript readonly
types without runtime freezing, including collector snapshots and phase summaries.

Compiler, all six native compiler packages, and DevTools runtime 0.8.0 remove client redaction configuration and selectors from
client correlation metadata. `createExactRuntimeInspectionCorrelation()` now accepts only the
source inspection. `installExactDevtoolsRuntime()` no longer accepts `redactions`. The unused
client source queue, its types, and `exactDevtoolsRuntimeSymbol` export are removed. Compiler
instrumentation retains direct component and task identities without emitting queue bootstraps. Older
instrumented client registrations remain loadable, with their obsolete selectors ignored.
Server catalog selectors, server preview redaction, source authorization, and server-to-client
secret exclusion remain in place. Compiler-emitted helper signatures and ABI epoch 2 are unchanged.

DOM event delivery consistently retains state writes preceding an exception, while explicit
`batch()` regions retain rollback. Event callbacks no longer restore the preceding focus or
selection, so application-requested focus, blur, and selection changes remain in effect.
Renderer-owned DOM updates continue to preserve focus. No emitted helper or artifact shape changes.

Microfrontend loading removes its fixed timeout and pending-entry eviction policy. Callers own
cancellation through the existing signal parameter, shared work remains active for remaining callers,
and the last caller releases the loader's resources. Recovery preparation follows live membership.
Module validation, integrity checking, and stale-result fencing retain their contracts. The browser
root retains the Web API binding gateway export while excluding Node build tooling.

Hydration and response observations, including partition trees, retain TypeScript readonly types
without runtime freezing. Partition inspection constructs its detached result directly during
validated DOM traversal, removing recursive copying. Server package metadata permits removal of
unused modules, keeping the restored microfrontend gateway export free of unrelated client-side
server initialization when the gateway is unused.

Child partition results and inspected child arrays use ordinary detached data with TypeScript
readonly views. Gateway and Intl facade methods retain their ordinary TypeScript method properties. Framework
publication receipts and gateway rejection observations use TypeScript readonly fields without
runtime freezing. Validated routing, rejection response contents, and renderer scheduling retain
their existing ownership. The Webpack remote production-build test now declares its 60-second
runner budget explicitly.

Configuration validation preserves ordinary authored values and plugin callback identity instead
of deep-freezing the caller's graph. Loader metadata and static enhancement declarations retain
TypeScript readonly views without freezing. Built-in schema rejection remains in place.

Motion 0.7.2 keeps readonly at the TypeScript layer, supports finite negative Web Animations
start delays, and releases pending placement frames on owner cancellation without a render deadline.

Gestures 0.7.2 uses TypeScript readonly definitions and ordinary detached sample coordinates.
Clock leases restore active installations after out-of-order disposal. Updated inherited settings
cancel recognition using captured previous scalar values. Motion and gesture preparation validate
captured authored fields, and imperative motion retains its checked timing during placement. Compiler helpers and
artifact ABI epoch 2 remain unchanged.

Secrets 0.7.1 retains accepted environment names in prototype-free dictionaries, removes freezing
from public providers and observations, and captures initialization and file-load cancellation
ownership. Provider contexts retain inherited metadata without sharing mutable observations.
Compiler secret qualification, server transport policy, helper signatures, and ABI epoch 2 remain.

Plugin API, Plugin Host, and Package Provenance 0.7.1 retain readonly declarations while returning
ordinary metadata, discovery records, callback contexts, and reports. Configuration preparation
uses caller-owned cancellation with optional explicit deadlines. Contributor scheduling preserves
sorted ready batches while reusing graph reachability for provenance. Forwarding and trust
validation consume captured values, selector parsing owns validation, and root invalidation matches
the complete workspace key. Secrets omits its unused empty render projection. Public helper
signatures, plugin protocol versions, and compiler artifact ABI epoch 2 remain unchanged.

Public package resolution, config discovery, component participation, and translation tooling
preserve ordinary child names such as `..generated` while rejecting parent-directory traversal.
`@exactjs/intl-build` joins the selected 0.7.1 patches for this correction. Public signatures and
the compiled ABI epoch remain unchanged. Bun Plugin 0.7.2 resolves build metadata against its
output directory once per generation and requests it for exposure builds, preserving hashed
output identities and resources without changing the compiler ABI. Release packaging resolves native input directories
before replacing its output and rejects inputs nested beneath that output, including directory aliases.

Hydrate 0.7.3 validates JSON-only custom response data before serialized byte accounting.
Rejected getters and `toJSON` hooks remain uncalled, including failed response bodies. Valid
single and batched responses retain exact encoded byte caps, error classification, and ABI epoch 2.

Intl and Intl Analyzer 0.7.2, with Intl Build 0.7.1, return ordinary readonly-typed observations
and emit ordinary descriptor/catalog values. Shared artifact state initializes on use. Registration
validation, generation fencing, global identity keys, companion export names, helper signatures, and
ABI epoch 2 remain unchanged. Published descriptor selection reuses its reached list directly.

## Additive component render-capability facts

The component analysis and SDK IR add per-target renderCapability statuses independently of
legacy component coordination placement. Component-build protocol 1 accepts absent facts as
unknown on both targets and validates present records strictly. Its writer now retains
component-only facts. Existing readers can ignore the additive field. It supplies no new runtime
authority, and existing task defaults, transport, publication, hydration and resumption records
retain their semantics. Public analysis types change, so compiler and native-provider publication
selection still requires review. The local coordinated 0.8.0 preparation does not prove publication
status or authorize publishing this change.

This slice does not change emitted helper signatures, runtime component record version 6,
render-program version 4 or runtime artifact authority. A later replacement of placement-dependent
publication or resumption checks requires producer/validator migration and semantic ABI review,
even if its JSON layout stays the same. Adding required runtime keys also conflicts with current
exact-key validators. Preserve released fixtures and apply epoch/provider version rules if a later
migration is incompatible. The approved separation does not authorize a silent ABI break.

## Release identity and metadata

The initial 0.5.0 release was published from commit
`6476a2f5de46b716d26c2d7d7e6d8a22b501f7f9` on September 14, 2026, with ABI epoch 1.
Its released fixtures are frozen. Current epoch-6 release requirements are described below;
prepublication redesigns do not authorize incompatible changes to a released contract.

`npm run check:npm-metadata` validates descriptions, package-specific keywords, repository links,
author, license, and issue tracker. Package READMEs link to their public documentation and source
using absolute URLs suitable for npm. Funding, engine, and platform metadata require an actual
supported policy. Native staging supplies the appropriate `os` and `cpu` fields.
Published manifests cannot be replaced in place. Validated main-branch builds publish new versions
directly through npm trusted publishing, with provenance and without npm stage approval.

Regression release acceptance includes every affected supported adapter and runtime, not only the
environment that reported the failure. The PR records the affected-environment matrix, automated
execution results, and ownership rationale for unaffected paths. Shared fixtures must exercise
adapter-specific boundaries where the same framework contract can fail differently. A green Vite
job does not establish Bun or Webpack correctness. Resolve missing affected-path coverage and
known cross-environment defects before publishing.

## Published coordinated 0.7.0 baseline

The coordinated 0.7.0 release selected every public workspace package and all six native compiler packages,
including packages whose implementation was unchanged. The VS Code and Chromium extension artifacts
also used 0.7.0. This coordinated release brought
the framework packages back to one version after the independent 0.6 repairs. Applications and
fixtures remained private. The local 0.8.0 preparation below is a separately selected coordinated exception.

The compiler repairs invoked-task captures, awaited result assignments, component locale ownership,
and lazy registry analysis. Rebuild application artifacts to receive those changes. Runtime repairs
cover optimistic rollback, paused work, independent continuation settlement, lazy adoption,
resumption ownership, and delayed interaction replay. Testing adds live protocol progress and an
option to mount before startup work settles. Build plugins refresh configuration-dependent modules
when configuration is first created, changes, disappears, or returns. SSR and hydration preserve
transparent enhancement contexts and configured island capabilities. Direct SSR resolves expression
props to their JavaScript values for both synchronous components and scheduled tasks, including
calls from general-runtime JSX helpers. These runtime fixes preserve existing artifact contracts.

ABI epoch 2 remains unchanged. Invoked task inputs and locale snapshots use existing dependency
slots. Locale capture carries only locale strings, never a provider or formatter. Server-side
write-only container preparation changes request execution without changing the wire schema.
Registry hydration adds core helper exports while preserving existing artifact helpers and layouts.
DOM and hydrate require core ^0.7.0 for those new exports. Hydrate also requires DOM ^0.7.0
for adoption of the loaded registry implementation. Vite, Bun, and Webpack plugins require
compiler ^0.7.0 for the shared configuration owner. Internal dependency ranges that excluded
0.7.0 advance with this release. Released fixtures remain frozen. The coordinated package minor
version does not itself change the artifact ABI epoch.

Eager-island replay extends the existing activation descriptor with authorized targets for eager
loading and preserves those targets' DOM identities in compact render programs. New generated
registrations require hydrate ^0.7.0, whose loader accepts eager descriptors. Released interaction
descriptors remain supported, and existing artifact layouts and helper signatures remain valid.
This is additive provider capability within the coordinated release, with ABI epoch 2 unchanged.
Rebuild paired artifacts and their hydration registration together to enable loading-time replay.

## Literal records in coordinated data transport

Reactive 0.8.0 preserves ordinary records whose enumerable `$exact` field equals a collection
marker. The encoder uses the existing map namespace with a `record` entry list, so other marker
values remain ordinary JSON and native version-one Map, Set and keyed-array envelopes remain
unchanged. The decoder validates dense own rows, unique string keys and exact envelope fields
before reconstructing properties without changing the object prototype.

Core 0.7.3 requires reactive ^0.8.0. SSR and server 0.8.0 and hydrate 0.7.3 require core ^0.7.3, and SSR also
requires reactive ^0.8.0 for validated record publication. Update both producer and consumer
providers when using the repaired record transport. Older decoders reject the record capsule.
Existing valid payloads retain their representation. Previously colliding records gain a working
representation without reserving another application marker value. This is an additive codec
capability and compatible repair for existing valid artifacts, with emitted helper signatures,
component artifact layouts and ABI epoch 2 unchanged. Released fixtures stay frozen.

The same coordinated codec preserves `undefined`, `NaN`, `Infinity`, `-Infinity`, and `-0`
using exact-field version-one map capsules with a `constant` token. Producer and consumer providers
must be updated together. Old decoders reject these capsules, so mixed codec versions are not
wire-compatible when constants are present. New decoders retain the existing Map, Set, keyed-array,
and record formats. Application records that resemble a constant capsule remain literal records.
Component artifact schemas and emitted helper signatures are unchanged, so this extension retains
ABI epoch 2 and the frozen release fixtures. The currently unpublished reactive, server and SSR 0.8.0 and core,
and hydrate 0.7.3 batch includes this provider capability and its dependency floors. Hydrate re-encodes state patches
for their DOM attributes. Server and hydrate patch validators distinguish an owned undefined value
from a missing required value field.

The same provider batch adds compiler-owned `deletions` and optional `statePaths` selections to
continuation results. Selections distinguish a descendant update from a parent replacement when
both paths are permitted, and are omitted when the partial tree is already unambiguous. Producers
and consumers must be upgraded together because older result parsers reject the additional field.
Application code continues to use ordinary assignment and `delete`. Omitted conditional writes
remain unchanged on the client. The recorder covers direct generation-fenced mutations, staged
publication, and owned child frames without attaching capture storage to unrelated client tasks.
Generic and indexed writes preserve own-property creation for undefined values, and generic
compiler hooks preserve strict assignment and deletion failure. Existing core-emitted helper
signatures and ABI epoch 2 remain unchanged. Property assignments, deletes, and array mutation hooks share synchronous generation-owned
execution evidence. An input snapshot or prepared parent container alone does not establish that a
conditional write ran. Equal-value assignments still count as performed writes. The underlying
reactive deletion hook retains its two-argument signature. Proven array mutators now carry exact
authority for their finite receiver path, allowing the existing array snapshot publication.
Wildcard and erased-receiver effects retain conservative authority. This repairs the generated
contract without changing its schema or emitted mutation helper signature. Artifacts that already
contain broad array-write metadata must be recompiled to obtain the repaired authority. A runtime
update alone cannot change that emitted contract.

Direct scalar task lowering now uses the existing native write and delete operations in lean
server continuations and preserves logical skips and selected references across suspension.
Helper signatures and the transport schema are unchanged. New compiler output needs providers
with successful operation-time canonical-key reporting. Artifacts from that earlier scalar-only lowering do not gain imported helper publication from a
runtime update alone; rebuild component callers with the current compiler/SDK pair described below. Ordinary assignment replacement semantics are already an incompatible change
against published core and reactive releases, including 0.6.0 and 0.7.1. The coordinated epoch,
provider versions, and compatibility acceptance remain release gates. Do not infer compatibility
from unchanged helper signatures or regenerate frozen fixtures to satisfy that gate.

Task context, signal, publication, progress,
and resource-lifetime registries are shared across compatible provider copies in the same realm.
Public task definitions and the default concurrency lane also retain identity across those copies.
Binding a bundled task through another compatible provider preserves queue serialization, latest
cancellation, and parallel execution under the same explicit owner.
Synchronous frame scopes, setup owners, deferred interaction materializers, and frame identifiers
are shared as well. Ordinary child calls across provider copies retain structural settlement and
cancellation. Explicitly detached calls retain their independent structural lifetime. Scopes restore
their predecessor synchronously and do not become ambient across promises.
Vite, Bun, and Webpack acceptance exercises separately bundled components against request
handling outside their bundle, including task-owned disposal. Frozen artifacts stay
unchanged and remain acceptance inputs. Value-only captures represent absent leaves as undefined.
Exact enclosing reads supersede descendant captures so complete snapshots retain property
presence, while missing containers and inherited leaf values remain invalid inputs.

SSR normalizes proxy identity in its request-owned encoding cache. Encoded hydration graph limits
include collection and record wrappers, checked while the existing JSON serializer visits them.
Ordinary document payloads retain their direct serialization path. Generic island and prepared
resumption JSON checks its encoded graph before publication. Server 0.8.0 changes its provider floor
for the coordinated codec, without adding a server API.

## Native localization typing and constructor compatibility

Compiled native Intl owner references use the qualified `ComponentLocalizationOwner` type from
core ^0.7.1 so application utility aliases cannot change generated typing. Native
`Intl.DurationFormat` construction also requires core ^0.7.1 for the additive
`requireIntlDurationFormatter` localization helper. It preserves the immediate native `TypeError`
when the constructor is absent, while the optional facade retains its `undefined` fallback.
Duration bindings retain their construction point rather than moving construction to method use.
Existing helper signatures, ABI epoch 2, and released fixtures remain unchanged. Rebuild paired
artifacts to receive the compiler correction.

## Ordinary helper boundary compatibility

Client pending compilation preserves ordinary helper bodies and supplies supported invocation-owned
state views. `stateAccess()` and `sameStateTarget()` are additive reactive exports. They do not
change component contract or transport schemas. Rebuild components to receive the narrowed
helper boundary and its identity, lifetime and class-receiver diagnostics.

Current components retain the original selected helper and manage pending state and publication
in generated component callers. Rebuild component artifacts with the matching JavaScript SDK and
native compiler using exact process protocol 2.0.0. Version-one/two process pairs reject during
startup before component work; a separate helper-planning capability is no longer used. Update
compiler/native platform packages together, including any `EXACT_COMPILER_EXECUTABLE` override.
This process-only change preserves runtime provider signatures, ABI epoch 6, and coordinated
package versions.

Already-built artifact sets may contain private helper modules from their producing compiler.
Keep those original modules with their original callers when retaining such a set; do not mix
independently rebuilt generations. Rebuilding with the current compiler emits caller-owned state
management and original helper imports. Frozen release fixtures and integrity records remain
unchanged and must not be regenerated to accommodate this compiler cleanup.

The removed helper-companion registry and alternate class/factory emitters were introduced during
local compiler investigation. Inspection of the published core and reactive 0.7.0 package contents
confirms that their helper-registration entry points were never published. They therefore do not
require a compatibility registry or ABI epoch change. Released artifacts remain acceptance inputs
and must not be regenerated. New publication must use new versions of affected packages because
0.7.0 already exists in the registry. Runtime provider requirements must cover the additive pending
transaction capabilities used by newly compiled components.

## TypeScript readonly contract

Reactive 0.8.0 removes the `ReactiveOptions.readonly` and `onReadonlyWrite` options and the internal
`reactiveProxyOptions` export. This is a public API removal at 0.x and requires the minor version
advance. Direct workspace consumers require reactive ^0.8.0 and use their own independent package
versions. Core props and pending task views rely on TypeScript's shallow compile-time readonly
checks. They do not reject ordinary writable aliases or mutable nested collections at runtime.
Native property descriptor failures, generation fencing, and transport authorization remain their
own contracts. No compiler-emitted helper references the removed export. Existing helper signatures
and valid compiled artifact behavior remain compatible with ABI epoch 2, verified against the frozen
fixtures. Wide nested batches merge inverse and cleanup records linearly, retaining atomic rollback,
original failure identity, and lease release. Array segment inverses and retained-position
reordering no longer expand stored values into function arguments. Detached position cleanup
filters each affected array once. Intl Build 0.7.1 iterates wide catalog file and package
publication arrays without a variadic call capacity limit. Replace the removed options with appropriate `Readonly<T>` or readonly collection types.
Gravity 0.7.2 applies the same TypeScript-only contract to field metadata, attractor definitions,
sample vectors, sampled arrays, and inspection records. Runtime values are ordinary objects.
The constructor-only nominal brands remain in declarations without unused runtime symbols.
Copied inputs and independent sample results remain intact, and moving attractor policy and
registered force validation retain their numerical constraints. Public helper signatures and
compiled component ABI epoch 2 are unchanged.
Core 0.7.3 and SSR 0.7.3 keep ref methods and public root release observations as ordinary
JavaScript values. Renderer generation authority remains private, and client lifecycle getters
retain native descriptor behavior. Framework ref provenance is captured separately from mutable
public owner observations. SSR 0.7.3 requires core ^0.7.3 for the additive ref-binding provider.
Existing helper signatures and ABI epoch 2 remain unchanged.
Physics 0.7.2 coordinates queued commands, transient force state, contacts, and simulation counters
with reactive rollback. Force, impulse, collision, and constraint output remain finite before
publication, including commands followed by kinematic transitions. Vector and attractor preparation use captured validated inputs. Existing
public function and component helper signatures remain compatible with artifact epoch 2.

## Compiler 0.7.1 provider requirements

The source-normalization repairs select core and compiler 0.7.1, with all six native compiler
packages matching compiler 0.7.1. Newly compiled zero-argument policy tasks use the additive
`activateTaskOnceForHost` helper and require core ^0.7.1. The helper waits for producer availability
and retains transport captures, then releases input subscriptions without cancelling the issued
generation. Existing helper signatures, artifact schemas, ABI epoch 2, and released fixtures
remain unchanged. Rebuild components to receive compiler normalization and capture repairs.
Applications and component libraries emitting the new helper must declare the minimum core provider.
Enhancement validation and activation repairs also ship in compiler 0.7.1. Webpack plugin 0.7.1
requires compiler ^0.7.1 for host resolution of Node-missing enhancement sources and portable
relative provider facades. Registry ownership and literal-key repairs also ship in compiler
0.7.1. Vite plugin 0.7.1 requires compiler ^0.7.1 and preserves literal deferred imports in queried
client/server test graphs. Bun plugin 0.7.1 includes its transform repairs and requires compiler
^0.7.1. Existing runtime helpers, artifact schemas, ABI epoch 2 and released fixtures remain
unchanged. Rebuild enhancement bundles to receive the corrected activation facts and facade edges.

## Source representation repair at 0.7.2

Compiler, Vite plugin, Webpack plugin, and Vitest select 0.7.2 for separating host-owned raw-text
and URL imports from executable component processing. All six native compiler manifests follow
compiler 0.7.2, although native lowering is unchanged. Vite and Webpack require compiler ^0.7.2
for the shared asset-query classifier. Vitest requires Vite plugin ^0.7.2 and compiler ^0.7.2 so
server tests receive the repaired selection. Bun’s separate host asset namespace already retains
source bytes and does not require a release for this repair. Runtime helper signatures, generated
artifact schemas, ABI epoch 2, and released fixtures remain unchanged. No component rebuild is
required for the adapter selection fix. Publish the selected providers together or verify they
are already available before publishing their consumers.

## JSON publication validation 0.7.1

SSR, server and hydrate 0.7.1 require core ^0.7.1 for shared JSON property inspection.
The validators reject hidden serialization hooks, inspect non-enumerable array indices and
count sparse null cells against graph limits. Keyed arrays cannot override iteration, mapping
or construction during encoding. Native Map and Set values retain their native prototypes and
cannot override iteration or JSON hooks. Ordinary payload representations and existing helper signatures
remain unchanged, so ABI epoch 2 and frozen artifacts remain valid. The shared core helpers join
its already selected, unpublished 0.7.1 release. Publication must select that provider with these
runtime packages or confirm it is already available.

Core 0.7.1 also retains checked URL conversions for object and function values across SSR,
DOM updates and text projection. This corrects publication of a different second conversion
without changing URL policy, helper signatures or the ABI epoch.

Server and hydrate 0.7.2 correct rejection of shared sibling references in JSON publication.
Each serialized occurrence consumes graph budgets, while active ancestor cycles remain invalid.
These patches retain the existing core dependency ranges, helper signatures, artifact schemas,
ABI epoch 2, and released fixtures. SSR already applies this ancestry rule and requires no
release for this correction.

SSR 0.7.2 retains document-event producers until reader cancellation has finished their
asynchronous cleanup. Synchronous producer failures follow the terminal error-event path and
release request abort listeners. Public signatures, artifact schemas, ABI epoch 2, and frozen
release fixtures remain unchanged.

Server 0.7.2 retains operation-progress producers inside their stream owner until cancellation
cleanup settles. The public request-scope wrapper already waits for request-owned work, and
the stream owner now preserves that invariant independently.

Compiler 0.7.3 and all six native compiler packages recognize terminal early availability
checks when projecting browser-global effects. Guarded helpers retain their server fallback,
while reads reachable without availability remain client-owned. Accessor bodies retain deferred
ownership, their invocation effects survive source value and helper-argument projections, and
standard URI globals and optional native receiver methods retain declaration-qualified portable
ownership. Router 0.7.1 rebuilds its
artifacts after resolving its caller-supplied location-source placement proof. Source SSR controls
pass, but the current package publication check still rejects the opaque source methods. This is
an unresolved release gap, and source tests do not establish rebuilt package acceptance. Its
source controller now fences lazy handlers, fetcher response decoding, and delayed navigation
publication after cancellation or supersession. Failed lazy materialization is evicted for retries.
Route hydration validation rejects accessors and JSON hooks without invoking them and includes
sparse cells and hidden array indices in its graph limits. Router requires core ^0.7.1 for the
shared JSON property-inspection helpers, which are absent from published core 0.7.0.
Memory history indices require an integer within the retained entries. Numeric navigation
deltas require safe integers across memory, browser, and custom sources, rejecting invalid
values before changing history.
Its compatibility forms share submission preparation and interception. Fetcher forms retain inputs
and publish their own interaction state. GET submissions replace query data without attaching a
request body and preserve fragments. Fetcher cleanup is safe after provider disposal. Source and
browser controls cover these behaviors, while rebuilt router package acceptance retains the gap above.
Modern compatibility destinations resolve against their owning route, with path-relative options
preserved by links, navigation, resolved paths and form actions. Resolved route fields precede
basename, hash-mode and browser encoding. Absolute schemes and network-relative URL authorities
remain outside basename resolution. These are compatible routing repairs without emitted helper
or ABI epoch changes, retaining the same paired-publication gap.
Standard typed-array and byte-storage placement follows bundled declaration identity for
constructors and methods. Array and typed-array factories retain mapper effects without invoking
callable input data or thisArg values. Shadow classes, overrides and added methods retain unknown execution
requirements. This compatible inference repair leaves public helper signatures and ABI epoch unchanged.
Native Router controller construction is setup-owned, retaining one subscription per component
instance and releasing it on unmount.
Route matching retains path-contributing parent branches, resolves optional parameters against
later route segments, and ranks the actual matched path. Splat bases use raw URL segment positions. Compatibility matching requires
complete basename prefixes and rejects outside locations before route matching.
These compatible repairs retain declaration ties and the emitted ABI epoch. Ranking uses cached
scores and a single winner pass, while URL segments are prepared once per match operation.
Fetcher ownership is separate from target handler selection. Compatibility fetchers resolve from
their owning route and dispatch by destination URL. Native `fetch()` accepts an undefined route ID
for the same URL selection, retaining explicit route IDs and the existing emitted artifact contract.
Fetcher cancellation ownership precedes pending-state notification. Reentrant retirement and
replacement fence old work, including lazy factories and abort callbacks. Publication failures
release only their own operation and preserve the first thrown value through cleanup.
Destination hooks observe retained route changes inside memoized compatibility components.
Forms share action resolution with direct submissions, retaining current owning routes and default
queries. Index action selection is shared with fetcher dispatch. GET file fields encode filenames,
and GET fetchers retain index selection while replacing ordinary query fields without mutating input.
React compatibility wrappers infer no-props functions as object-props components while retaining
declared prop checks. These provider typing changes leave runtime helper signatures and ABI epoch unchanged.
Navigation, initialization, submission and independent revalidation register identity before old
abort callbacks execute. Reentrant newer operations retain execution and publication rights.
Static query methods observe incoming cancellation before dispatch and while awaiting handlers,
settling with the original request reason while releasing the router. Handler Requests carry owned
operation cancellation without discarding supplied RequestInit signals. Caller signals now retire
owned submissions and fetchers, reject with the exact reason, and fence late publication. Static
loaders receive incoming headers and GET/HEAD semantics, while action revalidation uses GET. The
additive router `request` option accepts the incoming method and headers without changing ABI epoch. Submission paths share
URL-encoded, multipart, text and JSON field encoding and reject unsupported encodings before dispatch.
Routing dictionaries preserve prototype-named own entries without changing ordinary record shapes.
Own-key reads exclude inherited values, and boundary selection retains explicitly thrown undefined errors.
Static page queries dispose their router on success and rejection. Single-route queries validate
selection before dispatch, invoke only the selected handler, preserve raw Response objects and
exact thrown values, and release their private signal. Their redirects are returned directly.
Caller lifetime follows delegated navigation and revalidation without changing public signatures
or ABI epoch. Source and native HTTP controls cover these contracts, retaining the rebuilt-router
publication limitation above.
Navigation publishes prepared route data inside its owned history commit and restores the prior
model after a rejected write. Failed redirects and publication settle only their owning navigation.
Action handling keeps delegated navigation and revalidation outside its action-error catch so their
failures remain observable. Public signatures and ABI epoch 2 remain unchanged.

React DOM compatibility 0.7.1 binds host callbacks to the existing framework interaction and error
contracts, retains ownership during DOM adoption, and fences late event failures after release.
React compatibility 0.7.1 returns assignment-owned ref releases for callback cleanup.
React DOM compatibility requires that provider floor and retains one lease per host element.
Class refs and imperative handles use the same assignment contract. Queued class-ref changes
are fenced by component lifetime and assignment revision. Class teardown retains the first
lifecycle failure and completes ref release and instance ownership bookkeeping. Unused private
ref-envelope and binding scaffolding is removed. No compiler artifact references those helpers.
Hook deactivation and disposal share one failure-complete release operation. Effect and external
store leases are detached before user cleanup, preserving non-object primary failures and
allowing retained Activity ranges to reconnect after a cleanup error. Scheduled effect commit
failures report through their durable owner. Suspense candidates transfer ownership before
retiring old content, and promise retries share scheduled effects' error ownership with
disposal fencing. Failed range preparation retires newly acquired
hosts, fragments, components and portals without losing the initiating error or earlier ownership.
Ref attachment retains a release fallback before calling authored code. A failed imperative
value factory does not assign or release an untouched ref. Compiler-emitted helper
signatures, artifact representation, and ABI epoch 2 are unchanged.
Range retirement attempts every sibling and descendant release when a ref callback throws,
preserves the first failure, and retains ownership of an accepted replacement.
The public root signatures and precompiled compatibility-island artifact remain unchanged.
Nested React child arrays share iterative traversal while keeping their group and empty-slot
identities. Native projection preserves sparse cells, getter order and species selection.
SSR keeps adjoining text boundaries across empty output. Hydration retires separator
comments and preserves native-owned end delimiters, including transparent and empty ranges.
Server promise children and Suspense share one cancellable wait and preserve explicit
abort reasons, including null. Server request initialization and retained stream scopes likewise retain exact null abort
reasons. Native SSR stream cancellation likewise retains exact null reasons. Hydration task and response
readers retain exact falsey cancellation reasons and keep TypeError cancellation distinct
from malformed UTF-8. Receiver failures retain their identity because decoding alone owns
UTF-8 error normalization. Self-canceling factories and fetchers retain observation of
already-started promises, preserving cancellation without an unhandled late rejection. Queued SSR component work
checks cancellation after a permit grant and releases its permit without starting canceled work. Ordinary and resumed Node pipeable streams share one
settlement owner, retain undefined failures and honor caller cancellation. Matching raw-HTML hosts adopt their existing DOM and authored comments. Accepted host content
modes govern transfers back to child ownership, avoiding obsolete payload reads. Portals place
their marker in the adopted parent and preserve foreign target content through updates and removal.
React DOM compatibility 0.7.1 uses the new framework-facing child iterator exported by React
compatibility 0.7.1, already required by its provider floor. Public child utilities repair
absent-root counts, empty-slot callback positions and receiver binding, scoped copied keys,
and mapped array flattening. The generic mapping result remains precise for scalar callbacks
and uses the supported child type when callback arrays may flatten. This helper does not change
compiler-emitted signatures, wire artifacts or ABI epoch 2.
DevTools agent 0.7.1 preserves exact CDP cancellation reasons and rejects an unavailable
explicit target instead of attaching to a different page. Its owned loopback controls run
on Node, Bun and both Deno abort modes. Test-only WebSocket server support is excluded from package output.
Request 0.7.1 preserves configured authority when parsed pathnames begin with double slashes.
Router 0.7.1 and plugin-host 0.7.1 also apply active ancestry to JSON publication, permitting
shared siblings while rejecting cycles and retaining route graph and byte budgets. Server 0.7.2
and hydrate 0.7.2 preserve authorized context writes in streamed results and retain patch order
across streamed chunks and terminal results. Conflicting mutation representations are rejected.
Server 0.7.2 also checks debug origins against resolved public-origin configuration or absolute
adapter URLs. Relative URLs cannot borrow authority from the caller's Origin header. The boundary
also covers existing-session authorization and request observations.
Plugin-host
0.7.1 also fences cancellation before and after configuration loading, throughout runtime extension
loading and validation, and before registry publication. Preparation timeouts cover runtime entries.
Synchronous output rejection also observes forbidden async hook results so their later failures
remain handled while publication is rejected. Resource rollback reports initialization and cleanup
failures together, preserving the initialization cause without skipping later disposal.
Secrets 0.7.1 shares pending initialization, publishes provider snapshots atomically, fences
disposed generations, and preserves configured empty strings. Pending providers receive startup
and resolver-disposal cancellation. Environment-file reads also honor cancellation.
Core 0.7.2 restores task ownership during owned resource callbacks and preserves generation
identity through cancellation adapters. Callback-created children extend parent settlement,
inherit cancellation, and retain component error and asynchronous cleanup ownership.
DOM 0.7.2 gives inspection-factory installations independent cleanup identity when a callback is
reused. DOM 0.7.2 and DevTools runtime 0.7.1 require complete component ownership coordinates for
DOM selection and client detail queries. DevTools task trees and detail lookup preserve operation
and generation identity. Federated root selection uses unambiguous coordinates. Browser component,
root, and microfrontend collections and server catalog roots apply ownership filters before
pagination. Combined collections retain an active source cursor, accept retained global offsets,
and bound each read to 128 source pages. Malformed legacy host-cursor escapes preserve bounded
history resumption. Timeline reads stay independent of component snapshot collection. Queries
that need browser records reuse one captured snapshot, and retired services cannot list a newer
session's components.

DevTools connection generations fence late opens and closes, share concurrent opens, and make
disposal permanent. The browser transport validates session metadata and query/session correlation
and cancels unused denied-open and close response bodies. Highlight cleanup restores detached owned
elements without touching another owner's markers and preserves later changed outline values and
priorities. Highlights require the active installation session.

DevTools runtime 0.7.1 requires DOM ^0.7.2. DevTools protocol 0.8.0 rejects coerced request names,
malformed capabilities, and unknown debug/query envelope fields. Its query, subscription,
debug and response parsers now return detached own-data snapshots. Accessors, inherited
envelopes, sparse arrays and unsupported transport values are rejected before dispatch.
Server and browser rejection responses share bounded descriptor-based request-ID extraction.
Standalone catalog and runtime-identity validation likewise rejects accessor records, array
cells and authored iteration hooks. Valid compiler-generated metadata remains supported. Pagination rejects invalid maxima,
and the browser query service rejects invalid result limits during construction. Supported
positive limits retain their cursor and page behavior. Server 0.7.2 and DevTools runtime
0.7.1 require protocol ^0.8.0. Core and DOM 0.7.2 also require that preview provider. DevTools
agent 0.7.1 and Chromium extension 0.7.1 understand the expanded preview schema. Select these
candidate releases together when using inspection. The new `constant` variant preserves
`undefined`, `NaN`, infinities, and negative zero separately from strings and unavailable values.
This public DTO expansion selects the protocol's next minor version. Older 0.7 preview consumers
cannot interpret the new variant and must be upgraded with the inspection provider. Catalog and
inspection wire version 1 and compiler ABI epoch 2 remain unchanged. Vite, Webpack, and Bun plugins
require DevTools runtime ^0.7.1 for the repaired installation. Compiler, config 0.7.1, and build
adapters accept either protocol 0.7 or 0.8 for the unchanged catalog contract.

Core 0.7.2 also retains the first cleanup failure across component and task disposal, including
`null` and `undefined`. Server 0.7.2 preserves `undefined` application-disposal and stream-cancellation
failures. Testing 0.7.2 retains render, initialization, and failed-mount settlement errors during
failed cleanup, preserving owned and caller-owned container lifetimes.
Core 0.7.2 also completes readiness cleanup after callback failures, delivers asynchronous
publication failures to readiness consumers, and releases structural logical-owner unmount
registrations. SSR 0.7.2 preserves candidate render errors during failed readiness cleanup.
Core also retains work registered during generation cleanup, waits for work registered by readiness
notifications, and maintains pending counts without repeatedly scanning every registration.
DOM 0.7.2 continues subtree teardown after failed suspension cancellation and routes readiness
publication errors through Activity and Suspense error ownership before revealing a candidate.
Hydrate 0.7.2 preserves browser ownership of selected file inputs during restoration, restores
modeless dialogs and valid editable text attribute forms, and retains select values across option
reordering. Missing or ambiguous captured identities cannot transfer drafts through positional
recovery. Capture records sibling positions once during its bounded walk, avoiding repeated
sibling scans in wide forms. Unchanged retained editable descendants and native selection survive
restoration. Changed checkbox and radio option values, and replacements that are no longer
editable, cannot acquire old control drafts. Replacement file inputs require reselection.
SSR 0.7.2 also records native disclosure and dialog open defaults from a single property read.
Hydrate 0.7.2 preserves controls closed before hydration. Compiler 0.7.3 routes authored native
baseline metadata through the serializer instead of folding it into trusted HTML. Baselines remain
framework-owned across ordinary, compiled, and uppercase attribute paths. Output limits account
for the generated attributes. This uses the existing optional baseline marker and preserves ABI
epoch 2. React and custom-element ownership remain unchanged.
These repairs preserve helper signatures, artifact schemas, ABI epoch 2, and released fixtures.

Testing 0.7.2 extends server-test ownership across request initialization and context inspection,
always attempts application teardown after failed request disposal, and removes owned mount
containers when setup fails. Caller-owned containers remain attached. Public API signatures,
artifact schemas, ABI epoch 2, and released fixtures remain unchanged.

## Additional branch packages at 0.7.1

The remaining changed public packages select unpublished 0.7.1 versions: reactive, DOM,
component-library-policy, module-rewrite, Intl, Intl analyzer, Time, Bun plugin, gestures,
gravity, physics, testing, Vitest, Jest, Bun test, configuration, the component-library marker,
Motion, microfrontends, Theme, Jotai, React DOM compatibility, and the agent skill. The component libraries adopt setup-owned resources.
The remote component retains its documented client-only placement in microfrontends 0.7.1.
Microfrontends 0.7.2 expands the page-provided client helper set so specialized reactive state and
component construction use the host graph. Deploy its host bootstrap before remotes emitted with
the additional provider requirements. Older remote artifacts remain supported by the expanded
bootstrap. Component helper signatures and artifact epoch 2 remain unchanged. This directional
provider minimum does not establish that an older host can load a newly emitted remote.
Bun and Webpack adapters require microfrontends 0.7.2 for their shared import-analysis SPI.
Their existing generation and bridge signatures remain compatible. Static imports with repeated
declarations, comments, aliases, and lexical namespace shadowing retain the page-owned provider.
The agent skill publishes its revised application-authoring guidance. Charts has test-only
changes and remains at 0.7.0. Private applications, comparison tooling, and fixtures do not
receive release versions.

Core requires reactive ^0.7.1 for its transaction entry point and pending-state implementation.
DOM and SSR require core ^0.7.2 for their shared enhancement-target selection helper.
DOM requires reactive ^0.7.1, and hydrate requires DOM ^0.7.1 for the repaired adoption
paths. SSR requires reactive ^0.7.1. Time requires core ^0.7.1 for compiler-generated localization
typing. Component-library policy requires compiler ^0.7.1 for component selection facts.
All three build plugins require component-library-policy ^0.7.1. Vite also requires Intl and
Intl analyzer ^0.7.1, and the analyzer requires Intl ^0.7.1 for the corresponding formatting
and projection fixes. Existing compatible ranges in other consumers remain unchanged.
Vitest requires testing ^0.7.1 for the generated server factory typing and class matcher surface,
and compiler ^0.7.1 for participating-library discovery in paired test graphs.
Jest and Bun test require testing ^0.7.1 and their corrected compiler or build adapter ^0.7.1.
The marker and Motion patch releases include corrected installed usage and declaration guidance.
Compiler and adapter repairs preserve package-owned enhancement configuration, ordinary JSX helper
authorization facts, and a shared application runtime across physically duplicated framework packages.
Library protocol 1 gains optional descriptive paired registration products. Existing facts remain
valid, and consumer planning does not evaluate candidate code. Consumers and libraries must use
compiler 0.7.1 to generate and discover these products. The runtime helper signatures and execution
contract schema remain unchanged.
Stateful context providers retain a complete activation owner and import the SSR publication
capability with that owner. SSR preserves their rendered children using the existing retained-range
representation. Rebuild paired library and consumer artifacts to receive the compiler correction.
Legacy ID-only retained ranges remain valid, while partially supplied planned authority is rejected.
Hydrate 0.7.2 preserves browser ownership of selected file inputs during restoration, restores
modeless dialogs and valid editable text attribute forms, and retains select values across option
reordering. Missing or ambiguous captured identities cannot transfer drafts through positional
recovery. Capture records sibling positions once during its bounded walk, avoiding repeated
sibling scans in wide forms. Unchanged retained editable descendants and native selection survive
restoration. Changed checkbox and radio option values, and replacements that are no longer
editable, cannot acquire old control drafts. Replacement file inputs require reselection.
SSR 0.7.2 also records native disclosure and dialog open defaults from a single property read.
Hydrate 0.7.2 preserves controls closed before hydration. Compiler 0.7.3 routes authored native
baseline metadata through the serializer instead of folding it into trusted HTML. Baselines remain
framework-owned across ordinary, compiled, and uppercase attribute paths. Output limits account
for the generated attributes. This uses the existing optional baseline marker and preserves ABI
epoch 2. React and custom-element ownership remain unchanged.
These repairs preserve helper signatures, artifact schemas, and the ABI epoch.

These are compatible implementation, manifest, typing, and additive provider updates.
ABI epoch 2, released helper signatures, and frozen release fixtures remain unchanged.
Publication must select required unpublished providers together with their consumers.

## Earlier release compatibility decisions

The provider versions and ABI decisions below describe earlier releases. They do not
select packages for the coordinated 0.7.0 release. Published fixtures remain frozen, and their
provider requirements remain relevant when validating an older artifact against newer runtimes.

### Task status and reactive setup

Compiler 0.6.9 preserves reactive setup subscriptions when the same task is exposed through status
or an event callback. Earlier lowering reused the callable definition but discarded the setup
activation, so subsequent input changes could stop starting work. The existing
`activateTaskForHost` helper now receives the shared binding and reactive inputs.
Runtime signatures and ABI epoch 2 are unchanged. Rebuild application artifacts to receive the
correction. This compiler correction shipped with matching native packages. The docs search example
exercises replacement of a slower query, status, clearing, and removal with pending work.
Client-only task status also projects to idle during SSR, including `taskStatus()` calls and
direct status reads, without requiring a durable client-task host on the server. Extracted islands
recreate owner-bound status views instead of serializing them, and preserve original scalar text
facts so their client layout adopts the server DOM.

Core 0.6.5 corrects task `pending` and `pendingCount` to include queued and running nonblocking
and deferred generations. Previously those tasks could report idle before completion. Readiness
registration, Suspense, and form interaction barriers retain their separate policies. No helper
signature or artifact representation changes; released artifacts receive the status correction
when the core runtime is updated. Lifecycle tests cover completion, rejection, cancellation, and
disposal, and the native runtime fixture exercises the status transitions in each supported host.

### Other 0.6 provider requirements

Charts 0.6.2 adds an optional `dataView` prop for replacing the default chart data disclosure with
application-authored content. Existing callers retain the default table. This adds no runtime
helper signatures or artifact protocol changes and retains ABI epoch 2.

Project source-isolation repairs select `@exactjs/compiler@0.6.8` and its six matched native
packages. Artifact pruning and call-effect lookup now restrict file-local offsets to their owning
source, preserving unrelated exports and component placement when a project includes environment
writes or calls in other modules. Rebuild affected artifacts with the updated compiler. Runtime
packages, adapter implementations, compatible dependency ranges, helper signatures, and ABI epoch 2
remain unchanged. Adapter changes add shared client/server bundle acceptance only.
The same compiler patch includes literal dynamic-import dependencies in project artifact discovery
and rewrites them to emitted target-local modules. Deferred loading remains deferred. The broader
project-context corpus checks run in the Node 24/26 CI compatibility jobs.

Collection publication and task ownership repairs select `@exactjs/compiler@0.6.7` and its six
matched native packages, `@exactjs/core@0.6.4`, `@exactjs/hydrate@0.6.4`,
`@exactjs/ssr@0.6.3`, and `@exactjs/server@0.6.3`. Rebuild application artifacts and bundles
with these repairs to preserve collection state through SSR, independent islands, and server
continuations. Server dispatch distinguishes its own cancelled request from an application failure.
SSR additionally requires core ^0.6.4 for its new internal server-only fragment projection helper.
Server fragment presentation no longer retains client reactive computations, and target contributions
resolve task-output dependencies before attribute composition. Existing emitted artifacts and helper
signatures remain compatible. These repairs use existing collection envelopes and task constructors; ABI
epoch 2 and released fixtures remain unchanged. Other compatible dependency ranges remain unchanged.
The shared adapter and native-runtime fixture changes add acceptance coverage without selecting
adapter publications. This is release preparation, not a publication record.

Task progress additionally selects `@exactjs/core@0.6.3`, `@exactjs/hydrate@0.6.3`,
`@exactjs/server@0.6.2`, `@exactjs/serverless-adapter@0.6.2`, and `@exactjs/testing@0.6.2`.
The prepared compiler 0.6.6 and its native packages emit progress receivers and server reporters.
They also preserve the setup boundary of named task declarations during state-cycle analysis.
This is an additive ABI change: existing helper signatures, epoch 2 artifacts, and released fixtures
remain valid. Progress artifacts require core 0.6.3, hydrate 0.6.3, and server 0.6.2; applications and
component libraries using the new policy must declare those minimum providers. Server and hydrate
require core ^0.6.3, and the buffering serverless adapter requires server ^0.6.2. The testing update
retains progress negotiation headers in recorded transport exchanges. Build-adapter changes add
verification without changing their published implementation.

The Fastify request-lifetime repair selects `@exactjs/fastify-adapter@0.6.2`. It preserves response
work after normal request-body completion while retaining upload-abort, response-disconnect, and
explicitly supplied signal cancellation. Actual Fastify HTTP requests cover successful settlement
and client disconnect. Other adapters do not read Fastify's prototype body-lifetime signal. No
compiler artifact or ABI epoch changes are required.

The library-builder and collection-placement changes select `@exactjs/compiler@0.6.6` and its six
exactly matched native packages. The compiler gains `exactc build-library` and a reusable
`@exactjs/compiler/library-build` API. Standard mutable and read-only collection receivers retain
neutral placement through direct and aliased annotations. No runtime helper signature or ABI
semantics change. The repository's library scripts delegate to the same builder using existing
TypeScript output. An output-equivalent build-tool migration does not select those libraries for
publication: their public manifests, versions, and compatible dependency ranges remain unchanged.

The Intl placement repair selects `@exactjs/compiler@0.6.5` and its six exactly matched native
compiler packages. Standard-library Intl instance calls remain environment-neutral through
module-level helpers, including indexed method access. Existing cache lowering is preserved.
Rebuild affected component libraries and application artifacts with the new compiler. Runtime
packages, compatible dependency ranges, emitted helper signatures, and ABI epoch 2 are unchanged.
Adapter changes are tests only and do not select adapter publications.

The queued-lifecycle audit additionally selects `@exactjs/reactive@0.6.2` and
`@exactjs/hydrate@0.6.2`, alongside the prepared `@exactjs/core@0.6.2`. Reactive retains work
paused during a flush. Core rechecks queued continuation and owner lifetimes, reparks awaits,
and observes abandoned source rejections. Hydrate preserves live siblings in mixed-signal
internal batches. Public clients already provide root lifetime signals; that last repair protects
the helper contract rather than establishing an existing public-client failure. Compatible ranges
and ABI epoch 2 remain unchanged. Rebuild bundles with the updated runtimes.

The scheduled-reaction cancellation repair selects only `@exactjs/core@0.6.2`.
Cancelled producers retire their queued reaction leases while live observers continue reading
committed state without inheriting the cancelled frame. Explicit task cancellation still rejects;
real observer failures still propagate. Compiler artifacts, helper signatures, ABI epoch 2, and
compatible dependency ranges remain unchanged. Rebuild application bundles with the updated core;
no compiler or adapter publication is required. This is release preparation, not a publication record.

The keyed-row repair selects `@exactjs/compiler@0.6.4` and its six exactly matched native
compiler packages, plus `@exactjs/bun-plugin@0.6.3` and `@exactjs/webpack-plugin@0.6.3`.
The compiler republishes reactive component spread props, selects island owners from rendered
state consumers, and preserves conditional keyed-list boundaries across SSR and hydration.
Bun and Webpack preserve the shared policy's application-local component classification.
Rebuild affected application artifacts with compiler 0.6.4. Existing helper signatures and ABI
epoch 2 remain unchanged; no runtime package publication is required. Compatible dependency
ranges remain unchanged. This is release preparation, not a publication record.

The activation-boundary and inherited-theme repair selects `@exactjs/compiler@0.6.3` and its
six exactly matched native compiler packages, plus `@exactjs/dom@0.6.2`,
`@exactjs/theme@0.6.2`, and `@exactjs/agent-skill@0.6.2`. The compiler preserves activation
ownership and captured inputs for interactive wrappers. DOM retains empty raw-text hosts and parser-elided empty child ranges during
hydration. Theme exposes inherited custom sources and relative appearance modes, and its DOM
dependency requires `^0.6.2` so an installed scope receives the empty-style adoption repair.
The agent skill corrects obsolete theme API guidance.

Rebuild affected application artifacts with compiler 0.6.3. Runtime repairs remain compatible
with existing epoch-2 artifacts; helper signatures, artifact contracts, and ABI epoch 2 are
unchanged. Adapter changes in this batch are test-only and do not select adapter publications.
Other compatible dependency ranges and private application versions remain unchanged. This is
release preparation, not a publication record.

The independent 0.6.2 adapter repair selects `@exactjs/vite-plugin`, `@exactjs/bun-plugin`,
`@exactjs/webpack-plugin`, `@exactjs/config`, and `@exactjs/compiler`. Vite keeps installed framework packages in its
SSR module graph. Bun resolves providers with the build's export conditions and retains paired
artifact authorization under `dist`. Webpack preserves paired artifacts and replaces excluded
optional facades with a callable pass-through. Both adapters await concurrent authorization
without deadlocking cyclic component graphs. The config loader gives concurrent loads unique
temporary modules; the three adapters require `@exactjs/config@^0.6.2` to include that fix.
The compiler package supplies shared consumer-facade rebinding and missing-provider classification;
all three adapters require `@exactjs/compiler@^0.6.2`. This changes JavaScript adapter support only,
but the compiler distribution pins platform binaries to its own version, so its six native
compiler packages also publish at 0.6.2. Their compiler semantics are unchanged. Webpack declares its direct core dependency for the
excluded-enhancement facade, preserves browser conditions, and handles plain TypeScript and
`.exact` imports through its native pipeline. Bun owns one resolver worker per build generation.
Runtime packages remain compatible at 0.6.1, alongside the separately released
`@exactjs/ssr@0.6.2` document-shell repair. No emitted helper signature, artifact semantics, or ABI
epoch changes. This is release preparation, not a publication record.

The coordinated 0.6.1 release aligned public framework packages, native compiler packages,
and editor extensions, including unchanged utilities. Private applications and test fixtures
remained unpublished. Compatible dependency ranges were preserved.

The Ripley migration repairs target 0.6.1 for compiler, core, DOM, SSR, and testing, with matching
native compiler packages. They fix bare enhancement attributes, keyed derived/helper lists,
server task ownership, owner-local hydration callbacks, and nested array state restoration.
The testing package updates paired-hydration guidance. Rebuild both application artifacts with
the repaired compiler; runtime-only repairs also apply to existing epoch-2 artifacts. These
changes preserve helper signatures, tuple schemas, and intended artifact semantics, so the ABI
epoch remains 2. Install the compiler, core, DOM, and SSR repairs together for the complete fix.
Nothing in the local migration validation constitutes publication.

### Initial artifact and server contracts

The 0.6.0 enhancement-target redesign is an incompatible semantic ABI change. `_target`
places its supplied child and contributes props; it no longer exports one universal target for
incoming enhancements. Each incoming namespace resolves its own root. An enhancement can be
attached to a separately compiled, unaware component, including through a default activation.
Only a resolved fragment receiving additional target props materializes an intrinsic host at runtime.

This establishes ABI epoch 2 at 0.6.0, with component and render-program contracts advanced to
version 2. Execution metadata, component-library metadata, and the compiler process protocol retain
their own unchanged versions. All shared ABI providers advance to 0.6.0, together with packages
whose manifests must require those providers. Compiler native packages follow the compiler version.
The dependency closure is publication selection, not an instruction to publish every tested package.

This publication also aligns compatible updates to 0.6.0 for `@exactjs/language-extension-host`
(provider process cleanup and provenance handling) and `@exactjs/agent-skill` (updated application
authoring guidance). Their 0.5.1 versions are already published and cannot carry these changes.
These companion versions align with the coordinated release without introducing an ABI break.
Dependent packages accept both ^0.5.0 and ^0.6.0 to preserve existing compatibility.

Rebuild application and library client, server, and hydration artifacts with the matching compiler.
Epoch-1 compiled artifacts are rejected before construction; they are not reinterpreted using the
new target semantics. Preserve `fixtures/release-abi/0.5.0` unchanged and verify both its integrity and
rejection by the new runtime. Version 0.6.0 is published. Subsequent repairs require new package
versions; released manifests cannot be replaced. See [the component language](component-language.md#bounded-target-routing) and
[outstanding acceptance work](proposals/future-work.md#enhancement-performance-acceptance).

The eleven utility packages that remained at 0.5.1 deliver embedded source maps in their
coordinated 0.6.1 publications. Their published 0.5.1 tarballs omit authored sources; rebuilding
the workspace alone cannot repair installed copies. This version alignment changes no runtime
API or ABI. Consumer manifests must accept the new minor version without dropping support
for the compatible 0.5 versions.

Published JavaScript source maps embed authored sources by default. Package-content preflight
rejects map sources that are neither embedded nor included in the npm inventory, so a workspace
checkout cannot mask missing debugger sources in installed packages.

The 0.6.0 testing recorder observes response bodies as the client consumes them.
It no longer drains a separate stream branch. Direct recorder users must consume or cancel a
response body before awaiting settlement; cancellation reaches the source, and transport errors
remain on the client read without a second unhandled observer rejection. Native response `json()`
and `text()` reads remain supported. This changes test observation timing, not the component ABI.

The 0.6.0 scaffolder now selects matching runtime/compiler packages for SSR and single-file
outputs. The Vite integration adds `exactSingleFile()` and an `afterBuild` metadata hook. Public
hydration keeps request capabilities; only the explicit hydration-only entry is specialized.
These shipped in 0.6.0 without an additional ABI epoch change.

Nested server task emission in 0.6.0 adds
`activateServerComponentTaskTreeForHost` to the compiler-facing server task helpers. Ship the
compiler and core runtime together and rebuild affected paired artifacts. The helper retains
request-local task ownership only for slices that invoke children; flat SSR slices keep their
existing path. Generated continuation executors also retain their referenced child definitions,
and shared setup/interaction functions retain an explicit server setup activation. This shipped with epoch 2; preserve frozen released fixtures.

The 0.6.0 response API exposes owned body capabilities directly instead of a hidden
symbol and lazy text/stream getters. `ExactResponseLike` now requires one representation; stream
responses omit the old dummy `body: ''`. Buffered bodies alone support synchronous text/blob
collection, and asynchronous producers no longer advertise throwing synchronous methods. Migrate
custom response consumers to the platform adapter or explicit body operations. This is a public
server/adapter API change included in 0.6.0, not a new component ABI epoch:
compiler helper signatures and emitted component semantics are unchanged. Frozen 0.5.0 artifacts
remain untouched and retain their existing epoch-rejection expectation.

The same release includes immediate-child composition, `Document`, authored `doctype()`
declarations, and request-local document output slots. These additive APIs travel with the
incompatible target redesign rather than being advertised as a compatible 0.5.2 release. See
[child composition](child-composition.md) for their contracts.

The epoch-2 compiler also emits `withIntrinsicComposition` for fixed intrinsic child
declarations. This additive compiler helper retains a lazy structural view beside a render program;
it requires the matching core runtime. Existing epoch-2 artifacts remain valid, and frozen released
fixtures must not be regenerated for this optimization. Opaque receipt prototype layout remains
private: dispatch, immutability, key snapshots, and domain ownership are unchanged.

Client artifacts containing structural `title` or `textarea` receipts now select
`@exactjs/dom/runtime/text-host`. This additive DOM entry installs text presentation and reexports
the intrinsic receipt constructor without allocating an extra receipt. Target integration also
installs text presentation because an enhancement can choose its intrinsic host at runtime.
Rebuild development epoch-2 client artifacts with the matching compiler and DOM package: older
development text-host artifacts did not select this dependency. Server receipt emission and the
authored API are unchanged. This shipped in 0.6.0; it does not change the
released epoch-1 fixtures or establish compatibility with older development outputs.

Charts adopts immediate-child partitioning to place authored captions and descriptions under its
figure and requires core ^0.6.0. Its context-based axis, series, and datum registration contracts are
unchanged. Rebuild client and server artifacts together.

The initial SSR scheduling hook accepts `void | Promise<void>`. A ready adapter gate returns
void and starts rendering without a scheduling suspension. Node request handlers now own default
adaptive admission before rendering; Bun configuration is independent. This replaces the unreleased
promise-only declaration in the initial 0.5.0 contract. The hook now also governs resumption
after pending component data settles. Omission inherits the adapter policy through the request
signal. This intentionally replaces the unreleased entry-only hook semantics, without a new
ABI epoch or a second generated renderer. Ship the server signal-policy bridge, SSR runtime,
and adapter integration together. Compiler helper signatures and hydration representation
are unchanged.

The Bun adapter also enables native adaptive admission by default. `createExactBunHandler` accepts
optional scheduling controls, and `createBunRequestHandler` wraps a complete Fetch dispatcher.
Forward Bun's server argument and observe all HTTP routes through that dispatcher. These are host
API additions; compiler artifacts and hydration contracts are unchanged.

The host scheduler's optional streaming-policy capability is additive. Bun progressive rendering selects
a cooperative work window while string rendering and initial Fetch admission retain adaptive policy.
Ship the Bun policy and SSR selector together for this behavior. Function-only schedulers and explicit
`scheduleRender` callbacks remain valid; component artifacts, helper signatures, and the ABI epoch are
unchanged.

The Node adapter's former `createNodeHandler` alias now wraps a custom Node application/page
callback. Use `createExactNodeHandler` for an executor context. Both enable adaptive admission by
default on Node and accept an explicit immediate override. The low-level `createNodeRenderScheduler`
remains an always-yielding gate; the experimental lag-only adaptive option is replaced by request
completion-aware admission. These unreleased surfaces are reset in place, without compatibility aliases.

The compiler's optional closing-body offset on the SSR `static` operation is an additive
optimization hint. Existing writers ignore the extra argument and retain identical output;
the updated runtime also accepts programs without it. This does not advance the ABI epoch or
regenerate frozen artifacts. Ship the compiler and SSR optimization in the initial 0.5.0 release.

The initial 0.5.0 version-one positional projector contract exposes structural active-ancestor
operations (`has`, `add`, and `delete`), without requiring a native `Set`. This replaces the
unreleased native-`Set` contract in place. Ship compiler and runtime together; there is no
version-two registration or obsolete compatibility path. Schema tuples and hydration bytes are
unchanged. This prepublication contract reset does not advance the ABI epoch or regenerate
released fixtures.

The initial 0.5.0 progressive HTML contract permits a completed head chunk before body task
settlement. Consumers must concatenate stream chunks rather than assume the first chunk includes
the body. HTML framing recognizes the `head` discriminant in the shared document-event type;
raw document-event streams retain their existing shell/replacement behavior. Compiler artifact
schemas and the ABI epoch are unchanged by this runtime publication change.

The same initial progressive HTML contract now includes incremental body delivery. Its default
buffer threshold is 8192 bytes and complete spans can exceed that threshold. Hydration remains
before the closing body/html tags. Awaiting reader cancellation waits for rendering cleanup.
The internal HTML framing protocol recognizes `body` events and an already-streamed shell tail;
raw document-event consumers retain the existing complete shell/replacement representation.

The initial `documentShell` option keeps an enclosing ordinary document component server-only.
The requested application's props, resumption capture, markerless-root metadata, and client
hydration container must move together when adopting it. Directly requested authored documents
retain document hydration. This is an explicit API choice, not an automatic change to existing
authored roots. These unreleased runtime contracts remain version one at 0.5.0.

Server execution metadata now includes the optional compiler proof `documentRoot: true` for a
direct authored document view. Progressive HTML uses it to settle document-owned tasks before
evaluating that view, avoiding a discarded discovery render. The additional `streamingDocument`
proof permits a static head before settlement; the body invocation carries its owner and deferred
value reader in the prepared server program helper's optional fourth argument. Fragment
shell/replacement behavior is unchanged. Ship compiler emission, Core validation, and SSR consumption together in the initial
0.5.0 version-one contract; do not introduce a second contract version for this unreleased change.

## Selecting and publishing packages

Outside an explicitly coordinated release, public npm workspaces version independently.
A compatible component-library patch does not
require a framework release. Dependency ranges express supported versions and do not need to
equal the newest workspace version. Validation still requires them to accept the checked-out
dependency version.

Generated starters have a stricter floor policy. Their eXact dependency and development-dependency
ranges must equal `^<current owning package version>`, including independently versioned patches.
After changing a package version used by the scaffolder, update the existing template constants and
run its generation matrix:

```sh
npx vitest run packages/create-exact-app/src/project-generation.test.ts --exclude '**/.tmp/**'
```

The matrix checks exact caret floors against workspace manifests across the advertised build,
runtime, test, and React selections. It runs in the package suite used by the full release check.
It does not install or build the generated applications. Floor updates require a new scaffolder
patch release, without forcing unrelated packages onto a common version or changing their
compatible dependency ranges. The selected dependency versions must be published or included in
the release closure before a starter can install them. Packed-app acceptance remains separate.

Preview a package version change before writing manifests:

```sh
npm run version:packages -- --version=0.7.1 --packages=@exactjs/forms --dry-run
npm run version:packages -- --version=0.7.1 --packages=@exactjs/forms
npm install --package-lock-only --ignore-scripts
```

Omitting `--packages` selects all public packages, suitable for an initial common version.
If an existing range excludes the new version, a public dependent must also be explicitly
selected and receive a new version. Private consumers can have their ranges updated without
becoming publishable. Compatible ranges remain unchanged. Native compiler templates follow
the compiler host's version and remain private in the checkout.

Private framework-comparison manifests participate in version planning, including native participant
roots. Generated third-party build manifests are excluded. Comparison builds and measurement
workers verify actual eXact package resolution so a compatible registry copy cannot silently replace
the workspace runtime in a release performance capture.

After rebuilding versioned framework packages, restart development servers before checking apps.
Vite's application hot reload does not replace framework build-plugin modules already imported by
the Node process. A server started before an upgrade can therefore reject current adapter
manifests using cached framework code. Validate a freshly started development server as well
as the production build, including page navigation and browser error overlays.

`release:affected` selects validation work through the reverse dependency graph. This is a
different set from the packages being published: testing a dependent does not mean releasing it.
CI currently retains its complete build and acceptance matrix even for a selected publication.

After building and running `check:publish`, package only the requested workspaces:

```sh
node scripts/package-release-npm.mjs --packages=@exactjs/forms --output .tmp/release/forms
```

Selecting the compiler additionally requires `--native-packages <directory>` containing the
staged platform archives. Output must be a child of `.tmp`; packing replaces that output directory.
The normal CI artifact job still stages the complete release, including editor extensions.

Preview direct publication of release archives:

```sh
npm run release:publish -- --directory=.tmp/release/forms --packages=@exactjs/forms
```

The preview reads npm registry state without publishing. Adding `--execute` publishes directly.
Pushes to `main`, including merges, publish all unpublished public package versions after the full
release validation succeeds. Pull requests never publish. Manual dispatch on `main` can enable
`publish` and select comma-separated public package names with `packages`; its default is build-only.
Main-branch runs do not cancel an active release when another commit arrives.
Manual publication also requires `abi_base` naming the prior release commit or tag. For initial
adoption, select a commit before the ABI baseline was introduced. Publication rejects a comparison
against its own checkout; ordinary local checks can still compare uncommitted changes with HEAD.
Push validation compares with the previous main revision. Recorded pre-cleanup SHA values resolve
through `docs/history-revisions.txt` before Git verification, including when the old object still
exists locally. Unmapped or unavailable revisions fail rather than silently selecting a new baseline.
The release-artifact job also runs `check:security-audit`; an unreviewed finding prevents the
publication job from starting.

`security-audit-policy.json` retains narrowly reviewed exceptions for these dependency paths:

- [node-forge signature verification](https://github.com/advisories/GHSA-86w9-cpqp-85rv)
  arrives through listhen certificate tooling in the private comparison workspace. Its seven
  inherited records retain a high severity ceiling and expire November 10, 2026. Comparison
  servers use HTTP, and this path does not verify untrusted RSA signatures in repository
  applications. This does not establish nonreachability for other callers.
- SvelteKit [enhanced-action redirects](https://github.com/advisories/GHSA-pfhg-q3qv-9q6r)
  and [prerendered cache headers](https://github.com/advisories/GHSA-27mw-82g8-phjj) affect
  the private HTTP loopback comparison. It uses ordinary JSON onsubmit handlers and does not
  derive prerendered cache-control headers from untrusted inputs. SvelteKit 3 contains fixes,
  but the current Bun adapter requires SvelteKit 2. Exactly three inherited records have a low
  severity ceiling and expire at the start of November 7, 2026 UTC. Revisit the decision before
  expiry or any feature or exposure change.

- [MSAL authorization-code handling](https://github.com/advisories/GHSA-xcx6-jx8p-x3h5)
  remains vulnerable in the installed Azure dependency graph. Azure is unused. Local VSCE
  packaging does not call `getPAT` or select `azureCredential`, and unstorage uses memory/HTTP
  configuration without an Azure driver. Exactly two records have a high severity ceiling and
  expire at the start of November 7, 2026 UTC. Revisit before expiry or any authentication,
  publishing, driver, dependency or advisory change. This acknowledges the installed
  vulnerability and does not establish safety for other usage.

The withdrawn braces advisory has no retained exception. Fixed or absent causes do not justify
stale entries, and a patched upstream release alone does not establish compatible parent APIs.

These exceptions acknowledge retained vulnerable dependencies. They do not establish safety
for other callers or input paths. Recheck upstream fixes before expiry and remove both the
cause and its propagated exceptions when the audit no longer reports them. Any higher severity,
unlisted package, expired exception or stale exception still fails the gate. Every exception
must also list exactly the reviewed GitHub advisory URLs reported for that package, including
causes inherited through dependencies. New advisory identities and stale identities fail even
when their severity is within the exception's limit. Malformed or unresolved cause graphs fail
rather than counting as reviewed evidence.

Package-content and compiler-distribution checks accept both npm 11's array and npm 12's
package-name-keyed object from `npm pack --dry-run --json`. Each workspace check requires
exactly one matching package with a valid file inventory; malformed output fails the check.
Registry identity and exact-version checks accept either a scalar string or a singleton string
array from `npm view --json`. Empty, multiple, malformed, or mismatched values fail preflight.

An empty workflow selection means all public npm packages. Existing name/version pairs are
skipped. Missing archives, duplicate archives, private packages, version mismatches, and registry
errors other than an explicit missing-version response stop the run. All selected archives and
registry lookups are checked before publishing starts. Native binaries precede their host.
Internal runtime, optional, and peer dependency ranges must have a satisfying version already
on npm or included in the same publication selection. A package cannot be published alone when
its required framework versions are unavailable. Invalid dependency registry responses fail closed.
Publication is not transactional; a failure after publishing starts can leave a partial release.
A rerun skips versions already published. Prereleases use `next`; other versions use `latest`.
If an earlier staged attempt reserved a version, reject that obsolete stage in npm before retrying
its direct publication. A conflict is not evidence that two artifacts match. The workflow does not
create or approve stages.

### Configure direct trusted publishing

The GitHub workflow uses OIDC with job-scoped `id-token: write` and npm 11.19.1. No
`NPM_TOKEN` secret is used. npm trust is configured per package, so the repository provides
one bulk setup command. It includes the six native targets whenever the compiler is selected.
Private applications, fixtures, and nested packages are excluded.

Use npm 11.19.1 or newer locally, log in with an account that owns the packages and has 2FA,
then preview and apply:

```sh
npm install --global npm@11.19.1
npm login
npm run release:trust
npm run release:trust -- --execute
```

Use `--packages=@exactjs/forms` to limit setup. The preview is offline and changes nothing.
Execution checks all selected package identities and existing trusts before creating any trust.
Execution reports each package's identity and trust checks, followed by each revoke/create
operation. The offline preview prints planned creation commands without contacting npm.
It skips exact direct-publish matches and grants `--allow-publish` without staging permission.
For this repository and workflow, a known stage-only or combined grant is revoked and recreated
with direct-publish permission. The complete selection is checked before any mutations. Unrelated
publishers, environment restrictions, duplicate configurations, and unknown permissions stop setup
without changing them. npm supports one publisher per package. If recreation fails after revocation,
the package has no trust until setup is rerun; a rerun resumes from the actual registry state.
Trust mutations are paced two seconds apart to avoid registry rate limits.
An interactive trust-settings read establishes npm authentication before the script captures
JSON for preflight. The npm 2FA prompt can offer a five-minute authentication window for bulk setup.

The configured GitHub repository is `techjoshua/exact`, workflow filename
`native-compiler-packages.yml`, with no environment restriction. Run the workflow on `main`
with `publish` enabled, the selected packages, and the previous release commit/tag as `abi_base`
for a manual release. Successful main pushes publish automatically. Routine OIDC publication needs
no npm stage review or per-package 2FA; the one-time trust setup still requires npm login and 2FA.

npm requires a package to exist before trust setup. Bootstrap new package names through local
`npm login` and normal 2FA using the same `release:publish` preview and execution commands, then run
trust setup. In npm package settings, disallow token-based direct publishing and remove obsolete
bypass-2FA tokens after migration.

See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/),
[bulk trust setup](https://docs.npmjs.com/cli/v11/commands/npm-trust/).

## Distribution inventory

The current checkout has 67 public JavaScript/metadata/agent npm workspaces. These include the
framework, enhancements, adapters, plugins, and seven component libraries: charts, forms, gestures,
gravity, motion, physics, and router. Apps, compatibility corpora, and theme fixtures remain private.
Only immediate packages under the declared publishing roots are eligible; nested fixtures cannot
become public merely by acquiring an `@exactjs` name.

Six native compiler source templates are private workspaces. Staging deliberately produces public,
platform-restricted archives using the compiler host version. VS Code and Chromium DevTools
are private npm workspaces distributed as VSIX and extension ZIP artifacts.
README validation excludes Nuxt's generated `.output-bun` server packages, as it already excludes
the ordinary `.output` tree; generated package manifests are not maintained source packages.

## ABI compatibility

The [compiled ABI evolution proposal](proposals/compiled-abi-evolution.md) describes forward
compatibility from epoch 2, optional retention of older implementations in bundles, and dependency
attribution. It does not change the current single-epoch release gate or add epoch-1 support.

The native compiler upstream has moved from the closed `microsoft/typescript-go` repository to
`microsoft/TypeScript`, pinned at `1f70213d4922b434345f639b441681e470c7cfc1`. Its Go module is
`github.com/microsoft/TypeScript/tsc`. The overlay remains under `native/typescript-go` locally,
but staging places it in the upstream `tsc` module. Compiler host construction supplies no upstream
content-mapper project because eXact owns its source transformations. Parsed project references
are preserved when assembling and synchronizing project roots. Platform packages copy both the
upstream license and `NOTICE.txt`, including third-party attribution.

Compiler-emitted helper behavior and artifact semantics are ABI surfaces. Released fixtures must
never be regenerated to hide a break. Incompatible changes require a new ABI epoch and provider
minor versions at 0.x, or major versions at 1.0 and later. Development artifacts do not establish a
released compatibility promise. Current runtime contracts are documented in
[compiled component artifacts](compiled-component-artifacts.md) and [SSR/hydration](ssr-hydration.md).

## Coordinated local 0.8.0 preparation

All public npm packages and all six native compiler distributions are selected together at stable
0.8.0 for local release preparation. This includes unchanged public packages. It does not authorize
publication, replace an existing published version, or select private editor and browser extension
artifact versions. Registry availability, prior-release comparison, platform CI and package
acceptance remain publication prerequisites. The compiler's six native optional dependencies match
its version exactly. Application and starter dependency floors must accept the matching providers.

The working 0.9, 0.10 and 0.11 prerelease labels were unpublished preparation labels. Their approved
artifact changes belong to this single 0.8.0 preparation. Correcting those labels does not reset the
ABI epoch or weaken the version planner's published-version and downgrade protections.

Release ABI epoch 6 and component definition/input revision 6 require matching compiler, core, DOM
and SSR providers. Physical element addresses use compiler-installed symbol metadata rather than authored string props. Old generation-5 providers and render-program revision 3 reject before effects or output. Private children-input recipes, mandatory provider redemption, isolated receipt
storage and server-reference generation replace the old private receipt issuance, unrestricted
payload reads and root entry points without compatibility aliases. Component-only public roots
and one-active-placement ownership remain required. Delegated SSR children getters have one
acquisition per accepted execution occurrence. A fresh final stream pass acquires independently.
Ordinary prop getters and authored reactive payload identity retain their existing semantics.

Render-program revision 4 independently requires the SSR provider's version assertion before
identity preparation or output. A new core provider cannot make an old SSR provider accept that
contract. Component-input operation exports and compiler-created prop operands also require the
matching provider graph. Component-library build facts remain revision 1 and the compiler process
protocol is independently paired at 2.0.0. Existing capability bits do not change.

Array invocations require scoped completion discriminator 4 before application payload decoding or
execution. Success echoes it even without a patch. Single, batch and stream operations preserve
operation-local parser context. Old parsers reject new requests before application work. The obsolete
selectedArray method has no compatibility alias.

Released fixtures and their integrity records remain immutable, including old helper and artifact
bytes used as rejection witnesses. Witness selection follows each recorded release-fixture tree.
An unpublished epoch's introduced version does not require fabricating a released witness or imply
registry publication. Compiler, providers, repository callers, tests and documentation migrate
together while normal provider materialization and independent adapter and host acceptance remain
release gates.

The current contract versions are:

| Boundary                      | Current version        | Ownership                                        |
| ----------------------------- | ---------------------- | ------------------------------------------------ |
| Render program                | 4                      | Core and native compiler                         |
| Component definition/input    | 6                      | Core, native compiler, framework-owned artifacts |
| Component-library build facts | 1                      | Compiler, package marker, authorization          |
| Compiler process protocol     | 2.0.0                  | JavaScript compiler host and native process      |
| Capability mask               | 1, 2, 4, 8, 16, 32, 64 | Compiler/runtime capabilities                    |

Contract versions and capability bits come from `scripts/contracts/compiler-abi.json`.
Generated Go and TypeScript constants are checked by build-script tests. Capability values remain
bit assignments; standard source-map version 3 also remains unchanged. Existing independent
version-1 wire, task, plugin, and inspection contracts retain their identities.
The React adapter schema also remains 1. Its dependency-range validation uses the installed
marker package version generated from that package's manifest when versions change.

`scripts/contracts/release-abi.json` identifies the public ABI epoch and providers.
`check:release-abi` compares the current contracts and package versions against Git HEAD locally,
or the pull-request/push base in CI. Incompatible record versions or removed/reassigned capability
bits require a new epoch and a minor version increase for every provider still at 0.x,
or a major version increase for providers at 1.0 and later. Additive capabilities need not invalidate older artifacts.
The internal compiler process protocol is independently paired with exact-version native binary
dependencies; changing that process protocol alone does not break previously compiled components.
An unchanged ABI epoch must retain its original fixture baseline. Empty provider lists are invalid.
The additive `project-files` request uses the native TypeScript configuration parser for checking
root selection. It requires the matching native compiler package and changes no emitted component ABI.
Process protocol 2.0.0 removes helper-companion planning and requires the matching JavaScript
compiler host and native executable. The existing exact startup version gate rejects mixed pairs
before component work. This process-only change does not advance the runtime ABI epoch, alter
coordinated package versions, or regenerate frozen runtime artifacts.

`check:compiled-abi` bundles preserved 0.5.0 JavaScript against current runtime packages without
invoking the compiler. For epoch 3 it verifies rejection of epoch-1 and epoch-2 render-program artifacts before component construction or DOM mutation. Integrity hashes and the Git release gate
prevent refreshing a published fixture to hide an incompatible runtime change. These fixtures are
representative regression protection, not exhaustive proof of every possible component behavior.

Compiler-emitted helper imports, signatures, record layouts, lifecycle semantics, and hydration
formats are compatibility surfaces even when application authors never import them directly.
Review must classify semantic ABI breaks that leave schema numbers unchanged and advance the epoch.
Adding a new helper is compatible with old artifacts, but newly compiled libraries must declare
runtime dependency minimums that actually supply that helper. Do not claim backward compatibility
merely because version constants match.

Server child task facades emit `bindTask` imports from
`@exactjs/core/framework/server-task-helpers`. Newly compiled artifacts and
libraries require a core provider whose server helper facade exports that function.
Select a dependency minimum from the release that supplies this export and verify
its package contents and installed resolution. Existing `bindTask` signatures and
artifact fields are unchanged. The export alone does not select an ABI epoch.

Source-backed scalar task helpers add private module entries with the internal
`entry(signal, receiver, args)` signature and static target imports. Publication must classify
this linkage and its execution semantics alongside ordinary replacement semantics against the
published provider contracts. The 0.6 and 0.7.1 releases rule out an unreleased-code exception.
Keep the compiler host and native binary exactly paired, verify that ordinary and private imports
share one target module through each adapter, and preserve the released fixtures. These source
entries do not define a source-removed library helper protocol. The existing ABI and provider
release gates still require an explicit compatibility decision before publication.

## Licensing

eXact-owned code uses Apache-2.0 with copyright held by Joshua Friesen. Root and distribution
notices, manifest metadata, and npm package-content checks enforce that choice. Native compiler
packages retain Microsoft's license and upstream notices; internationalization retains its CLDR
notice. VSIX and Chromium extension packaging include eXact's license and notice, and VSIX
packaging no longer bypasses license checks. See [licensing](licensing.md).

## Release validation boundaries

Run the current release checks for each candidate; a historical passing run does not validate a new
release. Include cross-platform installation outside the monorepo and the dependency-audit gate.
Publication is not transactional: registry state can change after preflight, partial publication
is possible, and reruns must account for versions already published.

`npm run test:packages` runs every project in `vitest.packages.config.ts`. The default project
limits discovery to package directories in its configuration. Do not add repository-relative CLI
filters to this aggregate command: projects with their own roots match paths relative to those
roots and can otherwise be silently omitted.

CI runs `npm run test:build-adapters` on Node 24 and 26 after building workspace prerequisites.
This gate exercises Vite and Webpack builds plus the adapters' Node-compatible contract tests,
including the shared installed-provider, hydration, and continuation fixtures. `npm run test:bun`
runs the Bun-native builds and runtime checks separately. Both gates are unconditional for pull
requests; shared adapter fixture changes also select all three adapter workspaces for affected
local validation.

Packaging guards reject symlink and junction ancestors before replacing output. They assume no
concurrent filesystem mutation and are not a sandbox against a hostile process swapping paths.
An explicit ABI comparison baseline must be the relevant prior release, not an arbitrary older
commit selected to weaken the checks. Schema checks and representative artifact tests supplement,
but do not replace, semantic compatibility review.

Paired artifact enhancement linkage uses the existing version-1 optional-provider request format.
Consumers need the eXact adapter version that recognizes those requests and authorizes their
importer edges. This adds no component helper signature or ABI epoch; previously emitted components
remain valid. Single-target physical facade output remains the unbundled execution path.

The CI acceptance gate includes the scripted
[installed production workbench](component-composition-corpus.md#installed-production-workbench).
It verifies production browser-only and paired SSR builds using packed candidate packages and a
separately compiled optional-enhancement consumer. Run `npm run test:packed-workbench` with the
candidate native package prepared when reproducing this release check locally. It is intentionally
separate from the ordinary build command and requires no agent-driven browser testing.

The same gate runs `npm run test:packed-shipping` for installed production server-continuation
coverage using Parcel Lab and its deterministic DOOP provider. See
[installed shipping continuations](component-composition-corpus.md#installed-shipping-continuations)
for the scenarios, environment isolation, and limits of its cancellation evidence.

## Intl measurement differences at 0.7.1

Compiler and Intl analyzer 0.7.1 prepare explicit measurement differences for Intl 0.7.1.
The unit formatter adds an optional data-only `difference` mode and retains existing binding
vectors and helper signatures. Previously emitted descriptors omit the field and retain absolute
conversion. ABI epoch 2 and released fixtures remain unchanged. Newly compiled difference
activations require Intl ^0.7.1. Extraction also preserves call and property-read occurrences, fences scalar reuse after
potential effects, and removes
unit-option metadata from reconstructed intrinsic hosts. These providers join their already selected unpublished 0.7.1
releases and must be selected together for publication.

Charts 0.7.2 bounds tick generation for finite numeric domains and avoids intermediate overflow
in linear positioning. Charts and Physics 0.7.2 keep readonly guarantees in TypeScript rather
than freezing presentation values, simulation snapshots, or reusable projection policies.
Public helper signatures and ABI epoch 2 remain unchanged.

Time 0.7.3 fences stale clock callbacks, closes reentrant subscription teardown, and permits
retry after failed setup. Internal due publication carries a captured numeric timestamp and
generation. Public component and helper signatures and ABI epoch 2 remain unchanged.

Time 0.7.3 also captures plan, binding, environment, and input values before validation.
Readonly observations remain ordinary copies while private scheduling state retains its validated
values. Wall-clock reads share a timestamp per synchronous cycle without sharing a mutable
observation object. This replaces the previous frozen-object identity with value consistency.
Public helper signatures and ABI epoch 2 remain unchanged.

Microfrontends 0.7.2 selects a runtime-only browser facade at its root while retaining the Node
root API and the explicit `/client` entry. Compiled component identity and ABI epoch 2 are
unchanged. Bun plugin 0.7.2 preserves browser conditions and resolves scoped remote packages
through its build resolver. Provider bootstrap remains conditional on configured remote bindings.

Compiler 0.7.3 preserves ref facade method dispatch in SSR artifacts, including replacements
observed through ordinary writable aliases. It reuses the existing request-local facade helper
and removes the canonical-call bypass. Previously emitted bypass calls retain their released
meaning. Recompile components to receive the source-semantic repair. Helper signatures,
ABI epoch 2, and frozen fixtures remain unchanged.

Compiler 0.7.3 also retains standard method placement through primitive literal unions and indexed
aliases. This repairs type-driven source acceptance without changing emitted helper signatures or
the ABI epoch. Intl 0.7.2 captures validated protocol values consistently, rejects sparse arrays and
nonstring discriminants, and ignores caller-owned iteration methods during protocol capture.

Core 0.7.3 contains diagnostic reason conversion so inspection cannot replace a task's original
failure. The existing error-format provider adds `describeFailureReason` without changing emitted
helper signatures or ABI epoch 2. DevTools runtime 0.7.1 requires core ^0.7.3, emits bounded
failure descriptions, and returns ordinary query observations with TypeScript readonly fields.

SSR 0.7.3 reuses the public ref registry types in its focused helpers, preserving generic keyed
values and root overloads in emitted TypeScript. This is a compatible declaration refinement.
Helper runtime behavior, emitted call shapes, ABI epoch 2, and released fixtures are unchanged.

Theme 0.7.2 keeps resolved palettes, scope presentations, deriver definitions, helper envelopes,
and derivation outputs as ordinary
JavaScript values under their existing TypeScript readonly declarations. Output validation
retains identity, cycle rejection, and reserved-variable checks without freezing caller-owned data.
Palette and CSS reuse retain private bounded caches, while scope resolution observes current
definition values. Ancestry is captured once and processed iteratively, with explicit cycle
rejection before palette publication. Public preset and token metadata observations are separate from their canonical
definitions. This compatible correction does not change compiler helper signatures or the ABI epoch.

Theme 0.7.2 also captures structured color fields once, validates native component indices,
rejects unsupported color spaces, and distinguishes omitted opacity from invalid explicit null.
Supported CSS Color 4 and Design Tokens inputs retain their existing results. Custom temperament
fields include inherited accessors read with their original receiver, and partial typography fields
are captured once before applying defaults.

Intl 0.7.2 keeps measurement presentations, environment method handles, and locale metadata as
ordinary JavaScript values under their existing TypeScript declarations. Formatting ownership
reuses reactive mutation versions, so direct locale writes, restored public counters, and reactive
rollback cannot revive retired presentations. Updates during request resolution fail before
publication. Unit lookup excludes inherited object names, and identity conversions validate both
units before returning. Public helper signatures, supported unit names, and ABI epoch 2 remain
unchanged.

Intl preference inputs and returned observations use independent tuple copies. Provider and locale
scope policy updates share a reactive transaction, restoring private policy and public state on
rollback and fencing superseded propagation. Public policy types and helper signatures remain.

Intl catalog updates capture accepted inputs before replay publication. Descriptor and catalog
replacements validate in private collections before one registry revision is installed. Manual
history and scoped catalog updates share reactive rollback, preserving prior state after failures.
This compatible repair retains public protocol and helper signatures.

Intl locale scopes retain generated-source synchronization after creation while preserving scoped
manual overlays and explicit source isolation. Repeated inherited layers compact by catalog
identity, without changing the source protocol or emitted helper signatures.

Intl public message plans and translation projections use ordinary independent data. Materialized
formatter plans no longer alias their input descriptors, and writable result aliases cannot alter
private cached execution plans. Public protocol, helper signatures, and ABI epoch 2 are unchanged.

Intl 0.7.2 package metadata and editor observations retain TypeScript readonly declarations without
runtime freezing. Intl 0.7.2 and Compiler 0.7.3 language tools distinguish half-open span intersection
from cursor containment, avoiding adjacent hint, dependency, diagnostic, and refactor attribution.
These corrections preserve protocol shapes and compiler artifact ABI epoch 2.

DevTools Runtime 0.7.1 and Server 0.8.0 retain serialized event observations independently of
caller-owned nested values. Client subscriptions queue replay and live events in sequence order,
fence removed registrations, and preserve ordinary TypeScript readonly behavior. No compiler
helper or wire shape changes are introduced.

Core 0.7.3 and DevTools Protocol 0.8.0 return independent ordinary inspection observations under
their existing TypeScript readonly declarations. Task history captures private copies, component
names avoid authored accessors, and public method metadata cannot change dispatch authority.
Redaction isolates callback path aliases and rejects malformed decisions without exposing values.
Compiler helper signatures, event and query shapes, and ABI epoch 2 are unchanged.

Server 0.8.0 requires literal boolean approval from configured request, CSRF, operation, and
inspection policy callbacks. Derived request contexts preserve inherited and nonenumerable
configuration policies with their original owners. Configuration capture failures release opened
request resources while preserving the primary failure. Core 0.7.3 owns the internal
`framework/configuration` helper shared by Server 0.8.0, DOM 0.7.2 enhancements, and Hydrate 0.7.3.
Hydration entries preserve inherited work limits and callbacks while retaining live accessor
aliases and root-local overrides. Existing helper signatures, public hook types, transport shapes,
and compiler artifact ABI epoch 2 remain unchanged.

Server 0.8.0 captures inspection catalogs before validation and retains identity and redaction
metadata privately. Catalog lifecycle handles follow ordinary TypeScript readonly semantics. Catalog data must be plain and free of accessors and executable hooks.
Canonical query composition uses private lookups, avoiding full-catalog copies per debug request.
Wire shapes and compiler artifact ABI epoch 2 remain unchanged.

Server 0.8.0 removes the unused standalone catalog registry factory and registry types from its
public root. Applications supply `inspectionCatalogs`, use the server debug runtime's
`registerCatalog()` method, or use `registerExactInspectionCatalog()` for lifecycle registration.
The registry remains internal. This approved public API removal requires the 0.x minor version
advance, while compiled helper signatures and ABI epoch 2 remain compatible. Existing workspace
consumers accept Server 0.7.x and 0.8.x where their used APIs remain compatible.

DevTools Runtime 0.7.1 retains private session identity and publishes ordinary descriptions.
Concurrent pending connection calls retain shared opening-result identity. Later connected calls
return independent descriptions. Internal connection, subscription, and disposal work retains its
own lifecycle callbacks. DOM 0.7.2 returns ordinary independent inspection snapshots and element
lists. Compiler 0.7.3 correlation observations retain readonly types without runtime freezing.
Server 0.8.0 also removes redundant freezing from encoded inspection response preparation.
Public types, wire shapes, compiler registration payloads, and artifact ABI epoch 2 are unchanged.

Intl 0.7.2 captures validation limits before artifact fields are read and rejects invalid numeric
counts. Zero remains supported for empty patterns and catalogs. Bounded strings also check their
NFC-normalized output length in UTF-16 code units. Existing stage defaults, artifact shapes,
compiler helper signatures, and ABI epoch 2 remain unchanged.
