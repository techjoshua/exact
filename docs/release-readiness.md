# Release readiness

## Release identity and metadata

The initial 0.5.0 release was published from commit
`6476a2f5de46b716d26c2d7d7e6d8a22b501f7f9` on September 14, 2026, with ABI epoch 1.
Its released fixtures are frozen. Current epoch-2 release requirements are described below;
prepublication redesigns do not authorize incompatible changes to a released contract.

`npm run check:npm-metadata` validates descriptions, package-specific keywords, repository links,
author, license, and issue tracker. Package READMEs link to their public documentation and source
using absolute URLs suitable for npm. Funding, engine, and platform metadata require an actual
supported policy. Native staging supplies the appropriate `os` and `cpu` fields.
Published manifests cannot be replaced in place. Validated main-branch builds publish new versions
directly through npm trusted publishing, with provenance and without npm stage approval.

## Independent package releases

Independent versioning remains the default. The 0.6 prerelease is an explicitly coordinated
exception: every public framework package must join the 0.6 version family, including unchanged
utilities. The eleven omitted utilities therefore advance to 0.6.0, not 0.5.2. Published 0.6.0
consumers whose manifests change advance to 0.6.1; existing unpublished 0.6.1 candidates retain
that version. Widen compatible utility dependency ranges to accept both ^0.5.0 and ^0.6.0.
This preserves compatibility while allowing the coordinated packages to resolve together.

The Ripley migration repairs target 0.6.1 for compiler, core, DOM, SSR, and testing, with matching
native compiler packages. They fix bare enhancement attributes, keyed derived/helper lists,
server task ownership, owner-local hydration callbacks, and nested array state restoration.
The testing package updates paired-hydration guidance. Rebuild both application artifacts with
the repaired compiler; runtime-only repairs also apply to existing epoch-2 artifacts. These
changes preserve helper signatures, tuple schemas, and intended artifact semantics, so the ABI
epoch remains 2. Install the compiler, core, DOM, and SSR repairs together for the complete fix.
Nothing in the local migration validation constitutes publication.

The independent enhancement-target redesign is an incompatible semantic ABI change. `_target`
places its supplied child and contributes props; it no longer exports one universal target for
incoming enhancements. Each incoming namespace resolves its own root. An enhancement can be
attached to a separately compiled, unaware component, including through a default activation.
Only a resolved fragment receiving additional target props materializes an intrinsic host at runtime.

This establishes ABI epoch 2 at 0.6.0, with component and render-program contracts advanced to
version 2. Execution metadata, component-library metadata, and the compiler process protocol retain
their own unchanged versions. All shared ABI providers advance to 0.6.0, together with packages
whose manifests must require those providers. Compiler native packages follow the compiler version.
The dependency closure is publication selection, not an instruction to publish every tested package.

This publication also aligns compatible updates to 0.6.0 for `@exactjs/language-extension-host`
(provider process cleanup and provenance handling) and `@exactjs/agent-skill` (updated application
authoring guidance). Their 0.5.1 versions are already published and cannot carry these changes.
These companion versions align with the coordinated release without introducing an ABI break.
Dependent packages accept both ^0.5.0 and ^0.6.0 to preserve existing compatibility.

Rebuild application and library client, server, and hydration artifacts with the matching compiler.
Epoch-1 compiled artifacts are rejected before construction; they are not reinterpreted using the
new target semantics. Preserve `fixtures/release-abi/0.5.0` unchanged and verify both its integrity and
rejection by the new runtime. Version 0.6.0 is published. Subsequent repairs require new package
versions; released manifests cannot be replaced. See [the component language](component-language.md#bounded-target-routing) and
[outstanding acceptance work](proposals/future-work.md#enhancement-performance-acceptance).

The eleven utility packages that remained at 0.5.1 deliver embedded source maps in their
coordinated 0.6.0 publications. Their published 0.5.1 tarballs omit authored sources; rebuilding
the workspace alone cannot repair installed copies. This version alignment changes no runtime
API or ABI. Consumer manifests must accept the new minor version without dropping support
for the compatible 0.5 versions.

Published JavaScript source maps embed authored sources by default. Package-content preflight
rejects map sources that are neither embedded nor included in the npm inventory, so a workspace
checkout cannot mask missing debugger sources in installed packages.

The 0.6.0 testing recorder observes response bodies as the client consumes them.
It no longer drains a separate stream branch. Direct recorder users must consume or cancel a
response body before awaiting settlement; cancellation reaches the source, and transport errors
remain on the client read without a second unhandled observer rejection. Native response `json()`
and `text()` reads remain supported. This changes test observation timing, not the component ABI.

The 0.6.0 scaffolder now selects matching runtime/compiler packages for SSR and single-file
outputs. The Vite integration adds `exactSingleFile()` and an `afterBuild` metadata hook. Public
hydration keeps request capabilities; only the explicit hydration-only entry is specialized.
These shipped in 0.6.0 without an additional ABI epoch change.

Nested server task emission in 0.6.0 adds
`activateServerComponentTaskTreeForHost` to the compiler-facing server task helpers. Ship the
compiler and core runtime together and rebuild affected paired artifacts. The helper retains
request-local task ownership only for slices that invoke children; flat SSR slices keep their
existing path. Generated continuation executors also retain their referenced child definitions,
and shared setup/interaction functions retain an explicit server setup activation. This shipped with epoch 2; preserve frozen released fixtures.

The 0.6.0 response API exposes owned body capabilities directly instead of a hidden
symbol and lazy text/stream getters. `ExactResponseLike` now requires one representation; stream
responses omit the old dummy `body: ''`. Buffered bodies alone support synchronous text/blob
collection, and asynchronous producers no longer advertise throwing synchronous methods. Migrate
custom response consumers to the platform adapter or explicit body operations. This is a public
server/adapter API change included in 0.6.0, not a new component ABI epoch:
compiler helper signatures and emitted component semantics are unchanged. Frozen 0.5.0 artifacts
remain untouched and retain their existing epoch-rejection expectation.

The same release includes immediate-child composition, `Document`, authored `doctype()`
declarations, and request-local document output slots. These additive APIs travel with the
incompatible target redesign rather than being advertised as a compatible 0.5.2 release. See
[child composition](child-composition.md) for their contracts.

The epoch-2 compiler also emits `withIntrinsicComposition` for fixed intrinsic child
declarations. This additive compiler helper retains a lazy structural view beside a render program;
it requires the matching core runtime. Existing epoch-2 artifacts remain valid, and frozen released
fixtures must not be regenerated for this optimization. Opaque receipt prototype layout remains
private: dispatch, immutability, key snapshots, and domain ownership are unchanged.

Client artifacts containing structural `title` or `textarea` receipts now select
`@exactjs/dom/runtime/text-host`. This additive DOM entry installs text presentation and reexports
the intrinsic receipt constructor without allocating an extra receipt. Target integration also
installs text presentation because an enhancement can choose its intrinsic host at runtime.
Rebuild development epoch-2 client artifacts with the matching compiler and DOM package: older
development text-host artifacts did not select this dependency. Server receipt emission and the
authored API are unchanged. This shipped in 0.6.0; it does not change the
released epoch-1 fixtures or establish compatibility with older development outputs.

Charts adopts immediate-child partitioning to place authored captions and descriptions under its
figure and requires core ^0.6.0. Its context-based axis, series, and datum registration contracts are
unchanged. Rebuild client and server artifacts together.

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

The host scheduler's optional streaming-policy capability is additive. Bun progressive rendering selects
a cooperative work window while string rendering and initial Fetch admission retain adaptive policy.
Ship the Bun policy and SSR selector together for this behavior. Function-only schedulers and explicit
`scheduleRender` callbacks remain valid; component artifacts, helper signatures, and the ABI epoch are
unchanged.

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

Private framework-comparison manifests participate in version planning, including native participant
roots. Generated third-party build manifests are excluded. Comparison builds and measurement
workers verify actual eXact package resolution so a compatible registry copy cannot silently replace
the workspace runtime in a release performance capture.

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

Preview direct publication of release archives:

```sh
npm run release:publish -- --directory=.tmp/release/forms --packages=@exactjs/forms
```

The preview reads npm registry state without publishing. Adding `--execute` publishes directly.
Pushes to `main`, including merges, publish all unpublished public package versions after the full
release validation succeeds. Pull requests never publish. Manual dispatch on `main` can enable
`publish` and select comma-separated public package names with `packages`; its default is build-only.
Main-branch runs do not cancel an active release when another commit arrives.
Manual publication also requires `abi_base` naming the prior release commit or tag. For initial
adoption, select a commit before the ABI baseline was introduced. Publication rejects a comparison
against its own checkout; ordinary local checks can still compare uncommitted changes with HEAD.
Push validation compares with the previous main revision. Recorded pre-cleanup SHA values resolve
through `docs/history-revisions.txt` before Git verification, including when the old object still
exists locally. Unmapped or unavailable revisions fail rather than silently selecting a new baseline.
The release-artifact job also runs `check:security-audit`; an unreviewed finding prevents the
publication job from starting.

Package-content and compiler-distribution checks accept both npm 11's array and npm 12's
package-name-keyed object from `npm pack --dry-run --json`. Each workspace check requires
exactly one matching package with a valid file inventory; malformed output fails the check.
Registry identity and exact-version checks accept either a scalar string or a singleton string
array from `npm view --json`. Empty, multiple, malformed, or mismatched values fail preflight.

An empty workflow selection means all public npm packages. Existing name/version pairs are
skipped. Missing archives, duplicate archives, private packages, version mismatches, and registry
errors other than an explicit missing-version response stop the run. All selected archives and
registry lookups are checked before publishing starts. Native binaries precede their host.
Internal runtime, optional, and peer dependency ranges must have a satisfying version already
on npm or included in the same publication selection. A package cannot be published alone when
its required framework versions are unavailable. Invalid dependency registry responses fail closed.
Publication is not transactional; a failure after publishing starts can leave a partial release.
A rerun skips versions already published. Prereleases use `next`; other versions use `latest`.
If an earlier staged attempt reserved a version, reject that obsolete stage in npm before retrying
its direct publication. A conflict is not evidence that two artifacts match. The workflow does not
create or approve stages.

### Configure direct trusted publishing

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
Execution reports each package's identity and trust checks, followed by each revoke/create
operation. The offline preview prints planned creation commands without contacting npm.
It skips exact direct-publish matches and grants `--allow-publish` without staging permission.
For this repository and workflow, a known stage-only or combined grant is revoked and recreated
with direct-publish permission. The complete selection is checked before any mutations. Unrelated
publishers, environment restrictions, duplicate configurations, and unknown permissions stop setup
without changing them. npm supports one publisher per package. If recreation fails after revocation,
the package has no trust until setup is rerun; a rerun resumes from the actual registry state.
Trust mutations are paced two seconds apart to avoid registry rate limits.
An interactive trust-settings read establishes npm authentication before the script captures
JSON for preflight. The npm 2FA prompt can offer a five-minute authentication window for bulk setup.

The configured GitHub repository is `techjoshua/exact`, workflow filename
`native-compiler-packages.yml`, with no environment restriction. Run the workflow on `main`
with `publish` enabled, the selected packages, and the previous release commit/tag as `abi_base`
for a manual release. Successful main pushes publish automatically. Routine OIDC publication needs
no npm stage review or per-package 2FA; the one-time trust setup still requires npm login and 2FA.

npm requires a package to exist before trust setup. Bootstrap new package names through local
`npm login` and normal 2FA using the same `release:publish` preview and execution commands, then run
trust setup. In npm package settings, disallow token-based direct publishing and remove obsolete
bypass-2FA tokens after migration.

See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/),
[bulk trust setup](https://docs.npmjs.com/cli/v11/commands/npm-trust/).

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

Compiler-emitted helper behavior and artifact semantics are ABI surfaces. Released fixtures must
never be regenerated to hide a break. Incompatible changes require a new ABI epoch and provider
minor versions at 0.x, or major versions at 1.0 and later. Development artifacts do not establish a
released compatibility promise. Current runtime contracts are documented in
[compiled component artifacts](compiled-component-artifacts.md) and [SSR/hydration](ssr-hydration.md).

The current contract versions are:

| Boundary                      | Current version        | Ownership                                        |
| ----------------------------- | ---------------------- | ------------------------------------------------ |
| Render program                | 2                      | Core and native compiler                         |
| Component definition          | 2                      | Core, native compiler, framework-owned artifacts |
| Component-library build facts | 1                      | Compiler, package marker, authorization          |
| Compiler process protocol     | 1.0.0                  | JavaScript compiler host and native process      |
| Capability mask               | 1, 2, 4, 8, 16, 32, 64 | Compiler/runtime capabilities                    |

Contract versions and capability bits come from `scripts/contracts/compiler-abi.json`.
Generated Go and TypeScript constants are checked by build-script tests. Capability values remain
bit assignments; standard source-map version 3 also remains unchanged. Existing independent
version-1 wire, task, plugin, and inspection contracts retain their identities.
The React adapter schema also remains 1. Its dependency-range validation uses the installed
marker package release, currently 0.5.1, generated from that package's manifest when versions change.

`scripts/contracts/release-abi.json` identifies the public ABI epoch and providers.
`check:release-abi` compares the current contracts and package versions against Git HEAD locally,
or the pull-request/push base in CI. Incompatible record versions or removed/reassigned capability
bits require a new epoch and a minor version increase for every provider still at 0.x,
or a major version increase for providers at 1.0 and later. Additive capabilities need not invalidate older artifacts.
The internal compiler process protocol is independently paired with exact-version native binary
dependencies; changing that process protocol alone does not break previously compiled components.
An unchanged ABI epoch must retain its original fixture baseline. Empty provider lists are invalid.
The additive `project-files` request uses the native TypeScript configuration parser for checking
root selection. It requires the matching native compiler package and changes no emitted component ABI.

`check:compiled-abi` bundles preserved 0.5.0 JavaScript against current runtime packages without
invoking the compiler. For epoch 2 it verifies rejection of epoch-1 artifacts before component construction or DOM mutation. Integrity hashes and the Git release gate
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

## Release validation boundaries

Run the current release checks for each candidate; a historical passing run does not validate a new
release. Include cross-platform installation outside the monorepo and the dependency-audit gate.
Publication is not transactional: registry state can change after preflight, partial publication
is possible, and reruns must account for versions already published.

`npm run test:packages` runs every project in `vitest.packages.config.ts`. The default project
limits discovery to package directories in its configuration. Do not add repository-relative CLI
filters to this aggregate command: projects with their own roots match paths relative to those
roots and can otherwise be silently omitted.

Packaging guards reject symlink and junction ancestors before replacing output. They assume no
concurrent filesystem mutation and are not a sandbox against a hostile process swapping paths.
An explicit ABI comparison baseline must be the relevant prior release, not an arbitrary older
commit selected to weaken the checks. Schema checks and representative artifact tests supplement,
but do not replace, semantic compatibility review.

Paired artifact enhancement linkage uses the existing version-1 optional-provider request format.
Consumers need the eXact adapter version that recognizes those requests and authorizes their
importer edges. This adds no component helper signature or ABI epoch; previously emitted components
remain valid. Single-target physical facade output remains the unbundled execution path.

The CI acceptance gate includes the scripted
[installed production workbench](component-composition-corpus.md#installed-production-workbench).
It verifies production browser-only and paired SSR builds using packed candidate packages and a
separately compiled optional-enhancement consumer. Run `npm run test:packed-workbench` with the
candidate native package prepared when reproducing this release check locally. It is intentionally
separate from the ordinary build command and requires no agent-driven browser testing.

The same gate runs `npm run test:packed-shipping` for installed production server-continuation
coverage using Parcel Lab and its deterministic DOOP provider. See
[installed shipping continuations](component-composition-corpus.md#installed-shipping-continuations)
for the scenarios, environment isolation, and limits of its cancellation evidence.
