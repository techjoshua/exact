# Release readiness

Status: initial release configuration is prepared. Package preparation and registry publication are separate steps.

The initial 0.5.0 compiler/runtime contract includes server-only compiled empty external script
roots. The matching SSR runtime must retain keyed item boundaries for those script programs,
because the client still adopts them as ordinary intrinsics. Ship these compiler and runtime
changes together for the initial release; an older runtime's general compiled-row boundary elision
is not compatible with that new emission. This is a prepublication semantic contract update,
not a reason to regenerate released ABI fixtures or add an obsolete implementation.

## Independent package releases

The initial SSR scheduling hook accepts `void | Promise<void>`. A ready adapter gate returns
void and starts rendering without a scheduling suspension. Node request handlers now own default
adaptive admission before rendering; Bun configuration is independent. This replaces the unreleased
promise-only declaration in the initial 0.5.0 contract.

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

Preview publication from staged archives:

```sh
npm run release:publish -- --directory=.tmp/release/forms --packages=@exactjs/forms
```

The preview reads npm registry state. Only `--execute` publishes. The manual CI workflow's
`publish` input enables execution; `packages` accepts comma-separated public package names.
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
A rerun skips versions already published. Prereleases use `next`; other versions use `latest`.

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

The initial public package release is 0.5.0 with ABI epoch 1. It remains unreleased: explicitly
approved API and compiler-helper redesigns establish this initial contract rather than preserving
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
