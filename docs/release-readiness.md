# Release readiness

## Published baseline and next patch release

All 73 npm packages were published at 0.5.0 from commit
`6476a2f5de46b716d26c2d7d7e6d8a22b501f7f9` on September 14, 2026. ABI epoch 1 and its
released fixtures are now frozen. References below to prepublication redesigns describe the
history of that released baseline, not permission to change it incompatibly.

The 0.5.1 patch adds explicit descriptions, relevant search keywords, and package-specific documentation
homepages to all npm distributions, including native compiler targets. Existing compatible
dependency ranges remain in place; exact compiler-to-native dependencies advance together.
The patch also repairs standalone scaffolding: Windows npm invocation, compiler package file
selection, test matcher declarations, CSS typing, and bundler/test-runner configuration. Webpack
and Bun emit complete browser HTML with linked assets; Bun development serves and rebuilds the app
with compiler cleanup. Server templates declare their direct server dependency. New applications
require compiler and testing versions at least 0.5.1. There is no compiler/runtime ABI change.
See [application scaffolding](application-scaffolding.md) for the validation contract.

`npm run check:npm-metadata` validates these fields, repository directory links, author, license,
and the issue tracker before publication. Every public package needs meaningful package-specific
keywords alongside `exactjs`; describe capabilities rather than competing brands or search spam.
Each README links to the relevant public documentation page and its GitHub source directory.
Repository-relative reference links use absolute GitHub URLs so they work on npm as well. Use optional npm fields only when supported by
actual project policy: funding requires an approved funding destination, and engine/platform
constraints require a tested compatibility contract. Native staging already supplies `os` and `cpu`.
Trusted staging retains npm provenance and human approval; metadata does not grant publish access.

Published manifests cannot be replaced in place. Submit 0.5.1 through the stage-only workflow
and approve it in npm after review. See [npm package metadata](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/).

Status: 0.5.0 is published. The 0.5.1 patch repairs the standalone starter and metadata and the
[SSR testing inspection defect](application-scaffolding.md#ssr-testing-repair) found during validation.
Testing now requires SSR ^0.5.1 for observed parent topology. Explicit hydration activations survive
an empty compiler capture. Runtime helper signatures and the released hydration wire schema are unchanged.

The reactive runtime patch also preserves reactive references returned by derived selections.
Nested fields remain observable after in-place state reconciliation, and changing a selected
reference transfers subscriptions even when its fields are equal. This restores the existing
reactive-state contract for both authored `computed()` calls and compiler-emitted `createDerived()`
calls. Plain calculated results retain structural equality. Helper signatures, emitted artifacts,
and ABI epoch 1 are unchanged; released fixtures are preserved.

The initial 0.5.0 compiler/runtime contract includes server-only compiled empty external script
roots. The matching SSR runtime must retain keyed item boundaries for those script programs,
because the client still adopts them as ordinary intrinsics. Ship these compiler and runtime
changes together for the initial release; an older runtime's general compiled-row boundary elision
is not compatible with that new emission. This is a prepublication semantic contract update,
not a reason to regenerate released ABI fixtures or add an obsolete implementation.

The initial 0.5.0 audit remediation changes request hooks to `authorize(request, context)` and
`validateCsrf(request, context)`, with decoded local policy in `authorizeOperation`. Gateways accept
raw bytes/text, forward credentials and original bodies, and do not coordinate remote debug sessions.
Ship server, SSR, DevTools client, and adapter changes together. Response adapters preserve separate
cookies. These replace unreleased APIs without compatibility aliases or an ABI epoch change.

Native intrinsic prop compilation now rejects forbidden setters and event strings, normalizes known
casing, and diagnoses statically known invalid names. Ship the compiler with DOM/SSR guards. Helper
signatures and hydration schemas are unchanged. Component-policy build denials produce warnings and
execution guards; ship matching bundler and policy packages together. Released fixtures remain frozen.

The initial 0.5.0 compiler/core pairing also initializes neutral synchronous browser computations
before applying resumed state, then arms their dependencies after restoration. Complete browser
artifacts now use the existing synchronous computation helper as hydrate artifacts already did.
Ship compiler, core, and hydrate together: helper signatures and wire schemas are unchanged, but
construction ordering is a semantic artifact correction. Hydration artifacts additionally carry
the optional compact `resumption.continuations` allowlist; older contract validators reject that
field, so the compiler must not be released ahead of the matching core and hydrate packages. Retain frozen released fixtures; no ABI epoch or package
major change is required for this approved prepublication correction.

## Independent package releases

The initial SSR scheduling hook accepts `void | Promise<void>`. A ready adapter gate returns
void and starts rendering without a scheduling suspension. Node request handlers now own default
adaptive admission before rendering; Bun configuration is independent. This replaces the unreleased
promise-only declaration in the initial 0.5.0 contract. The hook now also governs resumption
after pending component data settles. Omission inherits the adapter policy through the request
signal. This intentionally replaces the unreleased entry-only hook semantics, without a new
ABI epoch or a second generated renderer. Ship the server signal-policy bridge, SSR runtime,
and adapter integration together. Compiler helper signatures and hydration representation
are unchanged.

The Bun adapter also enables native adaptive admission by default. `createExactBunHandler` accepts
optional scheduling controls, and `createBunRequestHandler` wraps a complete Fetch dispatcher.
Forward Bun's server argument and observe all HTTP routes through that dispatcher. These are host
API additions; compiler artifacts and hydration contracts are unchanged.

The Node adapter's former `createNodeHandler` alias now wraps a custom Node application/page
callback. Use `createExactNodeHandler` for an executor context. Both enable adaptive admission by
default on Node and accept an explicit immediate override. The low-level `createNodeRenderScheduler`
remains an always-yielding gate; the experimental lag-only adaptive option is replaced by request
completion-aware admission. These unreleased surfaces are reset in place, without compatibility aliases.

The compiler's optional closing-body offset on the SSR `static` operation is an additive
optimization hint. Existing writers ignore the extra argument and retain identical output;
the updated runtime also accepts programs without it. This does not advance the ABI epoch or
regenerate frozen artifacts. Ship the compiler and SSR optimization in the initial 0.5.0 release.

The initial 0.5.0 version-one positional projector contract exposes structural active-ancestor
operations (`has`, `add`, and `delete`), without requiring a native `Set`. This replaces the
unreleased native-`Set` contract in place. Ship compiler and runtime together; there is no
version-two registration or obsolete compatibility path. Schema tuples and hydration bytes are
unchanged. This prepublication contract reset does not advance the ABI epoch or regenerate
released fixtures.

The initial 0.5.0 progressive HTML contract permits a completed head chunk before body task
settlement. Consumers must concatenate stream chunks rather than assume the first chunk includes
the body. HTML framing recognizes the `head` discriminant in the shared document-event type;
raw document-event streams retain their existing shell/replacement behavior. Compiler artifact
schemas and the ABI epoch are unchanged by this runtime publication change.

The same initial progressive HTML contract now includes incremental body delivery. Its default
buffer threshold is 8192 bytes and complete spans can exceed that threshold. Hydration remains
before the closing body/html tags. Awaiting reader cancellation waits for rendering cleanup.
The internal HTML framing protocol recognizes `body` events and an already-streamed shell tail;
raw document-event consumers retain the existing complete shell/replacement representation.

The initial `documentShell` option keeps an enclosing ordinary document component server-only.
The requested application's props, resumption capture, markerless-root metadata, and client
hydration container must move together when adopting it. Directly requested authored documents
retain document hydration. This is an explicit API choice, not an automatic change to existing
authored roots. These unreleased runtime contracts remain version one at 0.5.0.

Server execution metadata now includes the optional compiler proof `documentRoot: true` for a
direct authored document view. Progressive HTML uses it to settle document-owned tasks before
evaluating that view, avoiding a discarded discovery render. The additional `streamingDocument`
proof permits a static head before settlement; the body invocation carries its owner and deferred
value reader in the prepared server program helper's optional fourth argument. Fragment
shell/replacement behavior is unchanged. Ship compiler emission, Core validation, and SSR consumption together in the initial
0.5.0 version-one contract; do not introduce a second contract version for this unreleased change.

Public npm workspaces version independently. A compatible component-library patch does not
require a framework release. Dependency ranges express supported versions and do not need to
equal the newest workspace version. Validation still requires them to accept the checked-out
dependency version.

Preview a package version change before writing manifests:

```sh
npm run version:packages -- --version=0.5.1 --packages=@exactjs/forms --dry-run
npm run version:packages -- --version=0.5.1 --packages=@exactjs/forms
npm install --package-lock-only --ignore-scripts
```

Omitting `--packages` selects all public packages, suitable for an initial common version.
If an existing range excludes the new version, a public dependent must also be explicitly
selected and receive a new version. Private consumers can have their ranges updated without
becoming publishable. Compatible ranges remain unchanged. Native compiler templates follow
the compiler host's version and remain private in the checkout.

After rebuilding versioned framework packages, restart development servers before checking apps.
Vite's application hot reload does not replace framework build-plugin modules already imported by
the Node process. A server started before the 0.5.0 migration can therefore reject current adapter
manifests using a cached 0.1.0 marker version. Validate a freshly started development server as well
as the production build, including page navigation and browser error overlays.

`release:affected` selects validation work through the reverse dependency graph. This is a
different set from the packages being published: testing a dependent does not mean releasing it.
CI currently retains its complete build and acceptance matrix even for a selected publication.

After building and running `check:publish`, package only the requested workspaces:

```sh
node scripts/package-release-npm.mjs --packages=@exactjs/forms --output .tmp/release/forms
```

Selecting the compiler additionally requires `--native-packages <directory>` containing the
staged platform archives. Output must be a child of `.tmp`; packing replaces that output directory.
The normal CI artifact job still stages the complete release, including editor extensions.

Preview submission of release archives for approval in npm:

```sh
npm run release:stage -- --directory=.tmp/release/forms --packages=@exactjs/forms
```

The preview reads npm registry state. Only `--execute` submits archives to npm staging; it does
not approve or publish them. The manual CI workflow's `stage` input enables submission;
`packages` accepts comma-separated public package names.
Manual publication also requires `abi_base` naming the prior release commit or tag. For initial
adoption, select a commit before the ABI baseline was introduced. Publication rejects a comparison
against its own checkout; ordinary local checks can still compare uncommitted changes with HEAD.
The release-artifact job also runs `check:security-audit`; an unreviewed finding prevents the
publication job from starting.
An empty workflow selection means all public npm packages. Existing name/version pairs are
skipped. Missing archives, duplicate archives, private packages, version mismatches, and registry
errors other than an explicit missing-version response stop the run. All selected archives and
registry lookups are checked before publishing starts. Native binaries precede their host.
Internal runtime, optional, and peer dependency ranges must have a satisfying version already
on npm or included in the same publication selection. A package cannot be published alone when
its required framework versions are unavailable. Invalid dependency registry responses fail closed.
Publication is not transactional; a failure after publishing starts can leave a partial release.
A rerun skips versions already published. Pending stages also reserve a version, but OIDC cannot
list them. A duplicate staged version stops the run; inspect it in npm, then approve the intended
artifact or reject it before retrying. Do not treat a conflict as evidence that the artifacts match.
Prereleases use `next`; other versions use `latest`. Staging does not make dependencies installable:
approve compatible dependencies (including native compiler targets) before their dependents.
Approval of the selected packages is not atomic.

### Configure stage-only trusted publishing

The GitHub workflow uses OIDC with job-scoped `id-token: write` and npm 11.19.1. No
`NPM_TOKEN` secret is used. npm trust is configured per package, so the repository provides
one bulk setup command. It includes the six native targets whenever the compiler is selected.
Private applications, fixtures, and nested packages are excluded.

Use npm 11.19.1 or newer locally, log in with an account that owns the packages and has 2FA,
then preview and apply:

```sh
npm install --global npm@11.19.1
npm login
npm run release:trust
npm run release:trust -- --execute
```

Use `--packages=@exactjs/forms` to limit setup. The preview is offline and changes nothing.
Execution checks all selected package identities and existing trusts before creating any trust.
It skips exact matches and grants only `--allow-stage-publish`, never direct publication.
Conflicting permissions for this workflow stop setup for manual review in npm. Unrelated
publishers are preserved; review their permissions separately if every publisher must stage.
Partial setup can be rerun. Creation is paced two seconds apart to avoid registry rate limits.
An interactive trust-settings read establishes npm authentication before the script captures
JSON for preflight. The npm 2FA prompt can offer a five-minute authentication window for bulk setup.

The configured GitHub repository is `techjoshua/exact`, workflow filename
`native-compiler-packages.yml`, with no environment restriction. Run the workflow on `main`
with `stage` enabled, the selected packages, and the previous release commit/tag as `abi_base`.
Inspect and approve or reject the resulting stages on npmjs.com. The workflow cannot approve them.
Authenticated local alternatives are `npm stage list @exactjs/forms`, `npm stage view <stage-id>`,
`npm stage approve <stage-id>`, and `npm stage reject <stage-id>`.

npm requires a package to exist before trust setup or staging. Bootstrap new package names with
a reviewed initial release through local `npm login` and normal 2FA. Download the built
`release-packages` artifact and use `npm run release:publish -- --directory=<npm-archive-directory>`
to preview, adding `--execute` only when ready to publish that initial release. This direct command
remains local bootstrap tooling and is never called by the automated release job. After bootstrap,
run trust setup. In npm package settings, disallow token-based direct publishing and remove any
obsolete bypass-2FA tokens after migration.

See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/),
[bulk trust setup](https://docs.npmjs.com/cli/v11/commands/npm-trust/), and
[staged publishing](https://docs.npmjs.com/cli/v11/commands/npm-stage/).

## Distribution inventory

The current checkout has 67 public JavaScript/metadata/agent npm workspaces. These include the
framework, enhancements, adapters, plugins, and seven component libraries: charts, forms, gestures,
gravity, motion, physics, and router. Apps, compatibility corpora, and theme fixtures remain private.
Only immediate packages under the declared publishing roots are eligible; nested fixtures cannot
become public merely by acquiring an `@exactjs` name.

Six native compiler source templates are private workspaces. Staging deliberately produces public,
platform-restricted archives using the compiler host version. VS Code and Chromium DevTools
are private npm workspaces distributed as VSIX and extension ZIP artifacts.
README validation excludes Nuxt's generated `.output-bun` server packages, as it already excludes
the ordinary `.output` tree; generated package manifests are not maintained source packages.

## ABI compatibility

The native compiler upstream has moved from the closed `microsoft/typescript-go` repository to
`microsoft/TypeScript`, pinned at `1f70213d4922b434345f639b441681e470c7cfc1`. Its Go module is
`github.com/microsoft/TypeScript/tsc`. The overlay remains under `native/typescript-go` locally,
but staging places it in the upstream `tsc` module. Compiler host construction supplies no upstream
content-mapper project because eXact owns its source transformations. Parsed project references
are preserved when assembling and synchronizing project roots. Platform packages copy both the
upstream license and `NOTICE.txt`, including third-party attribution.

The initial public package release is 0.5.0 with ABI epoch 1. It was published on September 14, 2026. Before publication, explicitly
approved API and compiler-helper redesigns established this initial contract rather than preserving
compatibility with development builds. String SSR now returns promises through one shared renderer;
the former synchronous implementations and `Async` aliases have been removed. This changes both
the authored API and compiler-emitted helper completion semantics. After publication, the same
incompatible change requires an ABI epoch and provider major-version advance, including at 0.x.
Preserved development artifacts remain useful regression coverage, but do not establish a released
compatibility promise. Never regenerate artifacts from an actual release to hide a break.

The SSR writer cutover also changes the initial compiler-helper contract: writers
receive caller-owned output as a fourth argument and return that same output after completion,
possibly asynchronously. The former three-argument, array-returning writer is removed. Generated
operations publish through the sink and prepare sibling references before traversal. Compiler,
core, SSR, generated packages, and the initial artifact baseline must be validated together before
publication. This is an incompatible development ABI change, not a compatible runtime update.
The previous development fixture is archived verbatim under `docs/performance-baselines`; the
unreleased 0.5.0 fixture now uses the new writer and passes adoption and lifecycle checks.

Compiled server document programs now carry `ssrHost` root-intrinsic metadata. SSR consumes that
metadata to preserve document claims, normalization, and asynchronous host ownership. Compile and
deploy these artifacts with the matching core and SSR implementation: older runtimes do not
implement the new document-program semantics. This is part of the unreleased 0.5.0 baseline. The
same semantic ABI change after publication requires an ABI epoch and provider major-version
advance; the preserved development fixtures are not regenerated.

Prepublication counters have
been reset at their producers and consumers:

| Boundary                      | Public baseline        | Ownership                                        |
| ----------------------------- | ---------------------- | ------------------------------------------------ |
| Render program                | 1                      | Core and native compiler                         |
| Component definition          | 1                      | Core, native compiler, framework-owned artifacts |
| Component-library build facts | 1                      | Compiler, package marker, authorization          |
| Compiler process protocol     | 1.0.0                  | JavaScript compiler host and native process      |
| Capability mask               | 1, 2, 4, 8, 16, 32, 64 | Compiler/runtime capabilities                    |

Contract versions and capability bits come from `scripts/contracts/compiler-abi.json`.
Generated Go and TypeScript constants are checked by build-script tests. Capability values remain
bit assignments; standard source-map version 3 also remains unchanged. Existing independent
version-1 wire, task, plugin, and inspection contracts retain their identities.
The React adapter schema also remains 1. Its dependency-range validation uses the installed
marker package release, now 0.5.0, generated from that package's manifest when versions change.

`scripts/contracts/release-abi.json` identifies the public ABI epoch and providers.
`check:release-abi` compares the current contracts and package versions against Git HEAD locally,
or the pull-request/push base in CI. Incompatible record versions or removed/reassigned capability
bits require a new epoch and a major version increase for every provider in that shared ABI.
This applies even before 1.0. Additive capabilities need not invalidate older artifacts.
The internal compiler process protocol is independently paired with exact-version native binary
dependencies; changing that process protocol alone does not break previously compiled components.
An unchanged ABI epoch must retain its original fixture baseline. Empty provider lists are invalid.

`check:compiled-abi` bundles preserved 0.5.0 JavaScript against current runtime packages without
invoking the compiler. It verifies client task execution, reactive expressions, conditional output,
keyed node identity, SSR, hydration adoption, and disposal. Integrity hashes and the Git release gate
prevent refreshing a published fixture to hide an incompatible runtime change. These fixtures are
representative regression protection, not exhaustive proof of every possible component behavior.

Compiler-emitted helper imports, signatures, record layouts, lifecycle semantics, and hydration
formats are compatibility surfaces even when application authors never import them directly.
Review must classify semantic ABI breaks that leave schema numbers unchanged and advance the epoch.
Adding a new helper is compatible with old artifacts, but newly compiled libraries must declare
runtime dependency minimums that actually supply that helper. Do not claim backward compatibility
merely because version constants match.

## Licensing

eXact-owned code uses Apache-2.0 with copyright held by Joshua Friesen. Root and distribution
notices, manifest metadata, and npm package-content checks enforce that choice. Native compiler
packages retain Microsoft's license and upstream notices; internationalization retains its CLDR
notice. VSIX and Chromium extension packaging include eXact's license and notice, and VSIX
packaging no longer bypasses license checks. See [licensing](licensing.md).

Public npm packages and native compiler templates are now 0.5.0. The public ABI starts at epoch 1.

## Validation recorded on 2026-09-07

The subsequent [adversarial release audit](adversarial-release-audit-2026-09-07.md) records fixes,
validation limits, and an unresolved comparison-only dependency audit finding. Packaging output
checks reject symlink and junction ancestors before replacement. Run packaging in a workspace
that is not being concurrently modified; those checks are not a filesystem sandbox.

The Windows build and native compiler tests pass against the pinned upstream revision.
Build-script tests, package tests (with corrected version fixtures rerun), test type checking,
documentation type checking, application tests, package-content and licensing checks, source architecture checks,
and platform-boundary checks pass. All five compiler browser acceptance journeys pass: Sudoku,
documentation, shipping continuations, localization, and Workbench.

A Forms-only dry-run changes only its package manifest; packing that selection produces one
archive without framework or native compiler packages. The staged Windows x64 compiler includes
both eXact notices and both upstream notices. The six-platform native build and Linux/Node/Bun
matrix remain CI validation, and registry publication has not been executed.

### Server list program ownership in the initial 0.5.0 contract

`createPreparedServerKeyedChild` accepts a compiler-only program proof flag. With that proof it
validates and converts the key, then returns the existing prepared program whose intrinsic root
already owns the item boundary. Other values continue to use a keyed wrapper. Review the helper's
return representation together with compiler emission and SSR child dispatch. Existing two-argument
artifacts retain their behavior; preserved fixtures must not be regenerated for this optimization.

The initial unreleased 0.5.0 SSR attribute contract includes kind 7 for compiler-proven safe ASCII
root classes. Its proof is confined to compiler-created root bags; generic and target-composed
attributes retain escaping. Older runtimes do not understand the proof operation, so new compiler
artifacts require the matching initial runtime. This is an initial contract addition, not a claim
of compatibility with an already published provider. Frozen fixtures remain unchanged.

The initial SSR root-attribute tuple also permits a compiler-owned scalar composition factory.
Its presence means the root invocation slot contains one attribute value instead of a property
object. The matching SSR provider serializes it directly or reconstructs the original properties
for target composition. This changes emitted artifact semantics and requires the matching initial
0.5.0 compiler, core types, and SSR provider; older providers cannot consume these new artifacts.
Existing released-fixture inputs remain unmodified.

### Independent island payload correction before 0.5.0

Resumable islands under server-only roots now serialize their resolved public props and ordered
resumptions inside their own boundary payload. They no longer depend on a page-wide activation cursor.
Ship the SSR and hydration providers together for this corrected initial contract. Client-root-owned
subtrees keep their existing capture representation and compiler helper signatures are unchanged.
Malformed inline payloads now fail before mounting. No released fixture was regenerated.

The initial unpublished 0.5.0 hydration contract also accepts a synchronous root factory in
`hydrateAfterNavigation()`. Compiler-proven factories use the existing compiled deferred-root
helper with the callable preserved until activation. Existing operation-valued calls retain their
semantics; factory-emitting compilers require the matching provider implementation. This establishes
the initial contract without changing the ABI epoch or preserving an unreleased alternate helper.
