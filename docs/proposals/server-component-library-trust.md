# Bundler-enforced server component-library trust

## Status

Proposed after
[`enhancements-as-component-composition.md`](enhancements-as-component-composition.md) and before
[`cooperative-structured-children.md`](cooperative-structured-children.md),
[`enhancement-first-internationalization.md`](enhancement-first-internationalization.md),
[`lazy-interaction-islands.md`](lazy-interaction-islands.md),
[`compiler-planned-structural-refresh.md`](compiler-planned-structural-refresh.md),
[`partial-prerender-resumption.md`](partial-prerender-resumption.md), and
[`webpack-bun-microfrontend-parity.md`](webpack-bun-microfrontend-parity.md). Those proposals must
operate on the component graph authorized for each server-executing artifact and preserve its
authorization fingerprint across development, SSR, hydration, refresh, resumption, and remote
boundaries.

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

The compiler should continue to describe component semantics and placement. It must not interpret
the marker package, consult application trust configuration, label a component trusted or
untrusted, or alter analysis based on authorization. Existing canonical component identities,
artifact targets, source ranges, enhancement fragments, and ownership edges are inputs to bundle
construction rather than security decisions.

Bundler adapters must not each invent their own policy. A shared eXact bundler module owns marker
validation, configuration normalization, provenance, authorization, diagnostics, fingerprints,
and audit records. Vite/Rollup, Webpack, Bun, test-build, and future adapters translate their
resolved graphs into that shared contract and enforce its result through native lifecycle hooks.

## Component-library marker

Publish `@exactjs/component-library` as a browser-safe, inert marker dependency. A participating
package declares a compatible version in production `dependencies`:

```json
{
	"name": "@acme/maps",
	"dependencies": {
		"@exactjs/component-library": "^1.0.0"
	}
}
```

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
authorization from the consumer and is insufficient by itself. An application may explicitly
allow an unmarked legacy package during migration, but the audit report must identify the marker
exception; published eXact component libraries are expected to use the marker.

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

`trusted` is the default. Official `@exactjs/` component libraries may be included in its initial
trusted scopes, matching the framework-plugin policy, while applications can replace that default.
Explicit deny rules take precedence over root, scope, package, and delegated authorization. A
specific allow rule may constrain package name, resolved version or integrity, canonical export,
artifact kind, and execution environment.

Delegation is edge-scoped. In `trusted` mode, an authorized library can vouch only for a marked
component library listed in its own production `dependencies` and reached through that resolved
edge. It cannot authorize a hoisted undeclared package, a `devDependency`, an unrelated copy of the
same package, or every package sharing a name or scope. Each recursive delegation edge appears in
the audit record.

`optionalDependencies` do not silently extend trust. If installed and server-reached, they require
an explicit application allow rule unless a future policy adds a separately named delegation mode.
Peer component libraries are selected by the consuming application and therefore require trust
from that consumer's graph rather than from the declaring library.

Configuration belongs to ordinary eXact build configuration, but component libraries do not gain
plugin configuration controllers or discovery hooks. The exact public configuration shape should
support at least:

- policy mode;
- trusted and denied package names or scopes;
- narrow legacy marker exceptions;
- version/integrity constraints where required; and
- strict handling of requested optional enhancements that are not authorized.

## Enforcement scope

Authorization applies when external component implementation code enters an artifact that executes
on the server. This includes:

- initial and streaming SSR;
- server components and server-owned continuation regions;
- server-side enhancement components;
- server task or operation code owned by a packaged component;
- refresh and partial-prerender resumption entries; and
- server-side component tests or generated server facades that execute package code.

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

Authorization is evaluated before server module evaluation, including configuration-triggered
prebundling and HMR. A bundler adapter that cannot guarantee this ordering must fail the affected
server mode rather than load code and report afterward.

## Enhancements and optional catalogs

Enhancements remain ordinary optional components under
[`enhancements-as-component-composition.md`](enhancements-as-component-composition.md). Their
compile-time metadata is unaffected by this proposal.

At bundle time, an enhancement implementation can enter a server enhancement catalog only when its
owning component library is authorized for that artifact. The outcomes are distinct:

- not selected for inclusion: preserve normal optional inactive behavior;
- selected and authorized: link the canonical component identity into the local catalog;
- selected but unauthorized: exclude it when optional policy permits, or fail a strict build;
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

Diagnostics should identify:

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

## Build manifest and runtime agreement

Each successful server build emits a deterministic authorization section in its existing
build-scoped artifact manifest. It records or hashes:

- policy and marker protocol versions;
- normalized trust configuration;
- authorized component package instances and provenance edges;
- denied or omitted optional enhancement identities;
- server artifact ownership and paired hydration catalog decisions; and
- lockfile, package integrity, or equivalent resolver identity available to the adapter.

The complete decision set contributes to a build authorization fingerprint. SSR, hydration,
refresh, resumption, worker, test, and microfrontend artifacts that exchange component-owned state
must agree on the applicable fingerprint or use the existing stale/incompatible-build recovery
path. Runtime code verifies build agreement; it does not rediscover packages or decide trust.

Audit output must be available as structured build inspection data and a concise human-readable
report. Secrets, absolute local paths, and unrelated dependency details must not leak into client
manifests or production diagnostics.

## Aliases, duplicates, and remote boundaries

Authorization keys use resolved package instances, not authored specifier strings. The shared
policy must preserve provenance through:

- package export maps and conditional exports;
- re-exports and compiler-generated component facades;
- package-manager aliases and workspace links;
- multiple installed versions or physical copies;
- virtual modules and generated enhancement catalogs; and
- microfrontend exposure and provided-package boundaries.

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
should include heap plateaus, authorization latency, HMR invalidation latency, and affected graph
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

1. Publish the inert `@exactjs/component-library` marker with protocol/version and package-content
   validation, README, and concise application-author guidance.
2. Define the tool-neutral resolved-package provenance, trust configuration, decision, diagnostic,
   audit, and authorization-fingerprint contracts in shared bundler infrastructure.
3. Implement marker validation and the `root`, `trusted`, and `all` policy modes without changing
   compiler analysis or output.
4. Integrate enforcement before module evaluation in the Vite/Rollup production and HMR paths,
   including enhancement catalog linking and paired hydration decisions.
5. Integrate the same shared policy into component-test and server-test bundle paths.
6. Add Webpack and Bun enforcement through their native pre-evaluation lifecycles; explicitly gate
   any server mode that cannot guarantee ordering.
7. Add build manifests, fingerprints, structured inspection, HMR recovery, and DevTools reporting.
8. Extend microfrontend exposure/consumer validation with authenticated authorization provenance.
9. Mark official component libraries, audit their direct component-library dependencies, and add
   explicit trust configuration where delegation is inappropriate.
10. Update current references, public docs, examples, package guidance, and release checks before
    advertising enforcement.

## Verification

- Shared policy unit tests cover modes, scopes, exact packages, deny precedence, versions,
  integrity, marker compatibility, direct edges, delegation, peers, optional dependencies, legacy
  exceptions, aliases, duplicates, workspaces, and deterministic decisions.
- Adversarial provenance tests prove re-exports, facades, aliases, hoisting, duplicate names, and
  virtual modules cannot launder a denied package identity.
- Real Vite/Rollup, Webpack, and Bun builds prove identical decisions over equivalent graphs and
  reject unauthorized server component code before evaluation.
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

1. The compiler contains no component-library trust configuration, marker interpretation,
   authorization logic, or duplicate diagnostics.
2. Every supported bundler uses one shared policy engine and rejects unauthorized server component
   code before evaluation in production, development, HMR, and server-test builds.
3. `@exactjs/component-library` classifies compatible component packages without granting trust,
   registering components, executing code, or participating in plugin lifecycle.
4. Root, configured, delegated, and denied decisions use resolved package-instance provenance and
   remain deterministic across aliases, re-exports, workspaces, duplicates, and virtual modules.
5. Client-only component code requires no additional eXact component-library authorization.
6. SSR, server components, server enhancements, owned server tasks, refresh, resumption, and server
   tests admit only authorized component-library code.
7. Optional unauthorized enhancements remain inactive or fail under explicit strict policy;
   required unauthorized server components always fail the build.
8. HMR reports the authoritative bundler diagnostic without evaluating or activating the rejected
   generation and preserves the last valid graph.
9. Build manifests and fingerprints preserve authorization agreement across paired server/client,
   continuation, test, and microfrontend artifacts without exposing sensitive provenance.
10. Component-library authorization remains independent from framework-plugin discovery and is
    documented as supply-chain authorization rather than sandboxing.
