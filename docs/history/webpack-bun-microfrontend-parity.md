# Webpack and Bun microfrontend production parity

## Status

Implemented and archived in August 2026. Webpack 5 and Bun 1.3+ now consume the shared artifact
plan, emit actual exposure entries and reachable resources, preserve provided-package identity,
publish only accepted generations, enforce paired authorization identity, expose stable
development entries, and release replaced build state. Real production fixtures cover CSS,
assets, lazy chunks, output-derived URLs, coordinator enforcement, and failure retention alongside
the bundler-neutral and portal runtime conformance suites.

The implementation followed the completed compiler and SSR boundary work, including
[`enhancements-as-component-composition.md`](enhancements-as-component-composition.md),
[`server-component-library-trust.md`](server-component-library-trust.md),
[`enhancement-first-internationalization.md`](enhancement-first-internationalization.md),
[`component-value-callback-bindings.md`](component-value-callback-bindings.md),
[`compiler-owned-render-programs.md`](compiler-owned-render-programs.md),
[`bounded-deterministic-async-ssr.md`](bounded-deterministic-async-ssr.md),
[`compact-hydration-publication.md`](compact-hydration-publication.md), and
[`lazy-interaction-islands.md`](lazy-interaction-islands.md). The dependent-foundation
experiments 2–4 and 6 in
[`javascript-performance-improvements.md`](javascript-performance-improvements.md) are resolved by
the focused prerequisites above and the implemented transport/build-host work. The trusted
microfrontend model and Vite/Rollup producer/consumer path are implemented. The completed adapter
conformance treats compiler-emitted enhancement catalogs and framework-plugin projections as
separate inputs, preserve activator-resolved canonical component identities, and apply the shared
bundler component-library trust policy before server evaluation and consistently across paired
server/client artifacts. Adapters must also emit reachable package/application locale catalogs and
Unicode formatter data under the shared artifact contract. Webpack and Bun
currently have focused artifact-mapping feasibility proofs, not complete lifecycle integration or
heterogeneous production conformance.

The architecture review confirms this remains a real adapter gap rather than compiler work. The
Webpack and Bun plugins already compile ordinary applications, resolve target facades, enforce
component-library authorization, and share Intl coordination. What remains here is specifically
microfrontend producer/consumer lifecycle integration and the heterogeneous production matrix.
Deferred structural render-program extensions are not prerequisites. Compiler-authored runtime
capabilities and optional facades are implemented
foundations. The remote-candidate slice of
[`compiler-authored-dynamic-component-boundaries.md`](compiler-authored-dynamic-component-boundaries.md)
consumes the artifacts produced here, but base dynamic components do not block this work. There are
no remaining architecture decisions before implementation.

| Delivery area          | Vite/Rollup                | Webpack and Bun current state | Proposed state                         |
| ---------------------- | -------------------------- | ----------------------------- | -------------------------------------- |
| Exposure entries       | Production integration     | Feasibility mapping           | Production emission and manifests      |
| Virtual modules        | Integrated resolution/load | Mapping proofs                | Adapter lifecycle integration          |
| CSS/assets/chunks      | Conformance coverage       | Incomplete                    | Reachable and deployable               |
| Development discovery  | Integrated                 | Incomplete                    | Stable watch/dev entry discovery       |
| Provided packages      | Bootstrap ordering covered | Mapping proof                 | Host/remote bootstrap parity           |
| Heterogeneous fixtures | Vite reference path        | Missing                       | Cross-bundler producer/consumer matrix |

## Decision

Implement Webpack and Bun as adapters over the existing tool-neutral microfrontend artifact plan,
exposure registration, provided-package bridge, execution-root identity, gateway transport,
hydration ownership, generation fencing, and recovery policy. Do not fork the microfrontend runtime
or create bundler-specific public contracts.

## Public and package contract

`@exactjs/microfrontends` remains the sole owner of `ExactRemoteArtifactPlan`, exposure and
provided-package source generation, registration records, manifest schema, and conformance
fixtures. No microfrontend configuration key changes. Webpack and Bun add the same optional
`onRemoteEntries(entries)` and `onRemoteDevelopmentEntries(entries)` callbacks already exposed by
the Vite plugin. The callbacks publish immutable exposure-to-client-entry maps only after a valid
generation; they are build integration hooks, not protocol identity.

`@exactjs/webpack-plugin` and `@exactjs/bun-plugin` dynamically import the focused
microfrontend integration only when the loaded eXact configuration contains exposures, remotes, or
provided packages. Ordinary applications retain their current dependency and bundle closure.
Adapter-owned module IDs, entry names, output paths, and hook carriers stay private.

The Bun package additionally exports `exactBuild(options)`, a thin coordinator around `Bun.build`.
It prepares the neutral artifact plan before the build, appends its exposure entrypoints, installs
`exact()` plus generated-module resolution, and publishes a generation only after `onEnd`
validation. Bun permits synchronous `build.config` changes during plugin setup, but the shared
configuration and artifact preparation is asynchronous and `onStart` cannot modify that config.
Consequently, direct `Bun.build({ plugins: [exact()] })` remains supported for ordinary builds but rejects a
configuration containing remote exposures with an actionable instruction to use `exactBuild()`.
This limitation is build-time API shape only and does not create a different runtime contract.

Webpack needs no wrapper: its plugin prepares the plan and adds entry dependencies through the
compilation lifecycle before module graph construction. Page-host-only remote consumption that has
no local exposures continues to use the ordinary plugin on both bundlers.

## Goals

- Produce independently loadable exposure entries with correct registration metadata.
- Resolve and load compiler-generated enhancement/artifact modules and framework-plugin-generated
  virtual modules through each bundler's native lifecycle without conflating their trust or
  invalidation paths.
- Enforce the shared component-library policy over resolved package instances before server module
  evaluation, including development and HMR.
- Preserve CSS, static asset, dynamic import, and public chunk URL reachability.
- Publish provided-package instances before any remote registration or hydration consumes them.
- Keep SSR and client artifacts on one exact exposure/build contract.
- Preserve activator-selected enhancement component identities, bundle-local catalog inclusion,
  direct `_` composition boundaries, and bounded root-frame hydration agreement inside exposed
  components.
- Support watch invalidation and development entry discovery without stale registrations.
- Prove heterogeneous page-host/component-host combinations across supported bundlers.

## Non-goals

- Redesigning trusted microfrontend authorization, gateway, or component ownership.
- Deployment discovery, signing, rollout orchestration, or service operation.
- Semver-based sharing of arbitrary compatible-looking package instances.
- Module Federation compatibility as an alternate runtime architecture.
- Primary page-bundle replacement or component-authenticated protocol messages.

## Shared adapter contract

Each adapter consumes the same prepared microfrontend projection and compiler artifact graph. It
must implement bundler-native equivalents for:

- registering exposure and provided-package entry inputs;
- resolving and loading generated entry, component facade, registration, and bridge modules;
- externalizing configured provided packages only inside remote exposure graphs;
- recording emitted entry, CSS, asset, and dynamic chunk locations;
- producing one build-scoped exposure manifest;
- injecting or ordering the page-host provided-package bootstrap;
- linking compiler-emitted enhancement component fragments into the responsible artifact's local
  catalog independently of framework-plugin discovery;
- linking reachable application and component-library message catalogs, formatter modules, and
  Unicode unit-data fragments by locale without treating catalog data as executable plugin code;
- supplying resolved package-instance and artifact provenance to the shared component-library trust
  engine before accepting server entries or replacement modules;
- invalidating plans and virtual modules after source/config changes; and
- disposing compiler/plugin state with the bundler lifecycle.

Generated module IDs and output paths remain adapter details. Runtime registration uses the existing
opaque build, execution-root, exposure, and component contracts.

An accepted exposure record also carries its canonical immutable client artifact URL plus integrity,
credentials/CORS, and referrer-policy metadata when the deployment supplies them. That metadata is
the only input made available to SSR preload planning or a compiler-authored dynamic boundary. It
does not authorize a generic dynamic component to use server operations, and this proposal does not
add a dynamic-component resolver.

## Ownership boundaries

- `@exactjs/microfrontends` owns preparation, generated sources, manifest validation, runtime
  registration contracts, and the adapter-neutral fixture oracle.
- Vite/Rollup remains the reference adapter, not a separate semantic authority.
- `@exactjs/webpack-plugin` owns Webpack hooks, virtual module plumbing, emitted-output indexing,
  cache dependencies, and generation disposal.
- `@exactjs/bun-plugin` owns `exactBuild()`, Bun hooks, emitted-output indexing, watch coordination,
  and generation disposal.
- Existing component-library policy, Intl build, enhancement catalogs, gateway, server, hydration,
  and runtime packages retain their present authority. Adapters pass their results through and do
  not reimplement them.

## Webpack integration

Using Webpack's documented
[`beforeCompile`, `make`, and completion hooks](https://webpack.js.org/api/compiler-hooks/), the
adapter prepares one immutable plan, registers explicit entry
dependencies, and installs generated entry/facade/registration/bridge modules through normal module
resolution compatible with persistent caching. `processAssets` records actual entry chunks, CSS,
assets, and transitive dynamic chunks after sealing. `done` publishes callbacks and the accepted
generation only after compilation succeeds. `invalid`, `failed`, and `shutdown` discard or dispose
the pending generation; a failed watch build leaves the last accepted development generation
active rather than partially replacing it. Provided-package bootstrap is an explicit dependency of
configured page entries and precedes their evaluation without relying on incidental chunk order or
an HTML plugin.

Watch invalidation must cover exposure components, enhancement export/activator maps, enhancement
catalog inclusion policy, component-library trust configuration and marker dependencies, exact
configuration, framework-plugin projections, generated registration modules, provided-package
imports, and compiler graph changes. Enhancement changes must not require preparing an unrelated
framework-plugin registry. Authorization errors should preserve resolved package and exposure
provenance rather than leaking virtual IDs as user action items, and rejected HMR generations must
not be evaluated.

## Bun integration

`exactBuild()` prepares exposure entrypoints before calling `Bun.build`. The installed plugin uses
`onStart` to open the generation, `onResolve`/`onLoad` for generated modules and provided bridges,
and `onEnd` to validate actual build outputs, record dynamic chunks/CSS/assets, and publish the
accepted entry map. Output URLs derive from actual outputs plus configured public path, never from
predicted filenames. Failure disposes the pending plan and retains the preceding accepted
development registration. These are the documented
[`BunPlugin` lifecycle hooks](https://bun.sh/reference/bun/BunPlugin); preparation does not depend on
an adapter-private Bun patch.

In watch mode, the coordinator tracks eXact config, exposure components, generated sources, trust
markers, catalogs, and compiler graph inputs. A relevant change starts a fresh coordinated build;
it never mutates the active plan. Bun server `--hot` remains unsupported because it cannot preserve
the required last-valid authorization and registration generation. The adapter rejects that mode
instead of approximating stale production behavior.

## Conformance matrix

Fixtures should cover page host and component host combinations where each side uses Vite, Webpack,
or Bun. The required production matrix includes at least:

- same-bundler host and remote for all three tools;
- Vite page with Webpack and Bun remotes;
- Webpack and Bun pages with a Vite remote; and
- one page loading simultaneous remotes produced by different bundlers.

Each fixture verifies initial registration, provided-package identity, CSS/assets, lazy chunks, SSR
and hydration agreement, invocation/refresh routing, stale-build recovery, upgrade fencing, and
disposal. At least one heterogeneous fixture must expose a component using several
activator-selected enhancements with shared props, a direct `_` enhancement chain, translated
package-owned messages, automatic unit conversion, and conditional root-bearing-frame changes; its
server and client artifacts must include the same authorized enhancement and locale-catalog
identities. Unsupported tool/version combinations must be explicit in package documentation and
release checks.

## Performance and generation-retention constraints

Adapter parity must include the lifecycle behavior in
[`javascript-performance-improvements.md`](javascript-performance-improvements.md), not only equivalent
output files:

- prepared artifact graphs, trust provenance, virtual modules, enhancement catalogs, translation
  catalogs, Unicode data, and emitted-asset indexes are released or replaced with their compilation
  generation;
- runtime registrations retain compact build/exposure/component identities and loaded module
  instances, not compiler graphs or bundler result objects;
- stale, rejected, upgraded, and disposed remote generations release loaders, catalog fragments,
  SSR ownership, queued activation records, and gateway state once generation fencing permits;
- shared provided-package, formatter-data, and catalog instances use explicit host-owned caches with
  observable bounds rather than one unbounded cache per adapter or remote; and
- Webpack persistent cache and Bun development state may persist serialized build products, but
  must not keep duplicate live JavaScript object graphs after invalidation.

Adapters must preserve per-root runtime capability splitting, compact hydration records, lazy
artifact preload hints, and the shared progressive bootstrap rather than rebundle an eager universal
runtime for remote exposures. Gateway forwarding should preserve validated streams without
parse/stringify translation unless build/binding identity or host policy actually requires a
rewrite.

The heterogeneous fixtures should record client retained heap, initial/lazy compressed bytes,
remote activation latency, server/gateway throughput, and server/build peak heap across remote load,
upgrade, rejection, and disposal. Equivalent behavior includes reaching a stable heap plateau after
repeated remote-generation churn without regressing the Vite reference path's startup or request
latency materially.

## Delivery order

1. Promote feasibility mappings into shared adapter conformance helpers and ratify the callbacks,
   accepted-generation record, immutable artifact metadata, and Bun `exactBuild()` contract.
2. Complete Webpack production entry, generated-module, output-index, callback, and lifecycle work.
3. Complete Bun coordinator, production entry, generated-module, output-index, callback, and
   lifecycle work.
4. Add watch/development discovery and invalidation for each adapter.
5. Add provided-package bootstrap ordering and SSR/client agreement tests.
6. Run the heterogeneous fixture matrix and add it to affected/full release profiles.
7. Update current references and public docs only when each adapter meets the advertised contract.

## Verification

- Focused adapter tests for hooks, virtual modules, entry naming, invalidation, and disposal.
- Public contract tests for callback parity, Bun coordinator entry merging, direct-build rejection
  with exposures, and zero microfrontend imports for ordinary builds.
- Real production builds proving CSS, asset, and dynamic chunk URL reachability.
- SSR/client artifact comparisons for exact build and exposure identities.
- Enhancement artifact comparisons for activator-resolved canonical identities, inclusion-policy
  decisions, catalog locality, and root-frame hydration agreement without plugin discovery.
- Provided-package tests proving one page-realm instance and deterministic bootstrap order.
- Heterogeneous browser/server fixtures for loading, interaction, refresh, upgrade, stale responses,
  recovery, and cleanup.
- Package-content and release checks proving generated fixtures do not leak absolute paths or
  server-only artifacts into client output.

## Acceptance criteria

1. Webpack and Bun produce and consume trusted microfrontend exposures with the same runtime contract
   as Vite/Rollup.
2. CSS, assets, dynamic chunks, and public URLs remain reachable in production output.
3. Provided packages publish before remote registration and preserve exact runtime identity.
4. Watch changes cannot leave an old exposure or registration active under a new build identity.
5. SSR and client artifacts agree on exposure, build, and execution-root ownership.
6. The heterogeneous conformance matrix passes for every advertised bundler combination.
7. No bundler-specific path, module ID, or lifecycle detail becomes public protocol identity.
8. Enhancement catalog construction remains independent of framework-plugin discovery and produces
   matching authorized component identities in every advertised server/client bundler pairing.
9. Failed or invalidated builds never publish partial entry maps and retain at most the last
   accepted development generation with bounded disposal.
10. Webpack and Bun publish the same immutable client artifact metadata for preload/dynamic
    consumers without granting generic dynamic components server authority.
11. The Bun exposure path has one supported, fully named build coordinator; unsupported `--hot` and
    direct-build exposure modes fail before producing ambiguous artifacts.
