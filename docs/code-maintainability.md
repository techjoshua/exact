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

Review hardening changes for simpler algorithms, fewer intermediate allocations, and less
production code. Share implementations when consumers enforce the same contract, including
their failure and ownership rules. Keep serialization, validation, and publication coordinated
so a checked value is the value that reaches its consumer. Report production code reductions
separately from regression fixtures and tests, and support performance claims with appropriate
measurements or explicit algorithmic bounds.

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

Public JSDoc must be useful on hover without requiring the reader to open the implementation.
Start with the caller's purpose and the observable result. Explain consequential defaults,
search boundaries, fallback behavior, and empty results at the API where the caller encounters
them. If normal framework entry points already perform the work, say so and identify when an
explicit call is useful. Distinguish validation from sanitization, copying from serialization,
and metadata generation from a complete build when confusing them could lead to incorrect use.

Check these claims against the implementation and existing behavioral tests. A phrase such as
"creates a client" or "defines the options contract" adds little beyond the declaration name.
Use short examples when they resolve a likely ambiguity, without turning every hover into a
tutorial. Review the exported declaration that editors actually follow, including alternate
entry points, so a corrected guide does not leave misleading package hover text behind.

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

### TypeScript framework coverage workflow

After building workspace prerequisites, run `npm run test:framework:coverage` to measure
TypeScript source in `core`, `reactive`, `dom`, `ssr`, `hydrate`, `server`, `testing`,
`request`, `plugin-api`, `plugin-host`, `devtools-runtime`, `devtools-protocol`, and the native
`router` component library.
The command reuses the maintained package configurations, including their compiler targets,
source aliases, and runtime setup, and executes the owned composition corpus alongside them.
Adapters, other optional libraries, tooling, applications, and the native compiler are outside
this runtime scope. Use workspace `test:coverage` commands to investigate other TypeScript
packages separately. Compiler workspace commands select the repository test configuration so
compiled fixtures resolve workspace providers from the repository root. Package commands retain
coverage reports after test failures for investigation. A failed run remains failed and does not
establish acceptance. Unexecuted source files remain in the denominator. Tests, declarations,
fixtures, and test-support modules are excluded.

The HTML source view and Istanbul JSON counters live under `.tmp/framework-confidence/coverage`.
Successful runs also write `.tmp/framework-confidence/evidence.json`, with weighted package
totals and files ordered by missed branches, then missed statements. The evidence records
measurement time, source revision, source fingerprint, environment, and worktree status.
Freeze source, fixture, and configuration files during measurement. A run whose source fingerprint
changes fails without success evidence, since merged counters from different versions are not
a meaningful coverage comparison. A dirty worktree cannot
be reproduced from its Git revision alone. Failed or interrupted reruns remove prior success
evidence. Keep these generated files out of Git.

V8 reports statements, branches, functions, and lines. Its branch metric is not an independent
condition metric or modified condition/decision coverage (MC/DC). For a consequential compound
predicate, review each operand's true and false outcomes, which operands short-circuit, and
observable behavior for valid and invalid inputs. Record executed witnesses separately from
unexplored outcomes. Source-mapped counters for compiler-transformed TSX also need semantic
tests before they can establish the authored contract.

Use coverage gaps to choose the next investigation, weighted by consequence and uncertainty.
Prioritize transaction integrity, task settlement and cancellation, DOM identity and cleanup,
hydration integrity, and server authorization and serialization. Add the smallest stable contract
tests that distinguish meaningful outcomes. A confirmed defect starts the related-defect workflow
below. Coverage increases alone do not establish correctness, and instrumented test timings are
not performance measurements. Use relevant existing performance guards after implementation
changes. Package coverage does not replace browser, adapter, installed-package, or native-runtime
acceptance. Source tests must keep their owner and its public entry points in the same
module graph. Calls through a built dependency do not establish source coverage for that
dependency. The root configuration aliases React compatibility entry points to source for this
reason, while installed-package and native acceptance continue to exercise built artifacts.

## Change acceptance

Each architectural change must:

- preserve or deliberately improve observable behavior;
- leave public API changes explicit;
- add or update focused tests;
- document affected contracts and non-obvious control flow;
- avoid new dependency cycles and platform-boundary violations;
- pass type checking, package tests, package-content checks, and relevant
  performance guards.

### Review finding evidence and triage

A defect finding identifies the supported trigger or reachable path, violated contract,
observable consequence, existing protections considered and smallest proportionate remedy.
A source-backed failure argument can establish the finding without an executable reproducer.
Questions, optional hardening and consequential unverified risks remain distinct from proven
defects. The coordinator checks the claim and evidence for plausibility, requests clarification
when needed and avoids automatically translating speculative concerns into guards or abstractions.
This triage does not require re-auditing every finding. Accepted fixes are verified against
current code, and costly or consequential unresolved disputes may need independent reassessment.
A valid finding does not by itself validate the suggested implementation.

### Shared migration connection acceptance

A shared producer or handoff is integrated only when its intended production consumers use
it. Before expanding a migration, inspect affected callers and context-construction sites,
including equivalent module, implicit-operation and deferred-body paths. Record connected,
explicitly unmigrated and unaffected entries in existing task state, with the reason for
exclusions. Validate the source operation through transfer, consuming decision and publication.
A helper pass or narrower source profile cannot stand in for the original workload.

Review required setup for silent omission. Prefer an owning entry point that installs required
handoffs consistently. Where setup is conditional, missing setup must retain explicit legacy
ownership or pending coverage rather than grant completion. Test registration versus adoption,
local readiness versus dependency closure and fresh-graph ownership when these boundaries change.
For a changed shared queue, protect interleaving and task/cursor ownership. For retained binding
or capture data, verify that the actual consuming edge receives it, not merely that the binder
published it.

Incremental review follows the changed contract into affected callers while reusing unchanged
qualified evidence. State the scope of acceptance explicitly. Retire superseded adapters and
duplicate legacy/staged work as their replacements become accepted. This supplements the
regression and affected-environment requirements below without adding a separate report.

### Compiler and runtime regression acceptance

For a behavioral fix, record the violated contract and its owning layer. Demonstrate that the
regression fails before the fix and passes afterward, or state why reproducing the earlier state
is impractical. A passing test added only after the implementation is weaker evidence.

Each confirmed compiler or runtime defect must also start a related-defect investigation. Identify
the violated contract and the mechanism that broke it, then inspect other transformations, helpers,
consumers and execution paths that share either. Search by the mechanism, not only by similar source
syntax. Use paired success and failure controls where applicable so lost validation and rejection
of valid code are both visible.

Group reproductions that share a cause, but treat each newly discovered mechanism or violated
contract as another investigation entry. For example, a lost assignment constraint may expose
lost callback context or expression result types. Those discoveries require examining the other
places that depend on callback context or result types, even when they do not perform assignments.
Keep a deduplicated list of confirmed causes, checked boundaries and unexplored candidates while
working. Record executed evidence separately from hypotheses and declared scenario modes.

Continue until representative adjacent contracts and affected paths have been checked and the
latest expansion reveals no new mechanism. Scale the breadth to consequence and uncertainty rather
than exhausting every syntax combination. If the investigation stops earlier, identify its remaining
frontier and the reason. Do not describe an unexplored candidate as safe or an entire cluster as
fixed because one reproducer passes. Promote confirmed failure classes into owned regression
coverage when fixing them, and consolidate durable conclusions into the owning contract reference
or issue. Keep raw exploration and temporary investigation lists out of Git.

For each compiler fix, acceptance includes a fresh native branch and condition counter audit of
the affected analysis and lowering paths. Add source-based native witnesses for
the repaired outcome and meaningful adjacent outcomes, paired with emitted semantic checks.
An analysis-only test does not establish lowering execution, and an emitted runtime test does not
establish native unit branch coverage. Record remaining outcomes individually as unchecked source
candidates or defensive paths without valid source witnesses. Complete this audit with the fix,
before reporting the investigation batch complete.

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

For public asynchronous features, include an author-facing testing workflow using the public
harness. Exercise intermediate state and cleanup as well as the terminal result. Acceptance must
reject unexpected framework reports even when no uncaught exception reaches the runner. Use the
[public testing workflow inventory](component-composition-corpus.md#public-testing-workflow-acceptance)
to extend existing journeys, including installed-package examples when resolution is involved.

Distinguish source-fixture verification from built-package and browser verification. Changes to
package resolution, compiler-emitted helpers, or paired artifacts need verification at those
boundaries. Record material untested paths explicitly rather than inferring coverage from a
scenario's declared modes. For supported source constructs, verify placement and published component
build facts as well as emitted syntax. A lowering snapshot can pass while an imported helper leaves its consumer unplaceable.
Tests must not accept `unknown` placement merely to reach an unrelated branding or emission assertion.
For type-driven placement, compare direct and aliased annotations and mutable/read-only views of
the same supported value. Type display text must not silently determine environment availability.
Check neighboring cases in proportion to their risk. For expression or capture transformations,
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

### Compiler diagnostic acceptance

A diagnostic should identify the rejected construct, explain the relevant requirement or
unproven fact, and offer an applicable correction. Preserve causal source locations across
imported helpers and keep compiler uncertainty distinct from a proven side effect. A purity
assertion cannot override placement or data-policy restrictions. Do not offer an automatic
annotation fix when correctness depends on a developer verifying the helper's behavior.

When changing diagnostic guidance, test representative rejected examples and their proposed
corrections. Prefer diagnostic codes, meaningful details, and source spans over full-message
snapshots. Protect source mapping after normalization, imported-file locations, and UTF-16
coordinates for editor clients. Shared build adapters should preserve the same diagnostic
context rather than independently reconstructing it.

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
