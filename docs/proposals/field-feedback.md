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

| Task | Priority                       | Finding                                                                      | Recommendation                                                               |
| ---- | ------------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| RF02 | P1                             | Scalar arguments captured by child view helpers stay stale                   | Fix helper input propagation; reject the blanket multi-input rule            |
| RF03 | P1                             | Inferred helper tasks miss activation; remote helper writes disappear        | Fix discovery and remote effect analysis separately                          |
| RF04 | P1                             | Inline continuation views become unmountable server receipts                 | Fix partitioning; document root versus island bootstrap                      |
| RF05 | Defer                          | Reduced server-only import graph is clean                                    | Do not start a general isolation rewrite from this report                    |
| RF06 | Close current bug candidate    | Throwing continuations reach catch in both batch modes                       | Retain transport regression coverage                                         |
| RF08 | P1                             | Five checking-projection failures reproduced                                 | Fix semantic lowering and authored diagnostic locations                      |
| RF09 | P2                             | Directory checking ignores project include; orphan fixture is checked        | Fix CLI contract; close reachability hypothesis for reduced case             |
| RF10 | P2                             | Emitted server task calls fail TS2554                                        | Fix invocation typing; avoid broad testing-API redesign                      |
| RF12 | P1 paired-artifact integration | Available theme provider lost in actual Vite artifact builds                 | Preserve optional-provider linkage in paired output                          |
| RF13 | Close current bug candidate    | Helper export matrix passes                                                  | Keep a focused regression case, not a new naming restriction                 |
| RF14 | P1                             | Motion default export fails server authorization; lower-level SSR also fails | Repair export mapping, then validate SSR projection; retain release behavior |
| RF15 | P2                             | Inert shell stays light; activated scope becomes dark                        | Specify rendering-mode behavior and a supported preference strategy          |
| RF16 | P1 sample / P2 starter         | Current sample server build fails on JSX                                     | Repair sample first, then build a full-stack template from it                |
| RF20 | P2                             | Concurrent generated continuations read isolated request contexts            | Publish the tested setup recipe                                              |
| RF21 | P2                             | Existing navigation surfaces need an integration recipe                      | Document client placement and redirect semantics                             |
| RF22 | P3                             | Claude project path and symlink support verified                             | Document the canonical-payload bridge                                        |

Start with RF02, RF03/RF04, RF08, and the sample build repair in RF16. The
reproductions are already sufficient to begin fixes. RF12 now has a Vite build reproduction with available providers; preserve the intentional no-op
fallback while repairing paired-artifact linkage. RF14 also needs the package export authorization
repair described below before its lower-level SSR projection can be validated through Vite. RF10 has a specific compiler failure mechanism and
can proceed without redesigning the task model. Do not schedule RF05, RF06, or RF13 as general
framework repairs unless a new failing variation is supplied.

For every implementation task, update the owning engineering reference and relevant `apps/docs`
page when behavior or supported usage changes. Update package READMEs and the reusable agent skill
only where their application-facing advice changes. Review emitted helper and artifact changes
under [release readiness](../release-readiness.md), including already released ABI fixtures.

## Correctness tasks

### RF02: Preserve live inputs across component view helpers

**Finding: reproduced, and narrower than the original explanation.** September 19, 18:05 and
22:05; September 20, 18:05; September 21, 19:50. The stale case does not require nested helpers:

```tsx
function view(value: string, flag: boolean) {
	return (
		<output>
			{value}:{String(flag)}
		</output>
	);
}
function Child(this: Component<{}>, props: { value: string; flag: boolean }) {
	return () => view(props.value, props.flag);
}
```

Both prop slots are declared, but the child stays `A:false` while a direct JSX child reaches
`C:false`. This occurs in the direct mount and root-hydration probes. A nested helper constructing
that child also stays stale. Replacing the scalar-argument helper with `view(props)` and reading
`props.value`/`props.flag` inside it makes the direct-child variation update correctly.

The emitted scalar-helper render program closes over its initial arguments; having valid prop
slots does not establish the necessary update path into that retained program. Trace the boundary
between `component_input_updates.go`, `jsx_component_updates.go`, and helper render-program
construction. Do not treat this as solely missing parent prop reception.

A separate `const label = status(value, flag)` inside a helper called by the parent **did** update
when either input changed. That disproves a universal “two inputs are cached against one” rule.
Ripley's original exact `judgeStatus` variation has not been replayed with all domain types.

**Recommendation:** fix live argument propagation or precise reevaluation of the affected helper
range. Keep the durable component and its local state. Use the passing whole-props variation as a
control, not as a permanent rule requiring applications to pass every prop object whole.

**Acceptance:** scalar and object arguments, direct and nested helper composition, independent
changes to both props, and post-hydration updates work without remounting. An unrelated state
change should not recompute the helper. Do not require repeated inline calls or one large view.

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

### RF05: Retain server-import isolation coverage; defer a new isolation fix

**Finding: passed the reduced current case.** September 19, 17:14 and 22:05. A workspace server
function calls an imported helper that imports `node:crypto`. Current paired-artifact compilation
removes that helper import and its server implementation from the client artifact. The unbundled
client imports only its view and inputs helper; its browser-target bundle graph has 193 inputs and
contains neither the server helper nor `node:crypto`.

This establishes the reduced graph is clean before final tree shaking, not just that a production
chunk happens to omit it. It does not certify Ripley's complete transitive workspace graph, dev
server, or source maps. The original installed version was 0.5.1.

**Recommendation:** do not start a general import-partitioning rewrite. Retain a dev-graph and
production-graph regression around this shape. Reopen only with a failing transitive variation,
such as a mixed shared/server module or package re-export. Treat any actual private-data reachability
as a compiler/adapter boundary defect, not an application bundler workaround.

**Acceptance if reopened:** the failing import is absent from the browser graph before evaluation;
shared imports remain available; chunks and source maps pass the existing artifact isolation checks.

### RF06: Close the current rejection bug candidate and protect the generated path

**Finding: passed real generated continuation dispatch.** September 19, 19:05. After waiting for
initial island loading, the sequence success → server throw → success was run with `batch: false`
and `batch: true`. Each successful action dispatched two continuations. The throw returned HTTP 500
with a redacted `internal_error`, reached the authored `catch`, and left the last successful value
intact. The next action succeeded. There was no catch-to-undefined workaround in the fixture.

The current [task runtime](../../packages/core/src/tasks/runtime.ts) rejects its invocation, and
[hydration operation handling](../../packages/hydrate/src/runtime/operations.ts) rethrows transport
errors. This agrees with the observed behavior. The old report is not evidence that the current
API returns undefined on failure; Ripley's later explicit `.catch(() => undefined)` also cannot
be used to test that hypothesis.

**Recommendation:** close this as a current general bug candidate. Retain a compact generated-path
regression covering rejection and recovery. Cancellation, legitimate undefined results, and stale
invocations should remain separate cases; they were not exhaustively tested in this investigation.

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

### RF09: Define project-check selection; close the reduced fixture-skipping hypothesis

**Finding: CLI semantics reproduced, test-only reachability hypothesis not reproduced.**
September 19, 16:45; September 20, 19:05. In an isolated strict project whose `include` is `src`:

- `--check --project tsconfig.json` prints usage and exits 1, not the historical 0.
- `--check --project tsconfig.json src` rejects an unreferenced fixture missing a required field.
- Replacing `src` with `.` also diagnoses implicit-any in `scripts/build.mjs`, outside `include`.

[File selection](../../packages/compiler/src/compilation/file-compilation.ts) collects the explicit
input paths independently of tsconfig inclusion. The starter's `exactc --check .` therefore checks
more than application authors expect. No component import is necessary to receive the fixture error.

**Recommendation:** define a useful project-only mode, preserve explicit-path semantics where
intentional, and align the generated typecheck command and CLI help. Do not redesign checking around
component reachability; the reduced unreferenced-file case already works. Reopen fixture skipping
only with the failing workspace/type-resolution input.

**Acceptance:** project includes/excludes, explicit paths, test-only fixtures, and unreferenced
included files have deterministic selection and nonzero error exits. Build scripts should not be
silently added to project mode. No application workaround that hides fixtures is acceptable.

### RF10: Repair emitted task invocation typing

**Finding: generated server-call arity errors reproduced.** September 19, 17:12 and 18:15.
TypeScript 6, with Node types and even with strict mode disabled, reports TS2554 for each generated
call to a default-policy server function: `Expected 4 arguments, but got 3`. The server declaration
has lost the authored default on its TaskContext parameter, while the generated invocation relies
on the helper to supply that context. Runtime dispatch in RF06 succeeds; this is a generated type
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

### RF12: Preserve optional-provider linkage in paired artifacts

**Finding: available providers are lost in Vite builds of paired artifacts.** September 20, 14:05
and 15:40. The original manual-catalog probe was insufficient to establish this defect. A subsequent
production-build comparison now establishes it without manually supplying catalogs or activation
imports. An unavailable enhancement intentionally resolves to `exactEnhancementPassThrough`;
that fallback must remain unchanged.

The fixture declares `@exactjs/theme/enhancements` in `exact.config.ts`, and exports a component
rendering a system theme scope containing `<p theme:text="body">theme content</p>`. The theme
package is installed. Fresh `compileProjectArtifacts` output and the authored source are each built
with the actual Vite `exact` plugin, using matching client/server targets and `serverComponents: true`.
The entries export the application and the ordinary SSR/hydration entry points. There are no
application-supplied catalogs. The resulting bundles run in separate jsdom processes.

| Build inputs                                                  | SSR result                                           | Hydration result         |
| ------------------------------------------------------------- | ---------------------------------------------------- | ------------------------ |
| Authored TSX on both targets                                  | Theme scope and `exact-theme-text` present           | Scope and class retained |
| Explicit paired `.exact.server.ts` / `.exact.client.ts` files | Missing capability diagnostics; plain paragraph      | Remains plain            |
| Target-selected `.exact` facade imports                       | Same missing capability diagnostics; plain paragraph | Remains plain            |
| Authored server, paired client                                | Theme scope and class present                        | Scope and class removed  |

Both client artifact import forms lack the optional-provider facade and DOM integration that appear
in the authored client build. The provider is available, but the pre-generated graph does not request
it. This differs from a requested provider being unavailable and intentionally resolving to no-op.

A mixed-build control also confirms that another authored module can mask this omission. Keeping
an exported helper from the authored enhanced module in the same bundle restores the paired
application's theme scope and text class in both SSR and hydration, without manual catalogs. The
client graph gains the optional-provider facades and DOM integration. The shared bundle catalog
therefore makes behavior depend on another included module contributing the missing registrations.
This control used local pre-generated artifacts, not a separately packed third-party package; it
supports that masking mechanism without proving every external component packaging path is affected.

**Owner and mechanism:** [paired artifact publication](../../packages/compiler/src/compilation/artifact-entry-output.ts)
writes transformed code without the registration/facade materialization used by
[single-file compilation](../../packages/compiler/src/compilation/file-compilation.ts). The Vite
[source transform](../../framework-adapters/vite-plugin/src/transform.ts) adds registrations from
`rendererEnhancements`; importing the already-generated module does not recover that authored
metadata. The Vite adapter otherwise resolves available/absent optional providers and activates the
DOM integration through its existing facade machinery.

**Repair design:** make each compiled module carry its own target-local enhancement dependency
linkage. Keep dependency declaration separate from provider selection:

1. The compiler retains each used enhancement's identity, module request, and export in emitted
   linkage. Paired publication must not discard `rendererEnhancements`. Generate registrations and
   optional facade requests using the existing helper, including target entry facades when shared
   component code is deduplicated.
2. The consuming build resolves each request using the importing package/module's scope and target
   conditions. Preserve provenance for relative requests and relocated output. The application
   controls server authorization; missing optional providers become pass-through, while unauthorized
   providers follow the existing error/guard or explicit exclusion policy. Do not silently equate
   authorization failure with absence.
3. The selected client facade activates DOM enhancement integration before enhanced content mounts
   or hydrates. The normal renderer setup consumes the bundle catalog. Registration must be reachable
   through the component's own dependency graph, without another application component or manual
   catalog supplying it.
4. Keep portable, adapter-consumed artifacts distinct from directly executable output. The existing
   optional virtual-module request is suitable for the tested Vite path; direct Node consumption
   needs ordinary physical facades. Do not publish virtual requests as if Node could resolve them,
   or freeze a portable library's optional-provider availability from its author's machine. Specify
   and test output-mode behavior before changing the compiler API. Existing package compilation uses
   `compileProject` and copies physical facades; it is not the same broken publication path.
5. Prepare linkage, target facades, and source maps inside the artifact publication transaction.
   Preserve pruning of unused modules and activation of lazy modules, deduplicate equivalent
   registrations, and retain conflicts for incompatible implementations. Review artifact ABI and
   release implications before committing a production change.

**Local design validation:** a temporary prototype prepended existing
`prependExactEnhancementRegistrations` output to freshly generated client/server artifact code, using
those transforms' own `rendererEnhancements`. Actual Vite builds then preserved the theme scope and
`exact-theme-text` during SSR and hydration with no other authored enhancement module and no manual
catalog. This validates the proposed missing-linkage repair for the reduced Vite path. It is not a
production patch: direct execution, relocated packages, authorization variations, publication rollback,
source maps, and tree shaking still need coverage. The prototype remains under `.tmp`.

**Acceptance:** run the authored/paired/facade comparison through dev and production builds, with
available and intentionally absent providers. Available theme scopes and classes survive hydration;
absent providers preserve the authored target according to the fallback contract. Cover cleanup,
reactive updates, unused-integration removal, and relevant source-map/publication behavior.

**Validation limits:** production bundles and jsdom were exercised with existing built workspace
packages at checkout `982bea8c`; this is not clean-checkout, real-browser, or 0.5.1 certification.
Five existing tests across the Vite enhancement catalog and physical compiler facade suites pass,
including available/absent facade selection. No implementation fix was applied.

### RF13: Close the current dropped-helper-export candidate

**Finding: the reduced export matrix passed.** September 20, 15:10. With real package enhancement
activation, current client artifacts retain helpers using an inline object parameter named `props`,
an inline object parameter named `model`, a named model type with parameter `props`, and no
enhancement. An isolated module exporting only
`renderShareBox(props: { text: string })` with `theme:text="body"` also retains its export.

**Recommendation:** do not impose parameter-name or named-type rules to avoid a defect that the
current reduction does not reproduce. Retain a compact compiler/export regression for the exact
one-parameter enhanced shape. If Ripley's original module still fails, compare its component signals,
return form, enhancement kind, and target partitioning before changing discovery globally.

**Acceptance if reopened:** a supported helper retains required exports and bundles on both targets;
an unsupported declaration receives an authored diagnostic rather than silently disappearing.
This investigation did not reconstruct all nine historical design-system atoms.

### RF14: Repair motion export authorization and validate SSR projection

**Finding: Vite server build failure and lower-level SSR failure reproduced; obsolete-DOM retention
not reproduced.** September 20, 16:20 and 16:35.

A follow-up authored-source production build with the actual Vite server plugin and no manual
catalog fails before rendering: `@exactjs/motion build facts do not map dist/server/index.js#default`.
This persists after successfully rebuilding `@exactjs/motion`. The source exports `MotionElement`
as default, but the package manifest lists only named compiled component exports, and the generated
component-build export records omit the default mapping. Repair the package export/build-fact
contract first; do not bypass server component authorization.

Using current compiled application artifacts and target-specific MotionElement catalogs:

- A mounted page starts with seven enhanced rows and one conditional panel. Removing them creates
  eight finite playbacks and temporarily retains seven rows/one panel. Finishing the controlled
  driver removes all eight. Adding two rows and the panel yields exactly two rows/one panel.
- The interactive page's server artifact replaces the entire view with an empty client boundary.
- A static page with `motion:change` on a grade/list and `motion:apply` on a panel throws during SSR:
  `Client boundary MotionElement ... props must be JSON-serializable; non-serializable value at $.children`.

The lower-level serializer rejects the unsafe child receipt instead of reproducing the older `{}`
serialization. That probe supplied a server enhancement explicitly and bypassed the adapter
authorization failure found above. It establishes a runtime failure under that setup, but does not
yet prove the final provider selection/projection after the supported build path is repaired.

**Recommendation:** repair and test the default enhancement export mapping, then rerun SSR through
the supported adapter. If the lower-level failure persists, repair compiler placement and the
enhancement's server projection so semantic children render on the server while browser animation
behavior remains client-owned. Do not serialize
compiler-owned child receipts as ordinary boundary props. Do not rewrite release ownership based on
the old leak report: the controlled current removal case passes.

**Acceptance:** the ordinary default enhancement import passes server authorization after a fresh
package build. JS-disabled output contains grade, list, and panel content; hydration preserves those
nodes; finite leave settlement removes obsolete content. Keep reduced-motion, failed playback,
reversal, and disposal coverage. The new probe covered normal finite settlement, not that whole matrix.

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

### RF20: Publish the working request-context recipe

**Finding: concurrent generated continuations successfully read isolated request facts.**
September 22, 19:03. A request-scoped token exposes a deliberately shared `read(): string` result.
Two mounted clients invoke the same generated component concurrently; server-supplied platform
request values `one` and `two` yield `one:` and `two:` in their respective UIs. The generated
continuation records its server context and the runtime observes each token access.

Configure the context **when creating** the runtime:

```ts
const runtime = createExactServerRuntime({
	contract,
	requestContexts: ({ platformRequest }) => [
		[Caller, { value: makeCallerService(platformRequest) }]
	]
});
```

The authored server function reads `this.getContext(Caller)`. The Node adapter already supplies its
platform request. Spreading `requestContexts` onto the returned runtime does not reconfigure its
already-created context runtime; a nested `context` option is also not this API. Missing registration
fails explicitly with “has not been initialized,” rather than silently returning an empty identity.

**Recommendation:** publish this complete sequence in the server/Node orientation and the existing
[context policy](../server-context-and-data-policy.md), including token creation, shared-result
qualification, trusted platform request extraction, and authored continuation use. No new ambient
storage API is needed.

**Acceptance:** retain concurrent isolation, missing-context failure, and factory disposal coverage;
explain SSR and invocation lifetimes and proxy trust. The caller fact must originate on the server,
not from a client argument. Transport only an intentionally public projection of the service result.

### RF21: Document navigation after continuation completion

**Evidence:** September 20, 20:30. The conclusion that eXact has no router is incorrect for the
repository: `component-libraries/router` and [routing documentation](../react-router-compatibility.md)
exist. Ripley's installed dependency list is not the framework's complete package inventory.

**Work:** show both an intentional full-document navigation and optional router navigation after
a typed continuation result. Explain why `RequestContext.redirect` changes its HTTP response and
does not automatically navigate an already loaded page. Put browser navigation in compiler-checked
client work rather than relying on a guard in another module to keep `location` out of SSR.

**Acceptance:** SSR never touches browser globals; successful completion navigates once; canceled
or stale work cannot navigate; invalid/untrusted destinations are handled at the application boundary.
Do not create a second router or new continuation redirect protocol without evidence that existing
APIs cannot support the intended interaction.

### RF22: Document the supported Claude skill-discovery bridge

**Finding: installation mismatch confirmed against the host's documentation.** September 19,
16:00. The generator and agent-skill README use `.agents/skills/exact-web-development`.
[Claude Code's skill documentation](https://code.claude.com/docs/en/skills#choose-where-skills-load)
identifies `.claude/skills/<name>/SKILL.md` as the project location and explicitly supports
symlinked skill directories. Checked September 23, 2026; this establishes the current documented
behavior, not which Claude version Ripley's author had installed on September 19.

Ripley currently has `.claude/skills/exact-web-development` symlinked to
`../../apps/web/.agents/skills/exact-web-development`. This is a concrete bridge to one canonical
payload, rather than a reason to duplicate the skill. A live Claude session was not exercised.

**Recommendation:** document that bridge for Claude and offer an explicit host/install-target choice
where appropriate. Preserve the canonical payload, and document a copy/update alternative where
symlinks are unavailable. Keep package usage guidance distinct from repository maintenance rules.

**Acceptance:** the documented scaffold setup exposes the skill to each advertised host, including
workspace-root versus nested-app placement, and updates do not leave conflicting copies.

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
