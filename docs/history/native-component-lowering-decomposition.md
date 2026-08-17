# Native component-lowering decomposition

## Status

**Completed and archived.** The native component-lowering implementation is split by the ownership
described here. The coordinator is approximately 320 logical lines, the moved domains retain one
visitor and one per-artifact state object, and no destination exceeds 900 logical lines.

The original monolith and decomposed implementation, both carrying the same deterministic
enhancement-alias correction, produced identical normalized responses for 276 authored files across
22 projects. Native Go, compiler, adapter, build-script, JSDoc, and corpus performance checks passed.
The source-architecture check still reports three pre-existing size violations outside this work.

This document records an internal source-ownership refactor. It did not change application APIs or
authorize changes to JSX/component behavior.

The work should precede substantial additions to component or JSX lowering, including clock-derived
view support, so new functionality begins in the module that owns it rather than extending the
existing monolith.

## Problem statement

`native/typescript-go/overlay/internal/exactcompiler/jsx_lowering.go` is currently approximately
7,300 physical lines. Its name understates its role: the file lowers not only JSX but also component
logs, registries, reactive captures, derived values, tasks, state writes, server/client component
stubs, runtime imports, and stable identifiers.

The file has coherent local regions, but those regions have different reasons to change and
different correctness boundaries. Recent work demonstrates the cost:

- render hot-path changes touched child emission, collection lowering, and scalar expression hints;
- optional localization and DOM capability work touched post-transform reachability and import
  emission;
- component execution and partitioning touched render programs, server slots, and client stubs; and
- task and state lowering continue to share the same traversal even though their analysis already
  lives in focused files.

The size itself is not the sole defect. The material problem is that ownership is implicit in file
position, reviewers must load unrelated domains, and a future feature can easily put logic in the
central file simply because all lowering state is available there.

## Goals

- Give each lowering responsibility one obvious implementation home.
- Keep one explicit traversal coordinator and preserve its transformation precedence.
- Retain the existing immutable analysis handoff and one mutable per-artifact lowering session.
- Preserve current compiler throughput, allocation behavior, output, source locations, and runtime
  tree-shaking.
- Make it possible to review task, state, render-program, property, collection, or import changes
  without loading unrelated lowering code.
- Keep analysis separate from emission: existing analysis files should not absorb AST rewriting.
- Establish a clear destination for future optional enhancement-generated plans without adding
  package-specific rules to the core compiler.

## Non-goals

- Redesigning JSX semantics or the component execution model.
- Introducing another compiler pass, intermediate representation, or plugin dispatch system.
- Moving code into new Go packages.
- Replacing the explicit visitor with reflection, interfaces, a slice of handler closures, or
  dynamically registered lowerers.
- Renaming every lowering type and entry point during the extraction.
- Reformatting or rewriting moved functions for style.
- Updating performance baselines to conceal a regression.
- Splitting files to satisfy an arbitrary maximum line count.

## Constraints from current behavior and history

An implementation must preserve these boundaries:

1. `jsxLoweringPlan.prepare()` remains the immutable analysis-to-emission handoff and creates
   mutable state only for artifacts requiring component-owned work.
2. `lowerExactJSX()` retains the current pass order: primary traversal, removal of fully
   materialized render locals, append client definitions, calculate reachable runtime imports,
   insert imports after directives, and restore AST parent links.
3. `jsxLowering.visit()` retains explicit precedence. In particular, task, derived, state-write,
   island-capture, and JSX transformations must not begin visiting a node in a different order.
4. The main traversal remains a single `ast.NodeVisitor`. Extraction must not add a complete AST
   walk per destination file.
5. Collection indexing remains one preparation step. Ordinary `Array.prototype.map()` calls
   outside JSX child positions must remain untouched.
6. Scalar dynamic-child hints, declarative collection depth, and reactive-closure materialization
   retain their current fast paths.
7. Runtime imports remain determined after transformation from actual identifier and capability
   reachability. Import module order, specifier order, side-effect-only imports, and collision-safe
   local names are emitted identically.
8. `renderProgramBuild` continues using its current bounded builders and slot/node records. The
   refactor must not replace them with interface-backed nodes or allocate a general IR.
9. Stable element, dynamic-expression, partition, task, and operation identities retain their
   current inputs and hashing.
10. Every AST replacement continues to preserve source ranges and required parent links.
11. Task generation retains parameter order, capture order, optimistic staging, continuation
    fencing, and helper-import discovery.
12. Server/client placement, hydration ownership, component localization, structural-boundary,
    unsafe-HTML, modal, and interaction capability detection remain unchanged.

## Selected architecture

All files remain in package `exactcompiler`. This is intentional. The lowerers collaborate through
the same TypeScript-Go internal AST types and one per-artifact state object; subpackages would
require a broad exported internal API, create dependency cycles, or move the monolith into a shared
contract package.

The existing `jsxLowering` receiver is retained during extraction. Same-package method movement has
no dispatch or allocation cost and lets each extraction be reviewed as a pure relocation. The name
can be reconsidered only in a later mechanical change after the boundaries have settled.

The resulting source layout is:

| File                              | Sole responsibility                                                                                   | Representative existing members                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `jsx_lowering.go`                 | Per-artifact state, entry point, pass ordering, and visitor precedence                                | `jsxLowering`, `lowerExactJSX`, `visit`                                                                          |
| `component_surface_lowering.go`   | Non-JSX component authoring surfaces and placement stubs                                              | component log, registry creation, component await/value elision, client component stubs                          |
| `jsx_element_lowering.go`         | Ordinary element, component, micro-component, fragment, and child emission                            | `lowerOpeningLike`, `lowerDynamicComponent`, `lowerMicroComponent`, `lowerFragment`, `children`                  |
| `jsx_render_program_lowering.go`  | Static host render-program construction                                                               | `renderProgramBuild`, namespace rules, slots, literal emission                                                   |
| `jsx_partition_lowering.go`       | Server/client partition slots and component boundaries                                                | partition edge IDs, slot references, boundary children, client/server slots                                      |
| `jsx_property_lowering.go`        | JSX props, attributes, class normalization, callback contextual typing, and binding properties        | `propsWithReactivity`, class helpers, event parameter types, component/form binding properties                   |
| `jsx_collection_lowering.go`      | Declarative and annotated collection emission and key inference                                       | `collectionMapPlan`, `lowerAnnotatedMap`, `indexCollectionMaps`, `collectionKey`                                 |
| `reactive_expression_lowering.go` | Reactive capture, expression/closure emission, and live forwarding                                    | `lowerReactiveCapture`, `reactiveExpressionMode`, `reactiveClosure`, materialized/cached closures                |
| `derived_value_lowering.go`       | Derived declaration/reference rewriting and render-local removal                                      | `lowerDerivedDeclaration`, `lowerDerivedReference`, `omitFullyMaterializedRenderLocals`                          |
| `derived_value_planning.go`       | Pre-emission derived-binding elision decisions                                                        | `planDerivedBindings`, scalar/elidable checks                                                                    |
| `task_definition_lowering.go`     | Authored task definitions, setup resources, policies, binding, and activation                         | `lowerSetupResourceTask`, `lowerTask`, setup/function definitions, invoked declarations/values, concurrency keys |
| `task_continuation_lowering.go`   | Invoked operations, continuations, context writes, dependencies, and capture rewriting                | operation work, continuation work, dependency inference, `rewriteTaskWork`                                       |
| `task_effect_lowering.go`         | Managed task work, optimistic/staged mutations, signals, resources, and work parameter/body rewriting | task mutation helpers, signal/resource calls, `manageTaskWork`                                                   |
| `state_write_lowering.go`         | Ordinary component state read/write/update emission                                                   | `lowerStateWrite`, `lowerStateUpdate`, state path helpers                                                        |
| `runtime_capability_imports.go`   | Collision-safe runtime names and post-transform capability import emission                            | `jsxRuntimeNames`, `runtimeImports`, reachability predicates, `allocateJSXRuntimeNames`                          |
| `lowering_ast.go`                 | Small, semantic-neutral AST construction primitives used by multiple owners                           | call/property/arrow construction, span lookup                                                                    |
| `lowering_identity.go`            | Stable source-derived lowering IDs only                                                               | node IDs, element/dynamic IDs, stable hash                                                                       |

Existing focused files such as `form_bindings.go`, `element_islands.go`, `task_captures.go`,
`enhancement_context_lowering.go`, and `continuation_context_lowering.go` remain authoritative for
their current domains. The extraction must not duplicate their behavior or move analysis into the
new emission files.

### Placement rules

A function belongs with the behavior whose invariant it protects, not merely its caller. For
example:

- `scalarDerivedType` belongs with derived planning even though child emission consumes its result;
- runtime localization/DOM reachability predicates belong with runtime capability imports;
- partition range IDs belong with partition lowering, while generic stable hashing belongs with
  identity;
- event contextual typing belongs with JSX properties, not generic AST helpers; and
- task state mutations belong with task effects, while ordinary `this.state` rewrites belong with
  state-write lowering.

`lowering_ast.go` is not a miscellaneous helper file. A function may enter it only when it is
semantic-neutral, used by at least two lowering domains, and cannot reasonably be owned by either.
Domain-specific convenience wrappers remain with their domain even if they are short.

### Dependency direction

The conceptual dependency direction is:

```text
analysis handoff
      |
      v
traversal coordinator
      |
      +--> domain lowerers --> AST primitives
      |          |
      |          +---------> stable identity
      |
      +--> final capability-import planning
```

Domain lowerers may call other domains only at established semantic boundaries already present in
the traversal, such as element children requesting reactive-expression emission. They must not call
the coordinator's `visit()` to manufacture a second traversal or reach into another domain merely
to reuse a private convenience helper.

Go does not enforce this diagram inside one package, so review ownership is part of the contract.
If a dependency becomes bidirectional during extraction, keep the smallest neutral primitive at
the shared layer; do not create an interface solely to make the diagram compile.

## Visitor organization

The final `visit()` remains direct code rather than a registered handler pipeline. It should be
visually divided into ordered sections with comments:

1. generated/import and component-surface rewrites;
2. collection and task rewrites;
3. placement-based declaration omission/stubbing;
4. derived declarations and references;
5. island captures and state writes; and
6. JSX element/fragment dispatch followed by ordinary child visitation.

Extraction must not convert the chain into a loop of function values. The current checks are on the
compiler hot path, and direct calls allow Go to inline small predicates and avoid handler-slice and
closure overhead. Any later visitor redesign requires separate measurements and a separate
proposal.

## Implementation sequence

Each numbered step should be its own reviewable commit. A commit may add destination files and
remove the identical declarations from `jsx_lowering.go`; it must not combine relocation with
semantic cleanup.

### Phase 0: establish equivalence evidence

1. Build the current native compiler and retain the executable as the before-refactor reference.
2. Run the native Go tests, TypeScript compiler integration tests, and native corpus performance
   check on the same machine/configuration.
3. Capture per-corpus-request normalized output hashes covering emitted code, diagnostics,
   artifacts, source maps, and build products. Exclude timing fields and filesystem-temporary paths.
4. Add focused golden/semantic tests only for a boundary not already protected, particularly
   runtime import order/tree-shaking and mixed task/state/JSX visitor precedence.

The output-hash comparison is required because the corpus performance check validates throughput
and successful compilation but does not by itself prove byte-for-byte result equivalence.

The implementation should add `scripts/compare-native-compiler-output.mjs` rather than performing
an undocumented manual comparison. It accepts `--before <executable>`, `--after <executable>`, and
the same discovered corpus/configuration used by the corpus check. It sends identical cold-session
requests to both executables, removes only the `timings` and `cacheHit` response fields, canonicalizes
JSON object-key order without reordering arrays, and compares each response by request ID. Code,
source maps, diagnostics, analysis/build products, version fields, errors, extensions, and array
order remain exact comparison inputs. On mismatch it reports the project, source file, target, and
first differing JSON path; a combined byte count is not sufficient.

### Phase 1: extract leaf planning and finalization

1. Move stable identity and neutral AST primitives.
2. Move runtime-name allocation and capability-import planning.
3. Move derived-value planning.
4. Move collection indexing/key inference.

These regions have narrow entry points and provide early validation that same-package extraction,
imports, and formatting do not affect output.

### Phase 2: extract JSX-owned emission

1. Move render-program records and emission as one unit.
2. Move partition slots and component-boundary emission.
3. Move JSX property/class/event/binding emission.
4. Move element, micro-component, fragment, and child emission.

Do not separate `renderProgramBuild` from the methods that mutate it, and do not merge partition
lowering into render-program lowering: partition ownership changes for server/client reasons, while
render programs change for host-template reasons.

### Phase 3: extract reactive and component-state emission

1. Move reactive expression and closure emission.
2. Move derived declaration/reference rewriting and materialized-local cleanup.
3. Move ordinary state-write lowering.
4. Move remaining component-surface transformations and placement stubs.

At the end of this phase, `jsx_lowering.go` should contain only session state, entry/final pass
ordering, and visitor dispatch.

### Phase 4: extract task emission in cohesive slices

1. Move task definition/policy/binding emission.
2. Move invoked operation, continuation, dependency, and capture rewriting.
3. Move managed work, optimistic/staged mutation, signal, resource, and parameter/body rewriting.

This phase comes last because task lowering is the largest and most internally connected region.
It already collaborates with `tasks.go`, `task_captures.go`, `task_resources.go`, and continuation
lowering. Keeping its three moves consecutive makes accidental duplication visible.

### Phase 5: consolidate ownership without semantic change

1. Remove newly exposed duplicate helpers and place each at its primary owner, preserving bodies.
2. Add contract-focused comments to non-obvious cross-domain entry points and lifecycle-sensitive
   operations.
3. Verify that no destination became a new catch-all and that Go imports are domain-appropriate.
4. Decide separately whether `jsxLowering`/`lowerExactJSX` should be renamed to
   `componentLowering`/`lowerComponentProgram`. A rename, if accepted, is a final mechanical commit
   and must not be required to complete this proposal.

## Change discipline

During the extraction:

- use whole declaration moves so `git diff --color-moved` can identify relocation;
- preserve declaration bodies and local ordering in the first move;
- allow only `gofmt` import/whitespace changes in a relocation commit;
- do not alter tests merely because their exact output becomes inconvenient;
- do not update the native corpus baseline unless an independently justified performance change is
  intentionally included later; and
- stop and isolate any discovered behavior defect rather than fixing it inside a move commit.

If a function appears to belong to two destinations, its tests and invariant decide ownership. A
thin cross-domain call is preferable to duplicating logic. A new shared abstraction is justified
only when it is smaller and more stable than both callers.

## Verification gates

Every extraction commit must pass:

1. `gofmt` on all touched Go files.
2. `go test ./internal/exactcompiler ./cmd/exactc-native` in the staged pinned TypeScript-Go
   checkout (normally through `npm run build:native-compiler -- --force`).
3. The focused session/lowering golden tests covering the moved domain.
4. Before/after normalized output-hash comparison for representative affected fixtures.

At phase boundaries, additionally run:

- `npm run test -w @exactjs/compiler`;
- `npm run test -w @exactjs/vite-plugin -w @exactjs/webpack-plugin -w @exactjs/bun-plugin`;
- `npm run check:native-compiler-corpus` without updating its baseline; and
- source-map, hydration, SSR, client-island, Intl, component-registry, task, form-binding, and
  dynamic-component integration tests.

At completion, compare the before/after native executables across the full corpus. All normalized
output hashes must match. Compiler throughput must remain within normal run-to-run variance; the
tracked corpus guard is a ceiling, not permission for an avoidable regression. If measurements show
a consistent slowdown, bisect the extraction commits and correct it rather than raising the
baseline.

## Review checklist by boundary

### Traversal and AST integrity

- One primary visitor remains.
- Transformation precedence is textually unchanged.
- No node is visited twice or skipped because a moved method now calls `VisitEachChild` differently.
- Directive/import insertion and `ast.SetParentInChildren` calls remain in the same stages.
- Source-map spans and diagnostics match the reference output.

### Rendering and reactivity

- Render-program template, parts, SSR parts, slots, nodes, and operations are identical.
- Namespace and void/unsupported-host decisions are identical.
- Scalar dynamic hints and live-slot forwarding are identical.
- Materialized/cached derived locals have identical names, evaluation counts, and removal behavior.
- Collection keys and JSX-only map rewriting are identical.

### Tasks and state

- Task helper imports, parameters, captures, dependencies, and continuation contexts are identical.
- Optimistic/direct/staged assignments retain ordering and transactional ownership.
- State write paths, compound operators, task attribution, and update-result behavior are identical.
- Cleanup, cancellation, server dispatch, and inspection metadata remain unchanged.

### Optional capabilities and placement

- Unused runtime capabilities remain absent from output.
- Localization, interaction, modal, unsafe-HTML, and structural-boundary side-effect imports retain
  exact reachability.
- Server/client stubs, islands, partition slots, and hydration ownership are identical.
- Runtime helper local names remain collision-safe and stable.

## Acceptance criteria

The decomposition is complete when:

1. `jsx_lowering.go` is a readable coordinator containing state, entry/finalization ordering, and
   explicit visitor precedence rather than domain implementations.
2. Every moved function has one unambiguous owner matching the selected layout.
3. No destination file is a generic dumping ground or an arbitrary line-number slice.
4. The compiler still performs one primary lowering traversal and the same bounded preparation and
   final reachability work.
5. Full-corpus normalized outputs, diagnostics, artifacts, source maps, stable IDs, and runtime
   imports match the pre-refactor executable.
6. Native Go tests, compiler/integration tests, adapter tests, and the corpus performance guard pass.
7. Measurements show no consistent compiler throughput or allocation regression attributable to
   the split.
8. No runtime, public API, language, or generated artifact behavior changes.
9. Subsequent lowering features can identify their owning file without expanding the coordinator.

## Relationship to clock-derived views

The time proposal's build-only analyzer should produce generic enhancement analysis and a finite
time plan. Its eventual core emission bridge belongs with enhancement activation or reactive
expression lowering, while time-specific analysis stays in `@exactjs/time-analyzer`. It must not
add clock rules to the traversal coordinator, runtime-import reachability predicates, or generic AST
helpers.

Completing the leaf, JSX, and reactive extraction phases before implementing `time:update` gives
that work a stable home. Full task extraction may proceed independently and should not block time
support if phases 1 through 3 and their equivalence gates are complete.
