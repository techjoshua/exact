# Compiler manifest usage inventory

Status: current inventory. Last reconciled with the repository after executable
component contracts replaced sample runtime JSON imports.

This document concerns `ExactCompilerManifest` and generated
`*.exact.manifest.json` analysis sidecars. It does not concern `package.json`,
Vite asset manifests, plugin package manifests, or runtime values that happen
to use the generic word “manifest.”

## Current summary

The compiler manifest remains active as analysis and build coordination data.
It is no longer required by the browser to resolve client islands, and the
server-component and shipping samples no longer import compiler JSON files to
construct runtime authority.

Current application runtimes compose executable contracts from imported
server component roots:

```ts
const contract = composeExactExecutorContract([App], {
	endpoint: '/__exact',
	actions: {
		save: defineExactActionContract('save', {
			writes: [
				/* ... */
			]
		})
	}
});
```

Compiler-generated component functions carry target-local versioned contracts
under private global symbols. Server composition reads executor contracts from
the imported roots. Generated hydration registration modules import client
islands lazily and publish inert continuation descriptors without evaluating
every island chunk.

The remaining manifest sidecar uses are compiler/build concerns:

1. cross-file and cross-package semantic analysis;
2. artifact planning and emitted-path discovery;
3. incremental development-state reconstruction;
4. installed component-package metadata discovery;
5. optional adapter inputs and compatibility APIs; and
6. policy, capability, plugin, and diagnostic reporting.

## Current data flow

```text
source graph
  -> compiler analysis
  -> ExactCompilerManifest values in memory
       -> client/server/shared artifact generation
       -> contracts attached to executable component exports
       -> artifact graph and lazy hydration registration
       -> optional/currently required sidecar writes
            -> retained dev-state reload
            -> installed-package discovery
            -> adapter manifestFiles inputs

server application imports generated component roots
  -> composeExactExecutorContract(...)
  -> runtime action/boundary allowlist and state/context contracts

browser imports generated hydration registration
  -> lazy component loaders plus inert continuation descriptors
```

## Executable component contracts

Generated component artifacts carry the facts needed by their target runtime:

- stable component identity;
- client island runtime name and implementation;
- server action and refresh boundary contracts;
- state, context, capture, and continuation records; and
- target-local registration details.

`composeExactExecutorContract()` rejects conflicting component, action,
boundary, and protocol identities. `createExactHydrationConfig()` derives the
client-safe runtime contract from the composed executor authority.

This path preserves tree shaking because importing an application root reaches
only its executable component graph. The browser does not import
`ExactCompilerManifest`, and generated operation names remain private.

## Remaining sidecar producers

### Paired artifact compilation

`compileFileArtifacts()` and project artifact compilation write a sidecar for
each generated artifact set. The same analysis value is also returned in
memory.

### Single-file compilation

`compileFile()` writes a manifest only when `emitManifest` is requested.
The CLI still exposes manifest-emitting workflows and reports emitted paths.

### Package publication fixtures

Compiler package tests still publish `package.json#exact.manifests` entries and
verify `discoverExactPackageManifests()`. This remains the current
cross-package analysis contract for independently compiled component packages.

## Remaining sidecar consumers

### Incremental development state

`createExactArtifactDevState()` retains manifest values in memory, but update
handling reconstructs unchanged entries by calling
`readExactArtifactManifestEntries()` on retained sidecar paths. A live process
already owns enough data to avoid this reread; restart persistence is a
separate concern.

### Installed package discovery

`discoverExactPackageManifests()` scans installed package metadata, reads
advertised sidecars, and supplies cross-package effects, placement, policy,
capability, plugin, and symbol facts to compilation.

This is the most substantial remaining public file contract. Removing it
requires target-specific executable artifacts and declarations to become
self-sufficient for every supported package boundary.

### Build adapters

Vite, Webpack, and Bun compiler adapters still accept:

- `importedManifests` for in-memory analysis; and
- `manifestFiles` for file-backed analysis that can be reread during watch.

Official adapters use the same validation helpers. Removing file inputs should
follow ownership of one long-lived project compiler session rather than
creating host-specific caches.

### Compiler analysis

Imported manifest values remain inputs to callable-effect propagation,
component placement, policy/secret analysis, raw-HTML capability checks,
plugin metadata validation, and artifact graph construction. Tests exercise
these paths directly even when no disk file is involved.

## Manifest field disposition

| Data                                    | Current role                          | Intended long-term owner                     |
| --------------------------------------- | ------------------------------------- | -------------------------------------------- |
| source dependencies and exports         | Project graph and invalidation        | In-memory compiler session                   |
| callable/effect graph                   | Cross-module placement and writes     | Compiler session; not runtime                |
| component/symbol/artifact records       | Target emission and generated imports | Compiler session plus executable exports     |
| action/boundary/state/context contracts | Runtime dispatch authority            | Composed executable executor contracts       |
| policy and secret flow                  | Cross-package disclosure checks       | Declarations and compiler-local analysis     |
| capabilities and plugin data            | Build validation and audit            | Package/runtime protocol contracts as needed |
| semantic graph and diagnostics          | Validation and inspection             | Optional reports; never runtime inputs       |

These responsibilities must not be copied into a differently named monolithic
file.

## Compatibility surfaces to remove last

The compiler still exposes eager client-island/server-part registry generators,
package manifest discovery, sidecar readers, `manifestFiles`,
`importedManifests`, and manifest-bearing artifact result types. They remain
tested current APIs until the replacement is complete.

Deleting them before executable package contracts cover every consumer would
weaken placement, tree shaking, or server allowlisting. Conversely,
application code should not add new dependencies on them.

## Next implementation sequence

The active proposal is
[`proposals/remove-compiler-manifests.md`](proposals/remove-compiler-manifests.md).
The least disruptive sequence is:

1. stop rereading unchanged sidecars in live dev state;
2. make official adapters share in-memory project sessions;
3. complete self-sufficient executable/declaration contracts for published
   packages;
4. replace installed-package manifest discovery;
5. remove compatibility registry generators and file options;
6. make compiler analysis entirely ephemeral; and
7. delete the manifest schema and sidecar emission.

After the final removal, delete both this inventory and the proposal. Current
architecture references should then describe only the replacement contracts.
