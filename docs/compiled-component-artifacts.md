# Compiled component artifacts

## Status

Target architecture and migration contract. Native eXact components are compiler products; raw
functions are not a second component authoring model.

## Invariant

Every value accepted as a native component by DOM rendering, hydration, SSR, or a component
registry must carry a target-local artifact produced by the eXact compiler. A package may publish
precompiled artifacts, so consuming an eXact library does not require recompiling its source.

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

Shared runtimes provide narrow operations such as setting text, installing an event, claiming an
element, managing a range, or running one selected task policy. They do not rediscover the
component's topology or interpret a universal component plan when the artifact already knows it.
Generated server writers preflight each dynamic input into a compiler-named local and pass that
value directly to its serialization operation; the runtime does not rebuild a per-region slot
table or allocate a receiver merely to replay the compiler's ordering. Render-program ABI version
4 identifies this direct stateless-operation contract so older precompiled writers cannot be
silently executed with the incompatible calling convention. Direct server components capture
compiler-known child slots during request-local task issuance, allowing independent child work to
start before the writer publishes those slots in authored order. Generic components retain lazy
slot evaluation where reactive stabilization remains observable. A compiler-closed server region
omits its generic VNode recovery factory. JSX interoperability is decided at the rendered component
graph rather than for the whole module: a local direct graph can remain closed even when another
component in the module uses a foreign boundary. A graph with a generic, imported, client-owned,
enhancement-owned, or general-child descendant retains the ordinary renderer.

The compiler also specializes authored `renderToStringAsync()` calls whose local root graph is
closed and whose options cannot enable foreign React markup. Those calls enter a structure-only
serializer that accepts generated render programs, scalar and property slots, and transitively
closed component slots. Dynamic render options, general child expressions, and unsupported graph
edges leave the authored call on the universal SSR entry point. This proof keeps the broad async
VNode dispatcher out of simple production server bundles without creating a second author-facing
render API. A private closed graph rendered by a local call with literal `markers: false` also
publishes its generated HTML directly, so marker, hydration-payload, and resumption-envelope
formatting do not enter that server bundle. Exported server components retain those capabilities
because an external caller can render them with markers, and non-empty output extensions retain
the universal entry point because they may replace the rendered value. The unmarked closed lane can
therefore trust its compiler-produced root directly; plugin-host output processing remains at the
ordinary renderer boundary for authored or externally transformed values.
Server artifacts import structure-only render and task helpers. Durable generic component
construction, enhancement planning, and native structural-boundary ownership are separately
installed capabilities selected only by artifacts that can reach those paths. Resumption
publication is a distinct server capability: a compiled continuation component can publish its
request-local resumption envelope without retaining client-boundary traversal or generic component
construction. SSR enhancement activation and `_target` composition are likewise installed only by
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
Static SSR capability installers use a versioned realm registry for the same development-module
interop reason. That registry contains only module-lifetime functions selected by reachable server
artifacts; request state and component instances never enter it, and omitting an installer still
lets bundlers remove the corresponding implementation from specialized targets.

## Migration inventory

| Existing path                                     | Classification                    | Required replacement                                                          |
| ------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| Compiler-attached component contract and identity | Compiled foundation               | Evolve into the mandatory target-local artifact; remove optional lookup       |
| `markExactComponent()`                            | Ad hoc native fallback            | Removed; compatibility and fixtures use complete scoped artifacts             |
| `contract?.definition?.instantiate ?? type`       | Ad hoc native construction        | Removed; native construction requires artifact wiring                         |
| `ComponentInstanceImpl`                           | Universal native host             | Replace with artifact-selected compact storage and capability sidecars        |
| `defineTask()` in compiler output                 | Generic task fallback             | Emit compiler-selected computation or task lanes                              |
| `defineTask()` as an advanced runtime API         | Internal/advanced primitive       | Move out of the normal compiled runtime graph                                 |
| Generic VNode component mounting and adoption     | Dynamic/compatibility fallback    | Retain only for compiler-declared dynamic ranges and compatibility boundaries |
| `createComponentRegistry()` callable entries      | Native dynamic selection          | Migrated to compiler-selected target-local facade artifacts                   |
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

## Transitional rules

1. New framework code must not add an identity-only native component path.
2. New compiler output must not introduce a generic runtime operation when its policy and topology
   are statically known.
3. During dual-path migration, compiled execution and the legacy path must pass the same observable
   behavior, lifecycle, cleanup, SSR, and hydration tests.
4. A fallback is removable only after all first-party users have migrated and malformed or foreign
   values fail at the intended boundary.
5. Development inspection metadata may be richer than production artifacts, but production state
   must remain coherently inspectable through the artifact ABI.

## Completion conditions

The migration is complete when production first-party code contains no manual native branding,
native entry points require artifacts, simple compiled applications do not retain generic component
construction, and benchmark coverage confirms that only explicitly selected dynamic capabilities
execute or remain bundled.
