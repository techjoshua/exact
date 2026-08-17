# eXact repository code audit

## Remediation completion — 2026-08-17

Remediation-order items 1–6 have been implemented and promoted into maintained gates:

1. **Acceptance gates:** source architecture, test typechecking, and formatting are restored.
2. **Trust and dependencies:** reserved protocol keys are rejected recursively, manual payloads
   require decoders before authorization, authored HTML patches require `unsafeExactHtml()`, and
   dependency findings are upgraded or governed by owner/expiry policy with no moderate/high/critical
   items. Vulnerable historical Router v6 fixtures were removed from the installed graph; three
   comparison-only Svelte-chain low findings remain owner/expiry governed.
3. **Theme performance:** nearest-first bounded search preserves exhaustive-grid results, initial
   scope resolution is reused, parent revisions are observed, and release budgets cover resolution.
4. **Release coverage:** all maintained application tests/builds and docs verification are in the
   full profile; affected planning includes docs/theme browser acceptance and maintained samples.
5. **Public contracts:** 48 production `any` erasures were removed (625 to 577) in the deeper
   remediation pass and the new lower baseline ratchets downward. Adapter/JSON generics are retained,
   core root modules have enforced ownership classifications, and payload decoding is typed.
6. **Drift/tooling:** Go and large CSS domains have no-growth ceilings, transform maps compose,
   the render-program cache is bounded and invalidatable, wire policy is shared, and DOM/SSR target
   contribution semantics have differential coverage and share one pure class/token merge planner.

Large Go/CSS ceilings are migration controls, not approval of current size: new large domains fail
immediately and listed legacy files cannot grow while cohesive phase splits proceed. Root
compiler/framework aliases likewise remain only for the documented 0.x compatibility window.

The follow-on Go decomposition moved normalized-source edit ordering/authored-position projection
into `source_edit_mapping.go` and state-destructuring validation/rewriting into
`component_state_destructuring_normalization.go`. This reduced `source_normalization.go` from 1,791
to 1,061 checker-counted lines, below the standard 1,200-line Go limit, so its legacy ceiling was
removed rather than merely lowered.

Time lowering was subsequently split into diagnostics, activation construction, clock rewriting,
and plan inference owners. `time_lowering.go` fell from 1,734 to 1,094 checker-counted lines, and its
legacy ceiling was also removed.

Element-island capture/index analysis was then separated from client/server AST emission.
`element_islands.go` fell from 1,314 to 881 checker-counted lines, removing another legacy ceiling
without adding an analysis traversal.

Task reactive/environment dependency analysis was separated from collection, policy formation, and
state-effect normalization. `tasks.go` fell from 1,417 to 1,098 checker-counted lines and no longer
requires a legacy ceiling.

**Audit date:** 2026-08-16  
**Audited state:** the current working tree, including its pre-existing tracked and untracked changes  
**Scope:** the full eXact monorepo, with manual depth weighted toward compiler, runtime, hydration,
server, theming, public API, build/release, and security boundaries

## Executive summary

The repository has unusually strong architectural intent, broad automated verification, cohesive
documentation, and extensive behavioral coverage. The compiler-led component model is visible in
the implementation: durable component instances, directly observable state, precise reactive
work, explicit ownership, compiler-branded render programs, and coordinated server/client
contracts are not superficial documentation claims.

The audit nevertheless found four issues that should be treated as immediate work:

1. The current tree does not pass its own acceptance gates: source architecture, test typechecking,
   and formatting each have a concrete failure.
2. Three generic record-copy paths permit `__proto__` to change the prototype of a newly created or
   live state object. Two are on hydration/protocol paths.
3. The public server result model can carry unbranded raw HTML into contextual-fragment parsing,
   bypassing the explicit `unsafeHtml` capability model if an application handler reflects
   untrusted input.
4. Theme resolution is computationally expensive and is performed twice for the initial
   `ThemeScopeEnhancement` value. A local release-build probe measured roughly 133 ms per ordinary
   resolution and 156 ms for a 12-color categorical derivation on this machine.

The highest-value systemic improvements are to harden protocol dictionaries, make HTML trust
explicit, optimize theme color search with a performance contract, include all maintained apps in
risk-appropriate release validation, and ratchet rather than blanket-ban explicit `any`.

## Scope and method

The inventory covered 2,399 tracked files. Tracked code-like files total approximately 262,417
lines across 1,900 files: 1,479 TypeScript files, 155 TSX files, 146 JavaScript modules, 75 Go
files, and supporting configuration and scripts. The largest authored roots are `packages`
(approximately 143,722 code lines), `native` (41,146), `apps` (30,753), component libraries
(12,796), framework adapters (10,875), and scripts (9,036).

The audit combined:

- a file-by-file repository inventory and extension/root classification;
- repository-wide searches for unsafe object construction, dynamic HTML, unchecked casts,
  assertions, `any`, duplicated protocol logic, large modules, caches, process execution, and
  release/test wiring;
- manual review of the risk-bearing compiler, core, reactive, DOM, SSR, hydrate, server, theme,
  adapter, application, documentation, and release modules surfaced by those scans;
- comparison with the repository's July 2026 review and adversarial audit, followed by current-code
  verification rather than assuming their findings or resolutions remained accurate;
- executable checks and small adversarial/performance probes against the current build.

“Line by line” here means every authored file was included in inventory and static inspection, and
every resulting signal was manually classified. It does not mean that all 262,000 lines received
equal human semantic attention. Generated fixtures, lockfiles, binary/font/image assets, build
outputs, coverage, `.tmp`, `.exact`, and dependency trees were assessed through their generator,
provenance, packaging checks, or consumers rather than reviewed as handwritten source. This is a
repository-wide engineering audit, not a proof that no defect exists.

## Verification results

| Check                                         | Result   | Evidence                                                              |
| --------------------------------------------- | -------- | --------------------------------------------------------------------- |
| Lint                                          | Pass     | `npm run lint`                                                        |
| Exported JSDoc                                | Pass     | `npm run check:jsdoc`                                                 |
| Internationalization boundaries               | Pass     | `npm run check:intl-boundaries`                                       |
| Package contents and manifest synchronization | Pass     | `npm run check:publish` (66 public manifests)                         |
| Platform boundaries                           | Pass     | `npm run check:platform-boundaries`                                   |
| Package tests                                 | Pass     | 385 files passed, 2 skipped; 2,244 tests passed, 4 skipped            |
| Build-script tests                            | Pass     | 20/20                                                                 |
| Framework comparison                          | Pass     | 13/13                                                                 |
| Maintained app tests run explicitly           | Pass     | docs, Sudoku, puzzle generator, microfrontend portal, and intl        |
| Native compiler corpus                        | Pass     | 283 files, 22 projects, 10.17 s; 1.20× the normalized 8.48 s baseline |
| Source architecture                           | **Fail** | `ThemeProposalPage.tsx`: 451 logical lines, limit 400                 |
| Test typecheck                                | **Fail** | three `.dataset` accesses on values typed as `Element`                |
| Format check                                  | **Fail** | `packages/theme/src/palette-resolution.ts`                            |
| Dependency audit                              | **Fail** | 11 advisories: 8 high, 3 low, 0 critical                              |

The failures are point-in-time results for the already modified working tree. They are not
necessarily regressions introduced by one coherent change set.

## Findings

### A01 — The current tree fails three required acceptance gates

**Severity:** High for release readiness; low implementation risk to correct  
**Status:** Confirmed

`apps/docs/src/pages/ThemeProposalPage.tsx` exceeds the source-architecture limit. The theme fixture
test accesses `.dataset` through the `Element` return type at
`component-libraries/theme-fixture/src/specimen.test.ts:45`, `:47`, and `:50`.
`packages/theme/src/palette-resolution.ts` does not match the formatter.

**Framework viability.** None of these repairs requires a semantic compromise. Splitting the docs
page should preserve native eXact composition and avoid turning sections into React-style rerender
units. Narrowing a selector to `HTMLElement` improves the test contract. Formatting is mechanical.

**Recommendation.** Fix these before feature work is considered complete. Split the proposal page
by documentation domain or demonstrable section ownership, use typed selectors or an explicit
`HTMLElement` guard, and format the palette module. Re-run `check:style`,
`check:source-architecture`, and `typecheck:tests` together.

### A02 — Untrusted `__proto__` keys can mutate object prototypes

**Severity:** High  
**Status:** Confirmed with executable probes

Three paths use assignment semantics on arbitrary own keys:

- `normalizeContinuationMap()` creates `{}` and assigns `output[id]` in
  `packages/hydrate/src/config-validation.ts:31-35`. A parsed `"__proto__"` continuation changes
  the output object's prototype instead of creating an own entry.
- wildcard continuation writes call `Object.assign(target, update)` in
  `packages/hydrate/src/state.ts:66-70`. A valid wildcard contract plus a parsed `"__proto__"`
  update changes the live component state object's prototype.
- `snapshot()` assigns `target[key]` after preserving the source prototype in
  `packages/reactive/src/snapshot.ts:27` and `:55-59`. A plain parsed object with an own
  `"__proto__"` key changes the clone's prototype.

The probes demonstrated object-local prototype mutation. They did not demonstrate pollution of
`Object.prototype`, but object-local prototype replacement is sufficient to violate protocol and
state integrity and can influence later property lookup.

**Framework viability.** Hardening these paths reinforces eXact's observable-state goal; it does
not hide state or replace normal mutation with reducers or patches. Compiler operation identity and
state paths can remain opaque while their decoded record containers are made safe.

**Recommendation.** Establish one narrow protocol-record policy used by server, SSR, and hydrate:

- create wire dictionaries with `Object.create(null)`;
- reject `__proto__`, `prototype`, and `constructor` at every untrusted record boundary where those
  names have no contract meaning;
- use `Reflect.defineProperty` or `Object.defineProperty` when a generic snapshot must faithfully
  preserve an own `__proto__` data property;
- recursively validate wildcard state updates, stage the complete result, and commit only after
  validation succeeds;
- add adversarial regression tests at hydration config, wildcard state, snapshot, and server
  response boundaries.

Do not solve this by making component state inaccessible. The correct boundary is safe decoding and
copying.

### A03 — Raw HTML server results bypass the explicit unsafe-HTML capability

**Severity:** High as an API footgun; exploitability depends on application handlers  
**Status:** Confirmed design weakness

The public server result contracts accept `html?: string` in
`packages/server/src/types.ts:348` and `:432`. Hydration eventually parses patch HTML with
`Range.createContextualFragment()` or `template.innerHTML` in
`packages/hydrate/src/patching/mutation.ts:66-82`. Structural response validation verifies that HTML
is a string, not that it came from the compiler/SSR renderer or an explicit unsafe-HTML capability.

Trusted server code can always create unsafe output, so this is not an unauthenticated framework
exploit by itself. It is a dangerous public contract: a manual invocation handler can reflect a
payload into executable markup while appearing to use an ordinary result field, bypassing the
framework's otherwise deliberate `unsafeHtml` ownership model.

**Framework viability.** eXact already treats authored unsafe HTML as an explicit capability. The
server/client protocol should carry that same provenance rather than borrowing React-style opaque
HTML conventions or relying on application discipline.

**Recommendation.** Replace ordinary strings at public patch boundaries with a branded
`ExactTrustedHtml` produced only by SSR/compiler-controlled rendering or an explicit audited
unsafe-HTML constructor. If compatibility requires retaining raw strings, move that entry point to
a clearly named unsafe API and require root opt-in. Keep transport serialization ordinary, but
validate provenance before serialization. Add tests proving normal handler results cannot construct
HTML patches from strings.

### A04 — Theme resolution performs exhaustive searches on reactive paths

**Severity:** High for UI performance  
**Status:** Confirmed by source and local measurement

Theme contrast and solid-color selection scan all 1,001 lightness values in
`packages/theme/src/color.ts:323-345` and
`packages/theme/src/palette-resolution.ts:219-243`. Sequential derivation repeats a 1,001-value scan
in `packages/theme/src/derivation.ts:204-229`. `ThemeScopeEnhancement` resolves once during setup at
`packages/theme/src/components.ts:87-91`, then resolves the same initial inputs again when its render
function first runs at `:116-121`.

A release-build probe on this audit machine measured:

- `resolveTheme`, 100 iterations: about **132.7 ms per call**;
- a sequential data-color derivation: about **2.3 ms per call**;
- a 12-color categorical derivation: about **155.6 ms per call**.

These are diagnostic measurements, not portable product benchmarks, but the magnitude and
exhaustive source algorithm justify action.

**Framework viability.** The repair should use eXact's durable instance and precise dependency
model, not `useMemo`, callback identity, or whole-component rerender assumptions. Resolved theme
data is a derived, inspectable value owned by the long-lived scope.

**Recommendation.** First replace exhaustive scans with a proven bracketed/monotonic search,
bounded candidate table, or equivalent algorithm that preserves gamut mapping, tie-breaking, and
contrast invariants. Add correctness/property tests against the existing exhaustive implementation
before deleting it. Then retain the initial resolved value and recompute only when the complete
source, parent revision/fingerprint, or system-preference tuple changes. Store that derived value on
the scope's observable environment or in a compiler-observed derived computation. Add cold/warm
performance budgets for resolution and representative derivations.

### A05 — Dependency advisories include production-relevant router chains

**Severity:** High, with mixed exposure  
**Status:** Confirmed by `npm audit --json`

The lockfile reports 11 advisories: 8 high and 3 low. High findings include React Router advisory
chains, brace-expansion denial of service, and js-yaml denial of service. Some router versions are
intentionally aliased compatibility dependencies, including v6.3, v6.30.4, and v7.18.1, and some
findings are development-only. That reduces exposure but does not make a blanket ignored audit safe;
router findings include redirect/XSS, SSR constructor injection, and CSRF classes.

**Framework viability.** The React compatibility corpus is an adoption boundary and should remain
one. Fixing supply-chain exposure must not reshape native eXact around React or delete valuable
compatibility evidence.

**Recommendation.** Upgrade deployable/router dependencies to patched releases (the audit reports
7.18.2 as a fix where compatible), apply safe lockfile overrides for transitive tooling, and isolate
historical compatibility versions as non-published, non-deployed fixtures that never process
untrusted traffic. Add an audit policy file with package, rationale, exposure, owner, and expiry for
each intentional exception; fail CI on new or expired high-severity entries.

### A06 — Release validation omits several maintained applications and the docs app

**Severity:** High  
**Status:** Confirmed

The standard release script builds only Kanban and Workbench as sample apps at
`scripts/release-check.mjs:53-57`. Root `npm test` covers package tests, framework comparison,
server-components, and shipping-calculator, but omits existing Sudoku, puzzle-generator,
microfrontend, intl, and docs test scripts. `check:sample-builds` includes several of those builds,
but the release script does not call it. The docs app has a `verify` command, yet neither its tests
nor build are in the normal release profile. The explicitly run omitted tests all passed during
this audit.

**Framework viability.** These applications are executable specifications of native eXact
features. Validating them strengthens the compiler/runtime contract without promoting app-local
workarounds into framework design.

**Recommendation.** Add a `test:apps` aggregation and make the full release profile run all
maintained app tests and builds. Extend the affected-release planner so normal changes run only the
apps whose dependency/features are affected, while docs/theme changes run docs verification and
the Theme Lab browser acceptance test. Keep expensive browser matrices risk-aware rather than
forcing every low-risk declaration change through all end-to-end tests.

### A07 — Explicit `any` is globally permitted and concentrated in public generic APIs

**Severity:** Medium  
**Status:** Confirmed

The scan found approximately 830 word occurrences of `any` in maintained production TS/TSX across
199 files, plus 191 in tests. Production concentration is highest in packages (717), followed by
React adapters (52), component libraries (30), and apps (23). The lint configuration explicitly
disables `@typescript-eslint/no-explicit-any` at `eslint.config.mjs:62`.

Not all of this is misuse. Component existential erasure, compiler-owned callables, test mounting,
and compatibility layers often need an “any component” representation. A blanket substitution with
`unknown` would make generic variance awkward and invite casts. Avoidable cases remain:

- the TanStack Query adapter loses most upstream generic information through public `any` types;
- shipping-calculator's `Json = Record<string, any>` does not actually describe JSON;
- several public component/task callable aliases use `(...args: any[]) => any` where parameters or
  result can be carried generically or narrowed at a boundary;
- snapshot internals use `any` where explicit container unions would make unsafe assignment visible.

**Framework viability.** eXact's state must stay ergonomic and inspectable. The goal is not to wrap
state behind setters or dispatch. Improve the types of contracts, adapters, and boundary decoders
while retaining ordinary `this.state` reads and writes.

**Recommendation.** Enable the rule as an error for normal production modules, with narrow,
documented overrides for compatibility/existential implementation files. Add named existential
aliases so unavoidable erasure is searchable. Preserve TanStack generic parameters, introduce a
recursive JSON value type, and prefer `unknown` plus validation only at untrusted data boundaries.
Record a baseline and prevent new unsuppressed `any`; migrate existing files by public-risk order
rather than in one noisy rewrite.

### A08 — The root core API still exposes framework/compiler internals

**Severity:** Medium  
**Status:** Existing finding, partially improved

`packages/core/src/index.ts` remains a broad mixed facade, exporting application contracts alongside
instance construction, render-program machinery, protocol identities, and renderer/compiler-facing
operations. New `runtime/*` and `framework/*` subpaths improve ownership, but the root surface still
makes internal mechanisms appear application-supported and increases compatibility cost.

**Framework viability.** eXact needs explicit compiler/runtime cooperation, but application authors
should consume durable components, state, tasks, contexts, registries, and supported JSX contracts—not
reconstruct compiler-owned lifecycle or protocol objects.

**Recommendation.** Classify every root export as application, runtime-adapter, compiler, testing,
or internal. Keep the shortest idiomatic application surface at the root; move renderer/compiler
contracts to explicit subpaths and remove unsupported internals over a documented deprecation
window. Enforce the classification in the export-map check. Do not model the result on React's root
API; base it on eXact ownership.

### A09 — Architecture enforcement misses the largest native compiler modules

**Severity:** Medium  
**Status:** Confirmed

The source-architecture checker covers TS/JS roots and scripts, as shown in
`scripts/check-source-architecture.mjs:6-33`, but not `native/compiler`. Several non-test Go modules
remain very large and cross multiple subdomains: `intl_extension.go` (about 2,701 lines),
`policy.go` (2,099), `callable_effects.go` (1,917), `source_normalization.go` (1,722),
`component_contract_lowering.go` (1,696), and `time_lowering.go` (1,665). The current working tree's
decomposition of the former monolithic JSX lowering file is a positive move.

**Framework viability.** The native compiler intentionally uses one coordinated visitor and shared
analysis state. Splitting by arbitrary line count into handler dispatch or repeated AST passes would
increase complexity and risk semantic drift.

**Recommendation.** Extend architecture reporting—not initially a hard uniform limit—to authored Go
and large CSS domains. Decompose compiler modules by cohesive phase ownership such as validation,
analysis, contract formation, and lowering while preserving one traversal and explicit shared
session state. Promote limits to gates only after current exceptions have owners and plans. Test
semantic output, diagnostics, placement, and protocol identities rather than private function shape.

### A10 — Post-processing can downgrade source maps to line-only mappings

**Severity:** Medium  
**Status:** Confirmed, narrower than the prior audit finding

The native compiler can emit real source maps. When a module transform or later executable rewrite
changes output, compiler paths fall back to `createLineSourceMap()`, whose implementation explicitly
maps only generated lines to source lines and emits no names or column fidelity in
`packages/compiler/src/source-maps.ts:3-26`.

**Framework viability.** Accurate source correlation directly supports eXact's inspectable state
machines and compiler-led debugging. It does not require changing component execution semantics.

**Recommendation.** Require post-transforms to return their map and compose it with the native map,
or make all framework insertions position-aware. Retain the line-only map only as a documented
fallback for third-party transforms that supply no mapping. Add tests for columns, names, and
diagnostic/devtools correlation after each supported transform chain.

### A11 — The compiled render-program cache has no invalidation or bound

**Severity:** Medium for long development sessions; low in finite production bundles  
**Status:** Confirmed

`packages/core/src/render-program.ts:51` holds a module-global `Map`. Entries are keyed by a
revision-specific cache key and never evicted. Contrary to the nearby statement that it avoids
retaining stale HMR output, every distinct HMR revision remains reachable for the life of the
module.

**Framework viability.** Render programs are immutable compiler artifacts shared across component
instances; moving the cache into component state would duplicate work and confuse ownership.

**Recommendation.** Give build/dev adapters an explicit generation invalidation hook, or bound the
cache per module/build generation. Preserve immutable shared programs within a generation. Add an
HMR stress test that asserts cache size and old program reachability remain bounded.

### A12 — Protocol allowlisting is not business payload validation

**Severity:** Medium  
**Status:** Confirmed design gap

Server execution has valuable operation allowlists, state-write contracts, shape limits,
authorization hooks, CSRF hooks, and generation fencing. Public manual invocation payloads remain
`unknown`, however, and structural protocol validation cannot establish business invariants such as
IDs, prices, permissions, URLs, or command-specific limits.

**Framework viability.** Generated compiler contracts should remain opaque and automatic. Business
validation belongs at the operation boundary, not in component reducers, shadow stores, or authored
transport plumbing.

**Recommendation.** Let each manual invocation/action register a typed decoder or schema validator,
executed after transport limits and before authorization/business logic. Generated operations can
emit or reference their compiler-known validation contract. Document clearly which guarantees are
framework structural guarantees and which remain application responsibilities. Include failed
validation in inspectable invocation status without retaining secrets.

### A13 — Same-domain protocol safety and limit logic is duplicated

**Severity:** Medium  
**Status:** Confirmed

Nearly identical `positiveLimit()` implementations occur repeatedly inside server and SSR modules,
including gateway, operations, protocol, streaming, validation, hydrate limits, and SSR stream
protocol. Safe object-key policies also exist separately in server and hydrate. Duplication across
independent packages is sometimes correct, but these particular copies govern the same wire and
resource-safety concepts. Their divergence contributed to wildcard state accepting keys that path
updates reject.

**Framework viability.** A small platform-neutral protocol policy module is compatible with explicit
server/client coordination. A generic `utils` package is not.

**Recommendation.** Consolidate exact wire-key validation and limit normalization behind a named,
dependency-light protocol owner shared by server/SSR/hydrate, or generate both sides from one
contract. Keep unrelated local “is record” and numeric helpers local when sharing would couple
independent domains. Add cross-boundary conformance vectors that both server and hydrate must pass.

### A14 — DOM and SSR implement parallel enhancement-target merge semantics

**Severity:** Medium  
**Status:** Design risk; no demonstrated current mismatch

DOM and SSR both plan enhancement contributions for classes, styles, attributes, tokens, and
content, but their implementations are separate because one owns reactive/lifecycle effects and the
other owns serialization. The separation is valid, yet it creates a drift surface for a user-visible
semantic contract.

**Framework viability.** Combining the complete implementations would incorrectly entangle DOM
lifecycle with SSR. The shared part, if any, should be a pure compiler/runtime contract for
contribution ordering and conflicts.

**Recommendation.** First add differential conformance tests that feed equivalent contribution
plans into DOM and SSR and compare observable attributes/content. Extract only a pure target-neutral
merge planner if those tests reveal substantial identical logic. Leave effect installation,
reactive reads, ownership, escaping, and serialization in their respective renderers.

### A15 — Compiler corpus performance is within policy but 20% above baseline

**Severity:** Medium observation; not a confirmed regression  
**Status:** Measured

The native compiler corpus completed in 10.17 seconds versus a normalized tracked baseline of 8.48
seconds, a 1.20× ratio under the allowed 1.50× ceiling. Phase totals place project linking well above
lowering. Environmental variance and the modified working tree prevent attributing the difference
to a specific change.

**Framework viability.** Compiler performance is central to keeping source code ordinary while
moving complexity into tooling. Optimization must preserve diagnostics, opaque identities, and the
single coordinated analysis model.

**Recommendation.** Profile the docs-heavy project-link phase, retain per-phase history in CI, and
investigate persistent shifts rather than optimizing from one run. Once variance is characterized,
tighten the broad 1.50 guard or add phase-specific budgets. Do not add caches whose invalidation can
produce stale component or operation identity.

### A16 — Public package metadata is systematically incomplete

**Severity:** Low  
**Status:** Confirmed

All 65 inspected public package manifests lacked a complete license/repository metadata set; 48
also lacked description and engines fields. The package-content check validates synchronization and
contents but does not enforce this publication metadata.

**Framework viability.** No runtime impact.

**Recommendation.** Decide the repository license before populating `license`; do not guess it.
Add repository/directory links and concise package descriptions through the manifest synchronization
source. Require engines only where there is a real runtime constraint. Extend publish checks to
enforce the chosen policy.

### A17 — Packaging checks do not provide a representative clean-consumer matrix

**Severity:** Low to Medium  
**Status:** Existing finding, partially covered

Current checks inspect package contents and some compiler artifact tests perform packing/installing,
but there is no representative matrix that installs published tarballs into clean consumers and
imports each class of public entry point. Workspace resolution can mask missing files, dependency
declarations, or export-map errors.

**Framework viability.** Clean-consumer tests protect the compiler/runtime boundary without changing
the framework model.

**Recommendation.** Add a small matrix rather than an exhaustive package×platform explosion: one
runtime app, one compiler/build adapter, one server/SSR app, one React boundary, and one component
library. Install tarballs with workspace access unavailable, import declared subpaths, run a minimal
build, and verify package-local agent guides/readmes are present where required.

### A18 — Authored documentation and an intl test contain mojibake

**Severity:** Low  
**Status:** Confirmed

Double-encoded sequences occur in `docs/theme.md`,
`docs/proposals/semantic-generative-theming.md`,
`docs/history/javascript-performance-improvements.md`, and
`packages/intl/src/intl.test.ts` (for example, a corrupted French “Chargé tardivement”). This is
especially undesirable in internationalization coverage because a broken fixture can normalize an
encoding defect into expected behavior.

**Framework viability.** No semantic conflict.

**Recommendation.** Repair the authored UTF-8 text and add a narrow mojibake scanner for source and
docs, with explicit escapes/allowlisting for tests that intentionally exercise malformed encoding.
Do not reject valid non-ASCII text.

## Reviewed concerns that should not be “fixed” mechanically

Several apparent smells are intentional or require a narrower response:

- Do not introduce React hooks, render-phase rules, immutable reducers, setter APIs, or general
  memoization ceremony. The theme performance fix belongs in durable derived state and compiler
  dependency tracking.
- Do not replace every `any` with `unknown`. Existential component and compatibility types need
  deliberate erasure; boundary data needs `unknown` plus validation.
- Do not merge every repeated `isRecord`, canonical JSON, or positive-number helper. Share only
  identical policy under a real domain owner; avoid a generic utility package and cross-package
  coupling for cosmetically similar code.
- Do not split the native compiler into multiple AST traversals merely to satisfy a line threshold.
  Preserve its coordinated analysis/lowering model and divide cohesive responsibilities.
- Do not hide `this.state` to address protocol safety. Observable component state is a feature;
  unsafe decoding and copying are the defects.
- Do not apply a uniform coverage percentage. Add least-coupled protection for the concrete risks:
  adversarial protocol tests, theme property/performance tests, HMR cache bounds, and clean-package
  integration tests.
- Do not remove intentionally old React Router versions from the compatibility corpus without an
  equivalent test. Isolate them from deployment and untrusted input instead.
- Do not force DOM and SSR into one renderer. Share or test only their pure semantic contract.

## Remediation order

1. **Restore the acceptance baseline:** A01.
2. **Close trust-boundary defects:** A02, A03, and deployable portions of A05; add adversarial tests.
3. **Remove the user-visible performance hazard:** A04, with correctness and benchmark guards.
4. **Make validation representative:** A06 and the affected-release mapping.
5. **Strengthen public contracts:** A07, A08, and A12.
6. **Reduce long-term drift and tool risk:** A09, A10, A11, A13, and A14.
7. **Complete release hygiene:** A15 through A18.

## Suggested acceptance criteria for the remediation program

- All existing style, architecture, typecheck, package, platform, app, and package test gates pass.
- Parsed records containing reserved prototype keys cannot alter prototypes at server, SSR,
  hydrate, reactive snapshot, or component state boundaries.
- Ordinary invocation result types cannot carry raw HTML; the explicit unsafe capability remains
  auditable end to end.
- Theme output is semantically equivalent for the current corpus and property vectors, initial
  scope creation performs one resolution, and agreed performance budgets pass on normalized CI.
- Normal release validation includes maintained applications through affected/full profiles.
- New production `any` requires a narrow suppression with rationale; public adapters preserve their
  source-library generics.
- HMR render-program retention is bounded, and post-transform source maps preserve tested source
  columns.
- Intentional dependency advisories have documented exposure, owner, and expiry; new high-severity
  advisories fail the policy.

## Closing assessment

eXact's distinctive model is viable and consistently represented in the codebase. The recommended
work does not require making eXact more React-like. The most important corrections instead deepen
the existing design: secure automatic server/client coordination, keep state inspectable without
trusting hostile record keys, make compiler artifacts accurately traceable, and express expensive
derived work as durable reactive state rather than repeated component execution.

The repository is not presently release-ready because its current tree fails required checks and
contains confirmed protocol-integrity footguns. Once A01 through A06 are resolved with the proposed
regression coverage, the remaining findings are suitable for staged maintainability work rather
than a blocking rewrite.
