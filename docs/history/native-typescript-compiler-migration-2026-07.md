# Native TypeScript compiler migration

Status: historical migration record. The native compiler is now the only
supported compiler backend. Current behavior is documented in
[`../native-compiler.md`](../native-compiler.md).

## Summary

The target is one persistent TypeScript 7 Go process that owns parsing,
checking, eXact analysis, lowering, extension execution, and printing. Its
output contract is TypeScript 6-compatible source and eXact-owned diagnostics,
manifests, explanations, and source maps. TypeScript implementation objects and
a reconstructed compiler AST must not cross into JavaScript.

The first implementation used TypeScript 7 for checking, factories, visitors,
and printing while projecting TypeScript 6-shaped semantic objects into
JavaScript. That path established behavioral compatibility but profiling showed
that projection consumed roughly 94-96% of representative compilation time. It
is therefore a migration oracle, not the production architecture.

The repository contains a pinned official TypeScript-Go overlay with a
persistent `exactc-native` host and a statically registered Go extension
interface. Parsing, checking, eXact analysis and placement, policy enforcement,
artifact partitioning, lowering, generated validation, and printing execute in
that host. TypeScript implementation objects do not cross the process boundary.

The earlier unstable synchronous API integration remains only as a differential
oracle. Profiling proved that reconstructing the complete expression and
compiler models in JavaScript erased most native-checker gains, so it is not the
production architecture.

## Goals

- Make native TypeScript parsing, binding, type checking, and incremental
  project state available to the eXact compiler.
- Keep eXact analysis, transformation, extension execution, and printing in
  the same native process.
- Emit source deliberately constrained to the supported TypeScript 6 syntax
  and configuration contract.
- Preserve the public `@exactjs/expressions` model and its rule that TypeScript
  implementation objects do not escape the project boundary.
- Preserve eXact diagnostics, placement, reactivity, generated protocol
  contracts, source identity, and runtime behavior.
- Keep npm, CLI, Vite, Webpack, Bun, and programmatic integration contracts
  independent of the compiler implementation language.
- Reduce cold compilation, incremental edit latency, and retained compiler
  memory on representative applications.
- Retain an explicit TypeScript 6 compatibility backend as a differential
  oracle during stabilization.

## Repository-version compatibility

The compiler's TypeScript version is independent of the application
repository's declared TypeScript dependency. The eXact tool runs its bundled
official TypeScript 7 native checker against source, configuration, libraries,
and declarations supplied by the target repository. It does not select the
legacy backend merely because that repository declares TypeScript 6.

This is the same version-skew model used by other compiler tools: the tool owns
its parser and checker version, while the repository supplies the program. A
TypeScript 6 repository is therefore supported when its syntax, compiler
options, library declarations, and observable diagnostics are within the
TypeScript 7 compatibility contract. The repository does not need TypeScript 7
installed separately.

Functional typing parity does not make version skew literally risk-free.
Acceptance coverage must continue to protect:

- deprecated or removed command-line and `tsconfig` options;
- differences in bundled standard-library declarations;
- package-resolution behavior and package-provided TypeScript declarations;
- diagnostic wording or ordering when a consumer treats it as a contract; and
- unstable native API behavior across TypeScript 7 updates.

Those are compiler-input compatibility concerns, not reasons to load the
repository's TypeScript 6 implementation into the native backend.

## Current implementation boundary

The JavaScript-hosted compatibility backend, retained for explicit legacy and
differential operation, provides:

- one official `@typescript/native` process per expression workspace;
- an eXact-owned virtual config that extends the repository config, preserves
  its compiler options, and limits roots to the active compilation transaction;
- in-memory creation, update, deletion, casing, and disk invalidation;
- immutable native snapshots and deterministic disposal;
- batched AST type and symbol queries;
- normalized source nodes, scopes, variables, types, signatures, directives,
  JSX facts, contextual callback types, and diagnostics;
- native assignability checks and transport telemetry; and
- an explicit `semanticBackend: "legacy"` option for differential testing.

The default native host provides:

- a pinned official TypeScript-Go revision;
- a newline-delimited, versioned process protocol;
- persistent incremental `Program`, checker, overlay-filesystem, and parsed-source ownership;
- raw authored-source normalization for JSX prop punning, synchronous derived
  setup work, async component continuations, and component-state destructuring;
- native directive, import, component, JSX, alias-aware state, provenance,
  callable, context, policy, task-placement, and artifact facts;
- direct native analysis, lowering, generated validation, and printing;
- a statically registered Go compiler-extension interface;
- bounded diagnostics, artifacts, manifests, explanations, source maps, and
  phase timing responses;
- build and test automation that applies the eXact overlay in a temporary
  upstream worktree; and
- optional npm binary packages for six macOS, Linux, and Windows ARM64/x64
  targets.

The compatibility adapter remains useful for differential testing and explicit
transition mode. It is not on the default compiler, CLI, Vite, Bun, Webpack, or
high-level programmatic compilation path.

The unstable snapshot API currently retains stale semantic state for an edited
file held open by the server. The backend contains that issue at its snapshot
boundary by closing and reopening changed virtual files in consecutive
snapshots. A focused stale-source invariant prevents a cached generation from
being published. This workaround should be removed when the upstream API
correctly invalidates open virtual files.

TypeScript 7.0.2 can also panic while serializing the contextual type of some
array-literal expressions (`TypeReference` reported through the tuple response
path). The compatibility adapter therefore does not request an expression-local
type for array literals and projects that one node-level fact as `any`.
Declaration, variable, symbol, element, and contextual consumer types remain
available, so downstream array analysis keeps its authoritative type. Remove
this containment when the native response serializer is fixed upstream.

## Non-goals

- Rewriting the eXact browser or server runtime in a native language.
- Reimplementing TypeScript's type checker.
- Exposing TypeScript 7 AST, symbol, type, signature, snapshot, or handle
  objects as eXact public API.
- Treating byte-identical generated JavaScript as a requirement when semantic
  and protocol contracts are unchanged.
- Depending indefinitely on undocumented TypeScript Go packages.

## Proof-of-concept findings

The experiment in
[`../../experiments/typescript7-native-checker`](../../experiments/typescript7-native-checker)
proved that the installed TypeScript 7.0.2 package can:

- load an in-memory `tsconfig.json` and TSX module through filesystem callbacks;
- return a binary AST to JavaScript;
- batch type queries for selected identifiers;
- reproduce the corresponding primitive type facts from the current
  `@exactjs/expressions` projection by source span;
- advance a persistent snapshot after an in-memory edit; and
- update the affected facts from `number` to `string`.

Three representative runs produced:

| Operation            | Current full expression projection | Native selected-fact slice |
| -------------------- | ---------------------------------: | -------------------------: |
| Cold                 |                         364-374 ms |                   38-47 ms |
| One incremental edit |                           30-32 ms |                     4-8 ms |

These values are not a speedup claim because the native proof projects only a
small semantic slice while the current implementation constructs a complete
`BoundModule`. They establish that the native process and transport are viable:
the complete two-generation probe used 33 requests, transferred approximately
18 KB, materialized 169 nodes, and spent approximately 3-4 ms in transport
overhead.

The compiler remains substantially coupled to TypeScript 6:

- `@exactjs/compiler` contains approximately 22,900 lines of production
  TypeScript;
- `@exactjs/expressions` contains approximately 6,900 lines; and
- approximately 74 production files across those packages import TypeScript.

The migration must therefore be staged around owned contracts rather than
performed as a file-by-file translation.

## Target architecture

```text
bundler, CLI, and npm facades
              |
              v
      ExactCompilerSession
              |
              v
    persistent exactc-native process
              |
              v
 TypeScript-Go program and checker
              |
              v
 eXact analysis and placement passes
              |
              v
 core and plugin Go extensions
              |
              v
 eXact lowering and native printer
              |
              v
 TS6-compatible source + owned metadata
```

The JavaScript API sends source and compilation options and receives generated
source plus bounded eXact-owned metadata. Native AST, checker, symbol, and type
objects never leave the process. JavaScript plugins may temporarily run through
the compatibility host, but native plugins participate directly in the Go pass
pipeline.

## Backend contract

Introduce an internal semantic backend selected when an
`ExactCompilerSession` is created. Its responsibilities are:

1. locate and parse project configuration;
2. own overlays and canonical paths;
3. synchronize disk and in-memory changes;
4. produce immutable expression modules;
5. report affected files and diagnostics;
6. expose profiling and resource statistics; and
7. release snapshots, native processes, caches, and callbacks deterministically.

The backend selection must be explicit during migration. Do not silently retry
with TypeScript 6 after a native semantic disagreement; that would hide
unsupported programs and make builds machine-dependent. A compatibility mode
may choose the legacy backend before compilation begins.

## Native session ownership

Use one persistent native API process per compiler-session workspace rather
than one process per file. Each workspace owns:

- one TypeScript API client;
- the currently open configured projects;
- an overlay filesystem keyed by canonical absolute path;
- the latest immutable snapshot;
- source-file and semantic projection caches; and
- reference counts for consumers of older snapshots.

Advance snapshots only after all overlay mutations for one compiler transaction
have been prepared. Publish the new snapshot after projection succeeds, then
release superseded snapshots when no module generation retains their eXact
projection. Native handles are snapshot-local and must never be cached in
`BoundModule`.

## Filesystem and invalidation

The production overlay filesystem must merge virtual entries with the real
filesystem. For each callback:

- return the overlay result when a path is explicitly present or deleted;
- return `undefined` when TypeScript should fall back to the real filesystem;
- merge overlay and disk directory entries without duplicates; and
- apply the same path casing and slash normalization as the native server.

Translate eXact invalidation transactions into one `updateSnapshot()` call with
complete changed, created, and deleted sets. Use the snapshot's per-project
change summary to invalidate expression modules and downstream artifacts.
Preserve the existing dependent-file behavior until equivalence tests establish
that TypeScript 7's affected set is sufficient.

## Compatibility projection strategy

The existing native projection is retained only as a differential oracle while
passes move to Go. Do not expand it or adapt additional native objects to
impersonate TypeScript 6 interfaces.

Where an unported JavaScript pass temporarily requires projection, it has two
phases:

1. Walk the source AST and prepare all required semantic queries without
   mutating published state.
2. Submit batched queries, normalize their answers, and construct the immutable
   module.

At minimum, batch:

- symbols for identifiers and binding locations;
- types for expressions and declarations;
- resolved signatures for calls and construction;
- contextual types for call arguments and JSX expressions; and
- symbol types at use locations.

Type expansion should remain lazy and cached within one projection generation.
Use native checker operations such as `getPropertiesOfType`,
`getSignaturesOfType`, `getTypeArguments`, and `getNonNullableType` rather than
causing one RPC request for each property exposed by a broad library type.

Add request count, bytes transferred, materialized nodes, server time, and
transport time to expression profiling. Performance acceptance must include
request budgets so a semantically correct change cannot introduce an RPC
N+1 regression.

## Known API gaps to resolve

The unstable API covers the checker operations currently used by expression
projection with close equivalents, including symbol lookup, types at locations,
resolved signatures, contextual types, return types, array and tuple checks,
properties, exports, type arguments, and type formatting.

Known differences require deliberate adapters:

- TypeScript 7 does not currently expose `signatureToString`; generate a
  signature declaration and print it, or define an eXact-owned stable display.
- Type properties and call signatures are checker queries rather than methods
  directly on type objects.
- Symbol declarations are snapshot-local node handles that must be resolved
  before reading directives or source locations.
- TypeScript 6 and 7 AST object identity is unrelated; cross-backend identity
  must use canonical filename, source span, syntax kind, and the existing eXact
  identity rules.
- TypeScript 7 type IDs and symbol IDs are generation-local implementation
  details and cannot become stable eXact IDs.
- Native printer and domain-transform equivalence are covered by the compiler
  regression suite.

Document every required unstable operation in one compatibility module. A
TypeScript upgrade should fail a focused capability test when one changes.

## Full-process migration

### Compatibility emission boundary

The current compatibility implementation produces eXact plans keyed by canonical source identity. The
compiler parses authored TSX in a persistent native project, binds projected
expression identities to that AST, applies the JSX, component-contract, and
secret transforms through a shared TypeScript 7 transformation context, and
prints the result with the Go emitter.

An eXact-owned compatibility facade contains the small factory-signature and
visitor-identity differences between the TypeScript 6 transform API and the
currently unstable native AST API. Updated native nodes retain their authored
identity through an explicit original-node map; synthetic nodes do not acquire
semantic identities accidentally.

The printing session owns one virtual file and persistent native process,
invalidates the source-file cache before each changed snapshot, and keeps a
bounded output cache. A native reparse normalizes mixed authored and synthetic
trees. The final metadata pass removes only native-printer trailing-comma
artifacts, restores compiler-owned pure annotations, and materializes one
internal generated `as any` marker used by typed form bindings. Those markers
are tested not to escape emitted output.

The default facade sends raw authored source to `exactc-native`. JSX prop
punning, component computation normalization, and async continuation
normalization now execute in Go before the retained project is updated. The
TypeScript 6 preprocessor remains only on the explicit legacy backend; no
TypeScript 6 AST enters the default analysis, lowering, or printing pipeline.

### Native process emission

The target emission path runs inside the TypeScript-Go module through its AST
factory, checker, transformers, and printer. The `exactc-native` overlay
establishes this ownership boundary. Each compiler domain module moves as a
cohesive Go pass with contract tests against the existing implementation.

Native emission is accepted only when it preserves:

- source maps and diagnostic locations;
- exact element and operation identities;
- client/server artifact selection;
- imports and tree-shaking behavior;
- JSX expression reactivity;
- lifecycle and resource ownership;
- hydration and server protocol contracts; and
- supported ECMAScript target behavior.

The TypeScript 6 parse and transformer have been removed from the default
lowering path. Retain the compatibility backend only for an explicitly
documented transition period.

## TypeScript-Go overlay and fork policy

TypeScript-Go's compiler packages are Go `internal` packages, so an independent
eXact module cannot legally import its AST, checker, transformer, or printer.
The native compiler is therefore built by applying the eXact-owned overlay to a
pinned official checkout.

Keep the overlay confined to new eXact packages and the smallest necessary
upstream integration points. Do not modify TypeScript algorithms. Pin an exact
upstream revision, test rebases explicitly, and preserve Apache 2.0 license and
NOTICE requirements. Upstream generally useful API improvements when practical.

Go extensions are statically linked initially. Dynamic Go plugins are excluded
because their ABI depends on the exact Go toolchain, dependency graph, platform,
and build flags. A future portable extension format may use subprocesses or
WebAssembly, but it must not require serializing the TypeScript object graph.

## Test strategy

### Differential expression corpus

Run every expression fixture through both backends and compare:

- node categories, text, and spans;
- scopes and variable identity;
- reads, writes, and captures;
- resolved call targets and signatures;
- normalized type graphs;
- JSX elements, attributes, cells, and contextual parameters;
- annotations and directives;
- module imports and exports; and
- diagnostics with severity and location.

Compare supported contracts rather than backend-specific IDs or incidental type
print ordering.

### Compiler differential corpus

Compile the existing compiler, application, adapter, plugin, and component
library fixtures with both semantic backends. Compare:

- accepted and rejected source;
- placement and secret-policy decisions;
- generated component and operation identities;
- client and server reachability;
- emitted runtime behavior;
- SSR and hydration results; and
- source-map mappings.

Where exact emitted text is not a contract, execute the output or compare its
semantic artifact model.

### Adversarial and lifecycle coverage

Add focused coverage for:

- malformed and partially typed source;
- recursive, conditional, mapped, and very broad library types;
- aliases and re-export chains;
- project references and package boundaries;
- file creation, deletion, rename, and config changes;
- concurrent compiler sessions;
- snapshot disposal and stale handles;
- cancelled builds and plugin shutdown;
- filesystem case sensitivity and symlinks; and
- native process crash and protocol-version mismatch.

## Performance gates

The native compiler corpus uses the same repository discovery contract as the
legacy expression corpus and runs 482 source files from 19 configured projects
through one native invocation. Go owns file I/O, four concurrent workers,
persistent project sessions, compilation, result validation, and aggregation;
JavaScript only discovers the stable shared source set before the timed region.
Complete correctness runs after raw-source normalization and repository-wide
Before retained-tree restoration, complete runs took 86.48, 86.94, and 97.76
seconds on the recorded Windows x64 Ryzen 7 development machine. Native lowering
temporarily attached authored nodes to synthesized parents, so the host rebuilt
the official TypeScript program and its project callable cache before every
subsequent compile. Restoring the checker-owned parent links after printing
removed that invalidation without weakening analysis.

The current complete corpus compiles 483 files in 7.61 seconds. The legacy
expression baseline normalized to the same files is 59.69 seconds, making the
native host 7.85 times faster. The latest summed worker profile attributes 18.34
seconds to analysis, including 7.76 seconds to callable analysis and 8.83
seconds to project linking. TypeScript-Go program maintenance accounts for 4.55
seconds; source analysis, policy/task analysis, lowering, printing, and checking
together account for less than 3 seconds. The retained-program lifecycle is
protected by focused Go coverage plus the complete package, application, and
corpus gates. The corpus command fails when native execution exceeds the
normalized legacy baseline unless an explicit environment threshold overrides
the release guard.

Continue measuring:

- process startup and first project load;
- implementation-only edit;
- exported-shape edit and dependent propagation;
- client/server artifact compilation;
- generated semantic validation;
- request count and transfer volume;
- peak and retained memory; and
- shutdown and resource release.

Kanban, Workbench, Sudoku, shipping, and microfrontend production builds also
exercise the native Vite path. Performance acceptance remains based on the
corpus and representative applications rather than narrow parser or printer
microbenchmarks.

## Delivery phases

### Phase 0: proof of concept

- Complete: in-memory native project and TSX AST.
- Complete: batched native type lookup.
- Complete: initial and incremental primitive-fact equivalence.
- Complete: native request and timing telemetry.

### Phase 1: compatibility contracts

- Complete: internal semantic backend interface.
- Complete: prior `ExpressionProject` behavior isolated as the legacy backend.
- Complete: production overlay filesystem and native session ownership.
- Complete: native version pinned through the package dependency and exercised
  by capability coverage.
- Complete: normalized expression and compiler differential contracts cover
  initial and retained-session semantic edits without comparing backend-only
  identity or representation details.

### Phase 2: compatibility projection

- Complete: source-node, scope, binding, directive, type, signature, call, JSX,
  and module projection.
- Complete: batched node type and symbol query planning.
- Complete: diagnostics, virtual config ownership, and incremental
  invalidation.
- Complete: structured cross-backend comparisons protect scopes, bindings,
  types, calls, JSX, placement, tasks, continuations, resumptions, policy, and
  diagnostics at their supported contract boundaries.

### Phase 3: persistent native host

- Complete: pin the official TypeScript-Go source revision.
- Complete: implement the versioned persistent `exactc-native` protocol.
- Complete: retain parsed source and print directly from the native AST.
- Complete: retain and incrementally update the TypeScript-Go program and checker.
- Complete: expose a synchronous JavaScript facade over one persistent process.
- Complete: implement deterministic statically linked Go extensions.
- Complete: enforce extension namespace and directive ownership.

### Phase 4: native eXact passes

- Complete: port core and namespaced directive parsing and validation.
- Complete: port static import and component declaration discovery.
- Complete: port JSX syntax facts and task facets.
- Complete: port checker-symbol state aliases, exact/broad state reads and writes,
  lexical reactive provenance, task state effects, and direct environment placement.
- Complete: port local checker-symbol callable graphs, fixed-point environment,
  state, and context propagation, context-token effects, canonical task resource
  ownership, escape diagnostics, and cancellation injection sites.
- Complete: port nested component discovery, intrinsic client-island counts,
  split-boundary effects, task/context aggregation, local JSX render edges, and
  fixed-point component subgraph placement.
- Complete: port annotation-backed ownership, selected-signature cancellation,
  callable client/server/pure/keep contracts, state and context policy subjects,
  and residency-driven task placement.
- Complete: port fixed-point policy propagation through declarations, callable
  returns, typed secret values, method-derived values, and destructuring; audit
  imported secret consumption; enforce qualified call boundaries; and reject
  client-artifact consumption.
- Complete: link callable effects and imported component placement across the
  retained native project without exposing dependency summaries in a
  module-scoped response.
- Complete: lower intrinsic and component JSX, fragments, attributes, spreads,
  reactive cells, and direct or alias-resolved transactional state writes
  inside the Go process with stable runtime identities.
- Complete: lower safe derived bindings and reads, inferred and explicit task
  dependencies, generation-scoped awaits, abort-signal injection, timers,
  fetches, observers, and owned task resources inside the Go process.
- Complete: assign compiler-compatible component and task protocol identities,
  attach target-local ownership brands, and emit root contracts for exported
  client component declarations and values.
- Complete: materialize continuation and resumption IR, tag and extract server
  task work, emit client dispatch stubs and state-only executors, reconstruct
  explicitly shared and server-owned context reads by policy, preserve
  component-scope context aliases, and partition shared context writes into
  resumption contracts.
- Complete: qualify native secret-policy declarations, callable returns, and
  explicit `Secret<T>` call boundaries without transporting secret values.
- Complete: execute server-retained context writes, emit generated
  implementation and boundary contracts, retain client-visible server
  component stubs, and partition client/server artifacts.
- Complete: validate generated TypeScript, emit source maps, manifests,
  placement explanations, asset records, and imported-manifest links.
- Complete: move authored-source normalization from the JavaScript facade into
  the native host so the default path receives raw TypeScript and TSX.
- Complete: apply artifact-planned module aliases to imports, export-from
  declarations, dynamic imports, CommonJS requests, and import types in the Go
  tree before native printing.
- Complete: apply structured export replacements to ESM imports and re-exports,
  CommonJS member and destructuring forms, and checker-identified namespace
  uses in Go. Only arbitrary JavaScript transform callbacks remain an explicit
  post-print compatibility extension boundary.
- Complete: preserve domain contracts through focused Go tests, native process
  integration, compiler tests, and native sample builds.

### Phase 5: plugin migration

- Complete: preserve existing JavaScript analysis plugins through an explicit
  compatibility boundary.
- Complete: define the native Go extension interface and deterministic
  build-time registration contract.
- Available: statically link first-party or application-selected Go extensions
  through the distribution build hook. The default distribution does not yet
  link a first-party native extension.
- Deferred: publish a separately versioned extension SDK or portable isolated
  format after measuring real third-party requirements.

### Phase 6: default and stabilization

- Complete: make `exactc-native` the default for the CLI, high-level
  programmatic compiler, Vite, Bun, and Webpack after the native corpus and
  sample-build gates passed.
- Complete: retain an explicit `legacy` compatibility option for the announced
  transition period without silent retry.
- Complete: define and validate optional npm binary packages for macOS, Linux,
  and Windows on ARM64 and x64, including pinned upstream licensing.
- Complete: automate cross-compilation, packing, corpus verification, artifact
  upload, and explicit npm publishing.
- Complete: audit legacy entry points. Compilation and bundler entry points
  default to native; expression-only convenience projection and explicit
  `legacy` selections remain deliberate compatibility boundaries.
- Complete: retain native import facts through artifact dependency planning
  instead of reparsing each module with TS6, and guard the default project
  artifact path against both `typescript.createSourceFile` and compatibility
  `createExpressionProject` calls.
- Complete on the development platform: package tests, sample builds, platform
  boundaries, source architecture, JSDoc, package contents, TS6/TS7 typechecks,
  and the native corpus pass together.
- Complete in release automation: build, pack, install without lifecycle
  scripts, and execute each native package on matching macOS Intel/Arm, Linux
  x64/Arm, and Windows x64/Arm GitHub-hosted runners. The compatibility backend
  remains until a deliberate major change.
- Complete: every native response reports the TypeScript-Go and eXact backend
  versions. Process, protocol, and backend failures retain those versions in
  the JavaScript error, and package execution verifies the same version
  handshake.

## Acceptance criteria

The full implementation is complete when:

1. all stable expression and compiler contracts pass differential tests;
2. all repository package tests, sample builds, platform boundaries, source
   architecture checks, package-content checks, and performance guards pass;
3. incremental invalidation and lifecycle cleanup have dedicated regression
   coverage;
4. supported operating systems and architectures install without a local Go,
   Rust, or C++ toolchain;
5. native compiler failures identify the TypeScript and eXact backend versions;
6. measured representative performance justifies making the backend default;
   and
7. TypeScript implementation objects remain inaccessible outside the native
   process; and
8. the default compiler does not reconstruct a TypeScript AST, symbol graph, or
   type graph in JavaScript.
