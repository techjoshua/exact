# Current Manifest Usage Inventory

## Scope

This inventory covers the generated eXact compiler/artifact manifest represented
by `ExactCompilerManifest` and usually written as
`*.exact.manifest.json`. It does not cover `package.json`, Vite's asset
manifest, or the smaller runtime objects also named "manifest" by the server
and hydration packages.

The important distinction is between:

- the compiler manifest object produced during analysis;
- the JSON sidecar used to persist and exchange that object;
- the reduced server manifest derived from compiler manifests at startup;
- the hydration registration/config serialized or registered in the browser.

Eliminating the JSON sidecar does not require eliminating all four concepts.

## Summary

The client-island implementation registry has already moved away from JSON
manifest files. Client and server artifacts attach versioned descriptors to
their exported component functions under global symbols. An application can
import its root components and call `composeExactComponentDescriptors()` to
obtain the runtime-name-to-implementation lookup used by hydration.

The compiler manifest is still used in four broad areas:

1. cross-file and cross-package compiler analysis;
2. artifact planning, incremental compilation, and generated module creation;
3. construction of server action/boundary allowlists and hydration contracts;
4. policy, capability, plugin, and diagnostic reporting.

Most project-local compilation already passes manifests in memory. The
strongest remaining reasons for manifest _files_ are restarting incremental
build state, advertising metadata from installed component packages, and
application server entrypoints that import the JSON to construct their runtime
allowlists.

## Current data flow

```text
source
  -> compiler analysis
  -> ExactCompilerManifest (in memory)
       -> client/server code generation
       -> descriptors attached to component functions
       -> project/package analysis inputs
       -> artifact graph and generated registration modules
       -> *.exact.manifest.json
            -> retained watch-state reload
            -> installed-package discovery
            -> application server import
                 -> reduced ExactServerManifest
                      -> server allowlists and validation
                      -> serialized hydration contracts/routes
```

## Component descriptors and island identifiers

The newer descriptor path works as follows:

- `exactComponentDescriptorTransformer()` reads the compiler manifest's
  component and symbol records while generating each target artifact.
- It assigns a tuple `[id, runtimeName, implementation]` to the exported
  component function using either
  `Symbol.for('@exactjs/client-component-descriptor')` or
  `Symbol.for('@exactjs/server-component-descriptor')`.
- `composeExactComponentDescriptors()` reads those properties from imported
  component functions and returns a registry keyed by `runtimeName`.
- SSR writes that runtime name to `data-exact-client-name`.
- Hydration reads the name and selects the implementation from the composed
  registry.

Therefore, the browser does not need the compiler manifest or a generated
JSON-backed island registry to resolve an island implementation. The shipping
calculator already uses this direct path.

There are two qualifications:

- Descriptor attachment is generated from manifest data during compilation,
  so this removes a runtime/file dependency but not the compiler's internal
  metadata requirement.
- The descriptor carries the stable symbol ID, but
  `composeExactComponentDescriptors()` currently discards it and keys the
  returned registry by generated runtime name. Boundary IDs remain a separate
  server/hydration concern.

The compiler still exposes the older manifest-derived client-island and
server-part registry generators for compatibility. The generated hydration
registration module uses the new descriptor composition path for
implementations, but still uses the artifact graph/manifests to decide which
root exports to import and to emit action state contracts and action-to-boundary
mappings.

Server descriptors are emitted and composable, but no production call site in
the repository currently composes them. The sample servers import their server
component roots directly and construct handler maps separately.

## Where the JSON files are used

### Artifact emission

`compileFileArtifacts()` and project artifact compilation currently write one
sidecar for every compiled source artifact set. The file includes both analysis
metadata and relative client/server/shared artifact paths.

This is unconditional for the paired-artifact APIs, even though the compile
result also returns the same manifest object in memory.

### Incremental development state

The initial `createExactArtifactDevState()` build retains manifest objects in
its graph entries. During an update, however, unchanged entries are reconstructed
by rereading their manifest files through
`readExactArtifactManifestEntries()`. Those retained manifests are then passed
to compilation of changed sources.

This file dependency appears removable for a live process: the previous
state already contains the retained entries and their manifest objects. A file
or cache format would only be needed for restart persistence or communication
between processes.

### Installed package discovery

`discoverExactPackageManifests()` finds the nearest `node_modules`, scans
installed packages, reads `package.json#exact.manifests`, and loads each
advertised JSON file. Those manifests provide cross-package placement, symbol,
call-effect, policy, capability, and plugin-registry information.

This is the most substantive cross-package file contract today. That describes
the current implementation, not an architectural requirement. The removal plan
replaces consumer-side dependency analysis with target-specific executable
artifacts, server boundary stubs, declarations, and component-attached
contracts.

### Build adapters

The Vite, Webpack, and Bun compiler adapters accept both:

- `importedManifests`, for in-memory metadata; and
- `manifestFiles`, which are reread for each transform so watch pipelines see
  fresh metadata.

The file option is a coordination mechanism rather than an analysis
requirement. A build adapter that owns the project compiler session can supply
the same objects in memory.

### Application server entrypoints

The server-components and shipping-calculator samples import generated JSON
files and pass them to `createExactServerManifest()`.

That conversion extracts:

- server/isomorphic action IDs and their component/task identities;
- state and context contracts;
- client-island/server-slot boundary records;
- non-client component IDs as root fallback boundaries;
- the compiler plugin-registry fingerprint.

The resulting reduced `ExactServerManifest`, not the full compiler manifest,
is what the request runtime and SSR handler registry use.

## Manifest object consumers

| Data                           | Current consumers                                                                 | Why it exists today                                                                |
| ------------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `filename`, `dependencies`     | import matching and watch invalidation                                            | Relate imports and changed files back to source modules                            |
| `components`, `exports`        | imported-component placement, artifact generation, root server boundaries         | Classify components and preserve component identity across compilation units       |
| `symbols`                      | descriptor attachment, generated imports, compatibility registries                | Relate public roots and generated client/server implementations                    |
| `boundaries`                   | server allowlist, refresh handlers, hydration action mappings                     | Authorize and route refreshable client islands and server slots                    |
| `callables`                    | cross-module effect analysis and project fixed-point compilation                  | Propagate browser/server effects, calls, state effects, and context effects        |
| `serverActions`                | server allowlist, state/context validation, hydration config                      | Authorize action dispatch and constrain client-supplied state/context              |
| `policy`                       | imported context policy, secret grants, audit reports                             | Carry residency and secret-flow requirements across packages                       |
| `requiredCapabilities`         | application capability grants                                                     | Require explicit application approval for dependency capabilities such as raw HTML |
| `pluginRegistry`, `pluginData` | compiler compatibility, runtime fingerprint, plugin-owned metadata                | Ensure separately compiled packages used compatible plugin protocols               |
| `artifacts`                    | sidecar reload and graph reconstruction                                           | Locate the source and generated target files                                       |
| `assets`                       | shared-artifact eligibility and external consumers                                | Record non-code dependencies and delivery classification                           |
| `semanticGraph`                | validation and shared-artifact eligibility; no later core production reader found | Preserve declaration/reference/export analysis                                     |
| `diagnostics`                  | transform failure/reporting                                                       | Return compiler and plugin findings                                                |

Some of these fields are compiler working data rather than publication or
runtime contracts. They should not all survive in one monolithic replacement.

## Runtime server uses

After `createExactServerManifest()` reduces compiler data, the server manifest
is used to:

- reject action or refresh IDs that are not allowlisted;
- validate that submitted boundary snapshots are allowed for an action;
- reject snapshot IDs absent from the boundary allowlist;
- validate submitted state against compiler-derived read/write contracts;
- validate submitted serialized context against context contracts;
- enforce configured endpoint routing;
- construct only those action and refresh handlers present in both the
  allowlist and application handler maps;
- expose action state contracts and action-to-boundary mappings to hydration;
- compare the server and client plugin-registry fingerprints.

These are active security and protocol roles. Removing the compiler JSON import
from a server entrypoint still requires a trusted way to construct this reduced
runtime data.

## Likely reduction opportunities

### 1. Stop rereading retained manifests in a live dev state

Use the retained entries already held by `ExactArtifactDevState`. Keep optional
persistence as a separate cache concern. This is the smallest, lowest-risk
file-use removal.

### 2. Make in-memory metadata the default adapter path

Let the owning project compiler/build session provide dependency summaries
directly to Vite, Webpack, and Bun transforms. Retain `manifestFiles` only as a
compatibility path until all official integrations own a shared session.

### 3. Replace application JSON imports with generated ESM metadata

A generated server entry module could export the reduced action/boundary
contract, or server artifacts could attach a second restricted descriptor that
can be composed from application imports. This would remove JSON imports from
application code while preserving tree shaking and runtime allowlisting.

The restricted descriptor should contain declarations and IDs, not executable
dispatch selected from client input. Application handler implementations must
still be explicitly composed and matched against the allowlist.

### 4. Remove the published compiler-analysis contract

Do not replace the monolithic manifest with a smaller trusted assertion from
the dependency. Compile the library's own source graph, publish target-specific
artifacts and declarations, and make the artifacts self-sufficient at runtime.
The consuming compiler should not need the dependency's internal:

- component placement analysis;
- callable/module effect graph;
- policy flow graph;
- plugin configuration fingerprint;
- generated-symbol table.

Stable identities and runtime contracts travel as properties attached to the
target-specific component functions. Public secret qualification travels
through declarations. Ordinary dependencies and versioned runtime imports
express plugin requirements.

### 5. Retire compatibility registries after descriptor adoption

Once all applications and package fixtures use component-attached descriptors,
remove the standalone client-island/server-part registry entry and module
generators. The artifact graph may still need symbol information to generate
imports, but it would no longer need to generate implementation registries from
manifest symbols.

### 6. Separate inspection output

Policy reports, semantic graphs, diagnostics, and debug metadata can remain
optional compiler inspection output without being required inputs to a build or
runtime. This makes observability available without forcing every application
to ship sidecars.

## Proposed next audit

Before choosing a replacement format:

1. classify every manifest field as compiler-local, project-session,
   package-publication, runtime-security, or inspection-only;
2. prove the project compiler can build and incrementally rebuild without
   reading any sidecar it emitted;
3. design the minimal cross-package summary around actual imported-analysis
   readers;
4. design a composable server contract for actions, boundaries, contracts, and
   plugin fingerprinting;
5. migrate the two sample servers away from JSON imports;
6. remove compatibility registry generation and then make sidecar emission
   opt-in.
