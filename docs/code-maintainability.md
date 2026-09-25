# Code maintainability standard

eXact is a new framework. Its source should optimize for explicit contracts,
cohesive modules, testability, and straightforward control flow rather than
preserving accidental internal structure.

## Module ownership

- A module should own one domain concept, state machine, or algorithm.
- Public `index.ts` files are API facades. Implementation belongs in named
  domain modules.
- Internal modules import their dependencies directly; they do not import back
  through their package's public façade.
- Shared helpers live with the narrowest domain that owns their semantics.
- Generic `utils.ts` modules are not permitted. A helper without a clear owner
  is usually a missing domain concept.
- Similar code may remain duplicated when sharing it would couple independent
  packages or erase meaningful differences in behavior.

## Helper extraction

Extract a helper when it names a domain operation, isolates a side effect,
centralizes an invariant, removes proven duplication, or makes behavior
independently testable. Do not extract a helper merely to reduce a line count.

For complex operations, prefer the following shape:

1. validate input;
2. prepare or plan without externally visible mutation;
3. apply mutations;
4. transfer ownership or publish state;
5. clean up superseded resources.

Keep pure planning separate from mutation where practical. Small result objects
are preferable to long parameter lists or several parallel mutable collections.

## JSDoc

JSDoc is required for exported functions, classes, interfaces, types, constants,
and public class methods. Internal declarations also require JSDoc when they
define lifecycle behavior, ownership, security rules, non-obvious invariants, or
important algorithms.

Documentation should describe the contract rather than repeat the TypeScript
signature. Include relevant details about:

- mutation and other side effects;
- ownership, cleanup, and disposal;
- cancellation and asynchronous settlement;
- defaults, units, and input constraints;
- expected errors;
- security or trust-boundary assumptions;
- algorithmic complexity where it affects callers.

## Type erasure

Prefer generics when a public adapter can preserve the source contract, and use `unknown` plus
validation for data crossing a trust boundary. Explicit `any` remains legitimate for narrow
existential component and compatibility internals where callers must accept every state or props
shape. Represent heterogeneous component infrastructure with `AnyComponentFunction`,
`AnyAuthoredComponentFunction`, and `AnyComponentInstance` so the necessary erasure is declared
once instead of repeated throughout implementation signatures. The repository ratchet prevents
the production total from increasing; remove or lower its baseline as erasure is replaced, and do
not hide new `any` behind casts or broad lint exclusions.

Use `@param`, `@returns`, `@throws`, `@example`, and `@deprecated` only when they
add information beyond the signature.

## Guiding comments

Comments inside functions explain why ordering or an implementation choice
matters. Use them at state transitions, validation/mutation boundaries,
fixed-point analysis phases, ownership transfers, and compatibility exceptions.

Do not narrate obvious statements. Comments that no longer describe the code
are defects and must be updated or removed with the corresponding change.

## Tests

- Tests are grouped by behavior, not by the public entry file that exposes it.
- Reusable fixtures belong in `test-support` and are excluded from production
  output.
- Temporary resources register cleanup immediately after creation.
- Pure planning and validation helpers receive direct tests when their behavior
  is important or has meaningful edge cases.
- Regression comments explain the invariant that was previously violated, not
  the mechanics of the assertion.

## Change acceptance

Each architectural change must:

- preserve or deliberately improve observable behavior;
- leave public API changes explicit;
- add or update focused tests;
- document affected contracts and non-obvious control flow;
- avoid new dependency cycles and platform-boundary violations;
- pass type checking, package tests, package-content checks, and relevant
  performance guards.

### Compiler and runtime regression acceptance

For a behavioral fix, record the violated contract and its owning layer. Demonstrate that the
regression fails before the fix and passes afterward, or state why reproducing the earlier state
is impractical. A passing test added only after the implementation is weaker evidence.

Review equivalent execution paths, not only the path that reported the bug. Use the
[composition corpus](component-composition-corpus.md) to share observable expectations across
relevant specialized and general paths. For stateful behavior, test initial behavior, a retained
update, the next interaction, replacement or removal, and cleanup as applicable. Assert identity
and ownership when their loss could be hidden by correct text output.

For queued work, distinguish enqueue, selection, execution, and publication. Cross applicable
cancellation, replacement, pause/resume, and disposal transitions with these boundaries. Verify
settlement, subsequent progress, shared-work isolation, and cleanup; checking only the first result
or absence of a global error is insufficient. Use the [task lifecycle boundary inventory](tasks.md#queued-work-lifecycle-review)
to locate existing protection before adding redundant tests.

Build an affected-environment matrix before accepting a regression fix. Include supported build
adapters, rendering modes, and execution runtimes whose contracts intersect the change, regardless
of which application or adapter reported it. Explain why unaffected environments are unaffected by
tracing ownership, rather than assuming that a passing Vite build covers Bun or Webpack. Shared
compiler/runtime repairs still need representative adapter-boundary checks when resolution,
configuration, authorization, bundling, or lifecycle can change the result. Run the same observable
contract through shared fixtures wherever possible, using scripted CI jobs. Missing verification
for an affected environment is a release gap to resolve, not permission to publish a partial fix.

Distinguish source-fixture verification from built-package and browser verification. Changes to
package resolution, compiler-emitted helpers, or paired artifacts need verification at those
boundaries. Record material untested paths explicitly rather than inferring coverage from a
scenario's declared modes. Check neighboring cases in proportion to their risk. For expression or capture transformations,
review direct, literal-indexed, and computed access; rendered output versus conditions; short-circuit
selection; and absent, primitive, and rendered values. Cross representative source variations with
ownership combinations, not just adapters. Preserve evaluation semantics and test repeated updates
without assuming that dependency establishment evaluates an expression only once during hydration.

For critical transformations, use bounded mutation witnesses where they add independent evidence:
a deliberate capture, routing, or layout defect must compile and then fail observable assertions.
First require the unmodified compiler to pass. Compilation failures, timeouts, missing mutation
anchors, and stale binaries do not count as detected behavioral faults. Keep mutation artifacts
isolated from the working compiler and out of Git.

Retire workarounds in repository-owned consumers when the corrected contract makes them obsolete.
External applications are optional evidence, never a required acceptance dependency. Promote a
minimal independently authored example into the owned corpus when it represents a reusable
failure class. Keep completion evidence in the change description, not a new progress document.

## Development process ownership

Long-lived repository development commands must retain and release every server, watcher, compiler,
and child process they start. Ordinary Vite applications use
`scripts/start-owned-vite-dev-server.mjs`; custom in-process servers install
`scripts/development-process-lifecycle.mjs`; development tools that require a separate child process
use `scripts/start-owned-development-command.mjs`.

These owners handle normal termination signals and monitor the launching parent process. The parent
monitor is required because Windows terminal hosts can terminate npm or its command shell without
forwarding a console signal, leaving Vite and `exactc` descendants alive. New package scripts must
not invoke long-lived Vite, Nuxt, or equivalent development servers directly.

## Automated ownership checks

`npm run check:source-architecture` waits for every source inspection and rejects read failures.
The dependency check includes maintained benchmark source and rejects imports of framework
implementation files from comparison participants and drivers. Public exports remain the boundary;
platform adapters own response consumption.

The remaining runtime cycles represent recursive DOM mounting/patching and adoption, SSR child
rendering, React-owned island conversion, and task consequence-frame execution. Their exact directed
edges are reviewed in `scripts/source-recursion.mjs`. This is not permission for new modules or
edges to join those cycles. Public facades, protocol validation, diff parsing, request lifetimes,
remote loading, router rendering, and test hosts do not need cyclic ownership. The static graph
covers source-local eager runtime imports, excludes erased types, and complements platform bundle
and package ownership checks rather than replacing them.

`npm run check:documentation` checks local Markdown targets and anchors, findings immutability,
generated benchmark report markers, and the docs application's own route/navigation/search inventory
before package outputs exist. Pass `-- --base=<commit>` to compare findings against the PR base.
Corrections are new documents linking to the original finding, which remains unchanged. External
URL availability and editorial usefulness require review; deterministic CI does not fetch websites.
