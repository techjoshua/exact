# Application field-feedback tasks

Status: investigated backlog. Findings below distinguish reproduced defects, working current paths,
and the remaining limits of the investigation.

This document turns Ripley's September 19–22, 2026 eXact field notes into independently
prioritizable engineering tasks. It serves maintainers deciding what to investigate and fix.
It is separate from public usage references because those references must describe supported
behavior, not teach application authors to preserve suspected compiler defects. Remove completed
tasks after incorporating their contracts and guidance into the owning references.

## Evidence and version boundaries

The input was `../ripley/docs/exact-field-notes.md`, inspected with Ripley at `f25cc28` and eXact
at `7182fb33`. Ripley's current lockfile pins the relevant framework packages to **0.5.1**;
its first web commit, `aeb1539`, also contains 0.5.1 packages. The later design translation is
`276a9dc`; `cab0ed8` contains the intermediate report component and two-stage audit work.
Use these commits to recover original application shapes, rather than reproducing only the
current application after its workarounds. Notes do not specify a timezone, and some failed
experiments were never committed. Their timestamps alone cannot identify an exact source tree.

This eXact checkout declares **0.6.0**. `5bf13067` changed composition and enhancement targeting;
`cc8dd1fd` and `4dbecfb8` subsequently changed guarded updates, task callback discovery, and list
hydration. These are relevant changes, not proof that a particular report is fixed. In particular,
`^0.5.1` does not select 0.6.0. Source inspection and a successful current reproduction must be
distinguished from claims about the package originally installed in Ripley.

The follow-up investigation used real paired artifacts from `compileProjectArtifacts`, generated
hydration registries, jsdom DOM mounting/adoption, `mountClientServerTest`, and real
`handleExactRequest` continuation dispatch. Type checks used the native semantic projection and
TypeScript 6 over emitted artifacts. A browser-target esbuild graph checked the reduced server-import
case; a write-disabled Vite build checked the shipping sample's actual server configuration.
A subsequent enhancement audit compared actual Vite production bundles of authored source, paired
artifacts, and `.exact` facade imports without manual catalogs. It also checked motion through
server-build authorization. These were reduced applications, not a full replay of Ripley or a
real-browser test suite.

The native executable matched current compiler sources according to the build-cache validator.
Its SHA-256 was `c2ca140a893dd9e3d5e0973e26292c4facd1371125d394a6e03b5ad417247a3b`.
The initial triage used `7182fb33`; during follow-up the shared checkout advanced to `982bea8c`
through unrelated work. Runtime probes used the available built workspace packages and generated
new application artifacts. This is not clean-checkout or published-package certification. No
framework or application implementation was changed for this investigation.

Reduced sources, runners, and raw output remain local in `.tmp/field-investigation`, with the
initial compiler probes in `.tmp/field-notes-probes`. The report preserves the consequential input
shapes and outcomes; raw generated artifacts are intentionally not committed. The compiler facade
worked when called from a normal `.mjs` runner, so the first triage's interrupted stdin-based probe
is not evidence of a framework defect.

Evidence labels:

- **Reproduced:** observed with a reduced compiler, DOM, transport, or build case, as specified.
- **Source-confirmed:** demonstrated by current source or documentation without an equivalent
  end-to-end reproduction.
- **Passed reduced case:** the tested current path works. This does not invalidate the historical
  report or prove every variation works.
- **Remaining uncertainty:** a limitation is stated explicitly; it is not an instruction to begin
  an unbounded investigation before implementing the confirmed fixes.

## Suggested priority and sequencing

Priority is a proposal for discussion, not an implementation commitment. P1 means correctness or
an adoption blocker; P2 means workflow reliability or important guidance; P3 means bounded polish.

| Task | Priority               | Finding                                                               | Recommendation                                                      |
| ---- | ---------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| RF03 | P1                     | Inferred helper tasks miss activation; remote helper writes disappear | Fix discovery and remote effect analysis separately                 |
| RF04 | P1                     | Inline continuation views become unmountable server receipts          | Fix partitioning; document root versus island bootstrap             |
| RF08 | P1                     | Five checking-projection failures reproduced                          | Fix semantic lowering and authored diagnostic locations             |
| RF10 | P2                     | Emitted server task calls fail TS2554                                 | Fix invocation typing; avoid broad testing-API redesign             |
| RF15 | P2                     | Inert shell stays light; activated scope becomes dark                 | Specify rendering-mode behavior and a supported preference strategy |
| RF16 | P1 sample / P2 starter | Current sample server build fails on JSX                              | Repair sample first, then build a full-stack template from it       |

Start with RF03/RF04, RF08, and the sample build repair in RF16. The
reproductions are already sufficient to begin fixes. RF10 has a specific compiler failure mechanism and
can proceed without redesigning the task model.

For every implementation task, update the owning engineering reference and relevant `apps/docs`
page when behavior or supported usage changes. Update package READMEs and the reusable agent skill
only where their application-facing advice changes. Review emitted helper and artifact changes
under [release readiness](../release-readiness.md), including already released ABI fixtures.

## Correctness tasks

### RF03: Discover helper-driven tasks and retain their remote effects

**Finding: two different failures reproduced.** September 19, 22:05.

1. An inferred local async function calls an imported `mutate(state, value)` helper and is activated
   with `void change(this.state.revision)`. The compiler leaves it as an ordinary setup call, so
   clicking to change revision does not execute it again. Adding a `TaskContext.client()` policy
   causes task lowering, and the imported write then updates the DOM. Ordinary helper mutation is
   therefore not universally invisible to the reactive runtime.
2. A generated server task calls that helper with `this.state`. Its successful response contains
   the return value but no state update, its declared `stateWrites` is empty, and the UI stays at its
   initial value. This reproduces with real request handling in both batch modes. The server executor
   executes the helper, but `projectContinuationState` cannot publish undeclared writes.

**Owners:** `task_dependency_analysis.go`, task discovery/effect analysis, invoked-operation
contracts, and [continuation state projection](../../packages/server/src/continuation-execution.ts).

**Recommendation:** improve finite interprocedural effect analysis for imported helpers. For opaque
or unsupported effects, require an explicit safe contract or issue an authored-source diagnostic.
Keep local task inference separate from remote write authorization. Do not transport arbitrary state
or broaden the allowlist at runtime to conceal a missing compiler effect.

**Acceptance:** inferred supported helpers activate on their intended dependencies; explicit local
helpers remain correct; remote helper writes are authorized and published; cancellation and stale
responses cannot publish writes. A direct inline assignment is the control for each layer.

### RF04: Repair inline continuation view partitioning and clarify bootstrap ownership

**Finding: one framework defect and one bootstrap mismatch reproduced.** September 19, 17:05,
17:10/17:15, 17:50, and 17:58.

The fixture has a server shell and a workspace with two server functions, a revision-activated local
async task, and event handlers from an inputs factory. With the returned JSX in an imported helper,
the registry loads a real workspace, hydration succeeds, and both continuations dispatch. Moving
that same JSX into the workspace's own returned render function emits a client implementation
returning `createServerBoundaryReceipt`. SSR still publishes the workspace as a client boundary.
Hydration then fails with `A server boundary cannot be mounted by the DOM target (Workspace)`.
The earlier minimal direct-click example passed because it did not exercise this activation shape.
An interactive motion page built with `serverComponents: true` also publishes an empty client
boundary, while root SSR renders its full rows and panel. After repairing motion's own server
projection and default export authorization, this partitioned-view case remains an RF04 acceptance
case. Static motion markup and root hydration now have a production-bundle regression.

The isomorphic-root variation has a different result: it emits zero independent boundaries, an
islands-only client makes zero requests, and `hydrate(clientApp, root, registrationAndTransport)`
correctly dispatches both operations. Its root owns the subtree. A dummy server task is not the
right repair for an application that selected islands-only bootstrap for that root.

**Owners:** component resumption and JSX partition lowering, registry generation,
[SSR publication](../../packages/ssr/src/render/component.ts), and hydration mode documentation.

**Recommendation:** reconcile the executable client implementation with the published boundary
and resumption contract. Fix the inline/imported layout discrepancy at partition planning. Document
root hydration versus independent-island hydration with the passing root example. The exact
local-only `ShareBar` and nested `ReportView` variations still need regression cases, but do not
block work on the now-reproduced partition mismatch.

**Acceptance:** moving the view between the component and an ordinary helper preserves supported
placement and interactions; every published boundary resolves to a mountable artifact; root hydration
and independent islands each have a complete example. Preserve adopted DOM and component identity.

### RF08: Preserve TypeScript semantics in the checking projection

**Finding: five reduced semantic-check failures reproduced.** September 19, 16:47, 17:15,
17:45/20:40, and 18:10; September 20, 16:45/16:50; September 21, 19:35/19:45.

| Authored shape                                                                                                         | Current checking result                                          | Executable compilation           |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------- |
| Plain helper returns JSX containing `items.map(item => <li key={item.id}>...</li>)`                                    | Invented `this.map` causes implicit-this and callback-any errors | Both targets emit keyed receipts |
| Async server task assigns `{ preview: await fetchValue() }`                                                            | TS1308: await outside async context                              | Client compilation succeeds      |
| A local explicitly typed as a string-literal union is passed as `intro={intro}`                                        | ReactiveValue/string incompatibility and invalid `.get()`        | Client compilation succeeds      |
| `this.state.preview ? <dd>{this.state.preview.hash}</dd> : ...`                                                        | TS2532: possibly undefined                                       | Client compilation succeeds      |
| Plain JSX module function assigns `const route = matchRoute(url)` and narrows `route.kind` before reading `route.hash` | TS2339: hash absent on union                                     | Client compilation succeeds      |

The last case differs from a function taking `route` directly as a parameter, which passed the
initial probe. That explains why the earlier small narrowing test did not reproduce the field note.
The keyed-list result confirms checking/executable disagreement, not a current server-500 claim.

**Recommendation:** fix collection lowering, async-expression ownership, derived-binding types,
and narrowing preservation in the checking projection. Give generated closures the necessary
stable narrowed bindings without weakening genuinely unsafe reactive reads. Map diagnostics to
useful authored spans; generated-file offsets remain visible in the native responses.

**Acceptance:** these valid forms check and compile consistently, deliberately invalid forms still
fail, and diagnostics point into the original source. Verify keyed insert/reorder/removal and
hydration at runtime rather than removing keys to make the checker pass.

### RF10: Repair emitted task invocation typing

**Finding: generated server-call arity errors reproduced.** September 19, 17:12 and 18:15.
TypeScript 6, with Node types and even with strict mode disabled, reports TS2554 for each generated
call to a default-policy server function: `Expected 4 arguments, but got 3`. The server declaration
has lost the authored default on its TaskContext parameter, while the generated invocation relies
on the helper to supply that context. Generated client-to-server rejection and recovery regression tests pass; this is a generated type
contract mismatch, not proof that transport omitted the runtime context.

A consumer calling `testServerComponent(Shell)` on the generated fixture **did** type-check once
these separate arity diagnostics were accounted for. The historical prepared-render return mismatch
and unknown-to-string assignment were not reproduced by this case.

**Recommendation:** correct the relationship between emitted function signatures and `invokeTask`
inference. Do not loosen all public component types or hide generated files from checking. Keep the
older additional errors as targeted variants only if a reduced failing input can be recovered.

**Acceptance:** ordinary TypeScript accepts both emitted target artifacts and the server testing
consumer, while invalid authored arguments/results fail. Review helper signature changes and
representative artifacts against the released ABI policy.

### RF15: Specify system preferences for inert server theme scopes

**Finding: rendering-mode limitation reproduced.** September 20, 17:30. With dark `matchMedia`
preferences supplied in jsdom, SSR produces a light scope. Islands-only bootstrap with no owning
client island leaves it light. Hydrating the scope with a client catalog and DOM integration changes
it to dark and preserves the theme text class.

[ThemeScopeEnhancement](../../packages/theme/src/components.ts) deliberately starts from deterministic
light/standard/full state and subscribes to preferences in `onMount`. A server-only scope never runs
that callback. The broad media-query statement in [theme guidance](../theme.md) needs this condition.

**Selected direction:** SSR must preserve `system` as an unresolved preference rather than resolve
it to light. Generated CSS must include the light and dark paths and let the browser select the
active path through its preference media query. Initial styling and subsequent system preference
changes must work without scope activation or JavaScript. Browser activation may expose the resolved
appearance to reactive consumers, but must not be required to select the visual appearance.

An explicit light or dark value takes precedence over system preference and permits selecting the
specific style path. Any pruning must still preserve paths reachable through supported runtime
changes and nested scopes; an explicit initial value alone does not prove the other path unreachable.
Keep source preference and browser-resolved appearance distinct across SSR and hydration.

**Additional design candidate:** allow application-configured cookie persistence of theme preferences
and request-time injection into the theme setup. This is optional, not required for system mode.
Prefer validated preference values over arbitrary serialized CSS. Define precedence as an explicit
scope value, then the configured request preference at the root, then system mode; nested scopes
retain their inheritance semantics. Missing or invalid cookie values fall back to system mode.
Use the same initial preference for server rendering and hydration, and define how changes are
persisted and how returning to system mode clears or replaces an explicit choice. Cookie naming,
scope, and lifetime belong to application configuration. Review request-specific HTML caching when
adding the integration. The cookie API and implementation remain to be designed and validated.

Document the current limitation until this behavior is implemented; do not present the selected
direction as already supported or make a reload/pre-paint script the mandatory solution.

**Acceptance:** verify first paint and no-JS output in real browsers with both light and dark system
preferences, live preference changes, explicit overrides, and nested scopes. The shell and islands
must not silently choose conflicting appearances. Cover contrast/reduced motion with the same
distinction between system preference and explicit values. If cookie support is added, cover missing,
invalid, and explicit saved preferences, returning to system mode, and hydration consistency.
The existing probe establishes activation behavior, not real-browser paint timing or the feasibility
of the proposed CSS generation changes.

## Integration and documentation tasks

### RF16: Provide a maintained full-stack starter and deployment path

**Finding:** September 19, 16:00, 16:52, 16:55/17:15, and 18:30. Starter gaps remain, and the
shipping sample's server build failure is now reproduced.
[The generator](../../packages/create-exact-app/src/project-generation.ts) creates transport examples,
not a complete SSR application; that is a product gap rather than an adapter defect. No deployment
manifest of the reported kinds was found in the tracked file inventory.

**Work:** make SSR plus hydration the default when the generated application includes the server
runtime. Preserve an explicit opt-out for applications that need only server operations. This is a
scaffolding default, not a requirement that every server-runtime consumer render HTML.
Include build/generation, document rendering, generated
hydration registration, continuation endpoint, assets, production start, and owned dev processes.
Keep the sample usable outside the repository. Include a minimal container example and a workspace
example explaining source-package bundling without requiring every dependency to be inlined.

Offer three application outputs: an ordinary browser-only site, a server application with SSR and
hydration, and a self-contained browser application delivered as one HTML file. The single-file
option is a proposed P2 build capability, not an investigated defect or an existing supported mode.
It should embed compiled scripts, styles, images, and required fonts, with no external framework or
asset requests. Authoring can remain a normal multi-file project; the delivery artifact is one file.
Own asset embedding in the build integration rather than application-specific postprocessing.
Define handling for CSS asset URLs, dynamic imports, and worker assets. Bundle supported cases and
diagnose unsupported or unresolved external dependencies. Server-only operations should produce a
clear build diagnostic for this mode.

The intended single-file baseline is an application that opens directly from disk and works offline.
Use routing compatible with that environment and document limits of browser APIs under `file:` URLs.
Validate an actual browser opening the emitted file with networking disabled, exercising interaction
and embedded assets. Optional application network features must be explicit; they cannot be required
for the self-contained baseline. Keep this work independently schedulable from the P1 sample repair
and the default SSR starter.

A write-disabled Vite build using the shipping sample's actual server config fails with
`Unexpected JSX expression` in `src/server-app.tsx`, at the request render callback. Pre-generating
App/component artifacts does not transform the authored JSX in that server entry graph. Repair this
sample configuration with the server-target eXact compilation path and add a build smoke check before
using the sample as the starter's foundation. This is an immediate P1 sample repair; the broader
full-stack template and deployment work can remain P2.

Correct the misleading `readExactHydrationConfig(root)` example when the script is a sibling.
The helper intentionally searches its supplied subtree and returns `{}` when absent. However,
`createExactClient` also uses `resolveHydrateOptions`, which searches the containing tree, so the
empty explicit read alone does **not** prove the current client has no endpoint. Test the complete
bootstrap, including a detached test container. Avoid making absent config universally erroneous:
not every hydration mode needs a remote endpoint.

**Acceptance:** a freshly generated external application builds and starts, serves meaningful SSR
without JS, hydrates a button, and dispatches a continuation in dev and production. Container startup
and a sibling TypeScript workspace package work with documented commands. No source copying from
the 300-line sample or manual framework registration is required. RF09 and RF12 inform the template.

## Reports that should not become new framework features

| Report                                                                                           | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| September 20, 19:40: document/head ownership requires a string shell                             | Already available in this tree. `documentShell(application)`, `Document`, and framework output slots are documented in [child composition](../child-composition.md) and covered by `packages/ssr/src/document-shell.test.ts`. Migrate the starter/example through RF16; do not open a duplicate document API design.                                                                                                                                                                    |
| September 19, 21:10: first Vitest run cannot resolve regenerated artifacts                       | Unconfirmed intermittent integration issue. The application script deletes `.exact` itself before compilation; `compileProjectArtifacts` is not proven to own that deletion or the root-absolute resolution. Current compiler publication is transactional. Preserve the failing resolver state and run a bounded cold-cache reproduction before opening a compiler fix. Fold a reproducible clean-generation failure into RF16 or assign it to the responsible Vite/application layer. |
| September 21, 20:20: Render rejects a shell-like payload                                         | Host-specific report, explicitly not an eXact defect. No transport encoding redesign is justified. Any host guidance should describe the deployment finding without turning base64 into a framework security guarantee.                                                                                                                                                                                                                                                                 |
| September 20, 16:50: inline lists check successfully                                             | Amends the earlier broad claim, but does not eliminate RF08: a direct keyed JSX helper still fails current semantic checking while its executable targets succeed.                                                                                                                                                                                                                                                                                                                      |
| September 19, 20:40 and September 21, 19:45: narrower scopes for previous compiler failures      | Use the amended scope in RF08. Ordinary `.tsx` functions and all union narrowing are not universally broken.                                                                                                                                                                                                                                                                                                                                                                            |
| September 20, 18:05 and September 21, 19:50: large views and repeated calculations are necessary | Consequences of RF01/RF02/RF11, not architectural goals. Scalar-helper capture is reproduced; a reduced two-input derivation works. Repeated calls are not established to be cheaper without measurement.                                                                                                                                                                                                                                                                               |
| Positive notes about SSR, theme accessibility, and unlimited continuation duration               | Preserve the useful scenarios as acceptance cases, but do not promote absolute claims. The same log reports missing SSR motion content; computed palette contrast does not prove every rendered combination accessible; transport/deployment cancellation still exists.                                                                                                                                                                                                                 |

## Completion criteria for this backlog

Each task closes with a reduced regression case or an explicit explanation showing the source
violates a documented contract, a fix at the owning boundary where required, appropriate tests,
and synchronized current guidance. “Works after moving code into another file” is diagnostic
evidence, not closure. Where replay against current artifacts succeeds, record the relevant
coverage and version distinction rather than retaining a speculative bug indefinitely.
