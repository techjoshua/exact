# Bundler-enforced server component-library trust

## Status

Ready for implementation after
[`enhancements-as-component-composition.md`](../history/enhancements-as-component-composition.md) and before
[`cooperative-structured-children.md`](cooperative-structured-children.md),
[`enhancement-first-internationalization.md`](enhancement-first-internationalization.md),
[`lazy-interaction-islands.md`](lazy-interaction-islands.md),
[`compiler-planned-structural-refresh.md`](compiler-planned-structural-refresh.md),
[`partial-prerender-resumption.md`](partial-prerender-resumption.md), and
[`webpack-bun-microfrontend-parity.md`](webpack-bun-microfrontend-parity.md). Those proposals must
operate on the component graph authorized for each server-executing artifact and preserve its
authorization fingerprint across development, SSR, hydration, refresh, resumption, and remote
boundaries.

The policy, configuration, metadata seam, adapter lifecycle, manifest format, failure behavior, and
delivery gates are decision-complete. Implementation may refine private module organization but
must not defer or independently reinterpret these public and cross-package contracts.

This proposal introduces a component-library participation marker and a plugin-like package trust
policy, but it does not make component libraries framework plugins. Enforcement belongs entirely
to shared bundler infrastructure and bundler adapters. The compiler emits its ordinary portable
component, placement, and enhancement metadata without loading the marker, reading trust
configuration, making authorization decisions, or duplicating bundler diagnostics.

| Concern                        | Owner                                          |
| ------------------------------ | ---------------------------------------------- |
| Component and placement facts  | Compiler's existing portable output            |
| Package classification         | `@exactjs/component-library` dependency marker |
| Resolved package provenance    | Bundler/module resolver                        |
| Server-execution authorization | Shared bundler policy used by every adapter    |
| Development feedback           | The same policy during initial build and HMR   |
| Runtime agreement              | Build-scoped authorized artifact manifest      |
| Framework-plugin participation | Unchanged `@exactjs/plugin-host` protocol      |

The implementation introduces two packages with separate responsibilities:

- `@exactjs/component-library` is the inert published participation marker; and
- `@exactjs/component-library-policy` is a Node/build-tool package containing the shared resolver,
  policy, provenance, diagnostic, audit, and fingerprint implementation used by every adapter.

`@exactjs/config` owns the only public configuration types; Vite, Webpack, Bun, Vitest, and Jest
option objects do not duplicate the policy. Applications configure it once through
`exact.config.*`. Private adapter factories may accept an authorization session for focused tests.
Move configuration-file loading out of
`@exactjs/plugin-host` into `@exactjs/config/node` as `loadExactConfig()`. Build adapters load one
configuration object and pass it independently to the plugin host and component-library policy;
component authorization must not discover or prepare a plugin registry merely to read config.

```ts
type ExactLoadedConfig = Readonly<{
	config?: ExactConfig;
	configPath?: string;
	watchFiles: readonly string[];
}>;

function loadExactConfig(options: {
	applicationRoot: string;
	configPath?: string;
}): Promise<ExactLoadedConfig>;
```

An explicit path wins. Otherwise the loader preserves the existing root discovery order:
`exact.config.ts`, `exact.config.mts`, `exact.config.js`, `exact.config.mjs`, then
`exact.config.cjs`. It validates a default-exported object,
returns the resolved config file in `watchFiles`, and owns TypeScript config transpilation and
temporary-module cleanup. Plugin discovery accepts the returned config instead of loading it again.

## Decision

Require third-party component packages that can contribute component code to an eXact
server-executing artifact to identify themselves by depending on the inert
`@exactjs/component-library` marker package. Before evaluating any newly admitted server module,
the application bundler combines:

- the compiler's existing component and placement facts;
- the bundler's resolved module, package, alias, and artifact graph;
- marker participation and protocol compatibility; and
- application component-library trust configuration.

The bundler either authorizes the component package for that server artifact or rejects the build.
Optional enhancement implementations may instead remain absent when the application did not elect
to include them, but an implementation must never be loaded and then rejected.

The same authoritative check runs during HMR. A rejected update reports package and import
provenance and leaves the last valid development graph active. There is no compiler-side trust
check: it would have less accurate package-resolution information, duplicate policy logic, and
produce a second diagnostic authority without improving feedback latency.

This policy authorizes in-process execution; it is not a JavaScript sandbox. Applications must not
authorize a component library they would not trust as server code.

## Why the bundler is authoritative

Only the final bundler can see the code that will actually enter an artifact. It owns or observes:

- package-manager resolution, lockfile identities, aliases, conditions, and export maps;
- duplicated versions and distinct physical package instances;
- workspace packages, generated modules, virtual modules, and compiler-produced facades;
- static and dynamic chunks reachable from each server entry;
- server/client artifact boundaries and SSR entry points;
- enhancement catalog linkage after optional implementations are selected; and
- HMR replacement graphs before new modules are evaluated.

The compiler continues to describe component semantics and placement. It must not interpret
the marker package, consult application trust configuration, label a component trusted or
untrusted, or alter analysis based on authorization. Existing canonical component identities,
artifact targets, source ranges, enhancement fragments, and ownership edges are inputs to bundle
construction rather than security decisions.

Bundler adapters must not each invent their own policy. A shared eXact bundler module owns marker
validation, configuration normalization, provenance, authorization, diagnostics, fingerprints,
and audit records. Vite/Rollup, Webpack, Bun, test-build, and future adapters translate their
resolved graphs into that shared contract and enforce its result through native lifecycle hooks.

## Compiler-to-bundler metadata seam

Trust remains absent from the compiler, but build adapters need a public way to consume the
descriptive facts the compiler already calculates. Add a target-neutral `componentBuild` field to
successful native `TransformResult` values. It is a data-only projection with protocol version 1:

```ts
type ExactComponentBuildFacts = Readonly<{
	protocol: 1;
	filename: string;
	packageName?: string;
	components: readonly Readonly<{
		id: string;
		placement: ExactPlacement;
		artifactTargets: readonly ExactArtifactTarget[];
	}>[];
	componentImports: readonly Readonly<{
		ownerComponentId: string;
		moduleSpecifier: string;
		exportName: string;
		canonicalComponentId?: string;
		artifactTargets: readonly ExactArtifactTarget[];
		reason: 'render' | 'enhancement' | 'registry' | 'task-owner' | 'continuation';
	}>[];
	rendererEnhancements: readonly Readonly<{
		identity: string;
		moduleSpecifier: string;
		exportName: string;
	}>[];
}>;
```

This projection is derived from `ExactModuleAnalysis.components`, the normalized partition plan,
component render edges, owned task/continuation facts, and `rendererEnhancements`. It contains no
source text, trust configuration, marker result, resolved package path, or authorization decision.
`packageName` remains an optional build-integration hint and is never accepted as provenance.

For compiler-produced `.exact` artifact plans, `componentBuild` is emitted beside the existing
`ExactArtifactBuildProducts`; ordinary Vite, Webpack, and Bun transforms receive the same field
directly on `TransformResult`. Build adapters retain it only for the active build generation and
join each `componentImports` or enhancement request to the bundler's resolved module/export edge.
The resolved edge, not the authored specifier or compiler package hint, selects the package instance
subject to policy.

Precompiled component libraries must publish protocol-1 component build facts through the
`exactComponentLibrary.build` entry in their `package.json`. The value is a package-relative path to
a static JSON file produced by the eXact package build with this shape:

```ts
type ExactPublishedComponentBuildFacts = Readonly<{
	protocol: 1;
	package: Readonly<{ name: string; version: string }>;
	modules: readonly Readonly<{
		path: string;
		facts: Omit<ExactComponentBuildFacts, 'filename' | 'packageName'>;
	}>[];
	exports: readonly Readonly<{
		subpath: string;
		condition: string;
		module: string;
		exportName: string;
		componentId: string;
	}>[];
}>;
```

Module paths are normalized package-relative POSIX paths with no `..` segments. Export records are
sorted by subpath, condition, export name, and component ID and must correspond to actual package
`exports` targets under the resolved condition. The declared package name/version must equal the
owning manifest, every referenced module must exist in `modules`, component IDs must exist in that
module's facts, and duplicate/conflicting records are invalid. Conditions not selected by the
current build are retained as data but cannot authorize the selected server target.

The file is included in package contents, contains no executable code, and is validated without
importing the package. A package reached as an eXact component but lacking compatible build facts or
the marker fails before its implementation module is loaded. Application source compiled in the
current build does not need a package sidecar.

The shared policy engine admits candidates only from compiler component/enhancement edges that are
reachable in the actual server target graph. It does not treat every import from a marked package
as a component edge and does not scan installed packages. Once a package instance is authorized,
its ordinary implementation closure may execute as in-process server code; utility dependencies in
that closure are governed by ordinary supply-chain controls unless they are themselves reached as
eXact component owners.

Successful package authorization returns the selected module's validated published
`componentBuild` projection to the adapter and records it as importer facts in the same generation.
Adapters recursively resolve its server component and enhancement edges before accepting the
parent, even when the bundler externalizes that parent and would not otherwise traverse its
implementation graph. Cycles are generation-fenced by resolved importer, export, and physical
candidate identity; an actual later bundler resolution is checked independently when aliases select
a different package instance.

## Component-library marker

Publish `@exactjs/component-library` as a browser-safe, inert marker dependency. A participating
package declares a compatible version in production `dependencies`:

```json
{
	"name": "@acme/maps",
	"dependencies": {
		"@exactjs/component-library": "^0.1.0"
	},
	"exactComponentLibrary": {
		"protocol": 1,
		"build": "./dist/exact-component-build.json"
	}
}
```

The marker package version follows the framework's `0.1.x` release line. Its own `package.json`
contains `"exactComponentLibraryProtocol": 1`; it has no JavaScript entry point, lifecycle, or
install script. The policy engine reads package manifests and the static build-facts file directly
through the bundler resolver and never imports either marker or candidate implementation code.

Marker validation resolves `@exactjs/component-library` from the candidate package root using the
candidate's production dependency edge. The installed marker version must satisfy the candidate's
declared range and its manifest protocol must equal 1. Hoisted resolution is valid only when it is
the resolver result for that declared edge; an undeclared reachable copy, peer, or root marker does
not classify the candidate.

The dependency communicates three bounded facts:

1. the package intentionally publishes eXact components for application composition;
2. it accepts the component-library packaging and provenance contract represented by that marker
   version; and
3. it may be considered by component-library authorization policy.

The marker does **not** assert that the package is safe, grant trust, register components, create an
enhancement catalog entry, run configuration, or install host behavior. It exposes no runtime
lifecycle or executable manifest. Type-only authoring contracts and package validation helpers may
be added only when they remain inert in application output.

A `devDependency` does not classify published runtime output. A `peerDependency` does not transfer
authorization from the consumer and is insufficient by itself. There is no unmarked-package
exception: eXact is unpublished, so an external package reached as an eXact component must declare
the production marker dependency and compatible static build facts before it can enter a server
artifact.

First-party application source does not need to mark itself. Workspace packages are not implicitly
first-party merely because they are local: the bundler resolves their package boundary and applies
the same root dependency and configuration rules so development matches publication.

## Authorization model

Use a model analogous to framework-plugin discovery while keeping configuration and execution
separate. The initial policy modes are:

- `root`: authorize marked component libraries that are direct production dependencies of the
  application root; transitive component libraries require an explicit allow rule;
- `trusted`: authorize `root`, configured packages or scopes, and marked component libraries that
  are direct production dependencies of an already authorized component library; and
- `all`: authorize every compatible marked component library reached by the server component
  graph, subject to explicit deny rules.

`trusted` is the default. Compatible marked `@exactjs/` libraries are trusted by default; an
application can disable that default without disabling its own configured scopes. Explicit deny
rules take precedence over root, scope, package, delegated, and `all` authorization. Rules operate
on package instances rather than exports: export-level permission would be misleading because
authorizing one module permits that package's top-level code and implementation closure to execute.

Delegation is edge-scoped. In `trusted` mode, an authorized library can vouch only for a marked
component library listed in its own production `dependencies` and reached through that resolved
edge. It cannot authorize a hoisted undeclared package, a `devDependency`, an unrelated copy of the
same package, or every package sharing a name or scope. Each recursive delegation edge appears in
the audit record.

`optionalDependencies` do not extend trust. If installed and server-reached, they require an
explicit application allow rule. Peer component libraries are selected by the consuming
application and therefore require trust from that consumer's graph rather than from the declaring
library.

Configuration belongs to ordinary eXact build configuration, but component libraries do not gain
plugin configuration controllers or discovery hooks. `@exactjs/config` exposes this exact initial
surface:

```ts
type ExactComponentLibraryRule =
	| string
	| Readonly<{
			package: string;
			version?: string;
			integrity?: string;
	  }>;

type ExactComponentLibraryTrustConfig = Readonly<{
	mode?: 'root' | 'trusted' | 'all';
	allow?: readonly ExactComponentLibraryRule[];
	deny?: readonly ExactComponentLibraryRule[];
	trustedScopes?: readonly string[];
	includeDefaultTrustedScopes?: boolean;
	unauthorizedOptionalEnhancements?: 'error' | 'exclude';
}>;

interface ExactConfig {
	componentLibraries?: ExactComponentLibraryTrustConfig;
}
```

A string rule is either an exact package name or a scope prefix ending in `/`. Object rules always
name one exact package. `version` is a semver range matched against the resolved instance;
`integrity` is an exact package-manager/lockfile integrity value. Empty selectors, invalid package
names, non-scope prefixes, invalid semver, and unknown values are configuration errors. Trust is
package-instance-wide because authorization permits in-process execution; artifact- or
export-specific rules would imply isolation the framework cannot provide.

Normalization defaults are fixed:

- `mode: 'trusted'`;
- empty `allow`, `deny`, and `trustedScopes` arrays;
- `includeDefaultTrustedScopes: true`, contributing only `@exactjs/`; and
- `unauthorizedOptionalEnhancements: 'error'`.

`allow` never bypasses the production marker, compatible protocol, or static build-facts
requirements. In `root` mode it is the only way to admit a transitive component library. In
`trusted` mode configured scopes and direct production-dependency delegation additionally apply.
In `all` mode every compatible reached library is admitted unless denied. A matching deny always
wins; a rule whose version or integrity constraint does not match has no effect. `exclude` applies
only to an optional enhancement catalog request: an ordinary component
edge, task owner, or continuation always fails when unauthorized.

`trustedScopes` and `includeDefaultTrustedScopes` are consulted only in `trusted` mode; retaining
them while temporarily selecting another mode is valid and has no effect. Delegation begins from
libraries authorized by root dependency, allow rule, or trusted scope and is recomputed per resolved
production-dependency edge rather than per package name.

## Enforcement scope

Authorization applies when external component implementation code enters an artifact that executes
on the server. This includes:

- initial and streaming SSR;
- server components and server-owned continuation regions;
- server-side enhancement components;
- server task or operation code owned by a packaged component;
- refresh and partial-prerender resumption entries; and
- server-side component tests or generated server facades that execute package code.

The shared session normalizes those cases to the closed reason set `ssr`, `server-component`,
`server-enhancement`, `server-task`, `refresh`, `resumption`, and `server-test`. Isomorphic render
edges reached from the server rendering entry are `ssr`; server-placed component/continuation edges
are `server-component`; enhancement and task-owner facts select their corresponding reasons;
generated refresh/resumption facades carry their compiler artifact reason; and test integrations
add `server-test`. A package may accumulate several sorted reasons in one server build.

The decision follows actual artifact reachability, not whether a component type could theoretically
run on the server. A component proven client-only requires no additional eXact component-library
authorization. It remains subject to the application's normal dependency, browser, integrity, and
content-security policies.

Trusting a component library authorizes its resolved implementation closure as ordinary in-process
server code. The policy does not require general-purpose utility dependencies such as parsers or
math libraries to pretend to be component libraries. If that closure crosses into another marked
package as the owner of a component node, the owning component library requires its own applicable
authorization. Undeclared or resolution-injected dependencies remain errors or conventional
supply-chain findings; the component policy does not legitimize them.

React-owned packages used only through the explicit compatibility boundary remain ordinary
application dependencies and do not claim the eXact component-library marker. An eXact wrapper
package that publishes native components must participate in this policy; authorizing that wrapper
authorizes its ordinary React and utility dependency closure as in-process code, but does not
classify those dependencies as eXact component libraries.

Authorization is evaluated before server module evaluation, including configuration-triggered
prebundling and HMR. A bundler adapter that cannot guarantee this ordering must fail the affected
server mode rather than load code and report afterward.

## Adapter enforcement lifecycle

Every adapter creates one `ExactComponentAuthorizationSession` from
`@exactjs/component-library-policy` per build/watch generation. The session accepts compiler build
facts, resolved module/export edges, package manifests, lockfile identities, the server build key,
and compiler-recorded execution reasons. Its adapter-facing contract is:

```ts
type ExactResolvedPackageInstance = Readonly<{
	key: string;
	root: string;
	manifestPath: string;
	name: string;
	version: string;
	integrity?: string;
}>;

type ExactResolvedDependencyEdge = Readonly<{
	owner: 'application' | string;
	candidate: string;
	specifier: string;
	kind: 'dependency' | 'devDependency' | 'peerDependency' | 'optionalDependency';
}>;

type ExactResolvedComponentCandidate = Readonly<{
	importerModuleId: string;
	moduleSpecifier: string;
	exportName: string;
	resolvedModuleId: string;
	packageInstanceKey: string;
	reason: ExactComponentServerExecutionReason;
	optionalEnhancementIdentity?: string;
}>;

type ExactComponentAuthorizationAudit = Readonly<{
	protocol: 1;
	buildKey: string;
	fingerprint: string;
	packages: readonly Readonly<{
		instanceId: string;
		name: string;
		version: string;
		markerVersion: string;
		decision: 'root' | 'allow' | 'scope' | 'delegated' | 'all';
		reasons: readonly ExactComponentServerExecutionReason[];
		matchedRule?: string;
		provenance: readonly Readonly<{
			owner: 'application' | string;
			specifier: string;
			kind: ExactResolvedDependencyEdge['kind'];
		}>[];
	}>[];
	omittedEnhancements: readonly Readonly<{
		identity: string;
		packageName: string;
		reason:
			| 'unmarked'
			| 'marker-incompatible'
			| 'build-facts-missing'
			| 'build-facts-invalid'
			| 'not-allowed'
			| 'explicitly-denied';
	}>[];
}>;

interface ExactComponentAuthorizationSession {
	recordImporterFacts(moduleId: string, facts: ExactComponentBuildFacts, version: string): void;
	recordPackageInstance(instance: ExactResolvedPackageInstance): void;
	recordDependencyEdge(edge: ExactResolvedDependencyEdge): void;
	authorizeResolvedComponent(
		candidate: ExactResolvedComponentCandidate
	): Promise<
		| Readonly<{ outcome: 'authorized'; packageInstanceId: string }>
		| Readonly<{ outcome: 'omitted'; enhancementIdentity: string }>
	>;
	commitGeneration(): Promise<
		Readonly<{
			manifest: ExactComponentAuthorizationManifest;
			audit: ExactComponentAuthorizationAudit;
		}>
	>;
	rejectGeneration(): void;
	dispose(): void;
}
```

`root`, `manifestPath`, raw integrity, and adapter keys are build-private. The session validates
name/version against the manifest and derives the emitted instance ID itself. An importer fact must
contain the authored component request, the static package facts must map the resolved
module/export/component, and the dependency edges must establish root or delegated provenance. A
required denial throws one structured `ExactComponentAuthorizationError`; the only non-error denial
result is `omitted` for a configured optional enhancement. Adapters do not receive lower-level
policy predicates and cannot manufacture an authorized result.

The required lifecycle is fixed:

| Integration       | Candidate discovery and pre-evaluation gate                                                                                                                                    | Generation behavior                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Vite/Rollup build | `transform` records importer facts; subsequent `resolveId` joins component requests through `this.resolve`; `load` refuses a candidate until the shared session authorizes it. | `buildStart` opens, `buildEnd` commits and emits manifests before output generation, and `closeBundle` releases the generation. |
| Vite development  | The same `transform`/`resolveId`/`load` gate runs before the SSR module runner receives source; `handleHotUpdate` preflights the affected graph.                               | Preflight commits before Vite publishes an update; only that file-version generation may transform.                             |
| Webpack           | The pre-loader records importer facts; `NormalModuleFactory` `beforeResolve`/`afterResolve` hooks join resolved package instances and reject before module build/evaluation.   | `thisCompilation` owns a generation; watch invalidation commits atomically or retains the prior compilation.                    |
| Bun build/watch   | `onLoad` records importer facts and `onResolve` authorizes component requests before the candidate `onLoad` runs.                                                              | `onStart` opens and `onEnd` commits; rejected watch builds retain no authorization state.                                       |
| Vitest            | Uses the Vite development/build integration with a `server-test` execution reason whenever the configured target executes on the server.                                       | Each test-server graph uses the enclosing Vite generation.                                                                      |
| Jest              | `@exactjs/jest` preflights test entries and installs a resolver that admits only component candidates recorded in the authorized preflight manifest.                           | Workers read one immutable cache-keyed generation; teardown deletes it after the test run.                                      |

Rollup/Vite dependency optimization must exclude unresolved component candidates until the gate has
classified them; it may prebundle an already authorized instance under the same fingerprint. Bun
server `--hot` mode is unsupported until its plugin lifecycle can prove that a rejected generation
leaves the last valid server graph active. When requested before that proof exists, the adapter
fails startup with a dedicated diagnostic rather than weakening enforcement. Ordinary Bun
production and watch builds remain required in this proposal.

Vite server builds enable `build.ssrEmitAssets` so the private authorization products emitted from
`buildEnd` survive SSR output filtering. Vite may externalize a package and return a bare ID from
`this.resolve`; the adapter materializes that resolved package ID from the importing module only for
provenance and static build-facts validation, while preserving Vite's externalization decision.
Failure to obtain a physical package identity is `provenance-unresolved`, never permission to skip
the gate.

Bun uses `build.resolve` when the installed Bun version implements it. Bun versions that expose the
method but explicitly report it as unimplemented fall back to package resolution from the importer;
the fallback applies Bun's exact package aliases first and remains limited to package candidates.
Other resolver failures propagate unchanged rather than being reinterpreted as a fallback.

Re-export and facade resolution may require several resolver edges, but no candidate implementation
is loaded while the chain is unresolved. The static package build-facts file supplies the export
map needed to follow those edges without evaluation. A cycle in package re-exports is diagnosed
with its bounded provenance chain.

Jest cannot rely on mutable state shared between its resolver and transformer workers. The
`exactJest()` configuration therefore installs eXact `globalSetup`, resolver, transformer, and
`globalTeardown` entries. Setup walks the configured test entries and their static authored module
graph with the compiler's no-emit facts plus Jest's default resolver, authorizes server-test
candidates, and writes an immutable manifest under Jest's cache directory keyed by normalized
config, lockfile identity, source hashes, and Jest project ID. The resolver refuses a component
candidate absent from that manifest; the transformer verifies the source hash before compiling.
Dynamic component imports must have a finite compiler-recorded target and are included in preflight;
an unresolved dynamic request is rejected. Teardown removes the generation. No worker imports a
candidate to discover whether it is authorized.

## Enhancements and optional catalogs

Enhancements remain ordinary optional components under
[`enhancements-as-component-composition.md`](../history/enhancements-as-component-composition.md). Their
compile-time metadata is unaffected by this proposal.

At bundle time, an enhancement implementation can enter a server enhancement catalog only when its
owning component library is authorized for that artifact. The outcomes are distinct:

- not selected for inclusion: preserve normal optional inactive behavior;
- selected and authorized: link the canonical component identity into the local catalog;
- selected but unauthorized: exclude it only under the explicit `exclude` policy, otherwise fail;
- required through an ordinary server component edge but unauthorized: fail the build.

The same authorization applies when an enhancement component directly occupies an authored `_`
fragment boundary. Avoiding intrinsic-root discovery does not let that component enter or execute in
a server artifact without authorization.

An excluded server enhancement must not be activated by the paired hydration artifact in a way that
changes the adopted logical component ownership or SSR contract. The bundler derives paired server
and client catalogs from one authorization result and either excludes the implementation from that
hydration root or emits an explicitly client-only activation plan already supported by placement
metadata. It never guesses agreement from package names.

Activator aliases and re-export chains authorize the resolved implementation package and canonical
component identity, not the authored namespace, re-exporting facade, or friendly export name. A
trusted facade cannot launder an explicitly denied implementation package.

## Development and HMR

Development uses exactly the production authorization engine over the development bundler's
resolved graph. On initial startup and every invalidation, the adapter recomputes only affected
provenance and authorization decisions before accepting replacement modules.

Vite `handleHotUpdate` is asynchronous. It uses Vite's module graph and plugin-container resolver
to collect the invalidated module plus affected importers, requests no-emit `componentBuild` facts
from the compiler session for changed authored modules, and authorizes every newly reachable
candidate before returning control to Vite. A successful preflight records source versions/content
hashes and commits the authorization generation; later `transform` calls must match those versions
or reopen and reject the generation. A failed preflight throws the authoritative Vite HMR error
before an update payload or SSR runner invalidation is accepted, leaving the prior modules and
catalog active.

The shared package throws one `ExactComponentAuthorizationError` with a stable `code` from
`unmarked`, `marker-incompatible`, `build-facts-missing`, `build-facts-invalid`, `not-allowed`,
`explicitly-denied`, `provenance-unresolved`, `generation-stale`, or `server-hmr-unsupported` and a
structured diagnostic record. Diagnostics must identify:

- the component or enhancement source request;
- the server artifact and execution reason;
- the resolved package, version, physical instance, and canonical export when available;
- the dependency and re-export path that introduced it;
- marker presence and protocol compatibility;
- the matching allow, deny, root, scope, or delegation rule; and
- the smallest configuration or dependency declaration that can resolve the failure.

A failed HMR authorization keeps the prior valid graph and catalog active, fences generated output
from the rejected generation, and recovers normally after the dependency or configuration changes.
The compiler language service may display bundler diagnostics supplied through existing development
diagnostic plumbing, but it must not recompute or approximate the policy.

The watched authorization inputs are the resolved eXact config, application `package.json`, active
lockfile, every reached candidate package manifest and build-facts file, and resolved aliases or
workspace links reported by the bundler. A change to any of them opens a new authorization
generation before invalidated code is transformed. The active decision map and enhancement catalog
are swapped together only at `commitGeneration`; `rejectGeneration` releases every newly read
manifest, graph edge, and diagnostic after reporting the failure.

## Build manifest and runtime agreement

Each successful server build emits a server-private
`.exact/component-library-authorization.json` file with this protocol-1 shape:

```ts
type ExactComponentServerExecutionReason =
	| 'ssr'
	| 'server-component'
	| 'server-enhancement'
	| 'server-task'
	| 'refresh'
	| 'resumption'
	| 'server-test';

type ExactComponentAuthorizationManifest = Readonly<{
	protocol: 1;
	buildKey: string;
	fingerprint: string;
	policyHash: string;
	markerProtocol: 1;
	packages: readonly Readonly<{
		instanceId: string;
		name: string;
		version: string;
		integrityHash?: string;
		decision: 'root' | 'allow' | 'scope' | 'delegated' | 'all';
		reasons: readonly ExactComponentServerExecutionReason[];
	}>[];
	omittedEnhancements: readonly string[];
}>;
```

`instanceId` is the SHA-256 base64url hash of the resolver's canonical package-instance identity;
`integrityHash` hashes the available lockfile integrity rather than exposing it. Records and nested
arrays are sorted bytewise by their stable identifiers. `policyHash` is the SHA-256 base64url hash
of canonical JSON for the normalized public configuration. `fingerprint` hashes protocol versions,
`buildKey`, `policyHash`, sorted package instance decisions, omitted enhancement identities, and
their compiler-recorded server execution reasons. The shared policy package owns canonical JSON
serialization and hashing so adapters cannot vary the result.

Only `protocol`, `buildKey`, and `fingerprint` cross into paired client hydration metadata. SSR,
hydration, refresh, resumption, worker, test, and microfrontend artifacts that exchange
component-owned state compare those fields through the existing build-key compatibility boundary;
a mismatch follows the existing stale/incompatible-build recovery path. Runtime code never reads
package manifests or decides trust.

Multi-pass build orchestration completes the server build first and reads its emitted manifest with
`readExactComponentAuthorizationIdentity()`. That compact result is passed to SSR hydration options,
retained build registration, and the paired Vite build's `componentAuthorization` option. The Vite
microfrontend integration forwards it to `prepareExactRemoteArtifactBuild`; a differing remote
build key fails planning. No adapter accepts a full audit or policy graph as paired-artifact input.

The full provenance graph and matched-rule explanation are emitted separately as server-private
`.exact/component-library-audit.json` and projected into build inspection when enabled. Audit paths
are application-root-relative, dependency paths are package/logical edges rather than absolute
filesystem paths, and secrets, raw lockfile contents, source text, and unrelated dependencies are
excluded. Production client output never contains package names, versions, rules, or provenance.

## Aliases, duplicates, and remote boundaries

Authorization keys use resolved package instances, not authored specifier strings. The shared
policy must preserve provenance through:

- package export maps and conditional exports;
- re-exports and compiler-generated component facades;
- package-manager aliases and workspace links;
- multiple installed versions or physical copies;
- virtual modules and generated enhancement catalogs; and
- microfrontend exposure and provided-package boundaries.

The canonical instance identity is the resolver-reported real package root plus package name,
resolved version, and available lockfile integrity. The real root distinguishes workspace links and
physical duplicates during the build; only its hash enters emitted manifests. When a resolver
cannot provide a real package root or equivalent opaque instance handle, the adapter must not
collapse the candidate to name/version and must fail with an unsupported-provenance diagnostic.

Two copies of one package name are separate candidates and may produce different decisions. An
allow rule without a version or integrity constraint can apply to both, but diagnostics and audits
must show each instance. Canonical component deduplication never merges implementations across
different resolved package instances.

A remote component artifact is authorized by its producing build and carries its authorization
fingerprint in the authenticated exposure metadata. The consuming server host must also permit that
remote/exposure provenance under its existing microfrontend trust policy. Neither side may infer
component-library authorization merely from the other's package name or marker. Client-only remote
components remain outside this server-execution policy.

## Framework-plugin boundary

The marker and trust engine do not use `@exactjs/plugin-api`, plugin manifests, plugin discovery, or
`@exactjs/plugin-host`. A component library receives no configuration controller, projection,
lifecycle hook, or output transform.

A package may independently be both:

- a marked component library whose server execution is authorized by this policy; and
- a framework plugin whose host projections are discovered and trusted by the plugin host.

Those decisions are evaluated independently and reported separately. Authorizing one role never
authorizes the other. Shared internal graph utilities are acceptable, but component authorization
must not make the plugin registry responsible for ordinary components.

## Build-performance and runtime-state constraints

Authorization must remain compatible with
[`javascript-performance-improvements.md`](javascript-performance-improvements.md). Resolved dependency
graphs, package manifests, source ranges, and diagnostic provenance are bundler/build inputs; paired
runtime artifacts retain only compact authorized component/catalog identities, the decision needed
at that boundary, and the authorization fingerprint. They must not ship or reconstruct the complete
provenance graph during SSR or hydration.

Development and HMR replace authorization generations atomically. Rejected and superseded graphs,
virtual modules, package manifests, and diagnostics must be released once no active build request
can observe them. Adapter caches require entry/count telemetry and bounded invalidation; repeatedly
correcting an unauthorized import must not accumulate a history of failed graphs. Verification
must include heap plateaus, authorization latency, HMR invalidation latency, and affected graph
counts across accepted/rejected churn and large dependency graphs in addition to the security
assertions below. Resolve each package instance once per build generation and reuse that decision
across paired server/client artifacts; performance must not create a stale secondary authorization
cache or move enforcement after evaluation.

## Non-goals and limits

- Sandboxing or capability-restricting code after it is authorized.
- Replacing lockfiles, registry signatures, dependency review, or deployment integrity controls.
- Authorizing arbitrary server operations solely because their package contains a component.
- Requiring client-only component libraries to participate in an eXact server policy.
- Discovering components by scanning every installed dependency.
- Executing package manifests, marker modules, or candidate component code during discovery.
- Moving package trust, marker interpretation, or authorization diagnostics into the compiler.
- Making enhancement activation or component composition depend on framework-plugin lifecycle.

The bundler considers only compiler-reached component identities and modules reachable from actual
server artifacts. It does not scan `node_modules` for candidates. Once a library is authorized,
ordinary context policy, operation allowlisting, placement validation, serialization validation,
secret residency, and request isolation remain independently necessary.

## Delivery order

1. Publish protocol-1 `componentBuild` facts on native transform results and emit the static package
   build-facts file from component-library artifact builds. Add semantic-equivalence tests proving
   this is a projection of existing analysis and changes no generated runtime code.
2. Publish inert `@exactjs/component-library`, add the exact `@exactjs/config` types and defaults,
   move neutral `loadExactConfig()` ownership to `@exactjs/config/node`, and add package-content
   checks for marker dependencies and `exactComponentLibrary.build`.
3. Create `@exactjs/component-library-policy` with the tool-neutral provenance, normalized
   configuration, candidate, decision, diagnostic, audit, generation, and fingerprint contracts.
4. Implement static marker/build-facts validation and the `root`, `trusted`, and `all` modes,
   including delegation, deny precedence, constrained rules, deterministic sorting, and cache
   release. No marker or policy logic enters the compiler.
5. Integrate the shared session into Vite/Rollup production and development before module load,
   including enhancement catalog linking, paired hydration decisions, configuration watches, and
   rejected-generation recovery.
6. Integrate server-executing Vitest through Vite and add the paired eXact Jest resolver so tests
   cannot evaluate candidates through a transform-only path.
7. Integrate Webpack through its loader and `NormalModuleFactory` resolution lifecycle, including
   atomic watch generations.
8. Integrate Bun production and watch through `onResolve`/`onLoad`; reject server `--hot` startup
   until its last-valid-generation guarantee has dedicated conformance coverage.
9. Emit authorization/audit manifests, embed the compact paired fingerprint, connect stale-build
   recovery, expose structured inspection and DevTools reporting, and verify redaction.
10. Extend microfrontend exposure/consumer validation with authenticated authorization provenance.
11. Mark official component libraries, generate and publish their build-facts files, audit direct
    component-library dependencies, and add explicit trust configuration where delegation is
    inappropriate.
12. Update current references, public docs, examples, package guidance, reusable skill guidance,
    and release checks before advertising enforcement.

## Verification

- Shared policy unit tests cover modes, scopes, exact packages, deny precedence, versions,
  integrity, marker compatibility, direct edges, delegation, peers, optional dependencies, aliases,
  duplicates, workspaces, and deterministic decisions. Unmarked candidates always fail.
- Compiler projection tests prove `componentBuild` matches component, partition, task, continuation,
  and enhancement analysis without containing trust state or changing emitted JavaScript.
- Packed-package tests prove static build facts survive publication, map conditional/subpath exports,
  and can be validated without loading the candidate module.
- Adversarial provenance tests prove re-exports, facades, aliases, hoisting, duplicate names, and
  virtual modules cannot launder a denied package identity.
- Real Vite/Rollup, Webpack, and Bun builds prove identical decisions over equivalent graphs and
  reject unauthorized server component code before evaluation.
- Vitest and Jest tests prove their server-executing paths use the same policy, while Bun server
  `--hot` rejects startup until atomic recovery is supported.
- Instrumented fixtures prove an unauthorized package cannot run top-level code, setup, SSR,
  enhancement setup, task registration, or disposal before rejection.
- HMR tests prove rejected generations do not evaluate, replace the last valid graph, mutate the
  active enhancement catalog, or survive after corrected configuration.
- Placement tests prove client-only components do not require authorization while SSR, server
  components, server enhancements, refresh, resumption, and server tests do.
- Enhancement tests cover inactive omission, strict rejection, activator/re-export provenance,
  paired hydration agreement, and canonical identity preservation.
- Manifest tests prove stable fingerprints, stale-build recovery, redaction, and agreement across
  SSR, hydration, refresh, resumption, workers, and test artifacts.
- Microfrontend tests cover producer authorization, consumer remote trust, tampered provenance,
  mixed bundlers, duplicates, and client-only exposures.
- Package-content tests prove the marker is inert, browser-safe, non-executable in application
  output, and included correctly by published component libraries.
- Documentation checks keep engineering references, docs-app navigation/search, package READMEs,
  local agent guides, and reusable skill guidance synchronized when implementation lands.

## Acceptance criteria

1. The compiler publishes only protocol-1 descriptive `componentBuild` facts and static package
   build facts; it contains no component-library trust configuration, marker interpretation,
   authorization logic, or duplicate diagnostics.
2. Every supported server bundler/test integration uses
   `@exactjs/component-library-policy` and rejects unauthorized component code before evaluation.
   Unsupported server HMR modes fail startup rather than bypassing the policy.
3. `@exactjs/component-library` classifies compatible component packages without granting trust,
   registering components, executing code, or participating in plugin lifecycle.
4. Root, configured, delegated, and denied decisions use resolved package-instance provenance and
   remain deterministic across aliases, re-exports, workspaces, duplicates, and virtual modules.
5. Client-only component code requires no additional eXact component-library authorization.
6. SSR, server components, server enhancements, owned server tasks, refresh, resumption, and server
   tests admit only authorized component-library code.
7. Optional unauthorized enhancements fail by default and remain inactive only under explicit
   `unauthorizedOptionalEnhancements: 'exclude'`; required server edges always fail.
8. Supported HMR reports the authoritative bundler diagnostic without evaluating or activating the
   rejected generation and preserves the last valid graph.
9. Build manifests and fingerprints preserve authorization agreement across paired server/client,
   continuation, test, and microfrontend artifacts without exposing sensitive provenance.
10. Component-library authorization remains independent from framework-plugin discovery and is
    documented as supply-chain authorization rather than sandboxing.
11. `@exactjs/config` implements the specified defaults and rule semantics without marker exceptions
    or adapter-specific configuration variants.
