# Webpack and Bun microfrontend production parity

## Status

Proposed after the higher-leverage compiler and SSR boundary work, including
[`enhancements-as-component-composition.md`](../history/enhancements-as-component-composition.md),
[`server-component-library-trust.md`](../history/server-component-library-trust.md),
resolution or explicit rejection of
[`cooperative-structured-children.md`](cooperative-structured-children.md), and
[`enhancement-first-internationalization.md`](enhancement-first-internationalization.md),
[`component-value-callback-bindings.md`](../history/component-value-callback-bindings.md),
[`compiler-owned-render-programs.md`](../history/compiler-owned-render-programs.md),
[`bounded-deterministic-async-ssr.md`](../history/bounded-deterministic-async-ssr.md),
[`compact-hydration-publication.md`](../history/compact-hydration-publication.md),
[`lazy-interaction-islands.md`](lazy-interaction-islands.md),
[`compiler-planned-structural-refresh.md`](compiler-planned-structural-refresh.md), and
[`partial-prerender-resumption.md`](partial-prerender-resumption.md). The dependent-foundation
experiments 2–4 and 6 in
[`javascript-performance-improvements.md`](javascript-performance-improvements.md) are resolved by
the focused prerequisites above and the implemented transport/build-host work. The trusted
microfrontend model and Vite/Rollup producer/consumer path are implemented. Final adapter
conformance must treat compiler-emitted enhancement catalogs and framework-plugin projections as
separate inputs, preserve activator-resolved canonical component identities, and apply the shared
bundler component-library trust policy before server evaluation and consistently across paired
server/client artifacts. Adapters must also emit reachable package/application locale catalogs and
Unicode formatter data under the shared artifact contract. Webpack and Bun
currently have focused artifact-mapping feasibility proofs, not complete lifecycle integration or
heterogeneous production conformance.

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

## Webpack integration

The Webpack adapter should use explicit entry dependencies and virtual-module resolution compatible
with persistent caching. Chunk and asset discovery occurs after compilation sealing through supported
compilation hooks. Provided-package bootstrap must precede page entry evaluation without relying on
incidental chunk ordering.

Watch invalidation must cover exposure components, enhancement export/activator maps, enhancement
catalog inclusion policy, component-library trust configuration and marker dependencies, exact
configuration, framework-plugin projections, generated registration modules, provided-package
imports, and compiler graph changes. Enhancement changes must not require preparing an unrelated
framework-plugin registry. Authorization errors should preserve resolved package and exposure
provenance rather than leaking virtual IDs as user action items, and rejected HMR generations must
not be evaluated.

## Bun integration

The Bun adapter should register exposure entrypoints and generated modules through its plugin
resolution/load hooks while respecting the configured output directory and public path. It must
record dynamic chunks, CSS, and assets from actual build outputs rather than predict filenames.

Development mode needs stable entry discovery and invalidation despite Bun's different watch/server
lifecycle. If Bun lacks a required lifecycle hook, the adapter should fail explicitly or document a
narrower mode instead of approximating stale production behavior.

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

1. Stabilize shared adapter conformance helpers around the existing Vite path.
2. Complete Webpack production entry, virtual-module, asset, and manifest lifecycle.
3. Complete Bun production entry, virtual-module, asset, and manifest lifecycle.
4. Add watch/development discovery and invalidation for each adapter.
5. Add provided-package bootstrap ordering and SSR/client agreement tests.
6. Run the heterogeneous fixture matrix and add it to affected/full release profiles.
7. Update current references and public docs only when each adapter meets the advertised contract.

## Verification

- Focused adapter tests for hooks, virtual modules, entry naming, invalidation, and disposal.
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
