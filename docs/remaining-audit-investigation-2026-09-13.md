# Remaining audit issues, 2026-09-13

Status: the three recommendations below were approved and implemented. The investigation sections
retain the evidence that motivated them; the implementation and validation summary supersedes their
original pending status. No timing threshold or tracked performance baseline was changed.

## Prop-derived initialization follow-up

The original regression was real: `this.state.count = props.initial` became a scheduled client
computation, while SSR executed it inline. Hydration restored 12 and 17, then the scheduled
initializers overwrote them with 2 and 7. The previous fixture was narrowed to a constant initializer,
which hid the failure. That change was incorrect; the prop-derived fixture is restored permanently.

The compiler now selects synchronous computation activation for neutral synchronous browser
computations across complete, hydrate, and client projections. During resumption, those computations
reconstruct sparse setup values before captured state is applied. Their dependency subscriptions
start after restoration, so restoration itself cannot enqueue an overwrite. Explicit asynchronous
and environment-specific tasks retain their task policy and completion handling.

The follow-up update test also exposed an indexed dependency defect: a child prop slot could retain
a parent's reactive expression, but only replacement of the child slot was observed. Indexed
continuation dependencies now observe that retained expression, rebind on replacement, and release
both subscriptions with their owner. Primitive slots retain direct indexed observation.
Compact input plans also observe retained parent expressions after restoration, while finalized
primitive inputs keep their direct receive path. The production hydration projection now retains
a compact compiler-owned completion-ID allowlist when it omits the verbose continuation catalog.
Payload validation remains strict; arbitrary completion IDs are still rejected.

Regression coverage retains string and streaming independent islands in reverse lazy-loading order,
DOM identity and clicks, sparse root hydration, fresh mounting, later parent input changes, and
subscription replacement/disposal. Native coverage checks all three browser artifact projections.
Final follow-up validation: the full package suite passed **2,177 tests across 364 files**
(15 tests and two files skipped). The production hydration projection passed all six focused
regressions, including rejection of an unknown completion ID. The native compiler package and
command tests passed, including complete/hydrate/client emission coverage and compact completion
allowlisting. Workspace and test typechecks, frozen 0.5.0 artifact execution, platform boundaries,
focused lint/formatting, source architecture, JSDoc, explicit-any, and `git diff --check` passed.
Benchmark preflight subsequently exposed a generated-type mismatch in the physics package: the
synchronous helper received a task-branded callback whose context inferred as `never`. Synchronous
computations now remain unbranded, preserving helper contextual typing; they do not own cross-boundary
task generations. The original physics package build is retained as the semantic validation boundary.
Logs are retained under `.tmp/adversarial-audit-2026-09-12/` as
`resumption-final-packages.log`, `resumption-final-native-build.log`, and
`resumption-production-projection.log`.

## Implementation and validation

- **SSR:** server-only roots now retain independently discoverable resumable islands. Each island
  serializes resolved public props and its own component records, without duplicating them in the
  page capture. Lazy activation scopes its cursor synchronously and keeps the existing transport
  domain. Full-client-root boundary elision remains intact. Invalid inline payloads fail before mount.
- **Dependencies:** SvelteKit alone overrides `cookie` to `0.7.2`. Framework versions are retained;
  the dependency audit reports zero vulnerabilities and all four policy exceptions were removed.
  The Svelte participant builds on Node and Bun and passes all seven shared browser contracts on
  each runtime, covering SSR, hydration, optimistic changes, live updates, and failure recovery.
- **Compiler:** a narrow pinned-upstream patch preserves unchanged implicit JSX import resolution
  with fresh synthetic nodes and a copied map. Changed imports retain full fallback. Native tests
  protect AST ownership, unaffected source reuse, and equivalence to fresh compilation. Per-project
  medians now retain matching phase/counter observations; reports record compiler/input identities.

Validation includes 2,171 passing package tests (15 existing skips), 688 focused SSR/hydration tests,
32 shipping tests, 113 build-script tests, native Go
compiler tests, workspace/test type checking, source architecture, JSDoc, explicit-any and core API
checks, platform boundaries, and frozen compiled/release ABI checks. Shipping tests use
`NODE_OPTIONS=--no-experimental-webstorage` for the existing Node 26/jsdom storage conflict.
The real Chromium shipping probe observes one hydrated island, no initial transport request,
one successful request after changing the destination ZIP, a changed route, and no browser errors.
String/progressive regressions exercise lazy islands finishing in reverse order and retaining
existing button nodes; existing full-document tests protect client-root adoption.

The focused Workbench control improved from 115.764 ms to approximately 44 ms, restoring six
callable analyses and five link walks. The full 360-file, 27-project corpus measured 4.35 seconds,
with a 1.30 guard ratio against the unchanged 1.50 limit. Its Workbench edit measured 52.793 ms
with the same recovered counters. These are local diagnostics, not new framework RPS claims.

Final evidence is retained under `.tmp/adversarial-audit-2026-09-12/`, including
`shipping-live-result.json`, `island-final-tests.log`, `shipping-final-tests.log`,
`svelte-cookie-node-browser.log`, `svelte-cookie-bun-browser.log`, `final-audit.json`,
`jsx-reuse-final-build.log`, and `jsx-reuse-full.log`.

## 1. Shipping SSR: confirmed client hydration failure

The missing markers are not merely a stale assertion. A Chromium probe served the real shipping
request handler through Vite, using the application's working directory and configuration. It
loaded the page and changed the destination ZIP to `94105` after startup. Results:

- No verbose or compact island boundary markers were emitted.
- No island was marked hydrated.
- Changing the input produced no `/__exact` request and did not change the route.
- No browser exception was reported. The page silently remained an inert server rendering.
- Hydration JSON contained the workspace's captured state. Serialization alone did not activate it.

The generated registration exposes `CalculatorWorkspace` as a lazy island. The client calls
`createExactClient()` with that registry, so activation depends on discovering its DOM boundary.
It does not mount a compiled client root for `ShippingCalculatorPage`.

The SSR publication condition in
[`direct-component-output.ts`](../packages/ssr/src/render/direct-component-output.ts) suppresses
the child boundary whenever a resumption capture exists. Its comment assumes that a hydratable
root owns the child. However, the hydratable renderer creates that capture for this island-based
application too. Capture availability is being mistaken for ownership by a client root. The
condition was introduced in `8aa16396`, during the shared SSR and root-ownership work.

**Recommendation:** fix the framework's hydration ownership contract. Distinguish a subtree adopted
by a known client root from an independently activated island. Retain a discoverable boundary and
correctly scoped captured state for the island case, while preserving boundary elision for children
actually owned by a client root. Do not move this supported application to another hydration model
or delete the assertion to hide the defect. Avoid publishing the same captured state twice.

Protect this with a compiler-to-SSR-to-browser regression: initial state resumes without replaying
startup requests, changing an input invokes its server operation, DOM identity survives adoption,
and independent/lazy islands keep separate ownership. Exercise string and progressive rendering,
and retain a full-client-root control proving the optimized markerless path still works.

Evidence: `.tmp/adversarial-audit-2026-09-12/shipping-live-probe.mjs`, `shipping-live.html`, and
`shipping-live-result.json`. The probe owns and closes its HTTP server, Vite instance, and browser.

## 2. Dependency advisories: one cookie defect propagated through four packages

A fresh npm audit still reports four low-severity entries and no moderate, high, or critical entries.
All four originate from `cookie@0.6.0`, required by `@sveltejs/kit@2.70.3`; the Node and Bun Svelte
adapter entries inherit that finding. Other installed cookie versions, including `0.7.2` and
`1.1.1`, are outside this advisory's affected range.

The defect permits cookie names, paths, or domains to inject cookie fields during serialization.
It is fixed from `0.7.0`. It requires unsafe values in those fields, not merely an untrusted cookie
value. See the [upstream advisory](https://github.com/advisories/GHSA-pxg6-pf52-xh8x).

The comparison participant does not set application cookies in its authored source. Its current
controlled-benchmark exception is defensible, but keeping an old vulnerable leaf is unnecessary if
the patched serializer works with the pinned framework. npm's suggested framework downgrades are
not an appropriate repair.

**Recommendation:** use a narrowly scoped override of SvelteKit's `cookie` dependency to `0.7.2`,
subject to Svelte Node/Bun SSR and client compatibility checks. Retain existing framework versions.
Then rerun the full dependency audit and remove the four exceptions if the tree is clean.

A local comparison of the installed `0.6.0` and `0.7.2` serializers produced identical outputs for
representative valid session, scoped, and deletion cookies. The patched version rejected injected
cookie names accepted by the old version. This is useful compatibility evidence, not a substitute
for rebuilding and exercising the Svelte participant. No override was applied.

Evidence: `remaining-audit.json` and `remaining-dependency-tree.txt` in the audit evidence directory.

## 3. Compiler timing: real incremental reuse loss, amplified by parallel measurement

The final full corpus is faster than its tracked aggregate baseline. The warning is driven by
Workbench's incremental case: appending one newline to `src/components/TaskCard.tsx` after warming
the project. Its measurements are:

| Case                                          | Incremental time | Callable source analyses | Component link walks |
| --------------------------------------------- | ---------------: | -----------------------: | -------------------: |
| September 1 tracked baseline                  |        63.438 ms |                        6 |                    5 |
| Revision before audit remediation             |       195.846 ms |                       16 |                   11 |
| Final audit remediation                       |       193.539 ms |                       16 |                   11 |
| Current isolated one-worker run, five samples |       115.764 ms |                       16 |                   11 |

All report the same five affected source paths and ten paths outside that set. The current engine
nevertheless discards the source identities needed to retain analysis for the unaffected files.
The extra analysis persists when parallel contention is removed. It predates the audit remediation.

The pinned TypeScript-Go `Program.ReuseProgram()` explicitly declines reuse when either source has
an implicit JSX-runtime import. Workbench specifies `jsxImportSource: "@exactjs/jsx"`, which creates
that import even with `jsx: "preserve"`. A focused native probe confirmed that the unchanged-import,
whitespace-only edit returns `reused=false`. The guard lives in the pinned upstream compiler's
`tsc/internal/compiler/program.go`; `GetJSXImplicitImportBase()` explains the import selection.
Its stated reason is that cloning does not recompute synthetic import bookkeeping.

**Recommendation:** restore safe reuse for unchanged JSX-runtime import bookkeeping through the
native host integration or a targeted upstream fix. Do not simply remove the conservative guard,
drop `jsxImportSource`, or reuse checker facts across incompatible AST identities. Preserve full
invalidation when imports, configuration, or source semantics require it. Add a configured JSX
project regression that verifies both semantic correctness and retained unaffected-source analysis.

Keep the timing threshold. Add a stable single-project edit control and record compiler/input
identity with baselines. The harness currently matches projects by config path and file count;
that cannot establish identical transitive inputs across revisions. It also combines per-project
median elapsed times with phase data from a separately selected whole-corpus sample, so those
fields are not always one observation. Keep a representative project's phases and counters with
the same selected timing sample. Rebaseline only after the reuse behavior and measurement contract
are understood and validated.

Evidence: `final-native-corpus.json`, `native-before-control.json`, and `workbench-isolated.json`
in the audit evidence directory. The isolated probe and temporary native test did not modify the
framework source or tracked baseline. The temporary native test was removed after completion.

## Recommended order

Fix the silent shipping hydration failure first. Validate the scoped cookie override next, since
it can remove all four advisories with limited scope. Repair the compiler reuse path separately,
with focused semantic and performance controls before accepting a new baseline.
