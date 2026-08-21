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

## Migration inventory

| Existing path                                     | Classification                     | Required replacement                                                          |
| ------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| Compiler-attached component contract and identity | Compiled foundation                | Evolve into the mandatory target-local artifact; remove optional lookup       |
| `markExactComponent()`                            | Compilerless native fallback       | Remove after first-party and testing migrations                               |
| `contract?.definition?.instantiate ?? type`       | Compilerless construction          | Require artifact construction wiring                                          |
| `ComponentInstanceImpl`                           | Universal native host              | Replace with artifact-selected compact storage and capability sidecars        |
| `defineTask()` in compiler output                 | Generic task fallback              | Emit compiler-selected computation or task lanes                              |
| `defineTask()` as an advanced runtime API         | Internal/advanced primitive        | Move out of the normal compiled runtime graph                                 |
| Generic VNode component mounting and adoption     | Compilerless/dynamic fallback      | Retain only for compiler-declared dynamic ranges and compatibility boundaries |
| `createComponentRegistry()` callable entries      | Native dynamic selection           | Migrated to compiler-selected target-local facade artifacts                   |
| Accessibility components                          | First-party native components      | Migrated to target-paired package artifacts                                   |
| Internationalization components                   | First-party native components      | Migrated to target-paired package artifacts                                   |
| Request provider                                  | First-party native component       | Migrated to target-paired package artifacts                                   |
| Theme components and enhancements                 | First-party native components      | Migrated to target-paired package artifacts                                   |
| Application theme preference components           | Repository application components  | Migrated to target-paired package artifacts                                   |
| Form components                                   | First-party component library      | Migrated to target-paired package artifacts                                   |
| Gesture components                                | First-party component library      | Migrated to target-paired package artifacts                                   |
| Physics components                                | First-party component library      | Migrated to target-paired package artifacts                                   |
| Gravity components                                | First-party component library      | Migrated to target-paired package artifacts                                   |
| Motion components                                 | First-party component library      | Migrated to target-paired package artifacts                                   |
| Router components                                 | First-party component library      | Migrated to target-paired package artifacts                                   |
| Theme fixture components                          | First-party acceptance fixture     | Migrated to target-paired package artifacts                                   |
| Testing mount host                                | Framework testing infrastructure   | Migrated to a target-paired package artifact                                  |
| Microfrontend remote host                         | First-party native component       | Migrated to target-paired package artifacts                                   |
| Native third-party state providers                | First-party native components      | Migrated to target-paired package artifacts                                   |
| Time components                                   | First-party native components      | Migrated to target-paired package artifacts                                   |
| DOM root support                                  | Framework-owned internal component | Replace with an internal compiled artifact or direct root operation           |
| Testing mount host and fixtures                   | Test infrastructure                | Compile fixtures or construct an explicitly internal artifact fixture         |
| React compatibility boundaries                    | Foreign compatibility              | Migrated to explicit target-local compatibility artifacts                     |
| Unsafe HTML, Activity, Suspense, opaque children  | Explicit dynamic operations        | Keep narrow region-local runtime capabilities                                 |

## Transitional rules

1. New framework code must not add a `markExactComponent()` call.
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
