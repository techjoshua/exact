# Compatible evolution of compiled components

## Status and scope

Proposed architecture for compiler, runtime, build-adapter, and release maintainers. This document
does not introduce runtime exports, change the release gate, or claim that mixed epochs work today.
Epoch 2 is the starting compatibility baseline. Epoch 1 remains unsupported, and its frozen
fixtures continue to verify rejection before construction or DOM mutation.

A precompiled component library should be able to use a newer supported runtime without requiring
its author to rebuild the library for every framework release. Applications should receive runtime
repairs while paying for older compatibility code only when their retained components need it.
Build reports should identify the dependencies responsible for that code.

The existing [artifact contract](../compiled-component-artifacts.md) and
[release policy](../release-readiness.md#abi-compatibility) remain authoritative until implementation
and acceptance establish the guarantees below.

## Compatibility model

Preserve each supported compiled entry point's contract. Improve its implementation in place when
arguments, results, layout assumptions, observable behavior, ownership, cancellation, cleanup, and
failure boundaries remain compatible. Introduce a distinct entry point when those semantics must
change. Matching TypeScript signatures alone does not establish compatibility.

An epoch identifies a compatible family of artifact contracts. It does not require a separate copy
of the framework. Multiple epochs should share implementations whose contracts have not changed.
Version an individual helper independently when its change can be isolated. Advance the artifact
epoch when component layout or composition semantics require a coordinated contract change.

Keep these identities distinct:

| Identity                           | Responsibility                                               |
| ---------------------------------- | ------------------------------------------------------------ |
| Package version                    | Installed implementation and dependency minimums             |
| Artifact epoch                     | Component construction and composition contract              |
| Helper entry point and revision    | Semantics expected by a particular generated call            |
| Wire or hydration protocol version | Serialization and interpretation across a transport boundary |

Adding a helper does not retire an older one. A newer artifact may require a higher runtime minimum
without breaking older artifacts. Compatibility is directional: a newer runtime can support older
artifacts, but an older runtime need not execute newly emitted helpers.

## Static epoch entry points

Use explicit ESM subpaths for epoch-sensitive operations, retaining the existing focused division
by capability and execution target. The following names are illustrative, not proposed final exports:

```ts
// An older compiled module imports only its required operation.
import { attachComponent } from '@exactjs/core/abi/2/component';

// A future module can select an incompatible revision explicitly.
import { attachComponent } from '@exactjs/core/abi/3/component';
```

Each entry point statically references its own implementation or a compatible shared implementation.
Do not create an eager registry importing every epoch or select helper implementations through a
global runtime version switch. New epoch modules must not transitively retain old implementations
unless a supported mixed composition actually requires that bridge. Shared low-level modules must
not import back through epoch facades.

Existing epoch-2 artifacts already import unversioned paths such as
`@exactjs/core/runtime/component-operations`. Those paths and their emitted symbols must continue
to serve their epoch-2 contracts. They cannot become aliases to whichever epoch is newest. New
explicit epoch-2 exports can share the same implementations without rewriting frozen artifacts.
Preserve browser/server export conditions and provider dependency minimums during that migration.

Unused epoch implementations should be absent from optimized bundles. Package installation can
still contain all supported implementations. An epoch's presence does not retain all its helpers,
and lazy chunks should retain compatibility work only where their execution requires it.

Some current capability modules perform registration on import. Audit those imports and the package
`sideEffects` declarations before adding facades. Required registrations must survive bundling,
while importing a current capability must not install every historical version. Marking all files
side-effect-free would hide a correctness defect rather than establish tree shaking.

## Composition and shared ownership

Static imports select helper behavior, but they do not by themselves make artifacts from different
epochs composable. Define and test a stable boundary for parent-owned props, child ranges, durable
instances, contexts, tasks, error propagation, DOM identity, and disposal. Prefer artifact-local
executable operations that the parent can call without interpreting the child's private layout.

Where representation translation is necessary, a narrowly owned bridge should adapt it at the
component boundary. Include the bridge only in graphs that require that combination. If a future
epoch cannot preserve a shared boundary safely, reject that combination explicitly rather than
claiming compatibility because both sets of helpers resolve.

Shared implementation must preserve a coherent ownership domain. Duplicating task schedulers,
context registries, or reactive transaction state for each epoch could break cross-component work
even when isolated components pass. Existing duplicate-package and realm identity guarantees must
also remain intact. Epoch-local state is appropriate only where its meaning is actually epoch-local.

SSR and hydration need matched component artifacts and a supported wire contract. Supporting old
components in a new build does not imply that arbitrary old server HTML can hydrate against an
unrelated new client deployment. Keep build identity, protocol checks, allowlisted dispatch,
serialization validation, and generation fencing explicit. Apply the same rule to server tasks,
actions, and refresh operations.

## Build attribution and diagnostics

Extend compiler and published-library build facts to describe artifact epochs and required helper
contracts per component and target. Join those facts to resolver-owned package instances and the
bundler graph. Package names or self-declared metadata alone establish neither runtime compatibility
nor authorization. Validate known unsupported contracts before execution.

Existing epoch-2 artifacts lack the proposed facts. Recognize their known entry points and validated
artifact versions conservatively. Report module-level attribution when component-level information
is unavailable. Do not guess an epoch from a package version or execute third-party code to inspect it.

The shared adapter layer should own classification and diagnostic policy. Vite, Webpack, and Bun
should supply their resolution and emitted-output evidence. Distinguish three findings:

- A dependency declares or imports an older contract.
- A component using that contract is retained in an emitted client, server, or lazy chunk.
- Compatibility implementation or a bridge is retained because of that dependency.

An installed or analyzed dependency that is eliminated from output should not trigger a warning that
it increased the bundle. Conversely, a side-effect-only compatibility registration can survive even
when its component is removed and must remain visible in the report. An externalized server package
is a deployment requirement, not evidence that its ABI implementation was eliminated.

For each retained older contract, report the resolved package and version, component export or
module, required epoch/helper revision, importing application path, target, and affected chunks.
Explain that updating or recompiling the library can remove the old requirement. Deduplicate the
summary by package and contract, with detailed import chains available in a machine-readable report.
Keep reporting metadata out of production runtime chunks.

Example of the intended information, using hypothetical future versions:

```text
Supported older ABI retained: epoch 2
  package: example-widgets@1.4.0
  component: Calendar
  imported by: src/Booking.tsx
  output: client, booking chunk
  action: update the library or rebuild it with a current compiler
```

Use an informational build summary for supported older contracts. Reserve warnings for announced
retirement or a configured project budget, and errors for unsupported contracts or missing providers.
Offer an explicit CI policy to disallow older requirements without making valid existing applications
fail by default. No repeated browser-console warnings are needed.

Reports must state their evidence limits. If a bundler cannot establish symbol retention, label a
module as potentially retained rather than claiming an exact component or byte cost. Shared and
minified code makes per-component byte attribution ambiguous. Any byte estimate needs an explicit
measurement method and must not be presented as additive savings.

Opaque or remote components outside the build graph remain outside complete static attribution.
Their supported contract still needs validation before construction, with a diagnostic identifying
the supplied module when possible. Local reporting does not extend remote authorization or placement.

## Runtime updates and retirement

Compatible performance and security repairs should flow through shared implementations wherever
their contracts permit it. Applications receive them when their deployed runtime or bundle is
updated. Compiler optimizations and compiler-side security repairs still require rebuilding affected
artifacts. Supporting an old entry point is not a promise to preserve exploitable behavior.

Track the current emitted epoch separately from the supported epoch set in release policy. Adding a
new epoch while retaining old contracts should not be treated as removing support. Retiring an epoch,
removing a helper, or narrowing a supported composition remains a deliberate breaking release under
the repository's package-version rules. The existing gate must be revised and tested before this
distinction can authorize a release.

Do not automatically expire an epoch after a fixed count of releases. Announce retirement, provide
an actionable build diagnostic, and identify a library update or recompilation path. A security issue
may require rejecting an unsafe contract sooner, with an explicit advisory and affected-artifact
guidance. Epoch 1 is excluded from this forward-looking support policy.

## Acceptance before implementation is considered complete

Preserve frozen epoch-2 artifacts and add representative fixtures for each later supported contract.
Run those artifacts against updated runtimes without invoking the compiler. Keep epoch-1 rejection
coverage. Add focused fixture coverage when an additive helper introduces a distinct contract, not
only when the global epoch changes.

| Boundary           | Required evidence                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Existing artifacts | Original epoch-2 import paths resolve and observable behavior survives runtime updates                                                           |
| Mixed composition  | Old parent/new child and new parent/old child preserve props, context, task ownership, identity, errors, cancellation, replacement, and disposal |
| Bundling           | Current-only output excludes old implementations, mixed output retains only needed compatibility, dead imports and lazy chunks behave correctly  |
| Attribution        | Retained, eliminated, side-effect-only, externalized, and metadata-poor libraries receive accurate reports                                       |
| SSR and hydration  | Matched mixed-epoch builds render and hydrate correctly, unsupported combinations reject before mutation                                         |
| Distribution       | Packed exports, conditions, dependency minimums, and duplicate-package ownership work outside the workspace                                      |
| Execution runtimes | Shared server-boundary cases run through native Node, Bun, Deno, and workerd acceptance                                                          |

Execute shared bundling and reporting scenarios through Vite, Webpack, and Bun. Put common observable
composition cases in the owned corpus and record actual execution results per environment. Preserve
focused package and compiler tests where they provide additional boundary protection. A synthetic
future-epoch fixture can prove module isolation, but does not establish compatibility with a real
future artifact design.

## Decisions still needed

Before implementation, choose the exact subpath and helper revision naming, the stable composition
boundary, and the build-fact schema extension. Determine what retention evidence each bundler exposes
and what conservative reporting remains necessary. Establish the process for announcing retirement
and the CI policy surface without promising unlimited support.

After implementation, consolidate supported behavior into the artifact, release, and component-library
references. Public package documentation should then explain compatibility and build diagnostics to
application authors. Retire this proposal once those references own its durable decisions.
