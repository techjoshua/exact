# Native compiler

`@exactjs/compiler` is the JavaScript process host and public API for the native `exactc` compiler. Parsing,
checking, eXact analysis, placement, policy enforcement, artifact partitioning, lowering,
generated-code validation, and printing execute in one persistent native TypeScript process.
After analysis and target transforms settle, the JavaScript artifact host stages the complete
client, server, shared, source-map, and inspection set before publication. A filesystem failure
restores the prior generation instead of leaving target files mixed. Semantic work and
deterministic diagnostics remain single-owned by the retained native session.

Semantic generated-code validation keeps each module at its original identity. Imported finite
mutation helpers are checked against the same compiler-owned companion bodies and runtime support
imports emitted by their producer. This dependency view is local to validation. The authored
program remains unchanged, and retained validation applies the same dependency view as a fresh
program, including changed or removed producer sources. Relative module aliases also keep already resolved ordinary source imports
linked to their original module identity during checking, including type-only edges. This is a
source-type proof before publication, so a resolved relative alias does not require its output file
to exist yet. Unresolved original imports and unresolved bare replacement targets remain errors.
The checking view writes no files and does not prove that a final artifact set has been published.
The artifact host owns the complete plan and commits it only after both targets validate. Generated import types retain that original dependency identity when an artifact moves to its output directory, including types inferred from an already resolved transitive source module.

Supported package declaration contracts retain their operation requirements when a host snapshot leaves an external package executable opaque. This applies to actual ambient function and variable declarations, including merged type/value exports. An explicit selected executable still owns the body, and a declaration supplies neither a private helper nor implementation proof. Opaque local imports retain uncertainty.

There is no JavaScript compiler fallback and no public backend selector. Native failures remain
visible instead of silently changing compiler semantics.

Native property validation reserves `data-exact-id` for compiler-generated physical element identity. This reservation also applies to native `_` and `_target` host contributions. Explicit attributes and statically known spread properties receive an error with a custom-attribute remedy. Validation includes members proved by the existing finite spread syntax facts, even when a type assertion hides them from the apparent type. Opaque spreads remain valid. Their normal evaluation and getter effects complete once before the compiler installs physical-address metadata under an internal shared symbol. This construction does not validate arbitrary runtime receipts or change replay authorization. Physical metadata is installed last. Native renderers ignore reserved ASCII-case-equivalent string keys and serialize the physical address once. Structural contributions neither supply nor override the selected host address, including during target composition. This metadata is not operation authority.

## No-emit language sessions

`createExactLanguageService()` owns a persistent editor-oriented project in the
pinned native compiler. Unsaved `upsert` changes overlay disk files by document
version, `close` releases an overlay, and `delete` removes the source from the
retained project. Each synchronization publishes one immutable generation with
changed files, affected dependents, and eXact diagnostics.

The language transport is asynchronous and serializes semantic mutations
without blocking the language server's JSON-RPC loop. Cancellation fences
native results even when a compiler phase cannot yet be interrupted internally,
and document-version checks prevent an older response from replacing newer
editor state. Disposal releases overlays, dependency indexes, pending work, and
the native process.

Language sessions are permanently `noEmit: true`: they never write JavaScript,
target artifacts, source maps, or inspection catalogs. Source
entities, typed reasons, rich diagnostics, and refactor plans are in-memory
projections of the same native component and placement analysis used by builds.

Build source maps preserve the native compiler map through later framework prefixes by composing
an exact generated-to-compiled suffix map. Host `moduleTransform` callbacks must return a version
3 map whenever they change code with source maps enabled; an unmapped rewrite is rejected rather
than approximated line-for-line. Vite, Webpack, and Bun recovery paths use token-position mappings
and leave generated-only regions unmapped.
Compiler process protocol 1.0.0 and component-contract version 1 carry the normalized recursive
partition plan, including ordinary enhancement-component owners, structural templates,
crossing-edge data slots, source evidence, and partition-derived range contracts. It also retains
`setupExecution` on authored state assignments across source normalization, distinguishing
one-time initialization from deferred reactive calculation. Analysis responses remap those
assignment spans to the original source before returning them to the language service. Paired
component and intrinsic bindings are preserved as authored `valueBindings` edges with their parent
state path, endpoint props, callback value type, placement, artifact targets, and intrinsic adapter
identity; generated helper names never replace that source-facing description.
Component binding types preserve generic instantiation before checking each endpoint. Explicit
JSX type arguments use the resolved signature. Inferred signatures combine ordinary authored
props with the finite value props generated by shorthand through the checker’s ordinary inference.
Binding location proof unwraps parentheses and erased assertions while retaining the authored
type and source span. Generated assignment checking preserves the writable member and projects
its receiver through derived cells. Reads and assignments retain assertion grouping inside
combined render slots. Computed write paths retain their original dynamic operands through
notification lowering and ordinary assignments.
See [Compiler-aware language tools](language-tools.md).

The native source is pinned from Microsoft’s main `TypeScript` repository, in its `tsc` Go module.
See [release readiness](release-readiness.md) for the upstream pin, ABI baseline, and publication
checks. The local `native/typescript-go` directory name is retained for repository continuity.

## Application and compiler TypeScript versions

New applications use TypeScript 7 for editor support and `exactc --check --project tsconfig.json` for compiler-aware
application checking. The compiler owns its pinned native TypeScript revision independently of
the application’s `typescript` dependency.
Application source does not import a compiler API, and it does not need TypeScript 6 to run the
eXact compiler.

Some build-time compatibility packages still use the TypeScript 6 programmatic API for their own
bounded jobs, such as configuration loading or React source transformation. That dependency is
not an alternative eXact compiler backend.

## npm distribution

The `@exactjs/compiler` tarball contains the JavaScript host, public contracts, CLI, and compiler
orchestration. It declares six optional platform packages:

- macOS ARM64 and x64;
- Linux ARM64 and x64; and
- Windows ARM64 and x64.

Each platform package declares npm `os` and `cpu` constraints. npm therefore installs only the
package matching the current machine. The host package does not contain six executables.

Set `EXACT_COMPILER_EXECUTABLE` only when a hermetic build or compiler-development workflow must
provide an explicit executable. No deprecated compiler-name environment alias is accepted.

## Library builds

`exactc build-library` and `buildLibrary()` from `@exactjs/compiler/library-build` own the
library packaging pipeline: declaration emission, paired unbundled modules, optional-enhancement
facades, export validation, and static package metadata. See
[library build configuration](component-library-trust.md#build-a-component-or-enhancement-library).
The JavaScript TypeScript API supplies declaration emission only; eXact analysis and lowering
remain native compiler responsibilities. The repository build uses the same builder after its
TypeScript project build, without changing the package artifact contract.
Before declaration emission, the native checker validates all production sources selected by the
library's TypeScript configuration, including support modules outside `exactCompileModules`.
TypeScript infers declarations from authored signatures and reports declaration emission errors.
It does not recheck task bodies using ordinary function receiver rules.

## Public integration

When emitted code reaches an optional enhancement, `compileFile` and `compileProject` prepend its
artifact-local registration and materialize a provider facade under the output's
`.exact/enhancements` directory. Emitted modules import that ordinary ESM file, never an `exact:`
scheme, so unbundled Node SSR needs no custom loader. Provider resolution happens during
compilation, not per request; absence selects the shared pass-through, while malformed installed
exports fail when the generated module is linked.

Newly generated physical facades also retain their validated optional-provider request in a
compiler-owned first-line marker. When a published component library is bundled by an eXact build
adapter, the adapter reselects that provider in the consumer installation instead of retaining the
publisher's availability decision. The same authorization and absent-provider rules apply as for
portable paired requests. This metadata is additive and does not change runtime helper signatures.
Libraries produced without the marker must be rebuilt to gain consumer-side reselection; ordinary
unmarked ESM re-exports are not reinterpreted as optional imports. Shared adapter support restores
compiler-marked facades to consumer-owned optional edges and classifies absent-module errors.
Bun and Webpack also share the Node-style package-presence check used when a host resolver
does not distinguish an absent package from a missing entry file in an installed package.
Build adapters derive application configuration and authorization ownership from the host project:
Vite uses its resolved `root`, Webpack uses compiler `context`, and Bun uses build `root` when
supplied, otherwise the process directory. An explicit `applicationRoot` overrides that default.
Root-sensitive enhancement, translation, compatibility, and authorization owners must agree before
build startup. Individually named absolute source files in an explicit adapter `include` can join
the host-selected source graph outside that root. Each file still needs an actual resolver-selected
edge and final compiler preparation. Pattern filters do not admit outside neighbors, and source
availability does not grant component-library authorization to another physical package.

Host-selected local server helpers use the adapter's actual resolved module for ordinary calls and
private task-owned entries. The compiler keeps authored TypeScript diagnostics separate from the
selected executable body and uses that body's parameter and write facts for publication. The build
prepares the complete relative/absolute local source graph below its application source root before
sibling modules load, so an ordinary import cannot race helper ownership acquisition. Snapshot
installation and dependent compilation share one serialized session operation. The existing native
acknowledgement binds target, generation, content revisions, and syntax slots. Missing or external
edges cannot fall back to a neighboring TypeScript implementation for private authority. Bare
package, alias, and virtual-source private authority are outside this local helper selection path.
Vite and Bun keep require slots opaque because their current selection callbacks do not establish
require-condition resolution. Webpack supplies its actual commonjs or esm resolver kind. Ordinary
host execution remains available for opaque sources.

Vite, Bun, and Webpack use these same contracts. Missing nested dependencies and invalid installed
providers remain failures rather than silently disabling an enhancement.

Paired `compileFileArtifacts` / `compileProjectArtifacts` output is portable build input.
`compileFileArtifacts` also publishes compiler-required local helper companions within its output
root. Keep those paired modules with the entry artifact when bundling or distributing it. Each
module carries registrations and `exact:optional-enhancement` requests. Consume enhanced paired
output through the eXact Vite, Bun, or Webpack adapter, which resolves those requests in the consuming module's
scope and target. It applies server authorization before loading providers. Missing providers use
the shared pass-through; explicitly excluded optional providers follow the configured exclusion
policy. A failed authorization does not become an absent provider. The producing machine does
not select or freeze the consuming application's optional dependencies.

Paired artifacts with component or enhancement imports also retain protocol-1 importer facts in an
inert `exact:component-build` comment. Ordinary JSX render helpers also contribute imported component edges, using native
JSX spans and binder identities to distinguish imports from shadowed local names. Those edges
receive the same consumer-side authorization and target-local bundling as component render edges. These facts follow target module aliases and binding
replacements; they carry no authorization decision or producer filename. Build adapters read and validate
them before skipping executable recompilation, then authorizes those imports and bundles approved
compiled component entries through its optional-provider resolver. The appended comment preserves
existing source-map positions. Keep this metadata until adapter consumption and regenerate older
paired artifacts to gain this preflight coverage. Runtime helper signatures are unchanged.

These portable requests are not native Node module specifiers. For unbundled Node execution, use
single-target `compileProject` output with its physical facades, include those facades in the
output distribution, and render through `@exactjs/ssr/enhanced` to supply the registered catalog.
Keep authored relative dependencies available or compile them into the output graph. Paired
project compilation rewrites local provider requests to the matching target artifacts when those
providers belong to its plan; other relative requests retain their original source destination.
Linkage and adjusted source maps publish in the same transaction as the paired code.

For client artifacts, each provider facade also imports the DOM enhancement integration. The
integration registers a versioned realm capability synchronously, so bundlers place it with the
static, lazy, or microfrontend module that selected the provider rather than forcing it into every
application entry. Server facades continue to select the SSR catalog facade and do not import DOM
code. Build adapters must preserve the client facade's registration side effect. Compiler-selected DOM
capability entries call their private installers explicitly, so the internal implementation stays
reachable through package tree shaking. The platform-boundary check verifies both selected
registration and pruning from an ordinary renderer for modal, root release, Target, unsafe HTML,
text host and structural boundaries.

Component capability planning uses the same native-component resolver as JSX receipt emission.
Host-classified imports, published component build facts, source declarations, and finite registry
identities therefore select consistent constructors and child operations. An unresolved preliminary
render edge does not by itself require compatibility or task support. This prevents a native package
child, such as `IntlMessage`, from selecting a task constructor without a task-runtime import.
Regression coverage builds the Intl workload and mounts, updates, server-renders, hydrates, and
disposes it in a fresh process, where unrelated tests cannot supply missing registrations.

Finite registry declarations, callbacks, and selected values retain their ownership through
parentheses and type-only wrappers. Scoped lazy facts follow the callback's builder parameter or
destructuring binding rather than its local name. Literal key proof uses checker-owned values,
including escaped strings. Immutable aliases retain selection provenance and shared mutation
ownership. Assignment and deletion targets remain writes through transparent wrappers.

Collection planning shares literal member and transparent callable proof with capability,
render, item-scope and partition consumers. Checker-resolved array ownership distinguishes
standard mapping from application methods. Destructured item callbacks retain the whole item
for key selection and their authored bindings for rendering. Defaulted callbacks retain their
authored item type when emitted through a generic list helper. Authored JSX keys override
inferred identity. Callback-local keys retain their lexical scope and derived-binding projection.
Interactive callback ranges retain every enclosing repeated lexical scope under one island
owner. State-connected sibling consumers share that owner. Immutable aliases of the actual component receiver are recreated under that owner rather
than serialized as data. Captures and materialized locals retain readonly and generic constraints
using checker-owned names in a retained lexical type environment. Module symbols keep their
identity. A finite destination type environment retains demanded local aliases and interfaces, including
merged and recursive groups. It owns the annotations actually emitted for captures, functions and
materialized locals. Explicit syntax preserves instantiated generic arguments. Inferred binding
types use the authored checker and its synthesized symbol map. Complete value queries rooted in
component parameters or setup locals are projected before extraction, preserving member types
without moving initializers or querying a generated capture envelope. Props observation does not
supply children capability. Authored property/index/union facts select child-slot access and data
sanitation, including guarded reads when only part of a union can supply children. Scalar read facts are captured before extraction,
so reconstructed callbacks do not query a checker whose lexical tree has changed.
Native callback parents establish separate nested list ownership instead of sharing a component
site cache. Literal key fields use indexed
access when their names cannot form an identifier. Primitive inference follows the existing
string-or-number key contract. Eager render callbacks retain state-write validation through
the same source wrappers, including sorting and iteration callbacks.

Resolved helpers receiving the component through ordinary parameters retain its focused
capabilities. Ownership follows immutable aliases, helper chains and captured parameters using
symbol identity. Passing an unrelated receiver does not select component capabilities. Ordinary
helper bodies remain unchanged. Context read methods carry the framework's pure-read contract,
while context writes remain effects.

Direct server clock ranges defer value reads until their enhancement selects the provider clock.
The additive `createDeferredServerChildRange` helper retains the existing prepared-range shape
and selects no reactive graph. `createDeferredServerIntrinsicReceipt` preserves deferred clock
attribute and conditional-class readers without copying their values early.
`createDeferredServerIntrinsicSpreadReceipt` defers a whole clock-bearing host property group
so finite conditional keys and last-write-wins spread order survive provider preparation.
Enhancement ownership and explicit key metadata remain eager. Final time-policy source
selection is shared by activation and diagnostics, including finite enhancement-bearing spreads.
Clock-bearing aliases retain the immediate-write rejection of their consuming expressions. Payload derivation preserves
that deferred group without observing it. These helpers are selected only for affected server output, and ordinary server ranges and intrinsic properties
remain eager. These internal exports preserve existing signatures, artifact layout and ABI epoch. New compiler artifacts
require the matching core provider package. Existing epoch-2 artifacts retain their existing imports.

Clock recognition proves standard-library value identity before replacing `Date`, `Math`, or
`Temporal` operations. Finite member keys retain their authored evaluation when lowering replaces
the operation. Precision validation follows genuine Temporal receiver types. Each repeated clock
expression also validates independent immediate calls and key arguments, while deferred functions
keep invocation ownership. Clock and formatter searches stop at nested time ranges.
Generated Temporal clock reads restore their proven native result category after the erased
runtime helper call. Localization receiver preparation includes stateless server components whose
owner reference is introduced by the later Intl pass. Its qualified runtime-module owner type
avoids capturing an application utility alias. Native duration construction uses core's
strict localization helper and retains the native formatter type and construction point.
Generated Intl element factories declare their children parameter from `IntlElementFactory`.
Element and opaque factory signatures have different first parameters, so their union cannot
supply that contextual type in a strict TypeScript build.

Applications normally compile through `@exactjs/vite-plugin`, `@exactjs/webpack-plugin`, or
`@exactjs/bun-plugin`. The `exactc` CLI supports precompiled pipelines. Direct tooling can use
`createCompilerSession`, `transformSource`, and the artifact-planning APIs from
`@exactjs/compiler`.

Successful transform results retain optional structured `diagnostics` independently of inspection.
Each `NativeCompilerDiagnostic` preserves its severity, stable code, authored filename and range.
Programmatic transforms collect diagnostics without printing. The CLI reports warnings to stderr
for checking, ordinary compilation, and paired artifacts. Warnings do not change a successful exit
status or prevent emission. Vite, Bun, and Webpack forward them through their existing warning
channels. Errors retain their refusal behavior.

The CLI deduplicates repeated target diagnostics within one invocation while each target result
retains its own collection. A local `@exact ignore=EXACT2004` acknowledgment removes only that
compiler advisory before host delivery. It grants no placement or runtime authority. See
[task lifetime](tasks.md#structural-settlement-and-failure) and the
[directive reference](component-language.md).

Each transform result reports `runtimeDependencies`, the bare package specifiers that remain in
the final target-local module after lowering and pruning. Published-package builds validate those
facts against `dependencies`, `peerDependencies`, and `optionalDependencies`; a generated DOM or
SSR import can therefore never be hidden behind a development-only workspace installation. The
monorepo discovers packages requesting target-local compilation from their manifests rather than
maintaining a second ordered package list.

Relative executable imports retain their runtime source edges when TypeScript resolves their types
through a declaration companion. The runtime edge uses existing artifact planning and import
rewriting. Dependencies without paired artifacts link back to the actual source module rather than
being copied into `outDir`. Type-only imports and package declarations do not acquire runtime edges
through this fallback.

Precompiled pipelines treat `rootDir` as an output-containment boundary. Every input must resolve
beneath that root before the compiler derives a path under `outDir`; an outside input fails without
writing through `..` segments or an absolute path.

The Vite adapter authorizes each optional provider in its importing component's scope, then gives
equivalent resolved facades one content-derived module identity. Compiler-selected narrow SSR,
DOM root, and hydration entries use the same catalog-supplying facades as their public entry points. Components that select the same
provider therefore share one browser module without weakening package-scoped authorization.

`exactc --check --project tsconfig.json` is the no-emit application type-check path. It analyzes and lowers each
transformable project module before TypeScript semantic validation, so compiler-owned TSX is
checked as the ordinary props and callbacks it produces. Untransformed TypeScript modules are
still checked directly. Component prop constraints cover required and excess properties, spreads,
generic inference, callbacks, and authored children before runtime receipts erase their types.
The checking projection normalizes component bindings and excludes compiler-owned enhancement
metadata from the public prop bag. It retains authored locals captured by prop constraints,
including object, array, and destructured bindings that executable client lowering can inline.
Executable artifacts retain the same receipt ABI.
Type subtrees remain separate from executable lowering. Indexed props
read proofs retain their authored nodes for type queries. A rewritten task expression can keep
the same source span while lacking the lexical parents required by the checker.
Type queries of
component-derived locals preserve the authored value type, including qualified members and generic
instantiation, rather than exposing generated reactive cells. Type-only environment references do
not select client or server placement. Derived declaration identities include their authored source,
so imported declarations cannot alias local plans through matching offsets and continuation clones
retain valid local references. Raw `tsc --noEmit` remains useful for packages that contain no eXact-owned
source syntax, but it is not authoritative for an eXact application. The current directory's
`tsconfig.json` is used automatically; `--project` selects a different configuration.

Source-local identity maps are built once and shared by component discovery, placement, island
planning and lowering. Project caches retain them only while their source identity survives
invalidation. Import-specifier discovery is cached by immutable source identity during
reverse-dependent invalidation. Replaced sources and full invalidations release those facts,
while conservative dynamic/global/path-mapping rules remain unchanged. JSON source syntax
has no executable import expressions or component declarations, so those discovery passes
do not traverse its literal data. JSON value typing and secret-policy checks remain intact.
Dependency discovery runs before identity allocation, and empty component facts
are retained under the same invalidation rules as component records. Their traversal paths and
generated identity strings remain unchanged. Requests without owned components defer the
dependency placement fixed point until a component request needs it. Source invalidation
still clears affected placement facts before that next request.
Native build staging includes the authored checker extensions alongside the compiler host.
The mutation runner verifies those checker sources against the same repository overlay before
building witnesses, and build-script acceptance checks that every owned Go package is selected.
Serialized session analysis acquires the authored program pool’s primary checker exclusively.
Cross-module requests therefore reuse one coherent type graph rather than distributing serial
work across file-affinity checkers. Parsing and generated validation retain their existing policies.
Import bindings and state-alias proofs are shared within one acquired authored checker. Requested
source callable facts seed project discovery before dependency analysis, avoiding provisional
analysis and a second graph merge for that source. Import and alias proofs remain request-local.
Callable facts and their executable/source-value owners are retained only for the exact authored
Program and acquired checker that produced them. A replacement Program or checker renews that
callable generation, even when some source text or AST identities survive. Unchanged generations
retain their callable cache. Other project caches keep their existing source invalidation rules.
Callable-cache reuse compares asset-rule values against an owned snapshot rather than formatting
the declarations into a string on every request. Rule order, selector lists, evaluation, and
delivery remain invalidation inputs. Replacement generations copy selector slices so later request
mutation cannot change the cache's retained contract.
Completed secret-type qualification queries are
shared by member and source-result policy analysis, including dependency component analysis.
They are retained separately for each exclusive checker owned by the unchanged authored program,
and discarded on every source invalidation or program replacement. Recursive provisional results
and inferred source subjects remain local to their traversal and source analysis. Member policy
discovery filters primitive local bindings before qualifying selected types, since annotation and
inference own their assignment contracts. Inferred local aggregates also inspect checker-resolved
field declaration policy, including inherited and mapped members. Public sibling selection retains
its own selected type. Imported values, members and instantiated call results retain their checks.
Client artifact containment separately plans qualified initializers and assertions against authored
AST identities before lowering. Qualified parameter defaults, including constructor parameter
properties, retain the same obligation even when their body is deferred. Destructuring defaults
also consume the receiving bindings' existing propagated secret policy, including renamed and
nested object/array patterns whose inferred checker types do not carry the input annotation.
An enclosing pattern default retains the obligation of its qualified leaves. Assignment defaults
use the same owned binding policy and native assignment-target classification, including the
separate shorthand default expression. This propagated lookup qualifies the fallback, not an
ordinary assignment's incoming reference. Declared field and checker-type obligations remain
independent. Public defaults keep their ordinary
behavior. Writes to qualified fields and annotated deferred bodies retain
the same containment obligation. Owned qualification also follows native array, promise, map,
and set payloads, plus declaration-backed stored record properties. Application-declared stored
fields added to native containers retain independent obligations. Native API members are excluded
only when all their declarations belong to the standard library. Synthetic constructor
prototypes describe deferred instances and do not count as stored payload fields. Changing instantiable template arguments defer to selected-use policy without discarding
independent secret fields. Unchanged free arguments do not excuse closed structural growth.
Closed expanding stored payloads retain their incomplete containment obligation. Template
dependency inspection also retains a finite obligation and cannot defer containment when incomplete. These contracts require a native library declaration and do not turn arbitrary
user generic arguments, callable result signatures, or `ThisType<T>` into runtime fields.
Contextual checker types retain explicit nested return and
storage contracts even when an expression is asserted as `any`. Assignment patterns and loop
destinations share native assignment-target classification. Finite computed keys and their
constraints use a narrow checker property-key adapter. An unresolved key retains every known
qualified destination of its receiver, while a proven public key keeps its own policy. Incomplete
destination qualification retains its publication obligation without classifying an ordinary
unknown checker value as secret. Result inference treats a simple assignment destination as a
reference, while execution-policy checks still inspect its ownership requirements. After task and
target projection, a retained qualified initializer
produces EXACT3022 with no code or source map. Pure, unreferenced module definitions containing
such initializers can be removed. Exported definitions, observable creation effects, dynamic scope,
and unresolved generated references prevent that removal. Dynamic-scope checks run against the
retained AST after server projection. Direct eval normalization removes parentheses and erased
type wrappers while retaining the distinction from comma, member and optional calls. This limited removal is not general
value analysis or permission to evaluate deferred members. Client maps omit embedded authored
source when the file contains private policy or qualified initializers, since projected server code
must not reappear through `sourcesContent`. Mappings and source filenames remain available.
Generated semantic validation owns isolated programs for the last artifact in each target. Reuse
checks the virtual file set, changed virtual configuration and package metadata, and observed
filesystem inputs, including configuration, directory entries,
real paths and failed resolution probes. Changed or untracked inputs require a fresh validation
program. Authored and generated type checks remain separate.
Source-map remapping indexes rune boundaries once for repeated UTF-16 conversions. Disjoint
normalization edits share one text and offset allocation. Invalid or overlapping edits retain
the sequential recovery path, including equal-position insertion ordering.
Mutation and pending-state facts use typed source spans for internal lookups. One authored-node
index retains both first and last traversal matches for equal-span wrappers and children.
Project callable merging copies mutable call edges and direct effect lists, shares immutable
source-reference maps, and rebuilds propagated summaries and artifact targets before publication.
Requests project their own summary slice from the retained immutable graph, sharing resolved facts
and node/symbol indexes rather than rebuilding graph-wide indexes for every module.
Callable effect propagation revisits only callers whose callee summaries changed. Ascending
passes preserve recursive widening, path selection and progress-receiver boundaries. Opaque-call
effects and prior summary signatures are retained within one graph resolution. Context and state-effect convergence
compare complete capability membership so recursive helpers cannot stall compilation by repeatedly
reordering the same obligations. State comparisons preserve receiver identity, structured paths,
operation and confidence. The comparison does not reorder retained effects or discard duplicates.
Pending-helper searches use indexed work roots when available and prune disjoint authored
subtrees. Mutation type capture shares only unnamed primitive types within one checker. Named,
generic, composite and unique-symbol types retain their authored lexical construction.
For server island snapshots, `EXACT2232` rejects a demanded authored computed key whose narrowed
type still contains a symbol alternative. The diagnostic uses the same private island plan as
emission and preserves authored key provenance before wildcard path deduplication. Key types are
classified before transformation, but only a snapshot surviving final artifact printing publishes the
diagnostic. The existing printer callback witnesses the exact constructed expression after
projection has removed dormant locals. Metadata-only analysis retains conservative paths without treating an elided island
plan as a transport demand. Client placeholders and continuation-absorbed element islands do not
create snapshot diagnostics. This does not
change client-local unique-symbol type preservation or the public state-path analysis schema.
A computed key narrowed to one string literal selects that named property in the server snapshot.
The conservative wildcard used by state-path analysis is not emitted as that finite property's name.

The incremental measurement harness compiles twelve components with state aliases, ordinary
helpers and blocking server tasks. Each operation edits authored text and measures native analysis,
lowering and validation after one session warmup. The October 7, 2026 comparison uses committed
baseline and optimized sources with the same harness and ten operations per case. On one Ryzen 7
8745HS running Linux and Go 1.27.1 with two Go workers, syntax compilation means decreased by
about 29% and semantic compilation means by about 42%. Allocated bytes per operation decreased
by about 48% and 59%, respectively. These are cumulative allocations, not retained heap.
The bounded measurements, source revisions, commands, dependency identities and limitations are
in the `nativeCompilerOptimization` group of [results.json](performance-baselines/results.json).
This synthetic workload excludes SDK transport, bundlers and emitted runtime execution. One
population on one machine does not establish a whole-corpus improvement or a timing distribution.

The shipping-calculator corpus measures a fresh native session reading, synchronizing and compiling
34 modules with syntax validation. Separate incremental samples compile the project first, then
time one newline appended to the prepared geography source. Client/server structure checks run
outside these timers. Two matched populations with reversed compiler order and three samples per
measurement reduced cold project medians from 2.43–2.54 seconds to 1.41–1.48 seconds, about 42%.
Incremental medians decreased from 359–417 ms to 194–201 ms, about 46–52%. The historical cold
baseline remains 1,816.057 ms and the incremental baseline remains 371.256 ms. The timing guard
uses the larger of those two ratios. Optimized guard ratios were 0.778 and 0.816, both below 1.0,
with the warning maximum unchanged at 1.5. All 102 projected compile responses across the baseline
and optimized compiler retain identical code, diagnostics, metadata and dependencies, including
99 source maps.

Separate diagnostic profiles sampled approximately 950 MiB of cumulative cold allocations before
and 650 MiB after, about 32% less. Geography-only profiles begin after project warmup and capture
ten successive prepared-source newline edits. Median cumulative allocations per edit decreased
from about 105 MiB to 75 MiB, about 28%. Each edit still invalidates 34 sources and analyzes
17 callable sources. Ordinary-module requests now defer component analysis and placement linking
to the next component request. A separate diagnostic times the geography edit followed by
requesting all 34 modules again, including that deferred work. Its three-session medians decreased
from 1.78 seconds to 0.96 seconds. This diagnostic includes JSON transport and uses baseline-first
order, so it is separate from the counterbalanced native timing populations.
Registry identity checks still materialize the imported centroid array type and account for
roughly 56% of sampled edit allocations. Profile values are cumulative sampled allocations rather
than peak or retained heap, and cumulative stack rows overlap.

The `shippingCalculatorCompiler` group in [results.json](performance-baselines/results.json)
records committed source identities, methodology, both populations and diagnostic limits.
These timings exclude bundlers, semantic validation and runtime execution. Native corpus timings
also exclude SDK transport. One owned application on one host does not establish a whole-corpus
speed improvement or cover every authored edit.

A compiler session owns one persistent native process. Bundler integrations retain the session
for their lifecycle, invalidate its project state after file changes, report project-wide native
diagnostics, and dispose it when the build closes. Each library build shares one session across
source checking and both output targets, then disposes it on success or failure. Reusing the
authored type graph preserves separate client and server lowering and validation. Registration
analysis uses that same generation and enhancement catalog. Export validation loads all public
entries once per target in a fresh process, then checks their settled exports. Each subsequent
build gets a fresh module graph. Vite, Webpack,
and Bun share one tool-neutral
transformation kernel for JSX ownership, React compatibility selection, native compilation,
inspection controls, instrumentation, source results, and contextual failures. Vite and Webpack
register resolved type-only imports and ambient declarations with their build watchers. Native
watch queries select the requesting source’s dependency graph, excluding its own file and unrelated
modules. Bun starts a fresh program at each build boundary because it supplies no changed-file set.
Initial reads in that generation are load observations. Changed observed source bytes still
refresh dependent analyses, including files outside the transform include. Runtime loaders without
a build-start boundary retain conservative initial invalidation, and requested initial diagnostics
still run.
Resolution, HMR,
asset emission, and build-tool lifecycle behavior remain adapter-owned. Shared adapter selection
classifies `?raw` and `?url` query keys as asset representations before executable analysis.
Vite leaves their text or URL wrappers to its asset loader and does not assign test projections,
compiler observations, internationalization analysis, or authorization facts to those wrappers.
Webpack excludes the same queries from its installed compiler pre-loader and explicit loader, preserving the host’s
`asset/source` and `asset/resource` rules. Combined asset queries remain assets. Ordinary cache
queries and `exact-target` test projections remain executable. Vite evaluates source filters and
owned-helper identities against the authored filename without host query parameters. An explicit
paired test projection owns its matching executable-selection transaction before compilation.
Bun has no built-in query convention
for these imports. A host asset plugin can resolve them into a separate namespace and return text
without entering the eXact source loader. Executable importer fingerprints and stale-generation
rejection remain unchanged. Client artifact isolation still rejects server artifact disclosure.
Watch diagnostics apply the owning TypeScript project's file-checking policy, including
`skipLibCheck`, `skipDefaultLibCheck`, `checkJs`, and `noCheck`, along with TypeScript diagnostic
directives and the limited diagnostics allowed in unchecked JavaScript. Published `.exact.client` and
`.exact.server` files reset consumer program state without checking lowered cells as authored
source. The producing compilation owns their semantic validation. Dependency notifications refresh
all retained projects containing the file, including linked path spellings. Declaration edits
invalidate type-dependent analysis before unchanged consumers compile again. Vite owns development
watch diagnostics in its watcher lifecycle so HMR does not repeat the same diagnostic request.
Authored edits still diagnose
reverse-dependent consumers, and asset changes do not enter the TypeScript program. Output
transactions retain byte-identical regular files under their publication lock, avoiding redundant
watch notifications without weakening rollback for changed files. Library publication retains
identical regular files through hard links inside the verified replacement tree when supported by
the filesystem. Permission changes keep new files. The declared build-facts file remains a fresh
publication marker even when its bytes match, and unsupported links fall back to normal publication.
Whole-tree replacement and rollback remain intact. Hydration registration modules
resolve compiler-owned runtime export names dynamically because authored declarations omit private
activation exports. Island loading still validates the resolved runtime component.

Native process disposal waits for confirmed child exit, escalating an unresponsive termination
after 250 milliseconds. Asynchronous disposal is idempotent and also settles queued requests;
a replacement process starts only after its predecessor exits. Synchronous disposal waits for the
worker's exit acknowledgement and throws if that acknowledgement cannot be obtained within the
shutdown deadline. It does not terminate the owning worker while child cleanup remains pending.

Bun component tests run with `bun --conditions=browser test` so dependencies resolve their compiled
client artifacts before `@exactjs/bun-test/preload` executes. A preload can register the compiler
and DOM environment, but it cannot retroactively change export conditions for its own imports.
Bun acceptance prepares Time and Secrets exports before running enhancement and policy checks.
These declaration-backed tests require built packages even when the test source imports only types.
Time semantic tests retain the host’s native Temporal implementation when available. On older
test hosts, a test-only polyfill supplies both the emitted-artifact API and the independent oracle.

Process startup is provisional until the worker starts and the native protocol/version handshake
completes. Any startup, timeout, or negotiation failure closes the worker and its child process
before the error escapes. Both synchronous and editor request timeouts identify the request kind and source
ID when supplied, so a stalled package build can be traced to its current input without logging
source contents or extending the response deadline. Native JSX lowering receives one immutable analysis plan, prepares its
derived binding indexes once, and retains a single source traversal; lowering stages should extend
that plan instead of restoring a broad positional-argument boundary or adding extra tree walks.

Generated operation identifiers, ephemeral module analysis, helper imports, and lowered source
are compiler-session details. Applications should depend on authored TypeScript behavior and
documented executable runtime contracts rather than generated representation.

### Helper state effects

Callable analysis retains receiver bindings before project imports are linked. A parameter effect
is relative either to the parameter value (`receiver.root: 'value'`) or its `state` member (the
existing omitted-root form). Each call site's argument path maps those effects into its caller.
Ordinary object effects do not become component state authority without a proven receiver.
Argument analysis identifies a possible component or parameter receiver before requesting its type.
A fresh literal or an unrelated local identifier cannot supply that receiver. The compiler avoids
contextually typing those whole arguments solely to establish a binding that is already unknown.
Owned arguments still receive type checks so scalar values cannot grant object mutation authority.
Unknown member-access paths retain their existing analysis metadata.

Receiver paths participate in the incremental analysis fingerprint. Strongly connected callable
groups identify recursive edges before effect propagation. A recursive call into a nested receiver
retains its argument prefix and widens the suffix to an unknown wildcard, preventing branching
recursion from enumerating exponentially many paths. Whole-receiver recursion and acyclic helper
calls retain precise effects. The 32-segment depth bound remains a fallback. Unknown recursive
writes cannot grant finite remote write authority. Literal property boundaries remain distinct
during analysis. Repeated primitive-input calls reuse the resolved callable effect graph rather
than acquire an opaque effect solely from revisiting an active declaration. Object, unknown,
projected and captured nonprimitive inputs still widen recursive value demands. This supplies
neither a return value nor purity or performed-execution authority.

### Portable build analysis

Project-wide callable facts retain their source-file ownership. Artifact pruning and call-effect
lookup may use source offsets only after selecting the owning file. An unrelated module initializer
included by `tsconfig.json` cannot remove another module's exports or change its component placement.
Real imported call edges still propagate their environment requirements across files.

Callback acquisition for callable effects retains explicit function-task execution ownership.
Caller arguments and receiver access are evaluated by the caller, while callbacks executed
inside a child belong to that child's effect graph. Source-value and producer proofs retain
their ordinary traversal because a task boundary does not establish a return value or purity.
Checking-only relocated modules use relative specifiers even when the source directory starts
with a dot, preserving the original module's namespace and nominal types.

Ordinary runtime values retain their local declaration ownership through aliases, default exports
and destructuring. Target pruning removes opposite-runtime exports and their local initialization
without dropping target-neutral siblings or treating a foreign re-export as a same-named local.
Loaded source re-exports preserve the originating declaration and its environment requirements.
Definition availability follows the module bindings captured by functions, methods and classes.
Declaring a function, evaluating an arrow or creating a class does not execute its body, default
parameters or instance fields. Their execution effects remain part of call and construction analysis.
Static fields, computed member keys and eager calls still execute during module initialization.
Captured opposite-runtime initializers remain unavailable, while dormant helpers retain the
definitions needed by retained class methods and component callbacks.
Value dependencies propagate creation requirements. Each placement query inspects a reachable
symbol once per creation or execution mode, so shared dependencies do not multiply work and
cyclic dependencies retain all reachable environment requirements.
Supplied-target helper proofs cache the callable and formal receiver together. Shared return paths
reuse that proof, while recursive returns and receiver substitution remain opaque.
Existing `typeof` guards keep portable fallbacks available in both targets. An unavailable branch
that exits with `return` or `throw` also guards later reads in that block. Partial exits, later
checks and checks of another global do not establish availability.
Getter and setter bodies retain their own execution ownership. Creating their object does not
execute them. Reads, writes, updates and value enumeration carry the appropriate accessor effects,
including structural annotations, source factory returns, nested projections and helper arguments.
Computed member names still execute while the owner is created. Provenance searches retain
structural safeguards, including 128 nested value or origin steps. Estimated work is advisory
and accumulates across nested callable and projection demands. Structural refusal retains known
effects and explicit incomplete provenance, including through purity filtering. Reflective descriptor installation and arbitrary
external value production require independent execution contracts.
Standard URI encoding and decoding functions, `isFinite()` and `isNaN()` retain portable ownership
from their bundled library declarations. Local or imported shadows keep their authored effects.
Standard typed-array, `ArrayBuffer` and `DataView` methods retain portable execution ownership
through their selected bundled declarations. The same rule applies to their standard constructors.
Local classes, method overrides and application-added methods do not gain authority from familiar
names. Unrelated interface augmentation does not remove authority from selected standard methods.
Standard `Array.from()` and typed-array `from()` calls carry the mapper callback's execution
requirements. Callable input values and `thisArg` values remain data rather than invoked callbacks.
Execution placement does not imply that mutation is safe inside a reactive derived calculation.
Optional native receiver calls retain the selected method's declaration after excluding nullish
receiver alternatives. Authored union members do not acquire native authority, and invoked callback
effects remain independent.
Standard-library `Event` and `EventTarget` methods remain portable across supported runtimes,
including aliases and mapped type views such as `Readonly<EventTarget>`. Method declaration
ownership preserves this placement without making DOM-specific methods portable.
DOM exports retain browser-only execution through renamed imports, namespace selection and
immutable aliases. Placement follows the resolved export declaration, including the implementation
behind a public re-export. Ordinary authored functions with the same name retain their own effects.
Framework `ReactiveValue` methods also retain portable declaration ownership through aliases,
readonly views and finite member keys. Computation factories retain their producer's execution
requirements, including imported producers. Reading a framework value does not erase browser-only
work in `this.reactive()`, `computed()` or `createDerived()`. Function-typed producer inputs
without an execution proof retain unknown placement. Native higher-order methods follow their
callback slots. Callable `thisArg` values and reduction seeds remain data, while both Promise
`then()` handlers retain their execution effects. Named function inputs and stable finite object
member callbacks preserve computation identity rather than becoming function-valued data.
Direct server artifacts link reactive, ref and extracted lifecycle operations through focused
request-local helpers in both synchronous and compiler-scheduled setup.
DOM subclasses and application-defined types retain their own placement requirements. Native
component re-exports retain their separately projected implementations instead of inheriting the
environment of a nested event handler. Opposite-runtime local helpers and executing module
statements follow their input dependencies, preventing references to removed initializers.
Guarded module branches retain their portable fallbacks. Static CommonJS loaders follow their requested module
placement, preserving portable package replacements while keeping Node built-ins server-owned. Compiler path indexes retain property segments rather than joining them into ambiguous
display labels. Island snapshots and task-local reads therefore distinguish a literal `"a.b"` key
from the nested `a.b` path without changing emitted artifact signatures.

Import consumers use lexical symbol identity. Local callbacks or receivers that shadow a renderer,
`unsafeHtml`, or `require` retain their ordinary behavior. Module replacements accept literal
template requests and string export names, preserving optional calls and member access. A computed
destructuring key is never matched by the local variable's name. Type-only aliases of classes and other runtime values do not publish runtime
exports or symbol records. Type declarations and `export type` references retain their erased status
in the semantic graph. Binding proofs are captured before lowering reparents expressions and
shared by runtime import selection, so required capability implementations follow their original
imports. JSX member tags such as `<core.Fragment>` resolve as values even when
the namespace begins with a lowercase letter. Plain lowercase tags remain intrinsic hosts.

Project synchronization installs empty sources and publishes a reusable generation even for a
single source. Generated-code checking uses an isolated program with the synchronized dependency
overlays, including files which do not exist on disk. Ordinary unselected synchronization updates
or adds those authoritative overlays. Omitting a source from a later batch, even after deleting its
physical file, does not discard its installed overlay. Explicit session reset clears that retained
source authority before a new source set is synchronized. Selected executable snapshots retain their
separate complete-replacement policy. A dependency type change is checked against
that generation without replacing the retained authored program with generated code. Generated
contents occupy the original canonical module identity in that isolated program, so circular
type imports retain module-local unique-symbol and other nominal identities. The generated entry
is parsed as TypeScript after JSX lowering during initial construction and retained updates.
Authored dependency overlays do not overwrite it. Entry diagnostics retain a synthetic reporting
name for source-map projection, while imported diagnostics keep their own source locations.
Retained normalization identity includes the prepared package-enhancement suffix, while authored
offsets remain separate for diagnostics and source maps. Synchronization and per-module requests
therefore agree on unchanged source identity. Imported normalized computations retain compiler-owned
task origins and placement after their defining module is compiled. Authored and suffix edits still
invalidate dependent facts.
The native corpus runner uses UTF-16 code-unit boundaries for prepared suffixes, matching the
compiler protocol. Non-ASCII authored text must not move that boundary into a virtual import.

Dependency discovery includes static declarations, re-exports, and string-literal or
no-substitution-template `import()` calls. Deferred imports retain their own facet rather than
becoming eager side-effect imports. Deferred optional-provider imports do not contribute eager
renderer registration facts. Artifact expansion and alias rewriting use these same native
facts, so relocated paired outputs include and resolve their lazy JSX dependencies. Computed
module names are not treated as statically enumerable edges.

Although the complete module analysis is owned by a compiler session, a stable build-facing subset
crosses the compiler/bundler boundary. `ExactModuleAnalysis.packageName` carries the package identity
provided by the build integration. Its `components` and `partitionPlan` entries carry canonical
component ownership, placement, environment effects, and concrete client/server artifact
reachability. Finite enhancement spreads publish the same canonical activation facts as direct
attributes, with each source key and component identity recorded once across union alternatives.
`rendererEnhancements` carries canonical enhancement identity plus the module
specifier and export needed to construct a bundle-local enhancement catalog.
Package-scoped config bindings are appended as host-owned virtual imports after authored source;
the protocol boundary preserves authored offsets, duplicate-identifier ownership, and demand-driven
catalog filtering without teaching the native compiler how to execute project configuration.
Finite enhancement props documented with the value-free `@exact analyzer-only` directive remain typed language-projection
facts but do not select renderer enhancements, create activation records, or enter emitted JSX.
The producer and consumer use the same directive grammar. Similar names, directive namespaces and
value-bearing markers do not establish analyzer-only fields.
Every present branch of a spread union must satisfy the declared metadata type. Absent metadata
branches do not create runtime composition. Their package-specific interpretation stays outside the compiler.
Ordinary imports cannot establish enhancement prefixes in direct attributes or finite spread keys,
even in modules without attributed enhancement imports. Ordinary open DOM bags retain their own
contract outside enhancement-enabled modules.
Binding analysis recognizes those declared fields as enhancement-owned syntax, while retaining the
usual ambiguity diagnostic when the same namespaced attribute is also a valid component or form
binding.

This is the sole compiler-provided seam for component-library authorization. It is deliberately
descriptive rather than authoritative: the compiler does not read the component-library marker,
trust configuration, lockfile, aliases, or resolved physical package graph. A server bundler must
join these facts to its own resolved graph and enforce one policy before evaluating admitted server
modules. Client-only component code remains distinguishable through placement and artifact targets
without adding a compiler-side trust decision.

## Repository-only compiler corpus

[`../fixtures/native-compiler-corpus`](../fixtures/native-compiler-corpus) retains focused
TypeScript and TSX semantic stress cases alongside representative framework applications. The
release check sends those sources directly through `exactc`; there is no executable
JavaScript expression engine or alternate semantic backend. Its tracked wall-time guard normalizes
the baseline for both the discovered source count and the available native worker count, so CI and
local runs remain comparable without oversubscribing smaller machines.

The small public `@exactjs/module-rewrite` package owns module-reference rewriting still needed by
React compatibility tooling. It applies the same lexical loader identity, string export names,
computed binding-key identity and optional call/member preservation rules. Its TypeScript transform
is checked independently of the native compiler.

## Change verification

Compiler and bundler-assembly changes trigger a dedicated acceptance workflow. It builds and runs:

- Sudoku for native client state and interaction;
- the client-only docs application for compiled components, routing, and code blocks; and
- Shipping Calculator for generated client/server continuations and `__exact` endpoint traffic.

The native package matrix separately builds, installs, and executes each supported platform
package. Publish checks inspect the compiler dependency graph and tarball so retired compiler
packages cannot re-enter generated applications unnoticed.

## Guarded DOM updates

Generated JSX prop and conditional-class dictionaries use own data properties, including keys
named `__proto__`. Authored object literals retain their native prototype-setter semantics.
Event argument omission requires an inspectable handler body and an unchanged named binding. A
declaration signature alone cannot prove that the runtime implementation ignores an event. Source
reassignment invalidates that proof, including writes before a hoisted function declaration.

Synchronous input relationships use finalized prop-slot invalidation only for a complete top-level
read. Nested reads retain field observation. Optional reads observe their complete selected value
when lowered as synchronous computations, while distributed task captures retain their receiver
semantics. Helper capability forwarding includes component owners passed through ordinary calls,
`call()` arguments, and statically selected `apply()` argument tuples. Aliased arrays and
spread tuples retain a conservative capability surface because their runtime positions can vary.
String form option expressions retain literal and union types in radio comparisons and checkbox
membership checks. Numeric and nullable options retain their required conversion.

Every region binder is finalized against the complete component dependency and dirty-mask contract.
An early state-only region must still subscribe to props when a later enclosing region reads them;
early regions also use the wide binder when later operations exceed two mask words.
Component update programs visit enclosing regions before their descendants. JSX regions are
registered after their children are lowered, so generated updates traverse those target identities
in reverse registration order. DOM subscriptions for these programs run in the structural phase,
before ordinary leaf bindings. Removing a region also clears its entry from any active update
snapshot, so a later operation in that update cannot read a value whose guard has become false.
Discriminators that read nested object or array properties retain tracked subscriptions: changing
`incident.comments` must update an empty-list branch even when the incident object itself is retained.
This preserves ordinary guarded property access when an optional selected resource disappears.
The regression fixture exercises removal and restoration through forwarded props and local state.
This corrects update ownership without changing emitted helper signatures or the ABI epoch.

### Component view helper inputs

A returned view can call a JSX helper with scalar arguments or live objects. Direct prop and state
reads used as arguments are snapshots, so the compiler gives that call a focused reactive range.
When an argument changes, the range reevaluates the helper and patches its retained render program;
the component instance, local state, and compatible DOM nodes remain owned by the same instance.
Passing a live props or state object instead lets the helper's field readers subscribe directly.
Unrelated state does not invalidate the helper. Both client and paired hydration projections use
this range contract; neither relies on component-wide render invalidation for helper snapshots.
This uses existing child-range and program-patching helpers without changing the component ABI.

### Type checking and source diagnostics

Task capture checking retains the selected input's union, nullable, readonly, and callable
constraints. Declared readonly types keep TypeScript's shallow property checks and ordinary
assignability rules. An inferred alias retains readonly properties, while assignment to a mutable
object type or passing that object to a mutable helper parameter remains permitted by type checking.
Runtime guards on a selected prop or reactive view are a separate contract. Captured callbacks keep
their argument types and supply contextual types to nested callbacks. These checks use the source-owned projection so executable artifacts do not need
annotations tied to the authored module's location.
Semantic task checking applies even when a task does not write state. Portable executable
capture annotations retain callback context, including type parameters declared by the callable.
Nested callbacks carry source-inferred parameter types even when an executable capture needs
type erasure. Module-generic callback results retain assignment types in client tasks and server
executors. Assertions and `satisfies` retain native checking at those boundaries. Unique-symbol
task results preserve distinct type identities through imported, private and shadowed declarations. Recursive callable contexts retain inference without unbounded annotation expansion.

The checking projection preserves contextual callback types in ordinary JSX helpers and
materialized attribute readers, explicit annotations on derived values, and authored union or optional-value narrowing across generated
read closures. A proof comes from the source checker: an unguarded optional read or invalid union
member remains an error. A value assertion must not replace a terminal optional read that supplies
an authored control-flow guard. Its receiver relationship stays in native syntax, while receiver
prefixes and selected derived getter reads retain their own value proofs. Optional access can
widen a property result, so assignability to the declared value type is checked separately from
guard ownership. Narrowing assertions never replace a `delete` operand, including
parenthesized property targets. State mutation lowering has the type-checking limitations described
below. Awaited expressions inside object or array assignments settle before the
compiler enters a synchronous task mutation, retaining cancellation checks before publication.
Keyed helper lists keep the same keyed identity contract in the executable targets.
Destructuring assignments to state also preserve the destination type in generated writers and
setters. Their type probes are never invoked, so typing does not evaluate getters or computed
assignment targets. Native destructuring still owns selection order and iterator closing.
JSX ancestry alone cannot classify a data map as a rendered list. Call receivers, arguments,
and property reads retain their authored array computations. Key inspection accepts inline arrow
and function-expression callbacks. Callback references such as `items.map(copyItem)` retain normal
call analysis and must not be accessed as function-syntax nodes. An explicitly keyed JSX projection
that feeds an array consumer preserves both its array result type and item ownership. Conditions
and direct child arrays retain their corresponding structural ownership. Rendered array literals,
spreads, and array type assertions retain inferred keys with array-valued lowering. Their
callback-local calculations follow the same item inputs as directly rendered keyed maps.
Destructured derived locals share one native pattern evaluation, with selected values owned as
reactive cells. Aliases, nested patterns, defaults, and rest retain native selection semantics.
Defaults participate in dependency and safety analysis. Island capture reconstructs each selected
pattern group once, including state read by defaults. Explicit snapshot initializers retain snapshot
behavior. Snapshot identity follows the imported core operation through immutable aliases and
namespace access. Reads inside its callback remain untracked. A calculation that mixes those reads
with live inputs retains its own computation boundary, including when a helper contains the snapshot.
Static helper aliases retain captured instance state and props dependencies without rewriting the helper.
Invoked literal-indexed members retain the same receiver input as dot access, including fresh native
Map/Set iterators and supported scalar conversions. Native Boolean conversion is proven from its
primitive receiver and standard inherited signature, while boxed and authored conversion hooks
remain subject to ordinary helper safety analysis.
Setup snapshot diagnostics identify native timers, Promise continuations and observer constructors
by declaration ownership. Immutable scheduling aliases, literal-indexed Promise members and
source-owned callback aliases preserve that boundary. Synchronous authored methods with the same
names do not acquire native scheduling semantics.
Keyed callback parameters also supply live inputs to their local derived calculations.
Shared collection snapshots retain their element types when another derived calculation consumes
them. Upstream array key registration is limited to native operations that preserve elements and
the selector's accepted type. Factory receivers and transforming projections cannot stand in for
the result collection. The result owns key registration when no safe upstream source is established.

Semantic diagnostics from generated code use the emitter's source map and normalization mapping
to report authored filenames and spans. Failures in unmapped generated code retain their generated
filename for investigation; imported-file diagnostics retain their own source location.

Diagnostic spans and edits cross the native process boundary in UTF-16 coordinates, after
normalization and generated-source mapping. Internal analysis spans retain native byte offsets
and are converted by the language-tools projection.

Source maps and authored locations follow JavaScript line boundaries, including LF, CRLF, CR,
and Unicode line and paragraph separators. Astral characters occupy two UTF-16 units at the
JavaScript-facing boundary. Capability and secret-consumer location records use one-based lines
and Unicode scalar columns, consistently with authored normalization.

Framework diagnostics retain their diagnostic code, primary source span, and available causal
locations through the native protocol and editor projection. A reevaluation failure can identify
an operation in an imported helper rather than attributing the whole failure to its caller.
Build errors include those related filenames and locations. Placement diagnostics include the
known effect paths and distinguish unresolved operations from incompatible browser/server work.
Diagnostic guidance must preserve the rejected contract. In particular, purity assertions do
not authorize placement or release secret data, and wrapping an effect in a reactive calculation
does not remove that effect.

Derived-value inference recognizes `Array.from()` consuming a fresh native Map or Set
`values()`, `keys()`, or `entries()` iterator, including readonly collection types. The selected
standard-library declaration establishes the iterator operation. Callback effects are still checked.
An existing iterator or an application-defined `values()` method does not receive that proof:
consuming an existing iterator can advance shared state, and a custom method may perform effects.

### Project file selection

`exactc --check --project tsconfig.json` selects roots using TypeScript's `files`, `include`,
`exclude`, and `extends` rules. `exactc --check` uses `tsconfig.json` in the current directory.
Included files are checked even when no application entry imports them, including test fixtures.
Imported dependencies still participate in TypeScript resolution; `exclude` is not an import firewall.
This checks one project, not a recursive solution build of project references.

Explicit inputs, such as `exactc --check --project tsconfig.json scripts`, override root selection
while retaining the project's compiler options. Directory inputs include supported source modules
outside the configuration's include list. Invalid configuration and checking errors exit nonzero.

Native extension analysis receives the authored source tree and authored coordinates. Compiler
normalization of destructured props, component returns, and setup computations happens in the
compilation path, so extension-produced edits remain applicable to the source submitted by the host.
Standalone localization analysis supplies native ESNext and DOM declarations when no project
configuration is provided. Ordinary compilation retains its default library selection, and an
explicit project configuration controls both paths. Session cache identities include this analysis
profile so inspecting a Temporal expression cannot change a later application's type checking.

### Executable selection during analysis

An authored import can acquire its TypeScript signature from a different file than the module
selected by a build host. Body-based analysis must distinguish those owners. The internal
`synchronize` request accepts a complete, source-backed `executableSelection` snapshot before
planning. Its generation and revision cover the host target, resolver conditions and configuration.
Each module pairs a host identity with one physical prepared source and its content digest.
Each edge identifies the original import or export syntax slot, specifier and import/require kind.
Host discovery uses the optional internal `executable-slots` request. Its version-two capability
is advertised as `executableSlotsVersion` during the native handshake. The request parses the
exact supplied source with the native parser and returns syntax slots and syntax diagnostics.
It creates no Program or checker, resolves no modules and performs no effect or policy analysis.
It does not install executable authority or change retained semantic state. Older binaries may
continue serving existing requests, but hosts reject this operation without the capability.
The ordinary `analyze` request retains its complete analysis and diagnostic behavior.
The syntax response also includes an exact-source helper-discovery result. Only a complete
negative for the shared helper planner's necessary callsite form permits the host to omit that
helper search. The fact is bound to the supplied source digest and rechecked against current
prepared source. Direct calls in nested bodies, aliases and unresolved callees require the
ordinary semantic helper analysis. This negative is not module purity, effect coverage or
permission to omit later analysis, imports, preparation or snapshot installation.
Repeated imports remain separate slots even when TypeScript resolves them to one declaration.
Build hosts may select a bare-package runtime import only when their actual resolver returns an
explicitly nominated executable file. Its reexport dependencies require the same source ownership.
External, missing, virtual and preparation-vetoed selections remain opaque. Nomination does not
change package conditions or supply factory purity. Standalone sessions without a resolver-backed
snapshot do not acquire runtime bodies from package declarations.
Native span indexes also retain physical source identity, so equal offsets in another root cannot
establish local execution.

The native session follows those slots before flattening aliases, including selected re-exports.
For finite bindings resolved by this owner, selected callable bodies feed the existing local
collectors and callable fixed point before task, policy and continuation construction. Export availability and module pruning share a separate
mode-aware environment traversal through the same selection owner. It distinguishes making a
callable or class from invoking it, including constructor and instance initialization work.
Accessor argument substitution and returned-object provenance consult that owner too. A checker
property declaration cannot reintroduce an accessor from a different executable factory.
A returned closure retains its selected factory body, acquired inputs and creating context
through array, object and lexical-binding destinations. Executable-selection routing belongs
to the original Call being dispatched. A selected factory in a later callee's value history
cannot suppress invocation of that acquired closure. Known runtime-body effects and independent
uncertainty remain additive. The source signature continues to own TypeScript checking.
`TestClosureProjectedSelectedInvocation` and `TestExecutableClosureSelectionComposition`
protect both body-selection directions, with paired emitted array consumers.
Eager export availability also consumes the existing explicit member, spread, own-value enumeration
and argument-accessor analysis. Constructing a getter owner or a deferred callable does not
execute the getter. Destructured bindings retain the binding operation, and omitted argument
defaults participate in the bounded invocation search.
TypeScript signatures and assignability retain authored resolution. An explicit opaque edge, a missing body, or an unprovided slot inside the
snapshot closure cannot acquire typed-body authority. Outside that closure, sessions retain
legacy checker and module-stem inference, which supplies no exact host-selection proof.
A selected symbol must have one executable declaration. Bodyless overload signatures do not
compete with an implementation. Source-backed CommonJS selection currently proves only a single
direct object export of shorthand bindings in an inert module containing only function declarations
and that assignment. Function references must resolve within the same source. Additional top-level
execution, including unrelated calls, imported helpers and read-only loader-cache access, makes
selection opaque. This positive bound deliberately sacrifices precision for otherwise valid CJS.
It does not interpret arbitrary CJS initialization or prove safety against external interference.
Unproven export shapes retain uncertainty, without exact
write authority or a new unsupported-source diagnostic. Local binding stability alone cannot
prove export-slot stability. Private rewrite proof remains separate.

Snapshots contain no persisted AST pointers, symbol IDs or duplicate effect summaries. A replacement
generation reparses configuration, drops obsolete execution roots and invalidates derived analyses
and validation caches. Content changes invalidate selected facts. A stale source cannot use its
old selection. Lower generations and synchronization without a replacement snapshot are rejected in selected
sessions. Reset and session disposal release selection. Hosts must serialize or fence asynchronous preparation with
these generation numbers. Module indexing scans the prepared closure once per analysis generation,
and existing synchronization batches source loading rather than creating a checker per edge.

Execution roots also belong to a different diagnostic universe. Synchronized semantic analysis
uses the existing target-neutral checking projection and isolated generated validation for
TypeScript, cached per retained program and request. JavaScript analysis checks an isolated
authored source with its original script kind, `checkJs` policy and checking pragmas. It does not
promote unchecked JavaScript to generated TypeScript. Watch diagnostics check authored project
roots in an isolated validation program. These boundaries preserve the tested ambient-name and
assignment diagnostics when runtime roots are added. Broader JSDoc and framework contextual-typing
combinations still require validation. Readonly remains shallow TypeScript assignability, including
writable aliases and mutable nested values.

Successful synchronization acknowledges the selected generation, revision and target. The native
process facade requires a matching acknowledgement whenever a snapshot is supplied, so an older
same-protocol binary that ignores the field fails closed. Requests without a snapshot retain
the existing protocol contract. This optional internal acknowledgement does not classify emitted
artifact ABI compatibility or authorize adapter adoption.

This internal path is limited to analysis. Explicit-selection sessions guard executable compilation
until private lowering and artifact retention share the same owner. Build adapters do not yet
supply these snapshots. Host resolution parity, ordinary/private module identity and helper
publication remain separate acceptance work. General member and higher-order flow, derived-value
reevaluation proof, registry loading and broader source-value provenance are still investigation
frontiers. The source-value owner now caches declaration-relative return and execution demands
against one checker generation. Finite creation edges substitute flattened source origins and
projections, without constructing dynamic invocation environments. Explicit and implicit accessor
reads, ordinary returned functions, callable effects and eager export availability consume those
same demands. An uninstantiated callable retains its free capture demands until a creating edge
supplies their source values.

The bounded source relation distinguishes parameter entry values from live binding assignments.
Local `const`, `let` and `var` aliases retain the source value read at initialization. Relevant
same-owner assignments and direct lexical calls before initialization contribute to that value.
An own binding read in a callable uses its body occurrence when the creating call is outside
that lexical order. A proved unconditional replacement before the read supersedes the entry
value. Local object-binding elements use that same current-write cut when a captured
initializer slot is unavailable. An unresolved entry remains an input demand alongside
possible writes. Binding-time Gets name their original binding element and source slot for
source effect coverage. That coverage neither supplies a normal own-slot receipt nor
reconstructs an unavailable initial capture from its type. A callable invoked after its
creator returns observes the live binding after that
creating activation completes. This includes unconditional assignments within the selected return
expression and enclosing `finally` blocks. Selecting the returned callable does not snapshot its
captures. A definitely abrupt `finally` supersedes the earlier returned value, while the earlier
return expression still executes. A call made inside the creator uses that invocation's earlier
boundary. Each finite creating edge scopes its own inputs and return occurrence. Acquiring a returned
callable through an object or array projection carries that occurrence's creating inputs and
completion boundary to the existing invocation consumer. This traversal-local handoff shares
the source query and keeps each acquired alternative separate. Acquisitions
for earlier aliases keep their earlier boundary and source object. This changes bound-value
provenance without removing parameter or local pattern evaluation effects. Unproved conditional
replacements still join alternatives and cannot establish certain replacement. Completion proofs
use bounded lexical reachability for the selected expression and its required finalizers.
That shared relation excludes proved bypassed logical right operands, conditional arms and
optional-chain continuations from possible writes. Tests, left operands and optional receivers
retain their own evaluation. Finite primitive conditions are acquired through the existing
source-value owner at the condition occurrence, rather than at the later capture observation.
Disagreeing or opaque alternatives cannot establish certain execution or replacement. Optional
continuations consult the actual optional roots, without assuming a custom method's behavior.
This finite relation does not establish general branch inference or complete effectful condition
acquisition. Completion proofs do not model general exception flow, async completion, conditional production through formal
values, or writes through opaque helpers. Destructuring-assignment binding effects and exception
suppression by an abrupt `finally` also remain analysis and emission frontiers.
Later parameter replacement does not replace an earlier alias, while later writes to the alias's
own binding remain visible. Unrelated calls and local writes do not change its input origin.
Direct sibling replacement calls are joined only with the matching source creation site.
Interference follows the demanded receiver through source arguments. Local rebinding and writes
to separate finite object origins do not imply mutation of that receiver. Unproven transitive or
opaque writers retain uncertainty. Indexed member assignments weakly
join alternatives sharing an origin, including writes through source aliases. Separate named
creation sites retain their precision. Demanded array-literal elements use the same source relation,
including finite indexed assignments through aliases and nested array/object projections. Sparse
holes keep their native positions, and named keys do not select numeric elements. Dynamic indices
and spread-dependent positions retain incomplete provenance while preserving known candidates.
Receiver calls and arguments share the receiver-relative interference relation. Calls after a
same-owner acquisition or read, disjoint projected receivers, and source bodies without relevant
writes do not revoke its provenance. Native mutation checks use existing declaration-owned write
facts, rather than a method name or an inferred append position. Every possible callable value
participates in completeness. An authored body does not discharge a native or unresolved alternative.
Read-only native alternatives retain their existing nonwriter treatment. Relevant source writes
retain known effects and incomplete provenance unless the ordered value relation proves replacement.
A write's presence in the member index alone cannot establish the post-call value. This includes
captured writes to an acquired object whose former container receives the method call.
Method-produced elements remain incomplete when the relation cannot resolve their source. This analysis adds no array wrapper or
runtime observation. Unresolved array-producing calls and constructors also retain uncertainty.
A structural array type can revoke completeness but supplies no native identity proof.
Projected aliases acquire finite source values at initialization. Later replacement of the
container slot does not retarget that value, while writes to the acquired object's own members
remain shared through aliases. Direct preceding replacements of ordinary own data slots in the
same statement list can supersede their initializer. The same proof applies to a factory data-slot
write preceding every returned value in that statement list. Direct standard data-member overrides
on array literals participate in acquisition ordering, without establishing native callee identity.
Conditional, computed, other cross-callable and opaque writes remain may alternatives or incomplete. This ordering proof does not extend to
accessor setters or reflective descriptor changes. Repeated-site and recursive queries widen to
incomplete provenance. Opaque writers and unproven transitive interference also retain uncertainty.
This is an analysis slice, not complete JavaScript closure or heap analysis. Computed and reflective
writers, escaped sibling methods, exception-sensitive alias timing, arbitrary returned-callable
arguments and cross-module mutable alias interference still need independent verification.
Finite array, object and nested projections of ordinary returned functions now compose the actual
call's arguments and creating captures through the same source query. Omitted and explicitly
undefined defaults, finite rest-element reads, ordinary member-call receivers and lexical arrow
receivers participate in that substitution. Rest arguments retain their separate source alternatives.
An unresolved native argument vector is distinct from a proven empty vector and cannot select a
default as though an argument were omitted. TypeScript's explicit `this` parameter consumes no
runtime argument. Rest-array forwarding, spread-dependent argument positions and unresolved
receiver or callee alternatives remain incomplete. A source candidate contributes possible effects,
not exact selection, and ordinary native methods retain their existing invocation contracts.
Callable property acquisition separates the effects of a property operation from the values
it may acquire. Calling a source method retains each known body's environment requirements,
receiver and arguments beside unresolved callable alternatives. Reading or assigning the property
does not execute that body, and calling the containing function does not execute its properties.
An incomplete acquired value cannot restore an old implementation through a checker signature.
Outside a supported built-in contract, a standard-library declaration on a receiver's type does
not account for an authored replacement callable. When an executed source assignment can select a callable whose implementation is
unavailable, eager module execution remains unknown and receives `EXACT2101`. Storing that
callable without invoking it does not execute its body. Known source alternatives still contribute
their own requirements alongside the unresolved alternative.

Inference uses the supported built-in contracts described by the target's standard libraries,
including conforming polyfills. It does not validate a polyfill's implementation or require a
published library and its consumer to use the same constructor implementation. An authored shadow
constructor does not acquire a built-in contract merely from its name. Host-specific globals such
as `document` retain their target requirements. Source transformations that depend on a particular
acquired reference or descriptor retain their own mutation and evaluation-order checks.

A direct standard `new Promise` with a literal synchronous executor supplies its first two runtime
parameters with the resolve and reject callable contracts. Their source identity survives aliases,
ordinary wrappers and mutable bindings alongside the binding's initial and other assigned values.
An arbitrary function with a compatible `() => void` type receives no such inference. The executor's
own statements retain their ordinary effects. Settlement changes Promise state and supplies no
reevaluation-safety or purity guarantee.

Calling resolve with no argument or a primitive adds no thenable work. An object can execute a
`then` getter and a callable `then` body, whose known host requirements remain visible alongside
unresolved alternatives. Ordinary async returns also perform this settlement Get. The compiler
retains the selected getter's actual receiver, captures and zero-argument defaults separately from
its returned value. It follows selected eager dependency operations for relevant authored
prototype changes. Deferred installers contribute only through an admitted invocation. Explicit
prototype escapes through shorthand properties, object spreads and nested containers passed to
foreign code retain uncertainty. Missing
inputs, callable thenables and unaccounted construction retain uncertainty. These effect facts
do not certify the fulfilled object's fields or lifetime. Reject does not assimilate its argument. Argument evaluation still runs
for both functions. Direct calls, `call` and `apply` share the ordinary invocation plan, including
`apply`'s length and indexed Gets even when a formal is unused. Authored replacement methods keep
their raw arguments.

Ordinary invocation analysis shares source acquisition and input binding across direct calls,
`call`, `apply`, `bind`, immutable aliases and finite returned or projected callables. Known source
bodies retain their environment, receiver, arguments and creating scopes independently of extra
Get effects and unresolved alternatives. Declaration-owned adapter routing is an ordinary invocation
relation, not selected native identity, purity or proof that a call performed. A modeled own method
uses its actual receiver and raw arguments instead of inheriting the base function's body. Mutable
bindings retain uncertainty alongside any reached replacement body's requirements. Constructing a
bound function acquires its method, receiver and prefix without executing the target body. Later
invocation retains those original capture sites. Unproved capture completion remains unknown.

Definition requirements belong to the compilation-owned source and existing supported package
contracts. A published component does not need to prove arbitrary future consumer implementations
or mutation history. Actual callers add their receiver, key, argument, Get and invocation effects.
Opaque external callables do not gain portability from a compatible type. Selected executable
snapshots and component-library metadata keep their existing authority and limits.

Member acquisition and interference inspect only the defining source and the query's actual
acquisition, receiving and return sources. Existing indexes and structural guards bound this view.
It does not expand import/reexport implementation trees. An unresolved intermediate module edge
retains uncertainty beside the known definition. Cross-file source positions never establish
ordering. Relevant owned assignments, literal containers passed to actual calls and reflective
operations retain their effects. A callable-compatible constructor result cannot borrow Function
method declarations to discharge its Get or trap effects. Unmodeled wrappers remain opaque.
A known server body plus a browser getter remains mixed. Import provenance or an unavailable
whole-prefix certificate alone does not erase the body's ordinary invocation requirements.

A separate eager same-source certificate still limits call and writer-region participation for
own-data acquisition and can refine a completed property operation's effect facts. It can license stronger acquisition conclusions and is not supplied by the
ordinary invocation relation. Its runtime-import, unsupported-effect and exhaustion refusals
remain conservative. The deferred private/export-history certificate is not part of ordinary
inference. Known source methods use their actual receiver and raw arguments, while an invoked
bodyless authored ambient signature remains an opaque call. Reevaluation safety from `@exact pure`
does not supply that missing implementation or prove a neutral environment. Unknown compiler
computations may still execute target-locally, without portable artifact availability or a remote
continuation grant. A target-local client artifact can retain its component identity while its
placement metadata remains unknown.

A separate numeric-conversion proof can follow a direct named import whose source module performs
only finite literal initialization without further runtime imports. It retains the actual receiver,
zero-input own `valueOf` activation, primitive normal return and completed ordinary global binding
assignment through the caller's preserved startup prefix. The module selected by the actual import
specifier must own the audited declaration. Re-exports, stars, cycles and other unaudited module
initialization cannot borrow the final declaration's certificate. An earlier activation of a body
on the target acquisition path must have complete-prefix proof. The current numeric slice refuses
that overlap rather than reuse the target activation's stop point. The later binding read can then observe
the assigned source callable. Unary plus does not call global `Number`. Effective
`@@toPrimitive`, accessors, custom prototypes, object-return fallback, unknown startup work,
relevant descriptor changes, unsupported execution and structural refusal withhold this proof.
Earlier acquired callees retain their original value. The ordinary native-conversion fence stays
in place for unproved routes. This query-local proof adds no runtime object model or global cache.

Capturing a callable retains its acquired reference. Later property reads still observe that
callable's current properties. Exporting a definition or retaining it in a source container does
not by itself execute an unknown future consumer. Actual escaped or replaced values remain
separate uncertainty, and ordinary inference grants no purity or performed-write certificate.

Callee acquisition precedes argument evaluation. Computed keys and receiver prefixes precede the
property operation, and an assignment evaluates its RHS before Set. Computed method and accessor
names execute in their enclosing region, while their bodies and parameter defaults remain deferred
until invocation. Reached source-call regions are considered conservatively, including possible
defaults. Descriptor changes in those regions remain relevant even if a later property read has a
known callable candidate. Unsupported forms and structural refusal retain uncertainty.
The indexed proof retains O(N) region entries and takes O(N\*D) worst-case ancestor work for N
source nodes and nesting depth D. The advisory estimate does not bound index construction or checker cost.

Module availability consumes performed producer dependencies from the same source-value query.
A preceding straight-line binding or own-data-slot assignment contributes its full executing
expression, including the receiver, computed key and RHS, to consumers of that value. The existing
mode-aware environment walker follows those dependencies for export analysis and target pruning.
Finite acquired literal values distinguish taken and skipped logical assignments. This is a
bounded source-order proof, not general constant evaluation. Reads before a write and aliases to
an earlier object retain their acquisition time and source identity. Source-owned receivers also
prevent a structural getter declaration from restoring an overwritten getter.

A source-owned object setter can contribute a performed body assignment through one reachable
module assignment. The indexed assignment supplies its acquired receiver and actual RHS to the
setter's existing source query. Receiver acquisition precedes RHS evaluation, while setter
selection retains descriptor uncertainty from RHS and other preceding effects. The body write
must pass the existing reachability and own-data-slot replacement proof. The full invoking
assignment remains an evaluation dependency, including receiver, key, RHS and body effects.
A setter's own property is not treated as an ordinary data slot. Noop setters and unperformed
assignments do not replace the observed slot. Multiple possible setter invocation sites,
reassigned setter parameters and incomplete receiver or descriptor acquisition do not supply
this performed-invocation proof. These restrictions retain uncertainty rather than granting
replacement authority from a possible effect.

An interference scan can reuse a completed reachability predicate for repeated bare reads of
one immutable local `const`. The declaration must be directly in the current callable body,
with the same source binding, no indexed reassignment, and no import or module-export cell.
Each scan owns its memo under fixed origin, path, mode, bindings and restored creator context.
Only empty-operation predicates are memoized, and incomplete or exhausted acquisitions are
never stored. Property reads, mutable bindings, parameters and repeated-region declarations
retain independent acquisition. This does not choose a computed array index or remove calls
from the worklist. Candidate visits contribute to the advisory estimate. The memo
retains at most one boolean per eligible binder for that scan and is discarded on return.

Source getter returns can select another method of the same receiver. The local member
traversal distinguishes residual member paths and static versus instance lookup, so revisiting
an object declaration is not by itself a cycle. Repeating the same active lookup retains
uncertainty, and the traversal depth bound still applies. Selecting a method retains its source
receiver and effects without issuing a normal Get or Call receipt. Unresolved construction
or receiver alternatives remain independent residuals beside known method effects.

A dormant writer is distinct from a performed producer. Direct source calls, finite callback
candidates and the existing call index retain possible routes. Unproved routes stay incomplete,
and possible writes do not authorize certain replacement or private entry. At a module read,
an overlapping write without a performed producer keeps the source alternatives uncertain,
including a write in the same module. Its possible browser effects alone do not prove that
the authored export is absent on server. Returned source values retain their individual return occurrence. A write can replace an
own data slot only when it is proved to run before that acquisition or return. Literal-selected
`if`, conditional and logical branches share the same finite decisions with producer discovery
and module availability. A completely acquired source callable can supply a branch fact when
its synchronous body consists of one immediate primitive return, including a finite primitive
returned formal under its actual invocation input plan. Default activation and completion use
that plan, preserving the earlier bindings captured by each initializer. Unknown or conditional
inputs do not prove branch selection. Captured formals and nonformal return expressions remain
outside this finite extension. Callee acquisition precedes argument evaluation, and the existing
invocation owner retains argument, default and body effects. A branch fact is not a purity or
private-entry certificate. A declaration-only variable can acquire a
performed source assignment from the current executable file. A qualified assignment must
identify the binder-owned namespace that exports that variable. A type-compatible receiver
does not establish this identity, and an unproved assignment cannot replace the incoming value.
A finite module-local possible Proxy construction can retain deferred Get effects after the
original New has selected its guarded constructor and acquired symbolic target and handler
origins. Ordinary effect analysis projects those source relationships without requiring
a normal initializer draft or live recipient frame. Argument evaluation remains at New. A later
read observes the acquired objects, including current handler member writes, without repeating
argument evaluation. A reached caller read retains current handler and possible target-Get
effects through the MAY graph, together with unknown alternatives. Original constructor selection preserves
authored constructor effects beside native alternatives, even when allocation or origin
publication refuses. Dormant construction does not select a handler body. Updates and
compound assignments retain their Get-trap effects before the possible Put. A plain
assignment does not select the Get trap. Target-Get effects remain a conservative
union even when a selected callable handler may intercept the read.

Possible trap calls bind the handler receiver and protocol arguments through the shared source input plan. The defined target
and property key bypass top-level defaults. An explicit original source Member reference
also establishes a defined receiver, independently of its unknown value. That relation ends
at its Get and cannot be inherited from an outer or nested lookup. Unanchored receivers and
nested patterns retain their own default uncertainty. Generator trap bodies stay deferred.
Independent constructor, handler lookup, trap and target fallback uncertainty remains. This
projection provides no Proxy value identity, DATA coverage, completed construction or Get, descriptor
constraints, or native storage allocation. Unmodeled New completion can still prevent emission.

The Proxy regression cohort includes `TestPossibleProxyReadModifyWriteEffects` for Get before
Put and the plain-assignment no-Get control. Source-reference and input controls retain current
handler writes, acquired argument cuts, deferred bodies and independent unknown effects. Strict
client/server checks require EXACT2101 with neither code nor a source map. Authored TS7-erased
Node phase checks supply runtime oracles independently of that artifact refusal.

A standard-library declaration alone does not prove which global
operation will run. Native `Number` facts require finite decimal string, numeric, boolean or null
literal inputs and a closed indexed mutation and call boundary. Native assignment targets,
including destructuring, defaults, rest and loop targets, invalidate the fact when a destination
can replace `Number` through an unresolved receiver. Stable literal receivers remain separate.
Calls must resolve to stable source-owned bodies in the indexed file or primitive `Number`
conversions, or occur in a provably later distinct module statement. This last case preserves
an earlier acquisition without assuming the later call is inert. Unowned calls, including
descriptor and reflective operations, otherwise invalidate the fact without interpreting their
result. Nonliteral unary numeric conversion is also an open-call barrier because it can invoke
`valueOf` or `Symbol.toPrimitive` code. A source-owned wrapper does not close that implicit
work merely because its own body is visible. Constructors and tagged calls use the same acquisition boundary.
A selected synchronous source return can carry its actual creating invocation back to a module
statement for this ordering proof. This uses the existing occurrence-local creator record,
including its selected callee and input context. Another invocation cannot lend its prefix.
Missing, recursive, async or generator occurrence ownership retains uncertainty. Other callable,
repeated and exception regions cannot borrow textual body order for this proof.
Shadowed constructors, coercion objects and effectful arguments provide no intrinsic fact.
This is a bounded source proof. Cross-module mutation, host changes and implicit foreign
getter or coercion effects remain outside its coverage. Rejecting an intrinsic fact does not
establish precise target pruning for an unresolved producer. Unknown placement retains authored
control flow and static export names rather than removing an export based on a possible effect.
That preservation does not certify target availability. A retained initializer can still throw
on a target where its actual source execution uses an unavailable global. Proving such an export
absent requires performed-producer and source-call authority, including implicit conversion
execution when it determines a later callable binding.

Named `break` statements retain their actual lexical label within the same callable. Ordered
block completion stops at the first known abrupt statement, and only the matching label
consumes its break into normal continuation. Work bypassed inside that label is unreachable,
while work after its exit can be performed. Unknown `if` alternatives merge only when both
complete normally or both return or throw. Incomplete prefixes remain incomplete.

Target resolution and containment contribute to the advisory estimate. Unresolved or unlabeled jumps,
`continue`, loops, switches and `try` statements remain incomplete. The relation does not model
loop or exception control flow. Finalizer override selection still requires definite return or
throw completion. An unconsumed labeled break supplies no such authority, while a locally
consumed break followed by a real return can prove that existing override.
The module environment walker uses the same reachable-statement relation for export analysis
and target pruning, preserving receiver, computed-key and RHS evaluation dependencies.

A finite acquired own method can contribute a captured binding replacement when its actual
callee and creating occurrence match, and the existing prefix and synchronous-body checks prove
that assignment performed before the read. Captured replacements from all sibling writers are
merged by their actual performed occurrence order, never by method declaration order. Unproved
ordering retains alternatives. Binding and own-member replacements share that completion merge.
Acquiring a left reference is not a completed write. A proved assignment inside an assignment
RHS completes before the enclosing replacement. Other overlap remains unproved.
An ordinary object method is a writable data slot,
so a source replacement selects its current body. Selection alone does not prove execution.
Unresolved conditions, loops, suspension, generator bodies, exceptions, indirect calls and
cross-module mutable storage remain outside this performed-producer proof. Possible alternatives
do not certify replacement or portable execution. Unknown placement still does not establish correct target
emission for these cases. Receiver methods that write through a composed `this` or
callee formal can remain incomplete even when the receiver is finite.

The shared input owner evaluates finite object parameter patterns at call entry, before body
consumers. Selecting a property executes its getter even when the bound name is unused. Bound
names retain the acquired source value for nested reads, aliases and returned closures. Ordinary
unused identifier parameters do not read their input's properties. Local object declarations use
the same binding owner. Module declaration readers request binding effects without requiring a
finite result value. Invocation readers also acquire origins for body demands, so unknown value
contents do not erase a known initializer's platform requirement. Formal and nested object
binding defaults share an invocation-local input plan with callable demands and the module
environment walker. Absent or explicit undefined inputs activate the default. Proved defined
inputs, including null, false, zero and empty strings, bypass its demands. Active defaults use
the earlier bound names at binding time, even when the body ignores the resulting value or
later replaces a name. An unresolved input retains alternatives and conditional execution
incompleteness when its default can contribute effects. This is a finite source relation,
not a proof of every default expression or call result. Finite object rest copies acquire the remaining own values
with the pattern's exclusions. These are provenance facts, not runtime copies introduced by the
compiler. Native parameter syntax preserves argument order, getter order, exceptions and identity.

Array patterns retain incomplete iterator provenance. Numeric element origins and array-like
types do not establish iterator identity, consumption, closing or yielded-value origins. Known
source iterator candidates remain visible beside that uncertainty. Dynamic computed keys,
foreign sources, prototype changes and unproved rest enumeration also retain incompleteness.
Unknown placement is not an emission safety proof for those paths. Captures of names introduced
by local variable patterns and writes forwarded through helper formals can still lose receiver
provenance. Identifier-only unused defaults and shared module input acquisitions can still lose
execution precision. Retained module-level closure variables can still lose target execution
precision across separate factory instances. Nested, recursive and opaque captures do not
have a general completeness proof. These are separate open defects. This bounded object-parameter repair does not
establish general pattern capture,
parameter-pattern or module-projection acceptance.

Capture-relative writes are materialized as existing caller, component or unknown receiver facts.
Possible writes through returned getters and projected ordinary calls remain visible in caller and task summaries with unknown
confidence while lowering is incomplete. They cannot supply finite publication authority. Captured closures
remain blocked from scalar private-entry lowering, even when their finite paths are known.
May alternatives do not prove selected implementations, performed writes or transport authority.
Task publication still requires environment-preserving lowering and actual invocation evidence.
Receiver matching retains a known parent's relative path instead of reacquiring its projected
child during that parent's acquisition. A directly returned source object can be matched to its
actual creating call without reading all of its getters. Direct immutable bodies with no eager
operations are excluded from the receiver-writer relation using the existing generation index.
Argument calls and real member/descriptor operations retain their independent effects. No
operand-value memo or separate capture-timing rule is needed for this matching.
The assignment index groups only stable literal object and array origins. Mutable, projected,
returned and symbolic roots retain a dynamic candidate list. Queries merge those lists in source
order, so index narrowing cannot reorder replacements. This reduces repeated unrelated-write
visits without caching an invocation or granting exact receiver identity.
Summary and assignment indexes belong to the current Program's analysis cache and are discarded
with source, selection or configuration invalidation, reset and disposal. No public authoring API,
persistent capture protocol or runtime observer is introduced.
The existing private-entry path below does not establish those properties for adjacent TypeScript and JavaScript implementations.

### Related defect families and repair boundaries

State lowering preserves two contracts: the framework's reactive ownership and the authored
TypeScript operation. The target-neutral checking projection keeps assignment destinations,
operators, deletes and method calls intact while retaining framework adaptations for tasks and
derived values. Semantic executable compilation also checks that projection. Client and server
compilation share its diagnostics within the same retained program generation and request options.
Source or dependency changes invalidate that proof. Generated helper
casts carry proven result types and do not replace validation of the source operation.

Member template tags in blocking tasks use the same invocation-owned receiver selection as
ordinary helper calls. Native template syntax preserves per-site template object identity,
raw and cooked strings, and substitution order. Captured signatures remove the receiver
parameter supplied by the invocation while retaining generic argument and result constraints.
Task-local `using` and `await using` retain native lexical disposal, with `ESNext.Disposable`
enabled in the application's TypeScript libraries. They do not extend lexical scope to the
component's mounted lifetime.

| Family                                 | Owning repair                                                                                                                                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authored type obligations              | Preserve destination, readonly, key, operator, method argument and arity obligations in the checking projection. Retain contextual callback parameters and expression result types in executable output.                   |
| Guard narrowing                        | Carry checker-proven read types across generated closures. Unsafe unguarded reads retain their diagnostics.                                                                                                                |
| Collection identity                    | Compare selected method declaration identity with native library declarations. Custom methods retain ordinary calls. Runtime wrappers compare the actual selected method with native intrinsics.                           |
| Authored access and invocation effects | Detect accessors before reading a comparison value. Invoke setters on equal writes and invoke overrides once. Native bookkeeping uses intrinsics rather than authored overrides.                                           |
| Private receiver brands                | Invoke Array, Map and Set subclass methods and descriptors on their native receiver. Observe public properties and native storage for notification and optimistic undo.                                                    |
| Suspension boundaries                  | Select receivers, keys and prior values before suspension. Keep eager awaits in the authored callable, then perform a synchronous fenced commit. Logical assignments retain short-circuiting.                              |
| Task signatures and captures           | Keep the public callable signature separate from resolved runtime work. Resolve defaults once, in parameter order, including binding patterns and earlier-parameter references. Direct SSR uses the same capture resolver. |
| Server task input/output ownership     | Share ordered task-local read facts between activation metadata and emitters. A slice cannot depend on its own unpublished output or on a dormant interaction definition.                                                  |

Mutation result facts are captured before island extraction can change lexical parents. Suspension
and blocking-task locals belong to each invocation, so overlapping calls do not share temporary
values. A blocking task can consume its locally assigned values before successful publication.
Only completed writes that dominate a read can remove its input dependency. Conditional writes
retain predecessor inputs and use an invocation-local value only when that write executes.
Uncalled nested writers and assignment right-hand sides do not establish a local value.
Other consumers continue to observe committed state. The compiler allocates these locals only
for writes whose values are read within the invocation, rather than copying all component state.

Native indexed primitives and native collection operations retain their focused paths. Authored
collection subclass calls need storage snapshots because their implementations can bypass proxy
traps. Array snapshots inspect descriptors without evaluating indexed getters, authored copying methods
or subclass species. Descriptor-sensitive rollback preserves accessors and later authoritative writes. Indexed state
and forwarded props recognize compiler operands by their own data descriptors, without reading
ordinary Array elements. Objects returned by
branded methods remain observable. That work is proportional to the collection and its public own properties. Public storage
changes participate in notification and optimistic undo. Private fields and external effects remain
opaque and are not automatically reversible. Subclass prototypes and function-bearing state still
require the existing hydration serialization contract.

### Task transformation boundaries

Consumed scalar assignments and updates retain their authored results. Proven static state paths
share invocation-local values across statement and expression forms. Compound and logical assignments, prefix and postfix results, awaited operands, and closure
reads declared before a write retain their authored evaluation order. Queued expression updates
inside a loop capture that iteration's reference and value. Direct operations keep the scalar path without
an additional capture closure. Queued Array, Map and Set call arguments evaluate before later
statements, including spread expansion. Block-scoped captures preserve inputs across loop iterations
without copying collection storage. Component-instance aliases retain state provenance until reassignment.
Rest bindings allocate new containers and do not authorize rewriting their own members through
the source state path. A binding default may select either a state reference or independent storage.
Its possible state effects retain wildcard authority, while ordinary client mutations use the
actual selected receiver. Server tasks require a finite proven state path and reject that uncertain
selection. Collection aliases that are already the full receiver use a temporary member holder
to satisfy the existing runtime helper's nonempty-path contract without copying the collection.

Invoked server-task optimistic callbacks reject captures of server-task locals with `EXACT2001`.
Task inputs, outer public values and callback-local computations retain their supported scope.
The capability call must be a direct task-body statement. Calls hidden inside server control flow
are also rejected with `EXACT2001`.

Server dependency preparation combines direct writes with proven callable effects. It retains
predecessor readiness while leaving affected scalar reads live across helper calls, conditional
writers and closures. Immutable argument aliases carry the same receiver provenance as direct
arguments. Ordinary functions, methods, class field initializers and static blocks retain their
own receiver. A property named `state` on an ordinary receiver does not create component-state
provenance or indexed slots. Compiler-owned setup computations, render closures and declared tasks
retain their component receiver. Computed member names evaluate in the enclosing scope, and arrows
inherit its receiver.

Generated temporaries retain assignment destination types, including empty arrays and contextual
callbacks. Callback argument context is captured before island extraction changes parent links.
Copied continuation executors retain component type parameters, constraints and defaults.
Task policies recognize renamed and namespace imports by provider identity. Invocation lowering
uses analyzed argument counts to distinguish the compiler-supplied context from application inputs.
A local binding that shadows a provider does not acquire framework policy ownership.
Recognized zero-argument policy defaults on the final parameter of a component-owned task
are compiler syntax, excluded from runtime body-effect summaries. This does not classify the
runtime marker as pure. Ordinary defaults, policy arguments and task bodies retain their
existing effects, and an unbound call still requires an explicit placement or known implementation.
Optimistic prelude extraction selects the framework `TaskContext.optimistic` method declaration.
Ordinary helpers with that name retain their original placement. Indexed, aliased and destructured
capability calls use the supplied generation context without capturing a server-local alias.
Collection helpers preserve the authored receiver, boolean and void result types.
Checking, client compilation and server compilation continue to reject invalid callbacks and arguments.

Loop-header and reflective state-write restrictions follow immutable operation aliases, const object
binding selections and defaults, type-only wrappers, computed
literal names and proven helper argument and receiver ownership. Native `call`, `apply` with a
literal argument vector, and `bind` preserve that ownership, including bound prefixes, empty final
argument lists and computed literal invocation names.
Native collection write classification and helper emission also accept literal-indexed members.
Their computed key executes before arguments. Staged progress publication captures that selected key
during authored execution, retaining the state path for publication into reconciled owners. Ordinary functions establish their own
receiver while arrows inherit their enclosing receiver. Ordinary objects with similarly named methods
do not acquire native reflective semantics. Loop-header support remains a separate design question:
normalization must preserve iterator closing, per-iteration reference evaluation, destructuring,
labels, scope and asynchronous iteration. Reflective support must account for descriptors, boolean
results and explicit receiver arguments before a restricted operation can be enabled.

Pending property reads, native collection results, helper effects, and helper parameter binding use
one explicit transaction engine owned by `@exactjs/reactive`. The compiler retains focused scalar
locals where they suffice and supplies invocation-owned views to ordinary helper inputs. Native
parameter binding operates on those inputs. Core retains task scheduling, cancellation and publication
policy. See [pending transaction ownership](tasks.md#pending-transaction-ownership) for runtime view
identity, lifetime and receiver limits.

Task capability recognition inspects callable signatures before resolving call arguments and generic
overloads. Calls whose signatures cannot select a framework task method stop at that check.
Flow-narrowed bindings and callable aliases still undergo native signature selection, so
`TaskContext.peek` and `TaskContext.optimistic` retain their declaration identity.

Ordinary functions, class methods, accessors and factories retain their authored implementations.
The compiler emits no alternate helper bodies or class registration. It analyzes helper declarations
when they establish component effects, placement or data policy, without taking executable ownership
of their modules. Callable-only modules are left to the host TypeScript/bundler pipeline.

Computed component operation reads can retain exact receiving-prop obligations. A resolved JSX
delivery with one matching named string-literal input can adopt its own obligation through a
private body projection. Standalone definitions and unmatched deliveries retain unknown placement.
A qualified edge does not authorize another edge to the same component or its global partition
node. Spreads, retained expression operands, getters, Proxy inputs and later updates keep their
independent evaluation effects. Recipe adoption checks the current program, checker, source indexes
and dependency facts, together with the exact selected target, attribute and literal value.

Policy receipt analysis includes pattern defaults and computed keys independently of the source
container. Native computed `call`, `apply`, and `bind` use declaration-proven Function members.
Public literal member selections retain type-derived narrowing. Secret-controlled helper returns
retain their result policy across available source-module boundaries, including function aliases
and accessors. Imported function references defer source-body result inference until invocation.
Getter reads still infer their result immediately, and an earlier function reference cannot
satisfy the separate query for a later call. Declaration annotations and selected type
qualification remain checked on references. Source result queries cache declaration and completed type-qualification facts
within their analysis and checker generation. Successful recursive searches never publish partial
negative facts. Whole-value qualification follows deferred call and construct result contracts,
while a selected public sibling is checked through its resolved invocation type. Argument policy
and execution effects remain independent. Expanding generic queries reuse the pinned checker's
recursion-identity detection and retain incomplete protection without caching success. Finite
record width is not an expansion limit, and subtree cache warmth cannot change the decision.
The retained-artifact consumer described above separately follows stored native payloads and
application augmentations. Standard library APIs alone do not label deferred definitions as
private data. Combined policy validation does not establish adapter bundle or source-map
publication acceptance.
Context residency resolves the core factory and native option syntax, including
factory aliases and immutable option objects, rather
than matching function names or substrings in authored text. Console sink analysis similarly uses
native receiver and module identity through immutable aliases and native Function forwarding.

At component task call sites, runtime views supply supported pending state behavior to ordinary
helpers. Published and in-project helpers share this runtime contract. Component-local lexical
callbacks remain eligible for component state lowering. Runtime view identity, lifetime and native
receiver limits are explicit, with `stateAccess()` and `sameStateTarget()` bridges described in the
[pending transaction reference](tasks.md#pending-transaction-ownership).

Task-created ordinary lexical closures retain their creating generation in both activated work
and invoked continuations. Both lanes reuse the active mutation visitor for selected writes,
resource ownership, context calls and awaits. Independently authored task definitions retain their
own defaults and body owner. A cancelled generation cannot perform a later selected commit,
including after an ordinary async closure resumes.

Finite synchronous own methods on named const objects created directly in task work use a
source-local lexical creation certificate. It retains the authored method and work-body identities,
the source-resolved direct call, and every eligible TaskID and Component pair for repeated
activations. A saved original keeps its creating signal. Replacing the member does not transfer
that certificate. Computed names evaluate in the enclosing frame, defaults use expression-local
storage, and method bodies get invocation-local temporaries. The certificate does not establish
publication for setup-shared objects, class/accessor/constructor methods, nested factories or
async/generator methods. Publication after successful task settlement remains a separate boundary.

Mutation type facts are captured against authored parent relationships and sealed before executable
lowering. Selected writes retain the expression, target, receiver, and computed-key annotations before
task extraction can change those relationships. Temporary storage consumes these captured facts after
sealing. Existing pending-read annotations take precedence. Authored checking retains the full type,
while executable temporaries retain only portable annotations under the existing task capture policy. A module-local const unique-symbol query or computed type name also retains its annotation when the authored checker resolves the value declaration and the final destination preserves that same binding. Reconstructed task work must retain the actual authored callable or its shared body, and final parameters, locals and introduced outer bindings must not shadow the value. Generated island input parameters use one printer-owned unique identifier throughout their private envelope reads. This preserves authored module names without changing runtime helper or transport contracts.
Uncaptured generated or non-selected expressions retain their existing query path.
Component operation plans preserve assignment results, evaluation order, short-circuiting
and suspension. Generated code must retain authored TypeScript constraints. JSX render helpers are
component-support code, with rendering ownership separate from ordinary task helper execution.

Scalar mutation lowering shares selected-reference planning across ordinary callbacks, indexed
commits, and task work. It captures the actual receiver before the raw computed-key expression
and keeps both across RHS suspension. Logical operators branch before committing. Publishable
lean server tasks use the existing write and delete helpers under their task generation, while
setup defaults and synchronous compiler computations retain lean storage and direct operations.
Function, method, accessor, and constructor bodies own invocation-local reference temporaries.
Computed member names evaluate in the enclosing definition scope. Parameter defaults and class
field initializers use synchronous expression scopes because body-local declarations are
unavailable during their evaluation. Unsupported selected references decline before creating
an expression scope. Bare parameter assignments retain their native binding operation, while
the normal child visitor can still lower eligible member mutations in their operands. Supported
member initializers receive local storage even without an enclosing invocation frame.
Static blocks retain their authored block and class
bindings, with synchronous reference temporaries in the enclosing definition frame. These
scopes preserve lexical `this`, `super`, private fields, and derived-constructor initialization
order. State-path analysis and write-root selection share those lexical receiver boundaries.
Resolved component and state aliases retain their original storage inside class bodies, while
class-owned `this.state` and shadowed local aliases retain their ordinary TypeScript meaning.
A computed member name bypasses only the class that declares that member. An object member
name evaluated within a class field still uses the field's class receiver.
The existing native operation owner converts the put or delete key at operation time and reports
that canonical key after success, without another coercion or accessor read.

Source-backed immutable module functions with finite scalar parameter effects can also own a
private server entry. The existing callable fixed point propagates emission completeness alongside
possible effects. Selection proof is separate, so resolving an effect through `call` or `apply`
does not authorize replacing the function actually selected by that operation. The source plan
retains resolved source files and private imports only for the exact-paired native and host build.
It adds no component-library helper protocol. Artifact planning retains local import and re-export
routes to required helpers, including type-only routes. Ordinary and private imports select one
target module and keep its runtime captures and nominal types together.
Build adapters acquire relative and absolute authored modules within their application source root
through the actual host resolver. Raw source analysis discovers helper requirements only. A second
snapshot binds final adapter-prepared content, including Intl descriptor imports, and its exact native
syntax slots before private entries or effects become authoritative. The same prepared root result
reaches the dependent transform without another Intl catalog pass. Build-owned preparation results
are keyed by authored content and compiler target and cleared with the adapter's Intl generation.
The existing session queue owns discovery, final preparation, snapshot acknowledgement, and dependent
compilation together. This adds source acquisition and native analysis work per acquired graph.
No linear or measured performance improvement is claimed. Bare, virtual, external, query-bearing,
and out-of-root sources gain no private authority through this bounded local-source path.
Vite and Bun leave require slots opaque. Webpack forwards the slot kind to its existing resolver.

The synchronous entry accepts a signal, receiver, and original argument vector. Generated
invocation references use unshadowed intrinsics, and the signal annotation comes from the
framework task context rather than an authored type with the same name. It returns
`Reflect.apply` of an instrumented ordinary-signature body directly, including an async body's
promise. A type-only reference to the original callable preserves inferred parameter defaults
and binding patterns under that invocation context. The original callee is read before arguments,
including its temporal dead zone. Original exported values, self references, defaults, rest arguments, and module captures
remain ordinary. Per-operation fences reuse selected-reference lowering and the existing capture.
Native array and object assignment patterns retain their own input evaluation, defaults,
iteration, abrupt completion, and assignment result. Finite parameter-member destinations,
including destinations without defaults, contribute possible write paths through the existing
callable effect collector. The private entry replaces each eligible destination reference with
an assignable accessor whose closure captures the immediate receiver and raw key once at native
reference selection. Its setter passes the engine-selected value through the same immediate
write hook and per-put task fence. A supplied value still performs a put when its default is skipped.
Destination types are captured before lowering, independently of default literal types.
This finite entry proof covers named and numeric/string literal member keys. It does not extend
rest or loop targets, nonliteral key ownership, or the pending invocation-view contract.
No observer spans a promise. Pure helpers need no entry. Arrows that require lexical `this`,
`arguments`, or `new.target`, nested execution owners, mutable callable selections, methods, and
array mutator effects remain outside this entry proof. Existing acceptance and diagnostics are unchanged
for those calls. Source-removed server helpers do not acquire executable ownership metadata.
Generated private imports and entry signatures require artifact ABI review before release.

Reactive task binding captures cover every lexical occurrence. Static selected paths share an
activation value, while distinct selected paths carry separate inputs. Dependency metadata and
executable lowering use the same capture groups, retaining useful input types and excluding
unrelated props from transport. Guarded optional or mixed callable properties retain their authored narrowing, receiver binding and
pending field selection. Immutable imported namespace reads preserve their host export-replacement
syntax, and those replacements consult restored authored checker parents.

Client pending helper factories, methods and accessors retain their authored bodies, descriptors and
lexical receivers. Their state arguments use the same invocation-owned views as external helpers.
Component branding attaches metadata to the original component function through a focused provider.
Enhancement-context registration uses its own lightweight dependency reader and immutable metadata.
Imported helper calls preserve those token identities through type-only wrappers, `call`, `apply`
and immutable local aliases. Attachments reference the imported callable at module scope rather
than an alias declared inside component setup. Mutable selections remain conservative.
Authored bindings named Object, Symbol, Reflect or Function do not intercept those metadata operations.

Optional operations preserve native short-circuiting, computed-key selection, and receiver binding.
Pending proxy views supply property and collection semantics at these syntax boundaries. Helpers
whose bodies are unavailable use the same view when passed component-owned values. A proxy cannot
preserve equality with an original reference captured outside its invocation or emulate private
receiver brands. Unsupported reflective and receiver-sensitive boundaries must fail explicitly.

### Shared repair strategies and performance criteria

The repairs share five boundaries: authored semantic facts, mutation evaluation order, native
operation identity, task argument resolution and task dependency ownership. The task-state and
component-branding and enhancement-context providers are additions to the coordinated 0.7.0 compiler/runtime contract. New
artifacts that use them require their provider packages. Existing released-artifact fixtures remain
unchanged and continue to verify consumption by the updated runtime. Changes confined to emitted
internal locals and type-only signatures do not change a runtime helper signature.

Task resource release tracking, fixed spread-argument readers, and native lexical cleanup fences
are additive compiler helpers in the coordinated 0.7.0 runtime provider. They preserve existing
helper signatures and serialized task records. Only affected sites import these capabilities,
so unused helpers remain tree-shakeable. Pending-state call lowering composes inside executed
release tracking. Optional release calls retain fallback ownership when they short-circuit. Authored overloads and inferred default parameter types
remain checking contracts, with one runtime task binding. Native factory discovery follows
symbol identity and immutable aliases, rather than treating a same-spelled custom method as
a platform API. Native `using` declarations retain their lexical ownership. An outer settlement
fence waits for their native disposal during cancellation without adding a second disposer.

Regression coverage lives in the compiler's mutation-contract and task-state tests, the reactive
accessor and subclass tests, and the owned mutation composition journey. Paired valid and invalid
programs protect checking and both executable targets. Runtime assertions cover repeated writes,
retained DOM identity, hydration, disposal, overridden calls, native storage and optimistic undo.
The shared adapter SSR fixture also exercises captured defaults and ordered local reads.

Use the native corpus guard for compiler timing and structural checks. Measure semantic
compilation separately because the neutral proof adds checker and analysis work. Measure primitive and
nested writes, native and overridden collections, task capture and SSR activation separately.
A source-level proof does not replace adapter or native runtime acceptance. Compiler branch
coverage remains a search aid, while fresh semantic and lifecycle execution supplies contract
confidence. A newly discovered mechanism reopens the related-defect investigation.

### Compiler confidence workflow

Framework APIs are identified by their checker-resolved imported values. Registry factories,
open dynamic-component factories, structural JSX lowering, and structural partition planning share
that import-identity rule. Renamed imports, namespaces, reexports, and immutable aliases preserve
framework identity. Lexically shadowing local values retain their authored behavior.
Context policy uses that import identity for factories, lexical component receiver ownership
for `getContext` and `setContext`, and checker-bound token subjects for residency. Static
computed protocol members retain the same policy. Ordinary receivers and shadowed token
bindings do not acquire another context's policy from their spelling. These policy restrictions
do not discharge current-callee, argument acquisition or writer effects. Residency narrows
existing artifact targets without replacing the component's independently analyzed effects.

Install workspace dependencies and build `@exactjs/core` first.
The composition test configuration anchors its application root to the corpus package, so
repository-root confidence runs retain the same local enhancement ownership as workspace runs.
Policy qualification uses the resolved call signature for instantiated return types. Generic
declaration results are not expanded again after selection. Secret qualification types are planned
before lowering reparents shared source nodes, then applied without further checker scope queries.

PR CI runs uninstrumented correctness suites. Coverage collection is an explicit local audit,
not a CI step.
CI pins Go 1.27.1. Native builds allow 30 minutes for the host test suite on constrained runners.

Use `npm run test:compiler:native-coverage` to review code that native unit tests do not exercise.
The command rebuilds the pinned compiler, runs uncached Go tests with statement coverage, and
installs Gobco 1.3.4 into an ignored local tool directory. Gobco runs each owned package separately
in branch and condition modes. Reports, uncovered source ranges, counters, function totals, and an
HTML statement view remain under `.tmp/compiler-confidence/native`. The combined `coverage.json`
records source revision, dirty-worktree limits, Go version, and tool version. Gobco instruments a
copied module. Repository package resolution is preserved while test-created temporary projects
keep their ordinary system-temp boundary. Each Gobco invocation uses a private Go build cache
and temporary directory, released after success, failure, or handled interruption. Ordinary
compiler builds retain their shared cache. Workspaces left by an uncatchable termination are
reclaimed on the next coverage run when their owning process no longer exists. Reports and
the installed Gobco executable remain outside that disposable workspace.
The denominator contains `internal/exactcompiler` and `cmd/exactc`, excluding upstream TypeScript
packages and our changes inside upstream `internal/compiler`.

Statement coverage includes code without conditions. Gobco distinguishes true and false outcomes
of branches and conditions, but does not cover `select` statements or establish every combination
of conditions. These measurements describe native unit tests. JavaScript package coverage cannot
measure the compiler subprocess, and neither metric proves a transformation's semantics. There is
no uniform percentage gate. Review uncovered high-risk analysis and lowering against behavioral
witnesses before adding tests.

When an uncovered outcome exposes a defect, close its native analysis and lowering witnesses
as part of the fix. Refresh the branch and condition counters and verify the repaired outcome
executed, alongside emitted semantic checks. Record any remaining source candidates or defensive
guards explicitly before calling the investigation complete. Match repeated predicates by their
occurrence within the owning function so one exercised guard cannot conceal another unvisited guard.
Removing unused private code changes the denominator. Report that separately from newly executed
outcomes. A retained defensive guard needs caller evidence identifying the invariant or earlier
validation that prevents a source witness.

After building workspace packages, run `npm run test:compiler:integration-coverage` to collect native
statement execution from the compiler, composition, and localization analyzer/build/language suites.
Localization includes the native extension request path used by package builds and editor providers.
It builds a separate instrumented
executable and records termination snapshots when test workers dispose compiler processes. The normal
compiler executable remains uninstrumented. Reports under `.tmp/compiler-confidence/integration`
separate unit, integration, and merged coverage without counting shared source blocks twice.
The report also records execution of our added upstream compiler file and the blocks intersecting
executable patch additions. Those upstream blocks are excluded from eXact's coverage denominator.
Block execution does not prove branch completeness or semantic correctness. Gobco outcomes remain
native-unit measurements, and coverage-build timings must not be used for performance comparisons.

After building workspace prerequisites, run `npm run test:compiler:confidence`. The maintained
[language and contract inventory](../scripts/compiler-confidence/inventory.mjs) distinguishes
transformed syntax, upstream pass-through, intentional diagnostics, and contract edges. Each edge
states its producer obligation, consumer guarantee, owning layer, and evidence scope. Known gaps
remain explicit, including syntax families and installed split-build environments that this
bounded workflow does not execute. An inventory gap may mean missing registered execution evidence,
rather than a proven unsupported feature.

The runner verifies the native executable against its source build key and executable hash,
rebuilding a stale local compiler before testing. An explicit compiler override must also supply
`EXACT_COMPILER_BUILD_STAMP` pointing to its matching build stamp. CI carries that stamp with its
native executable. A stale binary cannot count as current-source evidence.

The runner executes named suites and checks fresh Vitest JSON results against exact witness names.
Missing, skipped, failed, duplicated, or renamed witnesses fail acceptance. It writes
`.tmp/compiler-confidence/behavior/evidence.json` only after every required execution succeeds.
A verified entry means verified within its stated scope. It does not establish every source form,
compiler path, adapter, runtime, or interaction of that language family. The existing path ledger
and broader acceptance suites remain required.

The default profile collects compiler, reactive and composition witnesses. Run
`npm run test:compiler:confidence:environments` after building the workspace and installing the
native runtime acceptance tools and Chromium to collect the same witnesses together with existing
Vite, Webpack, native Bun and native HTTP/browser journeys. This profile requires Bun and every
runtime in the shared acceptance matrix. It runs the journeys freshly rather than importing
previous logs. CI runs it in the compiler browser acceptance job.

The Node 24 and Node 26 compatibility jobs also install Bun before running the shared
build-adapter suite, whose Bun integration cases launch the native Bun executable.

The evidence report keeps environment edges separate from the language and compiler-contract
denominators. Each edge includes its owning layer, producer and consumer obligations, and limits.
Installed enhancement SSR, workspace split-island hydration and native HTTP/browser acceptance are
distinct edges. The installed native-runtime edge executes source-removed paired components through
Vite-built consumers on Bun.serve, Deno.serve and local workerd with shared jsdom hydration assertions.
Its progressive output is assembled before delivery. Other adapter/native-host combinations and
real-browser installed-component behavior remain outside that evidence.
Entries without a registered witness have `evidenceState: 'known-gap'`. Registered edges whose
checks were not executed by the selected profile have `evidenceState: 'missing-execution'`.
Successful named checks have `evidenceState: 'executed'` and remain verified only within their scope.

Bun results are validated from the current invocation's JUnit report, including Bun's optional
suite-level CI provenance properties. Those properties do not count as test executions. Failed, skipped, incomplete
or duplicated named witnesses cannot count as acceptance. Native runtime acceptance writes
`.tmp/runtime-acceptance/evidence.json` only after every host and cleanup succeeds. The environment
profile directs that report into its own output directory and requires a matching invocation token,
fresh timestamps, a recorded browser engine, and all five host configurations with their completed
progress, dispatch-policy and browser-hydration checks. A retained success file cannot satisfy a
new invocation. Source revision and dirty-worktree limitations remain visible in the reports.

Bounded semantic exploration crosses six read forms with three assignment forms. The same
independent JavaScript reference predicts absent and zero values, replacement, and repeated
updates. Getter order, computed-key evaluation, iterator closing, DOM retention, strict checking,
and invalid-type controls run through mount and paired hydration. Direct and destructured writes
include incompatible-assignment controls. The authored checking proof retains destination
constraints before executable lowering. Set
`EXACT_EXTENDED_TESTING=1` to extend each journey from six to thirty updates. Failures identify the
source form, mode, step, and generated source. Promote new failure classes to focused regression
coverage rather than retaining raw exploration captures in Git.

CI retains native coverage and behavioral execution reports as seven-day artifacts. The report
parsers and evidence validators are dependency-free build-script tests and do not import package
outputs. These checks add execution evidence to the existing compiler and adapter acceptance jobs.

## Compositional source analysis

Source analysis and executable transformation have separate responsibilities. Analysis follows
bindings, calls, captures and writes to determine dependencies, effects and placement. The
`source_language_*` owners provide selected precision refinements using compiler-owned values,
Cells and completion records. Those records are analysis artifacts, not application runtime
objects or emitted activation identities.

The host's `process-callable-contracts.ts` owns the serialized callable dependency and effect
summary. It carries source identities, known environment requirements and unresolved edges,
without transferring live analysis frames or precision-engine storage into the host. The process
envelope references that contract without changing its wire representation.

Executable transformation uses the TypeScript AST visitor, factory and printer. Ordinary nested
expressions retain JavaScript evaluation order through their AST structure. Framework transforms
that split work across suspension or placement boundaries must preserve that order in generated
code. Generating that code does not require a known compile-time argument value or a successful
precision receipt for every ordinary Call. Placement diagnostics can still prevent emission when
unresolved effects make the requested artifact unsafe.

Ordinary synchronous analysis instantiates declaration-relative AST summaries with each use's
arguments, receiver and captured binding relationships. Returned functions retain their creating
source context through bindings and container fields. A later member demand observes applicable
writes at its current read boundary. This does not require knowing the runtime field value or
constructing an analysis-engine activation for every Call. Source-only Call entry keeps its
binding plan separate from normal operation lifetimes. A supplied precise observation retains
its original owner. Returned dependency relationships no longer use the detached
module-initializer origin-family side channel. Effects-only Proxy construction metadata retains
its separate source, generation and request-mode fences.

Normal operation slots have no separate callee, argument or result view derived from prefix
history. Ordinary source-effect analysis uses parameterized source relationships and does not
request precision execution for every unused initializer. Session collection no longer reserves,
attaches or index-qualifies the unreachable module-prefix execution adapter. Normal phase
admission no longer dispatches its first entry. No production requester supplied its required
original-statement precision frame. Production-requested default, Get, async and own-getter
refinement retain their separate normal input and lifetime checks. The historical prefix hold
guards and Call-retargeting lookup are removed from ordinary source consumers, along with the
uncalled candidate authentication and entry methods. Generic provenance and normal phase consumers
keep their existing fallback semantics. Source owners have no prefix execution lifecycle registry.
Reservation, generation attachment, source population qualification, history publication and
successor-Call dispatch adapters are retired. Storage schedules retain their normal body, event,
result and lifetime validators. Initializer/binding recipes and source-prefix getter or captured
Call paths retain refusal where retired source authority was required. No independent normal
request gains authority from that absence. Normal expression/recipe lowering and shared native
symbol facts remain separate from source admission. The orphan module-interval qualification builder
and its source-only lowering branches are removed. Independent formal, capture and receiver
contexts retain their prior refusal outside their supported domains. Obsolete compile-to-receipt bootstrap tests
are retired, while authored source effects and actual emitted initialization remain covered.

Effect contributions remain additive. A missing precise Return value can leave the value
incomplete while source analysis accounts for that operation's effects. Source dependency
field coverage marks matched effect obligations and supplies no normal DATA output.
Destructured formal names retain their original formal slot in those obligations, including
reads in later parameter defaults. A direct present field of an observation-only object-rest
copy can account for source read effects. This copy relation does not discharge writes,
escapes or dynamic scope. A fulfilled source-only obligation does not authorize a normal Get
result or descriptor. Only a matching operation, selected target, source use, consumer and
phase can discharge its classified obligation, across all relevant alternatives. Independent
opacity and known browser or server donors remain. Ordinary Call contributions also retain
relative receiver bindings through forwarded and reordered arguments, without turning an
ordinary object into component state. Repeated contributions to one source operation join its
receiver alternatives across analysis phases. Distinct original operations retain distinct
edges and independent unresolved receivers.

Active source-body reentry compares finite relationships between source endpoints, formal
positions, captures, creating sites and member edges. New relationships may reach the existing
summary consumer. Repeated or saturated contexts retain uncertainty and previously discovered
donors. These active facts are released with the outer source entry. They are neither runtime
activation identities nor a completed-result cache. This local bound does not establish
request-wide termination or successful package compilation.
Constructed-member alias matching retains the selected receiver's New endpoint separately from
the class used for lookup. Its projected path and captured creating/formal context remain intact
instead of reacquiring that receiver during write matching. The extra endpoint supplies only a
MAY association. It cannot establish receiver identity, completed replacement, DATA or normal
Get authority. Existing normal and native receiver proofs retain their separate contracts.
The class-field computed-name receiver controls cover this boundary alongside distinct creators,
captured inputs, current writes, recursive uncertainty and known effect donors. Ordinary
writer Calls use the canonical selected-body and argument binding relation before alias
matching. Indexed Calls satisfy their existing caller/creator eligibility before ordering and
branch queries. During those queries, the original Call's active occurrence boundary prevents
it from being selected again as a separate writer of its own precondition. That interval ends
before the canonical argument/body consumer takes ownership. An unknown predicate retains
possible writer contributions and supplies no performed Call or normal output authority.
Member alternatives keep their acquired source bindings and creator context through subsequent
container and getter projection. Returning only their AST node would lose a writer-created
closure's formal captures.

Reflective source writes keep the original Call's target, key and descriptor
inputs together through alias matching. A descriptor value or getter return keeps
its creating source bindings through later member projection. A target comparison
may demand the existing source return relationship of an earlier Call without
republishing that Call's arguments, defaults or callee effects. Unsupported output
remains an opaque original Call origin for indexed MAY writes. This supplies no
Object.create freshness, native descriptor completion or normal Get output.
Selected source return projection keeps the existing dependency-entry and active-body
ownership through return reachability and completion selection. Selected values then
pass to downstream consumers with their creating scope after that acquisition interval ends.
A sibling allocation comparison therefore does not inherit saturation from the completed
selection. An initializer or captured binding that asks for its own pending return during
selection rejoins those source inputs instead of starting another acquisition from copied scopes. Saturated reentry retains uncertainty without supplying
an undefined value or successful completion. Other input alternatives and discovered donors
remain available. This source interval does not change normal output or completion authority,
and emitted code retains ordinary JavaScript initialization and Throw behavior.
An uncorrelated possible getter uses an unknown receiver and nil operation, keeps
lexical arrow captures and retains uncertainty. It cannot discharge an actual Get
or borrow the descriptor target as its receiver. Existing normal descriptor
consumers retain their separate operation and lifetime checks.
Each alternative keeps its original Call and captured source scope. Known wrappers transfer those bindings through reached body Call demands, including forwarded callback invocation. Creating or storing a callback does not invoke it. Recursive source contexts use the existing finite dependency-entry join, and unresolved invocation alternatives retain uncertainty. Argument values are observed
at that Call, while later field reads retain the original reader boundary rather than borrowing a
factory return boundary. Unproved Call timing retains alternatives and uncertainty. These source
relationships neither replay argument effects at the read nor supply normal invocation receipts. Refused Call selection retains a source callable
that was actually exposed as callee or argument, with its captured inputs and unknown foreign
invocation inputs. Captured RHS values retain that source scope even when no performed
Call is available. Its possible indexed writes cannot become performed replacements or supply
write ordering. Module bindings have no creating callable. Source reads of a module cell
without an initializer retain its possible writer RHS values under each original Call's bindings,
including values returned through nested fields. Member reads consume those same captured source
alternatives. The unresolved entry stays uncertain, and these alternatives supply neither a
performed assignment nor an allocation or normal-output receipt. Exposed callbacks retain their
incomplete MAY scopes even when no performed Call is available. Constructor and accessor fallback
scopes require their original source body context. Index membership alone cannot enter those
writers. Earlier RHS acquisition effects remain at the writer Call, while their value
uncertainty and captured source values reach the later read. Known non-invoking bodies remain deferred. An unavailable source Call output
still retains its original binding origin for indexed possible member writes. This preserves
independently known donors beside the unresolved output without asserting object identity,
fresh allocation or a completed native result. Descriptor getter values use the same acquired
source bindings as literal getter bodies, including default initialization and captured returns.
Earlier getter-selection effects remain with descriptor installation. Literal descriptor keys
are compared before caller-input acquisition, avoiding reentry through an unrelated member.
Active indexed operations and ineligible mutation categories are excluded before projecting
writer inputs. They cannot reopen the native member acquisition that selected the same Call.
Constructor-context disjointness requires the existing allocation law on both alternatives. Source interference uses the same
original Call's existing performed-write proof rather than losing it at the input boundary.

The last source SDK state-write attempt stopped before test collection with a native stack
overflow while transforming `packages/core/src/component/error-boundary.tsx`. Passing the
class-receiver native cohort does not establish that SDK path or request-wide termination.
The integrated Core replay misses its configured request deadline. An uncapped diagnostic run
on `c2a7829ea` source, recorded at documentation revision `dc62e7a35`, fails naturally with a
stack overflow after 435.604 seconds. It uses the preserved 300-source request and runtime
profiling without analysis changes. The first two complete CPU segments cover repeated writer
input, member lookup and invocation preparation. At the second allocation snapshot,
`acquireCallableScope` accounts for 51.74% of sampled cumulative allocation bytes. The runtime
reports approximately 325 GB allocated by 374.589 seconds, with about 96 MB live heap at that
snapshot. These observations identify repeated copying and allocation churn, not a proven
semantic cycle or a validated replacement architecture. The remaining recurrence needs a
source-bound ownership diagnosis. Selected source-return acquisition now uses the existing source
body-entry interval, and its reduced recurrence controls pass. The subsequent uncapped
`387038cca` host still fails naturally with a stack overflow after 79.551 seconds. Its sampled
fatal stack includes refused writer-input and native member acquisition. Its CPU profile is
incomplete because the process fails before a snapshot, so no profile or speed improvement is
claimed for that run. The SDK path requires fresh execution after termination is repaired.

Maintainer validation uses `node scripts/build-native-compiler.mjs --source <pinned checkout>`.
The build prepares workspace declarations with the installed official TypeScript 7 CLI,
then stages the maintained overlay and runs its native tests before producing the host.
Use `--test-pattern '<Go test expression>'` for a bounded regression gate. That mode forces
a fresh build, cannot produce release packages or coverage, and leaves no full-suite cache stamp.
The ordinary build remains the complete native validation path.

Optional precision consumers share acquired values, storage and completion history. A child Call
uses the callee, receiver and arguments acquired by its caller. Completed work retains its effects
when a later operation refuses precision. A refused normal binding selection contributes ordinary
opacity directly. Independent known effects remain additive. The unreachable prefix-refusal source
coverage transport and its historical identity fields are removed. Descriptor request-mode fences
retain their separate ownership. Retained project facts do not replay completed work on another request.

Writer-candidate input matching uses a synchronous negative fence for its exact query, Call and input frame. It prevents the pending Call from being selected again as an input writer across raw, projected and container-origin lookup. Projection and declaration recursion retain their separate existing markers. The fence expires before receiver-body and write inspection, supplies no completion or effect authority, and cannot be inherited by a copied query or another input frame.

Source-visible prototype alias walks retain path-local cycle detection. A cycle leaves its prototype obligation unresolved, while sibling inputs remain eligible for inspection. Shared acyclic inputs are inspected on each branch. This traversal guard supplies neither purity nor completion for an unresolved call.

Property-reference preparation for a top-level expression or variable statement retains its
module prefix and imported initializers. A later once-only statement cannot make an earlier
descriptor conversion incomplete. Earlier work, deferred bodies, cyclic dependencies and work
inside the current statement retain their independent requirements. A directly indexed constant
Call initializer can retain its own precise output association. Property preparation references that exact
statement and recorded Call rather than moving its callee, argument or body effects to a later
requesting statement. An indexed eager Call nested inside a constant initializer also retains
that statement's effect fact when a member Get follows its result. Runtime variable initializers
receive generic effect owners independently of those precise associations. Effect ownership does
not promote a nested Call to the initializer's value or completion proof.

A reflective operation inside an actual default-class field also retains its allocating New as the caller boundary. Property preparation authenticates the live field inputs, unfinished original New publisher and canonical source occurrence before preparing predecessor modules. It stops before that New rather than entering the same allocation to establish its own field conversion. Missing, foreign, cyclic or unavailable construction relations remain incomplete. The boundary supplies neither descriptor completion nor prototype absence.

A later same-module effect read can use a sealed family of finite literal origins from a completed original top-level Call. Each family keeps the Call, return site and authentic immutable formal-to-actual associations. Mutable object contents are read at the current source boundary. Every return alternative must qualify before publication, so unresolved or Proxy alternatives cannot publish only their supported siblings. This metadata supplies effect dependencies without retaining an input frame or supplying normal Get, Call or descriptor output.

The reader checks source, program, checker, generation, mode and the sealed signature. Origin-bearing callable caches are recollected after request-generation turnover rather than renewing old evidence. Recollection adds analysis work for those sources. Other callable caches retain their existing reuse rules.

An entered ordinary helper can fulfill a declaration-local read demand on a direct parameter property only from that exact Call's completed normal Get. The proof checks the installed supplied argument, current source population, original operation and caller edge. It covers the read's effects without granting descriptor, mutation or value-completion authority. Uninstalled parameters retain their relative origin and incomplete value, and getter, Proxy, forwarded or independently opaque alternatives retain their own effects and uncertainty. Local temporaries keep the value observed before a later property replacement.

A selected component `map` retains a separate MAY-effect contribution from its original collection observation and key/render callback roles. Placement preserves known callee-key, argument, callback and possible item-getter effects, including computed getter names that may match. Dormant event bodies do not become eager setup work. Contributions retain exact source, operation, generation, analysis mode and immutable publication identity across copies.

Every currently produced map input domain remains open. A finite literal list, an empty list or observation-only future uses do not prove inherited iterator behavior, later item membership or complete property coverage. The contribution therefore cannot discharge abstract item reads or manufacture a callback invocation, normal Get, native preservation or descriptor receipt. Known effects survive beside that uncertainty. Ordinary methods named `map` receive no framework contribution.

Ordinary `Array.map` source inputs use a separate effect-only native alternative. The original
receiver is acquired before arguments, while possible numeric index Gets follow argument
evaluation. Canonical array indices and binder-owned prototype ancestors retain known getter
and callback donors beside unknown routes. This supplies neither a map-result model nor
field, descriptor, absence, normal DATA or callback-completion authority. A direct first
callback-argument Get suppresses later index and callback effects only when the source
completion owner assessed every represented route without a successful or unknown route.
Missing, unentered, refused and foreign projections remain unknown. A represented noncallable
callback suppresses numeric-index and callback-body work, preserving earlier acquisition donors.

Within that native alternative, index and array parameters are supplied and nonundefined,
so their top-level defaults are bypassed. Nested patterns and possibly undefined elements
retain their usual defaults. This local binding does not close the generic eager callback
edge. The current library method candidate is a typed possible target, without a complete
runtime-native callback-slot identity. Generic default donors therefore remain conservative,
and borrowed-method length behavior is not fully modeled.

Reflective descriptor conversion has a separate effect origin from callee selection. A generic
function summary retains uncertainty when it lacks an actual caller prefix. An entered normal
Call can account for that exact origin only after its target alternatives, descriptor fields,
native mutation and input dependencies complete, and its original effect batch is published.
Detached completion evidence retains source identities and effects without keeping a property
view, acquisition scope or query alive. Matching checks the caller, Call occurrence, target,
source, checker generation and analysis mode independently on each resolved edge. It does not
make the generic function summary pure or remove unrelated effects. Later member acquisition
still requires finalized descriptor outputs in its own live prefix view, with the actual receiver
kept distinct from an inherited native prototype lookup owner.
An earlier published ordinary Call can also supply a completed property prefix to a later
construction. Its original batch separately seals empty reference coverage and finite converted
mutation outputs. A scoped reader authenticates the exact earlier occurrence and original
publication without entering its body again. Captured values are copied with their original
provenance, and frame-dependent values refuse detachment. The initial projection covers
discarded argument-free Calls with empty reference inventories. Recursive, unfinished and
unknown-reference alternatives remain conservative. The original effects are published once.
The callee Get of a reflective operation has its own mutation component. Authenticated standard
data descriptors and their preserved source prefix can establish that component independently
of the later descriptor mutation Call. A completed own-member installation remains a real
write, with its selected value and getter effects consumed by the later member Get. Neither
relation makes an unresolved callee, argument, body or prototype alternative neutral.
A qualified namespace read of a selected source ES-module function export has a separate
read-mutation component. Its bounded proof checks the actual import receiver, current selected
export and dependency route. It does not certify module initialization, snapshot mutable export
values or authorize the returned function's body. CommonJS, declaration-only and incomplete
selected routes receive no such component.

A finite closed module prefix can retain one initialized module `const` object cell in a zero-parameter ordinary arrow. Capture creation obtains the actual lexical cell from the defining prefix. Body reads use that same cell and the current storage branch, while own writable data-field assignment uses the existing reference and Set owners. The local-cell environment rule remains separate. Exactly two consecutive indexed zero-argument Calls to the same captured arrow can continue on the first actual Call's output branch. Each enters a fresh activation and retains its own receipt, while both use the original captured cell and object. Continuation requires the next original installed operation in the same live generation. Cached or released history cannot resume it. Unknown, external, mutable or multiple captured bindings receive no such source entry. This bounded driver does not admit asynchronous bodies, general closure captures, arbitrary repeated source Calls or new Promise result authority.

A final module `const` initializer can bind the scalar Return of one original zero-argument Call to an admitted zero-formal closed body. The caller allocates the real destination cell before evaluation. It retains the original Call receipt and initializes the destination once on that Call's output storage branch. Throw, residual and unavailable output do not initialize the binding. Other returned-callable shapes, array projection and later invocation keep their separate admission.

A separate finite construction path admits a one-formal module function whose only statement returns a zero-parameter arrow reading a direct member of that formal. The original Call acquires a genuine module object and initializes the original formal cell in its fresh activation. Creation retains that cell and defining environment, with an actual storage marker. The original tagged Return and creation ancestry can bind this callable to the final caller cell. The inner member-read body stays deferred during creation. One immediately following zero-argument Call through that initialized destination can enter the exact inner body from the post-initialization caller branch. It creates a fresh activation and reads the original captured formal cell from current storage before the ordinary member Reference/Get and Return. The original creator Call receipt remains separate from destination initialization. A completed own-DATA Get can cover only its exact captured-field effect demand on that resolved Call edge. Generic summaries, unmatched input obligations and independent effects remain conservative. This finite two-site path does not admit intervening mutation, array projection, arbitrary repeated Calls or general escaping captured-member reads.

A creation-only module prefix can initialize one const with a dense, one-element array
whose element is that same creator Call. Array allocation precedes the original callee and
argument acquisition. The genuine callable Return resumes the same caller storage schedule
through the existing array slot definition, length update and final cell initialization.
The original Call receipt remains distinct from the post-container receipt. Its source Call
slot projects the original pre-container receipt. The inner member-read body stays deferred.
This finite destination adds no later array Get/Call, spread, hole, iterator, exported result
or intervening captured-mutation authority.

A zero-parameter module function declaration is instantiated before lexical initializers. Its actual defining environment retains the original captured Cell while that Cell is still uninitialized. This finite path admits one private synchronous zero-parameter declaration with the same one-const capture and direct one or two no-argument Calls, including Calls before the declaration's text. Instantiation executes no function body. The function binding keeps ordinary mutable storage semantics, and later captured reads use the current initialized Cell. Calls before the captured initializer remain outside this prefix slice.

A qualified closed two-formal arrow can use its actual boolean argument to select a direct read of the second argument's own data field, with a literal alternative. The original acquired Call enters the finalized conditional body schedule before generic traversal. The selected Reference/Get and exact skipped interval produce only their own field-demand coverage after matching body completion. Current descriptor and storage state remain authoritative. Static conditional index entries remain false-once. A consumed generic Get or a lexical reachability result cannot replace the selected continuation. Defaulted formals, typeof predicates, general ordinary-function bodies, accessors, Proxy/unknown receivers and arbitrary conditional nesting receive no additional admission from this finite path. The field outcome is not a normal value, descriptor, target-wide or public-policy proof. Validation observations are optional and inert without a test observer.

A separate finite closed-arrow path supports a capture-free numeric formal with a numeric-literal default and a direct return of that formal, such as `(x: number = 7) => x`. It also supports the exact earlier-formal read shape `(x: number = 7, y: number = x) => y`. A supplied known number bypasses its initializer. An omitted argument or authenticated `undefined` selects it. The existing acquired argument vector, default selector and merge initialize each formal once in declaration order. The second default reads the original initialized first cell in the same activation, before initializing the second cell. Omission does not add an actual argument. Unknown arguments and effectful, callable or throwing initializers retain conservative analysis. This path does not admit general multiple-formal defaults, destructured formals, initializer captures or general default completion. TypeScript's later-formal and self-reference diagnostics remain in force.

A finite normal default can instead read the earlier required object formal: `(input: { value: number }, x: number = input.value) => x`. The original acquired object initializes the first formal before the selected ReadLocal, Member and Get. Omission or genuine `undefined` selects the current own DATA field, then initializes the second formal and returns it. A supplied known number bypasses the Member/Get. Current field writes before the Call remain observable. The annotation supplies no descriptor or purity proof. This coverage belongs only to that original Call and field read. Accessor, inherited, Proxy and unknown receiver alternatives retain their existing effects or conservative refusal. This normal path does not extend the separate finite null GetThrow producer or general throwing defaults.

That normal field default path also admits `(input: { value: number | null | undefined }, x: number = input.value ?? 7) => x`. The earlier formal and own DATA Get execute once before the canonical nullish choice. An explicit own null or undefined value selects the literal `7` right operand, while a non-nullish number, including zero, forwards the actual Get value. A supplied numeric second argument bypasses both the Get and RHS. The inner nullish choice and outer parameter default each retain their own selector and merge. The field projection binds the actual Get independently from the final Return, since null or undefined can produce a Return value of 7. This finite path requires an explicit present own field and literal `7` fallback. It adds no absent-property/prototype inference, accessor or Proxy authority, general initializer Call/Throw, typeof, factory or policy admission.

A qualified closed source arrow can classify an acquired formal with `typeof`, such as `(value: unknown) => typeof value`. Existing Number, Boolean, String, undefined, null, allocated object and constructed callable values produce their usual JavaScript type strings. The acquired category supplies the result independently of the annotation. The operand executes once through its admitted schedule, including its selected conditional path. Classifying an object or callable value performs no property read or invocation. Reads used to obtain the operand retain their own effects, abrupt completion and residual obligations. Source population and original Call associations remain required. BigInt and Symbol VALUE ingress, native-library value transfer, source array-literal arguments and hoisted functions passed to an unrelated arrow remain open in this route. Missing identifiers, TDZ reads and general throwing/default-initializer composition receive no new admission.

One finite abrupt default is also tracked: `(x: number = (null as any).value) => x`. Omission and genuine `undefined` select the actual null Member/Get TypeError before formal initialization or body evaluation. A supplied known number bypasses that Get. The original Call retains its bare Get observation, raw Throw and checked caller exit, with the paid prefix state unchanged. The assertion is erased syntax and provides no runtime safety proof. This inference retains the native error category and producing occurrence, without granting Error-object identity or Normal error-object output. Other receivers, initializer Calls and general throwing defaults remain conservative. This original-Call terminal is separate from successful module-initializer result adoption and from iterator binding/finally routing.

The synchronous iterator binding slice supports empty, one-name and two-identifier patterns with
separately qualified acquisition, step, value and Close outcomes. Two identifiers use ordered
element descriptors and retain each actual initialization record. The second Step reuses the
paid Next acquisition while owning a fresh Call and completion. Exhaustion stays sticky, so a
later target receives undefined without another Next or Close. The two-identifier slice excludes
elisions, rest elements, defaults and loop bindings. Pre-record numeric-method and Getter-Throw
terminals retain their EMPTY/ONE target scope.

An abrupt selected default keeps its
incoming Throw while Close still performs its own Get and Call work. A defined value bypasses
the default. An abrupt default leaves its target uninitialized. A qualified scalar default result
retains its actual pre-initialization receipt and initializes its target once. An exhausted iterator
can select that default without performing Close. A finite two-key own-data alias assignment can
also establish a numeric iterator method. Its completed Get and acquired header establish TypeError
before invocation, iterator-record creation or target initialization. Callable replacements retain
their ordinary protocol Calls. The independent unresolved alternative remains conservative.
For an empty or one-name binding, a qualified computed iterator-method getter can finish with
Throw before the iterator factory is called. A one-name target remains uninitialized in its
authenticated source caller, separate from the Getter activation and the zero context target. Its actual computed key and finished Get receipt remain required.
This role creates no iterator record, step, initialization or Close. Normal getter results and
unfinished first-role diversion remain outside this accepted slice. A tested finish
refusal retains residual transport and historical metadata without granting a finished Get.
The independent unresolved Symbol alternative still prevents selected client/server partitions
from certifying this initializer portable. Unpartitioned emission preserves its ordinary JavaScript
Throw behavior.
These are finite source proofs. General repeated iterator execution, arbitrary computed-key
sequences, other noncallable method categories and normal completion of an invoked default remain
outside this slice.
Qualified source structure alone does not grant execution or artifact pruning authority.

## Advisory analysis cost

Estimated analysis cost helps explain expensive compiler work. It does not restrict source analysis or define TypeScript validity. The application may configure `analysis.estimatedCostWarningThreshold` in `exact.config.ts`, using a positive safe integer or `false` to disable the warning. The default is 4096 dimensionless estimate units. They describe estimated work rather than elapsed time or a heap limit.

Nested work contributes to its requesting root query. Diagnostics aggregate the retained project summary into one nonfatal warning for the requested source. A threshold change reclassifies reporting without replaying a body or changing semantic facts. Optional explanation/profile requests can include the estimate. Missing historical measurements remain unavailable.

Actual recursion, structural progress, checked allocation and identity arithmetic, source authority, lifetime and process/transport guards remain enforcing. Their refusal causes stay distinct from advisory cost.

Default source-class construction retains actual instance field outputs only within the live normal operation that produced them. The bounded path covers implicit default constructors and public noncomputed data fields. Construction evaluates arguments and field initializers in source order, while later reads retain descriptor and mutation checks. Unsupported construction output stays incomplete. These live values cannot enter detached descriptor history or generation caches.

Field completion consumes the actual field frame's Call results and preserves the original value and capture scope. A directly returned instance borrows its producing frame through the original caller's result slot until that caller is disposed. Closing either the generation or the input lifetime revokes the borrowed value.

A proven abrupt initializer stops the field sequence. An unavailable Normal value keeps construction incomplete while subsequent ordinary demands contribute only possible effects. Their borrowed prefix retains mutation uncertainty and creates no field values, Get receipts, or complete instance. A conditional nested `new` can retain cached field effects from one authenticated implicit class in the same source and creating lexical region. This effects-only projection preserves arguments and genuine captures without allocating an inner instance or supplying its `this`, prior-field values, prototype proof, or normal receipts. Unknown targets and receiver-dependent work remain incomplete, while independently known effects are retained.

Source effects and return relationships use the canonically selected native alternative and
its original argument cut. An immediate ordinary literal adds no accessor execution during
freeze. Its MAY return keeps the input AST and captures for later getter or setter effects.
Aliases, replacement alternatives, foreign overlapping writes and unavailable inputs retain
their independent uncertainty. Source projection supplies no integrity event, normal output,
descriptor or absence fact, field DATA or NoWrites proof. Source descriptor Top remains Top.
The original Call is excluded only while matching its own input/return relationship, without
excluding other writers. Earlier argument acquisition effects remain at the original Call.
Fixed tuple spreads through an authored freeze alias retain their source getter donors.
Abrupt-expression coverage remains conservative: a known throwing property initializer can
still leave a later accessor as a possible donor. This predates the source freeze relationship
and does not establish successful argument evaluation.

An authenticated native `Object.freeze` Call can publish an integrity event for a finite immediate ordinary object literal. The original argument observation owns its identity and captures. Data members, including shorthand syntax, retain their original value observations and uncertainty. Freeze does not invoke its accessors. Later source reads preserve those accessors, while the same event records nonextensibility, nonconfigurable properties and nonwritable data properties. Unknown or aliased target shapes retain conditional value origins and effects without a completed freeze event. Primitive targets remain conservative rather than being assigned an Object.defineProperty-style throwing law.

This source event supplies no typed-store allocation or source-body entry. Blocked source writes, deletion and incompatible redefinition retain incomplete completion instead of publishing successful mutation. Reflect and strict native outcomes remain distinct. Setter execution keeps its ordinary owner. An authenticated completed freeze event preserves its own accessor payload even when the enclosing property view has unresolved obligations. This operation-local fact prevents freeze itself from adding spurious setter opacity. It supplies no body purity or value completion, and independent unknown calls, arguments or setter effects remain uncertain.

Definition-only, immutable hoisted helper calls can contribute their canonical graph edge without constructing occurrence results when the existing closed-capture and primitive-demand checks apply. Exact immutable formal forwarding uses the same effects-only relation, including a canonical returned render arrow that forwards its enclosing definition's formal. The graph solver retains known effects, unresolved input obligations and parameter writes. Moving an unavailable return value retains value incompleteness separately from execution opacity. Coercion keeps its own unknown effects. Defaults, rest inputs, replaced bindings, unrelated captures, asynchronous results and other value consumers keep their ordinary owners. This does not supply a runtime result, a NoWrites proof, an actual Call receipt or authority to share actual calls.
