# Trusted language-service contributions

## Status

**Implemented.** This document defines the generic package protocol through which
trusted framework plugins and enhancement libraries can improve eXact language tooling without
registering compiler visitors or coupling the compiler to individual packages. The examples are
illustrative; this proposal does not require an accessibility or internationalization package to
exist, use particular public names, or receive privileged treatment. Configuration names,
projection fields, transport, limits, trust behavior, and delivery ownership are fixed below for the
first implementation.

## Decision

Add a versioned eXact language-extension protocol with two participation levels:

1. **Declarative contributions** are bounded, inert data describing namespaces, activators, target
   constraints, value vocabularies, relationships, documentation, diagnostics, and safe edit
   recipes. The language host validates this data and evaluates a fixed predicate vocabulary.
2. **Trusted analyzers** are optional executable providers for semantics that cannot be represented
   faithfully as finite data. They run behind a serialized, cancellable protocol in an isolated
   worker process and receive stable language projections rather than compiler implementation
   objects.

The eXact LSP owns editor discovery, scheduling, aggregation, and presentation. The compilation host
uses the same discovery, trust, diagnostic protocol, and provider configuration. An enabled
provider's source-located `error` is therefore an ordinary compilation error and prevents that build
generation from being published. Correctness checks do not drift between the editor and CI. Neither
contribution level can transform compiler output, register an AST visitor, suppress another
provider's diagnostic, or mutate application state.

Language participation is its own configured role. Trusting a package for build, server, runtime,
or component-library execution does not silently authorize its language analyzer. Conversely,
ignoring a language contribution does not remove the package's build or runtime behavior. The role
has an independent ignore list with per-capability controls.

## Why this belongs in the framework

Enhancements deliberately move useful semantics into independently shipped component libraries.
Framework plugins likewise own cross-cutting contracts that the standard compiler should not need
to understand. TypeScript can validate their public types, and the existing enhancement metadata
can identify canonical activators, but types alone cannot explain relationships such as:

- an activator that is valid only on a finite set of intrinsic elements or roles;
- two activators that must appear together or must not be combined;
- a literal value drawn from a versioned standards vocabulary;
- an ID relationship that is invalid only within a compiler-finite rendered branch;
- a source expression whose branches carry package-defined semantic intent; or
- a configuration value that changes the package's completion and validation domain.

Hard-coding each package into the compiler makes the compiler a registry of optional product
features. Allowing arbitrary callbacks inside the compiler or LSP creates an unstable API and a
supply-chain execution boundary with poor failure isolation. A bounded language-extension host
keeps package expertise with the package while preserving compiler ownership and editor stability.

## Goals

- Let any trusted plugin or enhancement library publish first-class diagnostics, completions,
  hovers, inlay hints, and source edits.
- Keep routine participation declarative, deterministic, bounded, and safe to inspect before code
  execution.
- Support JavaScript and native-backed analyzers through one runner protocol and adapter contract.
- Give editor diagnostics and CI validation identical provider versions, codes, and semantic
  results.
- Report package-known misuse as ordinary compilation errors before an invalid output generation is
  published.
- Preserve document-version, cancellation, and stale-result guarantees across provider boundaries.
- Discover only packages relevant to the current application and document rather than scanning all
  installed dependencies.
- Make trust, ignores, failures, timings, and provenance visible to developers.
- Allow applications to disable one language role without disabling an otherwise useful package.
- Keep the standard compiler independent of package-specific message, accessibility, design-system,
  routing, or domain rules.

## Non-goals

- A public compiler AST plugin API.
- Compiler-output transformation, JSX lowering, macro execution, or generated runtime imports.
- Letting a diagnostic provider alter compilation plans, even when its error gates publication.
- Automatically executing every language entry found in `node_modules`.
- Treating a worker process as a security sandbox for untrusted JavaScript or native code.
- Allowing providers to read or modify another provider's private state.
- Letting providers suppress core TypeScript or eXact diagnostics.
- Replacing package types, browser-based accessibility tests, catalog validation, or runtime
  validation at trust boundaries.
- Arbitrary editor commands, shell commands, network calls, or writes disguised as code actions.
- A general replacement for the Language Server Protocol.

## Ownership

| Concern                                                            | Owner                              |
| ------------------------------------------------------------------ | ---------------------------------- |
| TypeScript syntax, types, symbols, and module resolution           | TypeScript-Go language service     |
| Universal eXact component and compiler invariants                  | Standard compiler and eXact LSP    |
| Language contribution schema and serialized analyzer protocol      | `@exactjs/language-extension-api`  |
| Discovery, trust, process lifecycle, budgets, and aggregation      | `@exactjs/language-extension-host` |
| Neutral package graph, integrity, selectors, and export resolution | `@exactjs/package-provenance`      |
| Package-specific rules and explanations                            | Contributing package               |
| Shared application policy and CI-equivalent ignores                | `exact.config.ts`                  |
| Presentation-only local preferences                                | Editor settings                    |
| Applying a proposed workspace edit                                 | Editor after explicit user action  |

These package names and ownership boundaries are accepted for protocol 1. The contracts remain
independent from renderer, DOM, server, and browser packages. Existing package-graph, selector,
integrity, and public-export resolution code in plugin and component-library hosts moves into
`@exactjs/package-provenance`; the language host consumes that shared implementation instead of
creating a third resolver.

All three packages are development-time Node tooling. They are absent from client manifests and
browser bundles, and package export conditions do not provide browser entries. "Serialized" and
"JSON-safe" describe the protocol boundary, not a browser runtime target.

## Participation and discovery

### Package declaration

A participating package publishes inert metadata under its `exact` package-manifest field. This is
separate from framework-plugin participation so an enhancement-only component library can
participate without pretending to be a plugin:

```json
{
	"name": "@scope/example-enhancements",
	"exports": {
		"./language": "./dist/language.js",
		"./exact-language.json": "./dist/exact-language.json",
		"./language-data.json": "./dist/language-data.json"
	},
	"exact": {
		"language": {
			"schemaVersion": 1,
			"declarative": "./exact-language.json",
			"analyzer": {
				"protocolVersion": "^1.0.0",
				"subpath": "./language",
				"capabilities": ["diagnostics", "completions", "hover", "codeActions"],
				"projection": ["sourceText", "enhancements", "jsx", "types"],
				"data": ["./language-data.json"]
			}
		}
	}
}
```

Protocol 1 allows one provider per physical package instance. Its canonical provider ID is the
resolved package name; packages cannot author or impersonate another ID. Supporting multiple
providers later requires a protocol revision with package-qualified suffixes. Paths must be public
package subpaths, resolve inside the selected package, and match its version and lockfile integrity.
Unknown manifest keys, incompatible protocol versions, and disagreement between dependency copies
are errors before executable code loads.

The manifest-declared analyzer capabilities are limited to `diagnostics`, `completions`, `hover`,
`inlayHints`, and `codeActions`. Its projection requirements are limited to `sourceText`, `imports`,
`components`, `enhancements`, `jsx`, `expressions`, `types`, and `projectGraph`. The analyzer cannot
claim a capability or projection after launch that was absent from this inert declaration.
Optional `data` entries are public package subpaths included in generation hashing and watch
invalidation. They do not grant access to arbitrary workspace paths.

The JSON-safe declaration contract is:

```ts
interface ExactLanguageDeclarationV1 {
	readonly schemaVersion: 1;
	readonly declarative?: string;
	readonly analyzer?: {
		readonly protocolVersion: string;
		readonly subpath: string;
		readonly capabilities: readonly ExactLanguageAnalyzerCapability[];
		readonly projection: readonly ExactLanguageProjectionCapability[];
		readonly data?: readonly string[];
	};
}
```

At least one of `declarative` or `analyzer` is required. All subpaths use the existing public-package
subpath grammar (`.` or `./name`, with no traversal, absolute path, condition selection, or private
filesystem entry). The factory export is fixed in protocol 1 so manifests cannot select arbitrary
module values. A participating package must directly declare a compatible
`@exactjs/language-extension-api` dependency or peer dependency; a transitive dependency does not
authorize participation.

Framework plugins may declare the same language participation record alongside their ordinary
plugin declaration. The language host does not use the plugin's build, server, render, client, or
testing projections, and it does not call the plugin's build/server factory to obtain language
participation.

### Reachability

The host discovers candidates from two bounded sources:

- package provenance of attributed enhancement imports in the current document and package-scoped
  enhancement imports declared by its owning `exact.config.*`; and
- the application's already-selected framework-plugin graph.

It does not crawl every transitive package looking for language code, and an ordinary API import is
not an enhancement-language opt-in. A declarative contribution may be loaded when an attributed
document import, package-scoped config export, or selected plugin graph makes its package relevant.
An analyzer is started lazily only when an enabled capability has a request it can answer.

Removal of the final relevant attributed import, package registration, plugin selection, or project reference releases that
candidate after in-flight requests settle or are cancelled. Lockfile, package manifest,
configuration, declaration, analyzer binary, and generated-data changes invalidate the provider
generation.

Each relevant physical package instance receives an internal key derived from real path, name,
version, and integrity and may own one process per workspace. Diagnostics retain the stable
package-name provider ID so codes do not change across upgrades; provenance records the physical
instance. Two versions may validate their own imported activations in one project. A project-wide
request is sent only to the instance selected by resolved plugin or entry-package provenance, never
to an arbitrary nearest copy.

Protocol 1 introduces no separate signature for declarative metadata. Published packages use the
resolved lockfile integrity that already covers package contents. The host additionally hashes the
manifest declaration, declarative file, and resolved analyzer entry into the provider generation and
cache key. Linked/root packages without registry integrity are eligible only through root or
explicit analyzer trust and use those content hashes for invalidation, not as a substitute trust
claim. A future signed-provider ecosystem can add signatures without changing diagnostic semantics.

## Declarative contribution format

The declarative document is JSON-shaped, versioned, size-bounded, and contains no expressions or
regular expressions supplied for arbitrary execution. It may define:

- enhancement namespaces, canonical components, activator aliases, payload kinds, and descriptions;
- supported intrinsic targets, required roles, forbidden roles, and transparent-boundary support;
- finite string and numeric vocabularies with deprecation and replacement metadata;
- `requires`, `excludes`, `oneOf`, and finite implication relationships;
- required authored fallback properties and target properties contributed by an activator;
- static literal, nonempty-string, ID-token-list, and finite object-shape predicates;
- stable diagnostic codes, default severity, messages with finite named fields, and documentation
  links;
- completion items, hover sections, and inlay-hint templates; and
- safe edit recipes such as adding an import, replacing a deprecated literal, or inserting a
  required companion activator whose value is already known.

The host, not the package, implements every predicate and edit recipe. Schema limits bound document
bytes, entries, graph depth, message length, related spans, completion count, and edit count. Cycles
in implication or requirement graphs are rejected unless the schema explicitly models an atomic
group.

Protocol-1 limits are a 256 KiB declarative file, 2,048 total declarations, 16 levels of JSON or
rule nesting, 1,024 graph edges, 4 KiB per message or hover section, 500 completion items per
request, 500 diagnostics per document, and 2,000 diagnostics per provider/project. Predicate names
come from the API's closed enum; strings are exact or Unicode-normalized finite values. Package
regular expressions, JavaScript expressions, templates with property access, and unbounded glob
evaluation are invalid. These limits are host constants, not package-configurable hints.

The file begins with `schemaVersion: 1`, `provider` equal to the resolved package name, and a
`capabilities` object containing only the declarative roles it implements. Every diagnostic
declaration owns a provider-local code, default severity, summary, explanation, documentation URL,
and optional fixed recipe ID. The host prefixes the canonical provider ID and rejects duplicate
codes or recipe IDs.

Declarative providers cannot claim facts the compiler projection does not contain. A rule may test
that a target is a known `button`; it may not claim that an opaque component eventually renders one.
Uncertainty produces no error unless a generic eXact contract independently requires certainty.

## Executable analyzer protocol

### Process boundary

Trusted analyzers run in a reusable provider process rather than the LSP or compiler process. A
host-owned Node runner resolves the declared public subpath from the selected physical package,
imports only the fixed `createExactLanguageAnalyzer` export inside that child, and speaks
newline-delimited JSON over
stdio. Each line is one UTF-8 JSON request, response, or notification with `protocol`, `id`, and
`method` fields. Embedded newlines are ordinary JSON escapes. Stdout is reserved for protocol
frames; stderr is bounded diagnostic logging.

Protocol 1 deliberately has one launch descriptor: an exported JavaScript factory run by the
host-owned child. A native analyzer supplies a small JavaScript adapter that resolves and owns its
platform executable, as the existing native compiler adapters do. The adapter may forward the same
requests to its native process, but direct arbitrary command/argument declarations do not enter
package metadata in protocol 1. This avoids shell parsing, platform templates, and separate trust
rules while supporting native implementations immediately.

Process isolation protects LSP availability and memory ownership; it is not a security sandbox. A
trusted analyzer can import Node APIs or launch its declared native dependency, so authorization
remains a package trust decision. The runner starts with the workspace root as metadata, not as its
current directory; its working directory is the provider package root.

The initial protocol supports:

- `initialize` with protocol, workspace, provider, capability, locale, and configuration facts;
- `analyze` for document or project diagnostics;
- `complete` for an explicit cursor location and trigger;
- `hover` for one source position;
- `inlayHints` for one visible source range, optionally with bounded source ranges proving the
  summarized inference;
- `codeActions` for selected diagnostics and a requested range;
- `invalidate` for changed configuration, package data, or compiler facts;
- `cancel` for every outstanding request; and
- `shutdown` followed by bounded process termination.

Requests and responses use monotonically increasing host request IDs. Notifications omit `id`.
`cancel` names the original request ID; providers must stop producing a result, and the host discards
any response regardless. Protocol version compatibility uses semver with an equal major version and
a host version satisfying the provider's declared range. Initialization returns the subset of
manifest-declared capabilities actually available; returning a new capability is a protocol error.

Rename, formatting, arbitrary commands, and direct file creation are excluded from protocol 1.
Providers may return workspace edits only through `codeActions`; the host validates those edits
before the editor offers them.

The module factory and child-local interface are:

```ts
export function createExactLanguageAnalyzer(
	context: ExactLanguageAnalyzerContext
): ExactLanguageAnalyzer | Promise<ExactLanguageAnalyzer>;

interface ExactLanguageAnalyzer {
	diagnostics(
		request: ExactLanguageDiagnosticsRequestV1,
		signal: AbortSignal
	): Promise<readonly ExactLanguageDiagnosticV1[]>;
	complete?(
		request: ExactLanguageCompletionRequestV1,
		signal: AbortSignal
	): Promise<readonly ExactLanguageCompletionV1[]>;
	hover?(
		request: ExactLanguageHoverRequestV1,
		signal: AbortSignal
	): Promise<ExactLanguageHoverV1 | undefined>;
	inlayHints?(
		request: ExactLanguageInlayHintRequestV1,
		signal: AbortSignal
	): Promise<readonly ExactLanguageInlayHintV1[]>;
	codeActions?(
		request: ExactLanguageCodeActionRequestV1,
		signal: AbortSignal
	): Promise<readonly ExactLanguageCodeActionV1[]>;
	invalidate?(generation: number): void | Promise<void>;
	dispose?(): void | Promise<void>;
}
```

The runner owns `initialize`, request dispatch, cancellation controllers, result framing, and
shutdown. Package code implements domain operations, not transport. The analyzer context contains
only provider/package provenance, protocol version, enabled roles, validated JSON configuration,
workspace metadata, and declared data-file URLs.

### Stable language projection

An analyzer never receives a TypeScript compiler node, checker, program, filesystem handle, or LSP
connection. Requests contain versioned data such as:

```ts
interface ExactLanguageProjectionV1 {
	readonly protocol: 1;
	readonly generation: number;
	readonly project: {
		readonly root: string;
		readonly kind: 'configured' | 'inferred';
		readonly configFile?: string;
	};
	readonly document: {
		readonly uri: string;
		readonly path: string;
		readonly version: number;
		readonly textHash: string;
		readonly text?: string;
	};
	readonly imports: readonly ExactResolvedImportV1[];
	readonly components: readonly ExactComponentLanguageFactV1[];
	readonly enhancements: readonly ExactEnhancementActivationV1[];
	readonly jsx: readonly ExactJsxLanguageFactV1[];
	readonly expressions: readonly ExactExpressionLanguageFactV1[];
	readonly configuration?: ExactJsonValue;
}
```

All ranges are half-open UTF-16 offsets, matching the existing compiler language-service and LSP
projection. URIs are canonical file URIs; `path` is absolute for the trusted analyzer and never used
as protocol identity. The concrete protocol-1 records are:

- `imports`: authored specifier/range, type/runtime kind, resolved file, and resolved package name,
  version, integrity hash, and public subpath when available;
- `components`: compiler component ID, authored name/ranges, placement, artifact targets, and finite
  render-edge IDs;
- `enhancements`: authored namespace/activator and ranges, canonical enhancement identity, resolved
  module/export/package provenance, target JSX ID, owner component ID, payload expression ID, and
  whether the activation is direct, `_`, `_target`, or propagated;
- `jsx`: stable element ID, full/opening/tag ranges, intrinsic/component/fragment/target kind,
  intrinsic tag or component ID, owner component ID, and source-ordered attribute facts;
- `expressions`: stable expression ID/range, syntax kind, constant JSON value when proven, referenced
  symbols, reactive dependencies, and effect classification; and
- `types`: expression ID plus a normalized union of `string`, `number`, `bigint`, `boolean`, `null`,
  `undefined`, `array`, `object`, `function`, `date`, `temporal-duration`, and `unknown`, with
  package/export provenance for recognized nominal values.

Attribute facts include namespace, local name, full/name/value ranges, `boolean`, `string`,
`expression`, or `spread` value kind, and a constant value only when TypeScript-Go proves a finite
JSON-shaped result. Project-graph projection adds compiler-finite module imports, component render
edges, and package instances; it does not serialize arbitrary TypeScript symbols or every source
file.

An enhancement component may document a finite optional prop with `@exact analyzer-only`. Such a
field remains typed source evidence in these projections but is excluded from renderer selection,
activation records, and emitted props. The compiler understands only that generic lifecycle; the
provider owns the field's domain meaning. This prevents structural labels such as a hypothetical
message fragment name from specializing the compiler for one package.

Most fields project existing native analysis. The standard compiler adds one generic
`enhancementActivations` analysis record joining the JSX attribute already observed by the frontend
to the canonical enhancement identity/module/export already used by renderer registration. This is
not package-specific semantics and becomes the authoritative activation/provenance seam for build,
LSP, and language providers.

The exact records live in `@exactjs/language-extension-api`, use stable semantic IDs, and grow only
additively within protocol 1. Removing or changing a field requires protocol 2. Expressions expose
only facts requested in the manifest; they do not serialize the compiler program. The host rejects
an unavailable or overbroad projection before starting the provider.

`sourceText` is an explicit manifest projection and places the current document text in
`document.text`; otherwise it is omitted. Project analysis receives one projection per included
document rather than an unbounded text dictionary. The host sends only the requested open document
or compiler-finite related files, never secrets, environment variables, generated credentials, or
arbitrary workspace files. Because executable providers are trusted rather than sandboxed, this
projection boundary primarily creates API stability and auditable intent, not a claim of perfect
data confinement.

### Results

Diagnostics include:

- package-owned code, rendered as `<provider-id>/<code>`;
- `error`, `warning`, `information`, or `hint` severity;
- document version, primary source range, message, and optional related ranges;
- stable fingerprint inputs for editor deduplication;
- optional standards/documentation URL;
- tags such as deprecated or unnecessary; and
- the capability and provider generation that produced the result.

Providers cannot emit a diagnostic in another provider's namespace, alter a core diagnostic, or
return raw HTML for presentation. Markdown is parsed through the host's restricted renderer.
Duplicate results from declarative and executable parts of the same provider collapse by
fingerprint; diagnostics from different owners remain independently visible.

Completions and hovers carry package provenance so the UI can explain their source. Inlay hints may
attach bounded evidence ranges; the host validates them against the current document and an editor
may render them as unobtrusive underlines with provider-attributed hover explanations. Important
inlays and their evidence are enabled by default, with shared provider policy and editor-local
settings able to suppress that presentation role without weakening diagnostics.

## Trust and configuration

Language execution uses a dedicated policy in `exact.config.ts`:

```ts
export default {
	languageExtensions: {
		analyzers: {
			mode: 'trusted',
			allow: [{ package: '@company/design-system', version: '^3.0.0' }],
			deny: [],
			trustedScopes: ['@company/'],
			includeDefaultTrustedScopes: true
		},
		ignore: [
			{ package: '@vendor/legacy-enhancements', roles: ['analyzer'] },
			{ provider: '@company/design-system', roles: ['inlayHints', 'codeActions'] }
		],
		providers: {
			'@company/design-system': { strictTokens: true }
		},
		diagnostics: {
			providerFailures: 'error',
			ignore: [{ provider: '@company/design-system', codes: ['legacy-tone'] }],
			severity: [
				{ provider: '@company/design-system', codes: ['deprecated-tone'], severity: 'warning' }
			]
		}
	}
};
```

The public configuration types are:

```ts
type ExactLanguageExtensionRole =
	| 'declarative'
	| 'analyzer'
	| 'diagnostics'
	| 'completions'
	| 'hover'
	| 'inlayHints'
	| 'codeActions';

type ExactLanguagePackageRule = string | { package: string; version?: string; integrity?: string };

interface ExactLanguageExtensionsConfig {
	analyzers?: {
		mode?: 'off' | 'root' | 'trusted' | 'all';
		allow?: readonly ExactLanguagePackageRule[];
		deny?: readonly ExactLanguagePackageRule[];
		trustedScopes?: readonly string[];
		includeDefaultTrustedScopes?: boolean;
	};
	ignore?: readonly ExactLanguageIgnoreRule[];
	providers?: Partial<ExactLanguageProviderConfigRegistry>;
	diagnostics?: {
		providerFailures?: 'error' | 'warning';
		ignore?: readonly ExactLanguageDiagnosticSelector[];
		severity?: readonly (ExactLanguageDiagnosticSelector & {
			severity: 'error' | 'warning' | 'information' | 'hint';
		})[];
	};
}

type ExactLanguageIgnoreRule = (
	| { package: string; version?: string; integrity?: string; provider?: never }
	| { provider: string; package?: never }
) & { roles: readonly ExactLanguageExtensionRole[] };

interface ExactLanguageDiagnosticSelector {
	provider: string;
	codes: readonly string[];
	paths?: readonly string[];
}
```

`ExactConfig` gains `languageExtensions?: ExactLanguageExtensionsConfig`. The provider registry is
an empty augmentation interface, following the existing plugin configuration registry pattern.

These are the protocol-1 property names. `ExactConfig.languageExtensions` is owned by
`@exactjs/config`; provider-specific values are typed through an augmentable
`ExactLanguageProviderConfigRegistry` exported by `@exactjs/language-extension-api` and must be
finite JSON after configuration evaluation. Functions, symbols, class instances, secrets, and
server-only configuration are rejected before projection.

`analyzers.mode` is `trusted` by default. `off` runs no executable analyzer, `root` permits only the
application package, `trusted` permits the root plus matching allow/default-scope rules, and `all`
permits every relevant analyzer not denied. `deny` always wins. `allow` and `deny` entries use the
existing package/version/integrity rule shape. `trustedScopes` values are npm scopes ending in `/`;
the sole default trusted scope is `@exactjs/`, included unless
`includeDefaultTrustedScopes: false`. Declarative files are inert and may load from any relevant
package, but remain removable through the `declarative` ignore role.

`pluginDiscovery.ignore` continues to control plugin participation and is not reused for language
behavior. An application may want a plugin at runtime without its analyzer, or editor assistance
from an enhancement whose runtime selection is optional.

The initial ignore-role vocabulary is:

- `declarative`;
- `analyzer`;
- `diagnostics`;
- `completions`;
- `hover`;
- `inlayHints`; and
- `codeActions`.

Ignoring `analyzer` retains declarative assistance. Ignoring `diagnostics` disables both declarative
and analyzer diagnostics while leaving other roles available. Ignoring `declarative` also removes
metadata-backed completion and hover results, but does not implicitly authorize or disable an
analyzer.

An ignore entry names exactly one `package` selector or exact canonical `provider` ID plus one or
more roles. A package selector is an exact npm package name or a scope ending in `/`; wildcards and
regular expressions are not supported. Optional `version` or `integrity` fields constrain a package
entry rather than being embedded in its selector string.

Diagnostic ignores name an exact provider, one or more exact codes (or the single value `*`), and
optional project-relative POSIX `paths`. A path is an exact file or a directory prefix ending in
`/`; protocol 1 has no glob syntax. Severity overrides use the same provider/code/path selector and
choose `error`, `warning`, `information`, or `hint`. Rules are normalized and applied in authored
order, with the last matching severity override winning; ignore always wins. The CLI summary and LSP
status show every matched rule and its configuration source.

Shared configuration is authoritative for CI and produces a visible LSP status entry when a
correctness provider or diagnostic code is ignored. Editor-local settings may additionally hide
completions, hover sections, hints, or code actions, but may not change project diagnostic results
reported by `exactc --check`. Protocol 1 defines no source-level diagnostic suppression syntax;
applications use the shared provider/code/path selectors instead.

Declarative metadata from a relevant package is safe to parse automatically but still subject to
the role ignore list and resource bounds. Executable analyzers require an allow decision under the
language policy. Default trusted prefixes may include first-party eXact packages, but that default
must be visible and removable; installation alone never grants third-party execution.

### Provider configuration projection

An enhancement-only provider receives its JSON value from
`languageExtensions.providers[providerId]`, or `undefined`. A framework plugin may additionally add
an optional `languageConfig(config, context)` method to its existing config controller. The plugin
host evaluates that method beside `buildConfig` and other projections, validates the result as
finite secret-free JSON, and exposes it only to the language host. An explicit
`languageExtensions.providers` value replaces that plugin projection rather than deep-merging it,
so configuration precedence is understandable.

The language host never serializes the whole `ExactConfig`, plugin config transforms, server
projection, or environment. Enhancement-only providers do not gain plugin configuration execution,
and analyzer trust does not authorize a plugin's other entries.

### Workspace and editor trust

Protocol 1 adds no package-specific trust prompt. The editor supplies the existing
`workspaceTrusted` initialization option. When it is not exactly `true`, the language server keeps
its current behavior: it does not load `exact.config.ts`, the workspace compiler binary, package
declarations, runners, or analyzers. Editors without a native workspace-trust UI must require an
explicit user setting that sends `workspaceTrusted: true`; opening a folder is insufficient.

Inside a trusted workspace, `exact.config.ts` is the only authority for executable analyzer trust.
The VS Code extension may offer a code action that opens or edits that configuration, but an LSP
message cannot grant trust for the session. This makes the decision reviewable, source-controlled,
and identical in editors and CI. Editor-local settings can disable presentation roles but cannot
enable an analyzer denied by shared configuration.

## LSP orchestration

For each project generation, the LSP:

1. resolves TypeScript project configuration and eXact configuration;
2. derives relevant enhancement packages and selected framework plugins;
3. validates language declarations, trust decisions, ignores, versions, and integrity;
4. evaluates enabled declarative rules over the current compiler language facts;
5. lazily starts trusted analyzers needed by the requested language role;
6. sends immutable, versioned projections with cancellation identifiers;
7. discards responses for stale documents, provider generations, or configurations;
8. validates, bounds, sorts, and merges returned results; and
9. publishes results with provider provenance and health information.

Core and TypeScript diagnostics are computed independently and always retain authority. A provider
cannot delay their publication. Fast declarative results may appear before analyzer results; the
LSP replaces only that provider's previous generation when its analyzer settles.

Ordering is deterministic by document range, severity, provider ID, and diagnostic code. Provider
dependency order affects initialization/configuration only, never diagnostic precedence. A package
cannot require its diagnostics to hide or rewrite another package's output.

### Integration with the current language server

`ExactLanguageWorkspaceManager` owns one language-extension host beside each retained compiler
language service. Synchronization first updates the native compiler generation, then passes its
immutable inspection/projection to the extension host under the same document version and abort
signal. Closing a document releases its provider snapshot; removing a workspace disposes provider
processes after compiler cancellation.

Core diagnostics remain publishable as soon as compiler inspection finishes. Provider diagnostics
are published per provider generation and replace only that provider's prior results. The LSP
diagnostic `source` becomes `eXact` for core results and the canonical provider ID for package
results; the full code remains `<provider>/<code>`. Hover, completion, hints, and code actions merge
through the same provenance-aware host. Completion trigger characters add `:`, single quote, and
double quote to the existing set, while manual completion always queries enabled providers.

`exact/projectStatus` gains provider instance, version, trust source, enabled/ignored roles, health,
generation, duration, and stale-state records. No new package-specific LSP method is introduced.
The current `workspaceTrusted` initialization value gates configuration and provider execution as
described above.

## Compilation and LSP parity

### Compilation validation phase

Enabled diagnostic providers participate in compilation as validators, not transformers. The
compiler remains a pure source compiler and does not load providers. A shared Node-side compilation
host coordinates this ordered pipeline:

1. TypeScript-Go analyzes the program and eXact produces its portable source facts.
2. Core TypeScript and eXact diagnostics are retained independently.
3. The language-extension host discovers relevant providers, evaluates declarative rules, and
   awaits enabled trusted analyzers against immutable facts for that generation.
4. The host validates and merges provider diagnostics with package provenance.
5. Any unsuppressed `error`, whether core or provider-owned, rejects the generation.
6. Only a successful generation is published as build output, HMR state, package output, or a clean
   `exactc --check` result.

Compiler output may be prepared or cached while providers run, but it remains staged and cannot be
reported or served as successful until the diagnostic gate passes. Provider results never return as
AST mutations and never cause package-defined lowering. In development, a rejected generation
leaves the previous valid application running and reports the new source errors rather than
publishing partially validated HMR.

This lets an enhancement reject an invalid activator combination, or a plugin reject incorrect
configuration or source usage, precisely when compilation proves that package is relevant. It does
not make the package part of compiler implementation.

The existing file and artifact compilers currently write as they iterate. Implementation splits
their internal operation into `prepare` and `publish` owners: preparation reads source and produces
the existing in-memory transform/artifact results plus language facts; publication creates output
directories and writes the accepted results. Public convenience APIs preserve their current
behavior when no language host is requested. `exactc` and official adapters use the two-phase path
whenever language providers are present. This is a normal host validation barrier, not a callback
from compiler code into a package.

For Vite, Webpack, and Bun, per-document providers validate the in-memory transform before it is
returned. Project providers receive the adapter's shared generation at the normal build validation
barrier. Production output fails before final publication. During development, a document error
rejects that HMR update and a project error invalidates the candidate generation while retaining the
previous valid graph. All adapters consume one `@exactjs/language-extension-host` session; none
implements discovery, trust, or provider lifecycle itself.

### Shared hosts

The shared language-extension host wraps compiler facts for:

- `exactc --check` and editor project diagnostics;
- Vite, Webpack, and Bun validation phases for every selected diagnostics provider;
- package publication checks; and
- test fixtures that assert provider diagnostics.

The same provider version, integrity, config projection, language projection, and diagnostic request
must produce the same semantic diagnostics in LSP and CI. Presentation-only ordering and editor
capability filtering may differ. A build adapter must call the shared host rather than implementing
provider discovery or analyzer invocation itself.

Ignoring a correctness diagnostic in shared configuration affects both LSP project diagnostics and
CI. Editor-local hiding does not. CI records ignored providers and codes in its validation summary
so a green build cannot silently imply that every installed package check ran.

Packages may classify diagnostics as recommended errors, but application policy determines whether
provider infrastructure failure itself fails a build. By default, failure or timeout of a trusted,
enabled diagnostics analyzer produces a compilation error stating that validation did not complete;
shared configuration may deliberately change provider failures to warnings. This is distinct from
a semantic error successfully returned by the provider, which follows its configured diagnostic
severity. A package cannot make installation permanently block the editor or CLI by declaring its
analyzer infallible.

## Failure isolation and performance

Providers are lazy, long-lived per workspace generation, and disposable. The host enforces:

- one active diagnostics request per provider/project, with newer requests cancelling older ones;
- separate short interactive budgets for completion and hover and longer background budgets for
  diagnostics;
- response byte, item-count, related-range, and workspace-edit limits;
- bounded stdout framing and stderr capture with secret-safe truncation;
- process exit, timeout, invalid-data, and protocol-violation reporting;
- exponential restart backoff and quarantine after repeated failures; and
- reverse-order shutdown when a workspace, project, or provider generation is released.

Protocol-1 defaults are:

| Operation                       |                Deadline |                            Result bound |
| ------------------------------- | ----------------------: | --------------------------------------: |
| Process initialization          |               5 seconds |                             1 MiB frame |
| Completion or hover             |    150 ms soft deadline |                       500 items / 1 MiB |
| Inlay hints                     |    500 ms soft deadline |                     1,000 hints / 1 MiB |
| Code actions                    |  1 second soft deadline |          100 edits / 1 MiB changed text |
| Open-document diagnostics       |               5 seconds |                 500 diagnostics / 4 MiB |
| Compilation/project diagnostics | 30 seconds per provider |               2,000 diagnostics / 8 MiB |
| Cancellation grace              |                  500 ms |      provider is restarted after expiry |
| Graceful shutdown               |               2 seconds | process tree is terminated after expiry |

Interactive soft deadlines return the core and already-available package results without treating
the provider as failed; late responses are discarded by request ID. Diagnostics and initialization
deadlines are hard failures. At most one diagnostic request and four interactive requests are active
per provider process. New document diagnostics cancel the previous document generation.

The host launches the JavaScript runner with a 256 MiB V8 old-space limit. It cannot promise a
portable hard resident-memory sandbox for native grandchildren, so byte limits, deadlines, process
tree termination, and trust remain authoritative. Three crashes, protocol violations, or hard
timeouts within 60 seconds quarantine that provider generation after restart delays of 250 ms, 1
second, and 4 seconds. It remains quarantined until its package/configuration generation changes or
the developer explicitly retries it from language status.

A slow or failed provider never blocks TypeScript or core eXact results. Interactive requests may
return without that provider after their deadline. Background diagnostics retain the previous valid
provider generation until a replacement succeeds or configuration disables it; the LSP exposes that
the result is stale rather than presenting it as current.

Provider caches key at least package version and integrity, analyzer protocol, relevant
configuration hash, document/project version, compiler fact version, and declared data inputs. The
host watches only declared inputs. Providers cannot ask the host to watch an unbounded directory.

Compilation uses an explicit bounded deadline rather than waiting forever. If an enabled analyzer
misses it, the provider-failure policy determines whether the generation fails or continues with a
visible warning. The host never treats a timeout as a successful validation result. Protocol-1
deadlines and bounds are fixed framework constants, not application configuration. Changing a limit
requires a later protocol/host release so CI behavior stays portable.

## Code-action safety

Protocol-1 code actions return declarative text edits, never callbacks or commands. The host checks
that:

- every edit targets an open project file inside configured workspace roots;
- source versions still match;
- ranges are nonoverlapping and UTF encoding is valid;
- generated, dependency, lock, credential, and ignored paths are not modified;
- an action does not silently edit package configuration or install dependencies; and
- behavior-changing actions are labeled as such rather than presented as safe fixes.

The editor applies an action only after user selection. Bulk “fix all” is available only for a
provider/code combination whose manifest declares idempotence and whose returned edits pass a
second combined-overlap check.

## Illustrative accessibility use

A hypothetical accessibility enhancement library could declare, without executable code:

- `a11y:focus-scope`, `a11y:labelled-by`, and other finite activators;
- applicable intrinsic/role families;
- required companion options and mutually exclusive navigation modes;
- static ARIA token and ID-list shapes;
- completion documentation pointing authors toward native HTML first; and
- safe replacement of a deprecated finite option.

Its optional trusted analyzer could consume compiler-finite JSX and enhancement facts to diagnose a
known ID reference whose target cannot exist in the same rendered branch, reason about a finite
accessible-name source, or explain why a dynamic relationship is not provable. It would not execute
components, inspect a browser accessibility tree, invent human-facing labels, or register an
accessibility visitor with the compiler.

These examples remain valid if no package with those names is ever published. The protocol knows
only declarative predicates, analyzer capabilities, package provenance, and returned diagnostics.

## Illustrative internationalization use

A hypothetical internationalization package could declare formatter roles, property-message
allowlists, finite option vocabularies, and hover documentation as inert metadata. An optional
trusted native analyzer could provide deeper source-expression inference, message-boundary
validation, placeholder diagnostics, locale-aware completions, and code actions that make already
proven intent explicit.

The analyzer may be implemented in Go, JavaScript, or another supported executable form; the LSP
does not care. It receives the same serialized projection and speaks the same protocol. Translation
catalog contents, generated messages, or runtime formatters do not enter the standard compiler, and
the language host does not assume that an intl package is installed.

## Editor project ownership

An editor workspace may contain several eXact applications. For each document, the language server
selects the nearest `exact.config.*` while walking upward only as far as the containing editor
workspace folder. The config directory owns a compiler session, package enhancement registrations,
and one language-extension host. This keeps trust, ignore rules, catalogs, and provider state from
one monorepo application out of its siblings. Files with no nested configuration remain owned by
the workspace root, and removing that root disposes all nested sessions.

## DevTools and inspection

The LSP status surface lists, per resolved editor project:

- discovered declarative and executable providers;
- package version, integrity, activation provenance, and trust source;
- enabled and ignored language roles;
- analyzer process state, generation, last duration, and last failure;
- diagnostic counts and stale status; and
- configuration files responsible for trust or ignore decisions.

This information may also be exposed through a read-only language-tools inspection command. It must
not expose source text sent to a provider, private analyzer state, environment variables, or
configuration secrets.

## Testing

Protection follows the risk of executing package-owned tooling:

- schema tests reject unknown fields, cycles, excessive sizes, invalid paths, duplicate IDs, and
  unsupported protocols;
- discovery tests cover imported enhancements, selected plugins, dependency duplicates, integrity,
  project references, removal, and invalidation;
- trust tests prove independence from plugin discovery, component authorization, runtime selection,
  and editor-local preferences;
- declarative evaluator tests cover every fixed predicate and edit recipe without package code;
- protocol conformance fixtures run JavaScript and native analyzers through the same request corpus;
- adversarial host tests cover hangs, crashes, malformed frames, oversized results, stale replies,
  cancellation refusal, edit escape attempts, and restart quarantine;
- parity tests feed identical projections to the LSP and compilation host and compare provider
  diagnostic identity;
- compilation-gate tests prove a provider error prevents output/HMR publication, a warning does not,
  and a failed development generation retains the previous valid generation;
- aggregation tests prove deterministic ordering and that providers cannot suppress core or peer
  results; and
- hypothetical accessibility and intl fixtures demonstrate deep validation without adding either
  domain to compiler internals.

## Delivery slices

1. **Declarative foundation:** language manifest, fixed rule schema, package-import discovery,
   diagnostics/completion/hover evaluation, provenance UI, limits, and shared ignores.
2. **Trusted analyzer host:** independent trust policy, stdio protocol, worker lifecycle,
   cancellation, budgets, result validation, failures, and inspection.
3. **LSP and compilation parity:** shared orchestration, project generations, caching, stable
   aggregation, staged-output gates, CI summaries, and adapter integration.
4. **Developer actions:** bounded code actions, inlay hints, editor-local presentation controls, and
   fix-all safety.
5. **Conformance consumers:** generic fixture packages plus illustrative accessibility and intl
   analyzers proving that no compiler special case is necessary.

No executable analyzer ships before slices 1 and 2 pass their trust and adversarial acceptance
tests. Build enforcement does not ship before slice 3 proves editor/CI parity.

## Acceptance criteria

1. An enhancement-only package can contribute useful language metadata without becoming a
   framework plugin or executing code.
2. A trusted plugin or enhancement can provide complex analysis without receiving compiler AST
   objects or running in the compiler/LSP process.
3. The compiler contains no package identity or semantic branch for illustrative accessibility,
   intl, or fixture providers.
4. LSP and compilation diagnostics share provider version, code, ranges, semantics, and shared
   ignores.
5. Language trust and ignore policy remain independent from plugin discovery, runtime activation,
   and component-library authorization.
6. Applications can ignore a whole provider or individual language roles, while editor-local
   presentation settings cannot silently weaken CI validation.
7. Core and TypeScript diagnostics remain available when every external provider is slow, broken,
   malicious, ignored, or absent.
8. Stale, cancelled, oversized, invalid, or out-of-generation provider results never reach the
   editor or build result.
9. Code actions cannot execute commands or edit outside validated application source boundaries.
10. Provider discovery, execution, timing, failures, and ignore provenance are inspectable.
11. Removing all language contributions leaves ordinary TypeScript and eXact compiler behavior
    unchanged.
12. An enabled provider's unsuppressed semantic error rejects compilation before output or HMR
    publication without allowing the provider to alter compiler output.

## Implementation blueprint

The proposal has no remaining product decision that requires user input before implementation. Work
proceeds in this ownership order:

1. **Neutral provenance:** create `@exactjs/package-provenance`; move and reconcile package graph,
   lockfile integrity, selector validation, real-path containment, and public-export resolution from
   plugin-host and component-library policy without changing their behavior.
2. **Public protocol:** create `@exactjs/language-extension-api` with manifest/config/result types,
   strict parsers, declarative schema, fixed predicates, limit constants, and conformance fixtures.
   Extend package participation parsing for `exact.language` without requiring `@exactjs/plugin-api`.
3. **Generic compiler facts:** add protocol-1 enhancement activation facts and the additive language
   projection builder over existing native analysis. Keep package identities and semantic rules out
   of TypeScript-Go.
4. **Configuration:** add the exact `languageExtensions` types above to `@exactjs/config`, generated
   provider augmentation discovery, normalization, hashing, diagnostics, and watch-file ownership.
   Add the optional secret-free `languageConfig` projection to plugin configuration controllers.
5. **Host and runner:** create `@exactjs/language-extension-host` with discovery, analyzer policy,
   role ignores, declarative evaluation, NDJSON runner, request scheduling, limits, quarantine,
   caches, result validation, aggregation, status, and disposal.
6. **Language server:** attach one host to each workspace manager state, merge provider results into
   existing LSP features, expose status/provenance, and retain current document/version cancellation
   guarantees.
7. **Compilation gate:** split compiler preparation from filesystem publication, integrate the
   shared host into `exactc --check`, emitted compilation, artifact compilation, and package checks,
   and prove provider errors reject candidate generations.
8. **Official adapters:** add one reusable validation session to Vite, Webpack, and Bun; validate
   in-memory module results and project generations without host-specific discovery or provider
   invocation.
9. **Conformance consumers:** create generic fixture packages for declarative, JavaScript, and
   JavaScript-adapted native analyzers. Add illustrative accessibility and intl-shaped fixtures only
   after the generic suite passes; do not make either identity part of production host code.

The generic manifest, host, failure, and compilation-gate fixtures established the contract before
`@exactjs/intl` adopted it. The intl analyzer remains an ordinary consumer and does not define or
receive a compiler-special-cased protocol.
