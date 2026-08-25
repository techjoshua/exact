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
Direct compiler and CLI calls that omit a target emit the specialized client artifact. Executable
compilation accepts only `client` or `server`; target-neutral structure remains private compiler
analysis and cannot be published or passed to a renderer.

Shared runtimes provide narrow operations such as setting text, installing an event, claiming an
element, managing a range, or running one selected task policy. They do not rediscover the
component's topology or interpret a universal component plan when the artifact already knows it.
Browser-target artifacts carry only their specialized template, claims, readers, bindings, and
update program. They do not embed a second generic VNode description of the same region; a same-build
hydration mismatch is recovered at the owning root boundary.
When a render arrow returns an otherwise unstructured value such as `props.children`, the client
artifact emits one explicit dynamic range for that expression. The durable component render still
runs once; only the compiler-declared range observes and replaces the forwarded value. Such
components do not retain the component-wide watched-render fallback merely because they have no JSX
element of their own.
Framework-owned renderer roots likewise use an explicit compiled render operation. The renderer
invokes that operation when the public root value changes, so no compilerless component watcher or
additional dynamic marker is required around the application.
Compiler-proven top-level state reads use the artifact's deterministic numeric state slots rather
than re-entering the inspectable state's property proxy. That numeric lane tracks the same
target/key dependency graph as ordinary property reads, so computed freshness, transactions,
rollback, scheduling, and teardown retain one set of reactive semantics. Authored aliases, dynamic
keys, external consumers, and DevTools continue through the ordinary state facade. Direct server
frames use their plain request-local state records and do not import this client-only access lane.
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

Client construction is linked by the artifact rather than inferred by the runtime. The compiler
imports one target-local constructor and stores it in each component definition. An artifact with
no lifecycle, runtime-managed list, or task ownership selects the compact render record: state,
props, scope, render operation, activity state, and inspection identity only. Artifacts that
declare any of those durable capabilities select the full ownership record. The common mounting
entry invokes the linked constructor without importing either implementation or branching on ABI
bits. Both records implement the same observable component-instance contract and share
process-local diagnostic identity, but the compact lane cannot accidentally allocate unused
controllers, task state, or list cleanup machinery.

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
