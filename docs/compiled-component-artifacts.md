# Compiled component artifacts

## Status

Target architecture and migration contract. Native eXact components are compiler products; raw
functions are not a second component authoring model.

## Invariant

Every value accepted as a native component by DOM rendering, hydration, SSR, or a component
registry must carry a target-local artifact produced by the eXact compiler. A package may publish
precompiled artifacts, so consuming an eXact library does not require recompiling its source.
The artifact definition always carries its compiler-selected capability ABI; an absent ABI is an
invalid artifact, not a request for a universal compatibility runtime.
The ABI bit assignments have one repository-owned JSON contract. Generated Go compiler constants
and TypeScript runtime constants are checked into the tree and verified against that source during
build-script tests, so neither side can advance the protocol independently.

Compatibility adapters may own foreign functions and explicitly bridge them into a compiled eXact
boundary. Genuinely runtime-dependent children remain supported inside compiler-declared dynamic
ranges. Neither case makes an arbitrary function a native component.

## Artifact responsibilities

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
Published component-library facts preserve both the resolver-selected package facade and the
target-local compiler artifact that owns each component. Consumers authorize the facade but attach
the compiler facts to the owning artifact, so relative component imports, target placement, and
transitive authorization retain the same module base used during compilation. These facts are
emitted from the successful client and server compiler results; package builds do not reconstruct
component graphs by importing built JavaScript or scanning for legacy runtime brands.
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
Browser-target artifacts carry only their specialized template, claims, readers, bindings, and
update program. They do not embed a second generic VNode description of the same region; a same-build
hydration mismatch is recovered at the owning root boundary.
All compiler-proven direct updates belong to the component artifact. Each dependency identifies
its compiler-indexed component storage slot, and each dirty bit selects a generated
text, property, or structural-child call. Forwarded reactive props join that exact field binding
rather than forcing the child program through a general render watcher. The compiler emits as many
32-operation mask words as the component requires; a large component does not fall back to a
runtime lane registry, per-region subscriptions, or a render-program updater. JSX outside a native
component can use ordinary expression bindings, but it cannot manufacture a second implicit
component update owner.
Scalar expressions composed from several top-level state or prop slots share one generated update
operation whose mask is attached to every input slot. Arithmetic, comparison, logical, and
conditional composition therefore reruns through the component artifact without allocating a
retained watcher per DOM binding. Nested object reads, arbitrary calls, and deferred functions stay
on the reactive lane unless their complete dependency semantics are separately proven; a top-level
slot change cannot safely stand in for an observable nested mutation.
Static native-component slots are also installed directly. Their generated VNode contains the
compiler-owned forwarded readers for every live prop, so a second structural watcher around that
VNode would have no dependency to observe. Dynamic component identity and authored dynamic child
ranges continue to own an explicit structural reaction.
The dependency source is itself part of target specialization. An update artifact whose complete
dependency set is component state imports a state-only binder with one indexed target/version
table. Mixed artifacts encode a counted prefix of prop slots followed by state slots; they do not
repeat source or property-name strings, rebuild binding-index tables, or resolve the component's
property layout per instance. Only artifacts that read props import the forwarded-reactive prop
subscription lane; state-only applications do not retain that machinery merely because the
framework supports reactive props elsewhere.
When a render arrow returns an otherwise unstructured value such as `props.children`, the client
artifact marks that authored render function as its component-range output operation. The existing
component boundary owns its dependency subscription and child reconciliation; the artifact does
not allocate a nested generic dynamic VNode, import a wrapper helper, or emit another marker pair.
Dependency changes still publish even when the resulting VNode is structurally equal, because
ownership refreshes such as a remote-domain replacement are semantic operations rather than value
memoization. This is a compiler-selected boundary lane, not the universal watched-render fallback
used by explicit compatibility and test artifacts.
Framework-owned renderer roots likewise use an explicit compiled render operation. The renderer
invokes that operation when the public root value changes, so no compilerless component watcher or
additional dynamic marker is required around the application.
Compiler-proven top-level state reads use the artifact's deterministic numeric state slots rather
than re-entering the inspectable state's property proxy. That numeric lane tracks the same
target/key dependency graph as ordinary property reads, so computed freshness, transactions,
rollback, scheduling, and teardown retain one set of reactive semantics. Authored aliases, dynamic
keys, external consumers, and DevTools continue through the ordinary state facade. Direct server
frames use their plain request-local state records and do not import this client-only access lane.
Compiler-proven top-level props reads use a separate deterministic layout on the readonly props
facade. Initial construction seeds that layout without publishing false changes, and later parent
updates reconcile through the same numeric dependency identities. Every compiled definition emits
state and props layouts, including empty layouts, so component construction never infers a generic
storage lane from missing metadata. Dynamic property access extends the same facade, while
`children` preserves its renderer-owned passthrough identity. Generated client islands retain the
parent state layout instead of renumbering a serialized subset; their synthetic transport props
receive a separate compiler-owned layout. Direct server artifacts carry the metadata for target
contract consistency but continue to read plain request-local state and props without constructing
client reactive storage.
Canonical top-level client assignments, updates, and deletes use the same numeric slots directly;
compiler-generated intrinsic and component binding callbacks preserve that slot proof even when
their handlers move into a generated client island. A checker-proven alias of the complete state
facade retains the same numeric identity inside nested callbacks. Nested-state aliases and dynamic
references retain path-based operations because their final target is runtime data.
Compiler-synthesized computation and task wrappers consume the same analyzed write identity; they
do not reconstruct a string path merely because the authored assignment moved into managed work.
Client render programs use only dense, zero-based compiler indexes in their generated claim calls.
Hydration executes those claims directly; it does not interpret a node table or build a
string-identity map.
`data-exact-id` remains a separate identity only for operations that must address a live DOM target,
such as authorized server patches and interaction replay. It is not a second render-program ABI.
Generated server writers preflight each dynamic input into a compiler-named local and pass that
value directly to its serialization operation; the runtime does not rebuild a per-region slot
table or allocate a receiver merely to replay the compiler's ordering. Render-program ABI version
4 identifies this direct stateless-operation contract so older precompiled writers cannot be
silently executed with the incompatible calling convention. Server artifacts return a branded
prepared invocation directly to the SSR component lane; they do not allocate a render-program
VNode and send it back through ordinary child normalization and kind dispatch. Durable fallback
components likewise preserve raw compiler output until SSR has selected that invocation or the
ordinary child path. The SSR walkers therefore do not retain a second executor for client
render-program VNodes; reaching one is an invalid target artifact rather than a compatibility
selection. Prepared server invocations can also appear as compiler-owned children inside a
dynamic or keyed range; those ranges execute the same direct server ABI instead of coercing the
invocation as authored data. Direct server components capture
compiler-known child slots during request-local task issuance, allowing independent child work to
start before the writer publishes those slots in authored order. Generic components retain lazy
slot evaluation where reactive stabilization remains observable. A compiler-closed server region
omits its generic VNode recovery factory. JSX interoperability is decided at the rendered component
graph rather than for the whole module: a local direct graph can remain closed even when another
component in the module uses a foreign boundary. A graph with a generic, imported, client-owned,
enhancement-owned, or general-child descendant retains the ordinary renderer.

The compiler also specializes authored `renderToStringAsync()` and
`renderToHydratableStringAsync()` calls whose local root graph is closed and whose options cannot
enable foreign React markup. A runtime `markers` choice still uses the closed marked entrypoint;
the request context selects whether it publishes delimiters without reopening component dispatch.
Those calls enter a structure-only
serializer that accepts generated render programs, scalar and property slots, and transitively
closed component slots. Render options that can replace the root, general child expressions, and
unsupported graph edges leave the authored call on the universal SSR entry point. This proof keeps the broad async
VNode dispatcher out of simple production server bundles without creating a second author-facing
render API. A private closed graph rendered by a local call with literal `markers: false` also
publishes its generated HTML directly, so marker, hydration-payload, and resumption-envelope
formatting do not enter that server bundle. Exported server components retain those capabilities
because an external caller can render them with markers, and non-empty output extensions retain
the universal entry point because they may replace the rendered value. Every compiler-only closed
entry trusts its proven root directly; plugin-host output processing remains at the ordinary
renderer boundary for authored or externally transformed values.
Generated native-component slots preserve their component kind through server serialization. The
direct lane writes the component inside the parent slot's existing structural range instead of
adding a redundant component marker pair. Hydration uses that same bounded slot for ownership, while
still accepting an explicit matching component marker when a generic keyed-list lane rendered the
slot. Components with continuation activation keep their resumable boundary.
Server artifacts import structure-only render and task helpers. Durable generic component
construction, enhancement planning, and native structural-boundary ownership are separately
installed capabilities selected only by artifacts that can reach those paths. A direct server
artifact evaluates its compiler-ordered render slots into the prepared invocation directly rather
than creating a one-use runtime slot dispatcher. Resumption
publication is a distinct server capability: a compiled continuation component can publish its
request-local resumption envelope without retaining client-boundary traversal or generic component
construction. The server artifact carries the authored publication name and resumption kind, so
the direct publisher calls the narrow serializer without rereading the component contract or
searching its continuation catalog. Server-only task components do not select that client
publication capability, even when their server artifact is exported. The server keeps readable
path-keyed records in its result API while serializing
values as compiler-indexed pairs; hydration expands them only through the matching prepared
component contract. SSR enhancement activation and `_target` composition are likewise installed only by
server artifacts that emit enhancement operations. Client-only artifacts never select SSR,
resumption, or continuation capabilities;
SSR-only, hydratable, continuation, and mixed artifacts each import their own analyzed lane.
An SSR-render contract facet retains request-local task readiness and resumption publication but
omits later continuation-dispatch executors; combined server bundles retain the complete facet.
Compiler-owned vnode discriminators use realm-stable ABI identities so separately loaded
precompiled libraries and renderer modules agree on generated execution boundaries during
development as well as in deduplicated production bundles.
Compiler-closed server task frames follow the same rule: the renderer attaches the frame to its
request-local host with a realm-stable, non-enumerable identity, and disposal removes it. Generated
artifacts can therefore find their own request's frame even when a development module graph loads
another copy of core, without introducing a process-wide request registry or cross-request
retention.

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
as the descendant owner during serialization and is discarded with its request.

Canonical server logging is also a direct-frame capability. A logging-only component receives its
component identity, logical parent, request domain, and ambient contexts without allocating the
context map or any durable instance machinery. A context-bearing frame already has that ownership
and serves both capabilities. The shared logging operation checks the current request logger and
level before evaluating generated message or data readers, so disabled logging remains inert while
logger changes inside a request remain observable.

Canonical component localization uses that same context-bearing direct frame. The compiler lowers
`this.intl` to a component-owned localization operation, and the operation caches one stable facade
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
Each compiled registry key is itself a target-local render artifact. Client keys render once and
delegate changing props or lazy readiness to one explicit dynamic range; they do not retain a
component-wide render watcher or advertise unused lifecycle, list, or task ownership. Eager server
keys select the direct synchronous frame and forward immediately to their fixed implementation.
Only a lazy server key retains the dynamic generic lane while its loader can suspend.

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
