# Framework adversarial and maintainability audit, 2026-09-12

Audited revision: `c1e52fd97d267d285c9dacf1ebd8aa967f95fd2f`.

The framework has a coherent compiler-led architecture, but it is not ready to be described as free of correctness defects or code smells. This review confirmed seven runtime or lifecycle defects, substantial gaps in contract comments, duplicated policy implementations, and failing validation gates. The findings below describe the audited revision before remediation. Subsequent decisions and implementation progress are recorded separately here.

## Remediation progress, 2026-09-13

The agreed remediation is implemented in the working tree. These decisions supersede the initial
recommendations where discussion selected a different design, especially raw gateway forwarding
and component-policy build warnings. Historical findings below describe the original revision.

| Item | Implemented decision                                                                                                                                                                                                                                                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1   | Compiler errors for forbidden HTML setters, inline event strings, malformed names, and statically known invalid platform props. Recognized casing is corrected for native intrinsics and proven static spreads. DOM/SSR share inexpensive HTML and event guards; explicit unsafe HTML still requires a receipt and root opt-in.                                                       |
| F2   | Array index and structural inverses have independent ownership. Rollback preserves later authoritative slots and explicit lengths, sparse arrays, overlapping journals, and complete authoritative snapshots. Ordinary writes do not take array snapshots.                                                                                                                            |
| F3   | Readonly array methods reject before raw-target mutation or comparator execution.                                                                                                                                                                                                                                                                                                     |
| F4   | Gateway requests and responses retain their transport payloads. Request authentication and CSRF policy run before reading bodies; each service owns decoded operation authorization. Credentials and application-enriched headers can pass through. Debug requests carry the same correlation ID without child sessions or key exchange. Adapters preserve separate response cookies. |
| F5   | Lazy activation checks cancellation, generation, and original-container ownership before registration and mounting. New owners can reuse loaded artifacts; movement within the original container remains supported.                                                                                                                                                                  |
| F6   | Admission rechecks capacity and runtime generation after authorization. Renewal rechecks identity, expiry, and revocation; shutdown fences pending opens and requests.                                                                                                                                                                                                                |
| F7   | Build denials warn and generate an execution guard that cannot import the denied implementation. Development and execution remain strict. Cold and warm continuations cannot publish into disposed, rejected, or committed generations.                                                                                                                                               |
| M1   | Stateful and security-sensitive contracts explain ordering, ownership, cancellation, rollback conflicts, and cleanup. The concrete hook-state, DOM-adoption, and test-settlement examples were rewritten. This was focused review, not mechanical replacement of every matched comment.                                                                                               |
| M2   | Shared owners handle inspection redaction merging, state-write matching, server-slot discrimination, authored DOM event normalization, and runtime HTML safety.                                                                                                                                                                                                                       |
| M3   | Retained the numeric SSR checkpoint and documented its quotient/remainder encoding and allocation rationale.                                                                                                                                                                                                                                                                          |
| V1   | Applied compatible dependency upgrades and classified tool/benchmark reachability. Security policy passes with four reviewed low-severity Svelte comparison exceptions.                                                                                                                                                                                                               |

Engineering references, public docs pages, affected package guidance, and initial 0.5.0 release
coordination are synchronized. Frozen release fixtures and the ABI epoch are unchanged. No changes
have been committed during this remediation.

### Validation and performance evidence

- Complete native Go compiler and command tests pass. The corpus compiles 360 files across
  27 projects, with no new generic-renderer fallbacks in its structural report.
- Integrated runtime, compiler, policy, and adapter tests passed 1,973 cases across 306 files,
  including the packaging test rerun with npm's CLI environment required on Windows.
  Fifteen tests are skipped by this configuration. Real Vite, Webpack, and Bun
  builds separately verify that denied implementation effects cannot execute.
- All 112 build-script tests and all 90 comparison-harness tests pass. Docs and server-component app
  tests passed; the microfrontend sample passes with raw forwarding.
- Workspace and test types, changed-source lint, architecture, JSDoc, explicit-any, core API
  ownership, package guides, README checks, package contents, platform boundaries, frozen compiled
  artifacts, and release ABI policy pass.
- Paired reactive controls alternate original-revision and working-tree bundles after warmup.
  Ordinary index-write and push/pop ratios range from 0.95 to 0.99 at 1,000 and 10,000 slots.
  This supports absence of an ordinary-write snapshot regression, not an application RPS claim.
- Compiler controls exposed and reduced a project-rebuild regression in casing normalization.
  Standard DOM casing now shares the syntax pass before binding, using cached bundled declaration
  metadata instead of another maintained property registry. Checked normalization handles remaining
  project-specific cases. A regression test protects synchronized source reuse across targets.
  The final corpus measured 3.20 seconds (11.61 worker seconds), close to the original revision's
  3.16 seconds (11.45 worker seconds), with the same 27 program rebuilds. This is a local control,
  not a statistically established throughput change.
  Both original and revised compilers exceed the corpus's per-project timing guard against its
  tracked baseline. Timing results remain non-publishable; structural results remain usable.

Evidence is retained locally under `.tmp/adversarial-audit-2026-09-12/`, including original-revision
controls, regression results, native corpus reports, and dependency audit results. Temporary evidence
and generated outputs are not proposed source changes.

### Remaining limits

The prop-derived initialization follow-up is implemented, with the original failing fixture
restored. Synchronous setup runs before captured state restoration, and its subscriptions arm
afterwards. Parent-owned reactive prop sources are also observed correctly. See the
[follow-up record](remaining-audit-investigation-2026-09-13.md) for the cause and validation.
The previous completion summary incorrectly omitted the failure and relied on a narrowed fixture.

The [subsequent investigation and implementation](remaining-audit-investigation-2026-09-13.md)
resolved the shipping hydration failure, removed the four cookie-related dependency advisories,
and restored the compiler's incremental JSX reuse. The original shipping assertion remains and
passes, the audit reports zero vulnerabilities with no exceptions, and the full compiler corpus
passes its unchanged timing guard. The linked report records the implementation and its validation.

This does not establish that the framework has no undiscovered defects. The original findings and
execution limits below remain as historical evidence of the audit's scope.

## Confirmed runtime findings

### F1. High: ordinary native props bypass the explicit unsafe-HTML boundary

**Trigger:** an application forwards a property bag containing an attacker-controlled HTML property or event attribute. This is conditional on application data flow, not an assertion that every application is exploitable.

The DOM setter accepts `innerHTML` through its generic property-assignment branch without an `unsafeHtml` receipt or `allowUnsafeHtml`. SSR recognizes event props using an uppercase-third-character convention, so lowercase `onclick` is emitted as an active HTML attribute. The `srcdoc` restriction also misses uppercase `SRCDOC`, which the browser treats case-insensitively.

**Evidence:** a native TSX component with a spread prop compiled successfully. Its SSR output included an executable `onclick`. In Chromium, its compiled client output accepted an `innerHTML` value containing an image event handler and executed the handler. An uppercase iframe `SRCDOC` also executed script without unsafe-HTML opt-in. These probes used local marker variables, not external destinations.

**Owners:** [DOM prop assignment](../packages/dom/src/props.ts), [SSR attribute classification](../packages/ssr/src/attribute-traversal.ts), [SSR markup](../packages/ssr/src/markup.ts), and [native SSR attribute lowering](../native/typescript-go/overlay/internal/exactcompiler/jsx_render_program_ssr_attributes.go). The server-patch property validator already rejects a broader, case-normalized set of unsafe properties; that separate path was not shown vulnerable.

**Recommended scope:** define a common native property safety contract, enforce it before both property assignment and attribute emission, and preserve the explicit unsafe-HTML capability. Test compiler-emitted spreads, direct DOM updates, SSR, casing variants, and actual browser execution. CSP can affect exploitability but does not repair the framework contract.

### F2. High: optimistic array rollback overwrites newer authoritative changes

**Trigger:** capture an optimistic index or length mutation, apply a later authoritative mutation to another array position, then roll back the optimistic journal.

Two deterministic examples:

```text
['base'] -> optimistic index 0 replacement -> authoritative push
rollback: ['base']
required: ['base', 'authoritative']

['a', 'b', 'c'] -> optimistic length = 1 -> authoritative index 0 replacement
rollback: ['a', 'b', 'c']
required: ['authoritative', 'b', 'c']
```

[Property undo](../packages/reactive/src/array-mutation.ts) restores the old array length even when undoing an existing index. Length undo restores a whole-array descriptor snapshot. The journal's per-key version fencing does not protect collateral positions modified by those undo functions.

**Recommended scope:** make index and length undo respect later writes to every affected position and array structure. Preserve the existing sequence-aware behavior for array methods. Add overlapping optimistic/authoritative transaction cases at the reactive journal boundary.

### F3. Medium: array methods mutate readonly component props

**Trigger:** a child invokes `props.items.push(...)` on parent-owned props.

Assignment to `props.items[0]` correctly throws. `props.items.push('child')` succeeds and changes the parent's raw array. The array-method branch in [the proxy getter](../packages/reactive/src/proxy/create-base.ts) calls the raw-target mutation implementation before checking readonly ownership. Map and Set mutation paths have a writable check, making the behavior inconsistent.

**Recommended scope:** enforce readonly ownership for all mutating array methods, including their optimized implementations. Verify through real component props as well as the reactive API. Do not compensate by copying props in application components.

### F4. Medium: gateway forwarding silently loses protocol collections

**Trigger:** an invocation containing a supported Map or Set passes through a binding gateway.

The request decoder reconstructs collections before dispatch. [Gateway forwarding](../packages/server/src/gateway.ts) then uses `JSON.stringify(input)` without re-encoding the reactive protocol. The remote receives empty objects in place of those collections.

**Evidence:** a public `handleExactRequest` invocation with a Map and Set returned status 200 through a mock remote; the remote's actual request decoder received `{ lookup: {}, selected: {} }`. Both collection identities and contents were lost.

**Recommended scope:** re-encode the decoded envelope at the forwarding boundary. Check local and gateway dispatch for equivalent payload semantics, including batches. Retain current request size and authorization checks.

### F5. Medium: pending lazy hydration can mount outside its original container

**Trigger:** start loading a lazy island beneath one container, move its boundary into another container, then resolve the loader without changing its generation attribute.

The continuation in [islands.ts](../packages/hydrate/src/islands.ts) checks cancellation, generation, and whether the boundary has any parent. It does not verify that the original container still owns the boundary before mounting. The outer `container.contains(boundary)` check runs after mounting.

**Evidence:** a Chromium probe moved a boundary from `main` into `aside` while its loader was pending. The original hydration call subsequently mounted the component under `aside` and marked it hydrated.

**Recommended scope:** carry container and lifecycle ownership through the asynchronous continuation and validate it before registration or mounting. Protect movement, removal, cancellation, and replacement. This is an ownership defect, not evidence of a browser-origin escape.

### F6. Medium: DevTools session admission and revocation have asynchronous races

[Session management](../packages/server/src/debug/sessions.ts) checks capacity before awaiting authorization and inserts afterward without reserving capacity or checking it again. Its `require` operation likewise returns an authorized session after awaiting application policy without rechecking whether the session still exists or has expired.

**Evidence:** the public debug runtime admitted 20 concurrent opens with `maxSessions: 1`. A focused manager probe closed a session while authorization was pending; the pending `require` still returned that session after authorization resolved.

**Impact:** configured resource limits and revocation are unreliable under overlap. Authorization is still required; this does not establish access by an otherwise unauthorized attacker.

**Recommended scope:** reserve or recheck admission at publication, and revalidate session identity, existence, expiry, and runtime lifetime after asynchronous callbacks. Exercise close and shutdown while policy callbacks are pending.

### F7. Medium: component authorization can publish into a closed generation

[Component authorization](../packages/component-library-policy/src/session.ts) checks that its generation is open before awaiting participation validation. It does not repeat that check before recording authorization and importer facts.

**Evidence:** after warming the participation cache with a valid package, start another authorization and immediately dispose, reject, or commit the generation. In all three cases the pending operation resolves `outcome: 'authorized'`. Telemetry then shows one authorized package and one importer retained inside the disposed, rejected, or committed generation.

**Impact:** closed generation state can be repopulated and stale success can reach the caller. The probe did not establish that an integration executes a disallowed package; the confirmed issue is the policy session's lifecycle contract.

**Recommended scope:** fence asynchronous results against the generation state before any mutation or success publication. Decide explicitly whether commit waits for pending work or rejects it. Include warm-cache and cold-cache cases; the cold-cache probe failed closed because the cleared provenance map prevented validation, while the warm-cache case succeeded incorrectly.

## Maintainability findings

### M1. Medium: contract comments often satisfy the gate without explaining the contract

A tracked-source scan found 583 comments matching generic contract templates across 141 files. Of these, 336 use the form “Performs the ... domain operation.” This is a search result count, not a claim that every matched comment needs rewriting.

Concrete weak examples appear in [array undo](../packages/reactive/src/array-mutation.ts), [React hook state](../packages/react-compat/src/runtime/hook-state.ts), [DOM adoption boundaries](../packages/dom/src/renderer/adoption/boundaries.ts), and [test settlement helpers](../packages/testing/src/control/settling.ts). They omit important facts such as rollback conflict behavior, callback timing, ownership, cancellation, and which failures are accumulated.

[The JSDoc gate](../scripts/check-jsdoc.mjs) accepts a comment with at least eight trimmed characters. It passed during this audit. The repository's maintainability standard asks for actual contracts, so that pass does not establish compliance with the substantive rule.

**Recommended scope:** replace boilerplate first at stateful and security-sensitive boundaries. Explain the invariants exposed by F2, F3, F6, and F7. Keep trivial declarations concise. Do not replace one template with a longer template or require exhaustive prose for obvious forwarding code.

### M2. Medium: shared boundary policy has multiple implementations

The HTML safety drift in F1 is a concrete consequence. Additional identical implementations were found in:

- inspection redaction merging across [Bun](../framework-adapters/bun-plugin/src/devtools.ts), [Vite](../framework-adapters/vite-plugin/src/debug-output.ts), and [Webpack](../framework-adapters/webpack-plugin/src/sessions.ts);
- state-write shape matching in [hydration](../packages/hydrate/src/state.ts) and [server validation](../packages/server/src/validation.ts);
- server-slot discriminator validation in [hydration](../packages/hydrate/src/islands/partition-slots.ts) and [SSR](../packages/ssr/src/render/server-slots.ts);
- authored event normalization in [DOM props](../packages/dom/src/props.ts) and [target contributions](../packages/dom/src/renderer/target-contributions.ts).

The exact duplicates above are maintenance risks, not additional proven failures. They implement common protocol or ownership rules and should have a clearly identified common owner, or documented reasons for remaining separate with shared conformance cases.

**Recommended scope:** consolidate narrow, dependency-safe policy functions where that improves consistency. Preserve separate host I/O and compiler implementation concerns. Independent comparison participants and versioned React reference fixtures intentionally repeat behavior; those are not cleanup targets merely because their text matches.

### M3. Low: compact checkpoint encoding leaves an important invariant implicit

[DocumentShellScope](../packages/ssr/src/render/document-shell.ts) packs a resumption checkpoint and shell visit count into `checkpoint * 2 + visits`, then decodes with remainder and division. The comment describes shell rollback but does not explain the encoding, its valid visit range, or why a numeric token is required.

This is not a reproduced rendering failure. It is an example of compact code whose rationale should be adjacent to the code. If retained for performance or ABI reasons, explain those reasons and the numeric invariants. Do not expand it into allocations solely for stylistic uniformity.

## Validation and documentation inconsistencies

### V1. Dependency security policy fails

`check:security-audit` failed its existing policy for new advisory entries involving `@vitest/coverage-v8`, `@vitest/mocker`, `js-yaml`, `morgan`, `svelte-adapter-bun`, `svgo`, and `vitest`. The saved npm response includes high-severity entries for `js-yaml` and `svgo`.

This is a repository dependency and release-policy finding. It is not evidence that every advisory is reachable through a published eXact runtime. Development tools, benchmark participants, and runtime dependencies require separate reachability classification before remediation. No automated dependency fix was applied.

### V2. Shipping SSR integration expectations disagree with current output

[The shipping SSR test](../apps/shipping-calculator/src/vite-ssr.test.ts) fails because rendered HTML lacks `data-exact-client-name="CalculatorWorkspace"`. The failure reproduced after regenerating artifacts. A separate render probe also observed no verbose island name, no `data-xh` marker, and no `data-exact-client-resumption="true"` marker in `rendered.html`.

This is not classified as merely a compact-marker snapshot change: the probe did not find a compact marker either. Whether the intended application should retain that island boundary or the assertion reflects an obsolete architecture needs an explicit contract decision. Do not delete the assertion until the generated registration, SSR output, and browser hydration behavior have been reconciled.

Three shipping client tests initially failed on `localStorage.clear()` under the Node 26 test environment. All three passed with `NODE_OPTIONS=--no-experimental-webstorage`; the SSR assertion still failed. These are distinct issues.

### V3. Publication preflight rejects the SSR README

`check:publish` reached the README gate and failed because [the SSR README](../packages/ssr/README.md) has 85 lines against the configured maximum of 80. Earlier publication checks in that command passed. This is a small, concrete mismatch between repository policy and the current documentation. Move detailed explanation to the engineering reference or deliberately reconsider the limit; do not remove useful public contract information arbitrarily.

## Performance exceptions reviewed

Several unconventional paths have useful explanations and should remain unless evidence supports changing them:

- [Shared proxy traps](../packages/reactive/src/proxy/create-base.ts) retain per-proxy ownership records to preserve alias-specific dependency paths while sharing code.
- [Async SSR permits](../packages/ssr/src/render/async-scheduler.ts) start ready I/O without an extra promise or microtask and explain unconditional permit reacquisition during nested suspension.
- [Node admission](../framework-adapters/node-adapter/src/requests/adaptive-gate.ts) documents surrounding control windows, successful-response accounting, sparse traffic, and idle cleanup.
- [Bun admission](../framework-adapters/bun-adapter/src/adaptive-gate.ts) explicitly documents that native departures include disconnects. Its capacity signal is intentionally different from Node's completion signal.
- [DOM teardown](../packages/dom/src/renderer/teardown.ts) uses an iterative stack and explains descendant ordering and continued cleanup after failures.
- [Remote module loading](../plugins/microfrontends/src/client.ts) explains why deployment generations require bounded retained load state.

The optimized array path still needs F2 and F3 addressed. A performance justification does not waive ownership or rollback correctness. Benchmark evidence should accompany any later restructuring of these paths.

## Coverage and validation record

The scope included all eXact-owned repository areas, beyond the adaptive scheduler work. A tracked-source inventory scanned 2,799 TypeScript, JavaScript, Go, and CSS files across packages, adapters, plugins, component libraries, apps, scripts, comparison code, and the native compiler overlay. Manifest and documentation checks also covered package guides, distribution metadata, and native package surfaces. Generated and reference files were distinguished from maintainable implementation when assessing smells.

Coverage is repository-wide and risk-based. Automated scans cover the inventory; manual semantic review concentrated on ownership, transport, compiler policy, asynchronous publication, cleanup, and public boundaries. This is not a claim that every line was manually inspected or that passing checks prove the absence of defects.

| Area                                                                    | Review and evidence                                                                                                                                                                                                      |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Native compiler, compiler API, JSX                                      | Go overlay tests; 360-source, 27-project compiler corpus; package compiler tests; secret qualification and sink policy; artifact isolation; compiled adversarial prop fixture; ABI checks                                |
| Core, reactive, request, instrumentation                                | Package tests; durable instance and readonly props ownership; optimistic journals; request-local storage; task continuation and cancellation review; reactive probes                                                     |
| DOM and hydration                                                       | Package tests; teardown and identity paths; patch confinement; bounded protocol decoding; lazy activation; real Chromium prop and moved-island probes                                                                    |
| SSR and server                                                          | Package tests; string/stream output, readiness, scheduling, escaping, request dispatch, allowlists, decoding, gateway forwarding, request limits, debug sessions                                                         |
| Framework adapters                                                      | All package-suite adapter paths; Node/Bun scheduling review; Fetch and Node ownership boundaries; Bun-native integration tests; Vite/Bun/Webpack authorization and redaction policy comparison                           |
| React compatibility and all five React adapters                         | Package tests; hook and island ownership review; package corpus, React 18/19 conformance checks, custom reconciler checks. Corpus catalog size is not an assertion that every catalog entry has full behavioral coverage |
| Accessibility, theme, time, internationalization                        | Package tests; focus restoration, document ownership, scheduler deadlines and cleanup, artifact generation identity, formatting caches, validation, compiler/language integration                                        |
| Forms, charts, gestures, motion, physics, gravity, router               | Package tests; validation and field ownership; target/listener cleanup; playback lifetime; physics resource ownership; router generation fencing and cancellation; schema and finite numeric input review                |
| Plugins, component-library policy, provenance, module rewriting, config | Package tests; trusted discovery; secret placement; remote integrity and cache lifetime; generation lifecycle probe; static participation metadata and output policy review                                              |
| DevTools, language server/providers, TypeScript/VS Code integrations    | Package tests and distribution checks; debug authorization/redaction; bounded messages; provider startup, shutdown and cancellation; workspace trust propagation; browser extension manifest and bridge ownership review |
| Testing integrations and application generator                          | Package tests; Bun integration; authorization cache and fixture ownership; settling and cleanup helpers; empty-target and package-manager validation                                                                     |
| Apps, comparison and repository tooling                                 | Architecture/documentation scan; available app tests; 90 comparison tests; 112 build-script tests; release paths, process ownership, dependency security, manifests, guides, package contents and README checks          |

### Results

- Package suite: 358 files passed, two skipped, and one invocation-related failure. That compiler package-artifact test passed when rerun with npm's CLI path set. The initial run had 2,138 passing tests and 14 skipped tests; the isolated rerun added the formerly failing test.
- Native Go compiler and CLI tests: passed on the staged overlay used by the current build.
- Compiler corpus: 360 source files across 27 projects compiled. Timing variability exceeded the report's threshold, so its timing evidence is non-publishable. This run was not used to claim a performance regression or improvement.
- Build-script tests: 112 passed. Native DOM and SSR reachability checks passed.
- Comparison tests: 90 passed.
- React compatibility checks: package corpus, conformance, and reconciler commands completed successfully. Their individual capability inventories retain unsupported or unmeasured cases.
- Bun-native tests: 3 plugin, 11 adapter, and 1 test-integration cases passed. The PowerShell wrapper returned a nonzero result while rendering native stderr, so raw logs are retained rather than treating the wrapper status as an additional runtime defect.
- Apps: docs 10 tests passed; server components 4 passed; shipping 31 passed and 1 SSR assertion failed under the storage-adjusted environment; Sudoku 23 passed; puzzle generator 15 passed; microfrontend portal 6 passed; internationalization catalog check passed.
- Source architecture, JSDoc presence, explicit-any ratchet, core API ownership, platform boundaries, frozen compiled ABI fixtures, and release ABI policy: passed.
- Dependency security policy and final README publication gate: failed as described above.

One attempted overlap between app tests and shipping's artifact regeneration caused missing-output errors. Those attempts were excluded from framework findings and the affected app tests were rerun after regeneration completed. No audit-owned Node, exactc, Bun, Go, or browser process remained at final process inspection.

### Limits

The review covers eXact-owned code and its integration boundaries. It does not independently audit the full upstream TypeScript, browser engines, third-party dependencies, or hosted production deployments. Runtime execution here used Windows, Node 26.8.1, Bun 1.4.2, and Chromium. Deno, Cloudflare, other operating systems, and other browser engines received source/contract coverage rather than native deployment execution. The full application browser journey suite and a new performance benchmark sweep were not run as part of this audit.

## Reproduction evidence

Temporary probes, raw outputs, dependency response, and source inventory are retained locally in [the audit evidence directory](../.tmp/adversarial-audit-2026-09-12/). They are ignored workspace artifacts, not published package files or committed regression tests.

Run the confirmed runtime probes from the repository root against built packages:

```text
node .tmp/adversarial-audit-2026-09-12/record-probes.mjs
```

The source inventory is reproducible with `inventory.mjs` in that directory. `authorization-race-probe.mjs` reuses inert fixture-building functions from the existing policy tests and retains its local fixture for inspection. Browser probes close their browser in `finally`; the Vite rendering probe closes its owning server.

## Suggested review order

1. Agree on F1's native prop safety contract and F2's rollback conflict semantics.
2. Address F3 through F7 at their owning framework boundaries, with focused lifecycle and transport cases.
3. Resolve the shipping boundary expectation and classify dependency reachability before changing tests or dependencies.
4. Improve comments around those changes and consolidate duplicated policy where ownership is clear.
5. Preserve documented performance paths and use focused benchmark comparisons if their implementation changes.
