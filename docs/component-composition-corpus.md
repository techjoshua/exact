# Component composition corpus

The component composition corpus is the normative acceptance suite for native eXact compilation.
It lives in `packages/component-composition-corpus` and protects semantics that otherwise tend to
surface as isolated application regressions after compiler changes.

The inventory records the known compiler paths and their intended scenario coverage,
including shared setup/interaction invocation of one durable function-task definition and
receiver-owned indexed input updates across client replacement and hydration. Compiler-created
intrinsic identity is also protected as immutable server data outside the request-local dynamic
attribute plan, and compiler-known root openings publish through one focused server operation.
Exact synchronous server value propagation also emits direct assignments while authored
calculations retain their executable setup boundary.
Compiler-proven single-slot task inputs subscribe directly to the receiving component's indexed
state or prop dependency; arbitrary task expressions retain their executable tracked source.
Finite nested root props also carry the same immutable positional publication schema in client and
server artifacts; behavioral tests independently protect round-trip decoding and named fallback.
Compiler-proven indexed state and prop reads used by intrinsic properties are encoded in the
component-local `wire`; mixed property groups retain executable writers only for their arbitrary
expressions and callbacks. Fully reconstructible transition-free components omit their resumption
contract and value record rather than shipping an empty activation protocol.
Checker-proven whole-state aliases also retain indexed reads inside derived authored expressions;
invalidated, nested, dynamic, and broad alias paths keep their general property semantics.
Direct properties of keyed items and object-valued indexed props forwarded across native component
boundaries use compact component-local operands. Replacing the outer prop rebinds the child-owned
property dependency without accumulating computation owners; arbitrary and derived expressions
retain their computation owners.
Nested keyed cells beneath an indexed native map also retain each outer callback's values instead
of reusing the first row's closure through a shared list-site cache.
Exact prop snapshots expressed through `peek()` also remain compiler-known resumption inputs: the
server verifies equality before omitting redundant nested state, while those server-only source
paths do not ship in hydration artifacts.
Compiler-closed single-scalar text runs also retain adjacent authored text in one focused operation,
while multi-expression runs keep their independent reactive owners. Whole-intrinsic scalar runs
omit server comments and split the adopted text into independently updated nodes. Focused hydration
coverage protects element identity, empty values, UTF-16 boundaries, and mismatch recovery.
Compiler-proven native `maxLength` literals and bare `required` attributes are protected as static
client, server, and hydration structure; dynamic values and custom-element properties retain their
runtime operations.
A compiler-known intrinsic can bound an immediately preceding opaque native child's marker-free
range at the program root or beneath a direct parent with a stable forward claim path. The corpus
protects multi-node output, prop updates, hydration identity, the deeper explicit-marker fallback,
and generated client and server structure; focused DOM coverage also protects the empty-output
boundary case.
Fixed intrinsic children crossing a component boundary retain compiled rendering while exposing a
lazy structural view. Coverage checks immediate intrinsic selection, derived children, exactly-once
construction and disposal, reactive updates, and hydration identity. Derived locals in focused
component output ranges must remain available inside their generated reactive callbacks.

## Contract model

The corpus has two independent layers:

1. Handwritten behavior expectations define what authored TSX must do during client mount, indexed
   updates, final disposal, SSR with ready and pending tasks, streaming, progressive output,
   matching hydration, and compiler-owned root recovery after a structural mismatch.
2. Generated-structure predicates verify compiler-owned properties such as target-local artifact
   emission, attachment ordering, enhancement dependencies, and exclusion of native VNode or
   runtime-artifact fallback paths.

Expected HTML, DOM identity, state transitions, cleanup counts, and recovery boundaries are authored
framework contracts. Tests must not derive expected values from current compiler output or replace
these assertions with whole-output snapshots.

Enhancement coverage includes the framework's server pass-through projection and activation of the
bundle-local implementation after adopting the authored target. The shared workbench also hydrates
output produced with the server implementation present. Enhanced interactive hosts must retain the
same child topology across targets and keep enhancement namespace props out of serialized HTML.
Separate SSR scenarios cover target contributions across native component boundaries.
The built Vite motion integration applies the same adoption, repeated-update, identity, and
disposal expectations across buffered and progressive document shells. It distinguishes
task-placed and explicitly annotated server-only pages with independently bootstrapped islands
from client-capable applications
that adopt their whole subtree. These built-bundle checks run in jsdom; the installed workbench
adds Chromium coverage for the whole-application path. Installed-package development SSR checks
exercise theme scopes and fields from authored and paired artifacts, including module invalidation.

## Inventory discipline

`src/compiler-path-inventory.ts` is the maintained ledger of known specialized paths, supported
general paths, explicit compatibility boundaries, diagnostics, and forbidden legacy paths.
`src/scenarios.ts` assigns each path to at least one scenario and declares the rendering modes in
which it must be exercised. The inventory tests fail for unknown paths, missing paths, duplicate
inventory identities, or missing required rendering modes. These checks validate declarations,
not execution coverage. A listed mode is evidence only when a behavioral test executes it and
asserts the relevant contract. The ledger is not proof that every compiler path has been discovered.

When compiler behavior changes:

1. Add or update the inventory entry and its required modes.
2. Add the smallest independently meaningful component scenario that exercises the behavior.
3. State the normative observation before running the fixture.
4. Compose the scenario with related capabilities when the interaction creates additional risk.
5. Run `npm test -w @exactjs/component-composition-corpus`.

Compatibility components remain owned by their explicit renderer. They may be represented in the
inventory as a boundary, but they must never be used to justify a VNode or runtime-created artifact
path for native eXact components.

## Shared interaction workbench

The private corpus owns a small report workbench in
`src/test-support/repeated-interactions.fixtures.tsx`. It has no dependency on another project's
source, data, or availability. Grow this application with minimal, independently authored examples
of new failure classes instead of importing an application's workarounds.

`src/repeated-interactions.test.ts` executes the same assertions for each combination below.
The loops generate executable tests, so adding an entry runs the complete transition contract.

| Authored control form                    | Client mount       | Server render followed by strict hydration |
| ---------------------------------------- | ------------------ | ------------------------------------------ |
| Direct callback prop                     | Shared transitions | Shared transitions and DOM adoption        |
| JSX spread plus callback prop            | Shared transitions | Shared transitions and DOM adoption        |
| Intrinsic enhancement plus callback prop | Shared transitions | Shared transitions and DOM adoption        |

Every cell checks the first interaction, replacement of callback inputs, a second interaction,
conditional removal and restoration, keyed row retention and removal, empty derived output,
handler removal, and exactly-once row cleanup. Expected labels and interaction observations are
handwritten. SSR uses the server enhancement implementation, and hydration uses the client
implementation. Enhancement attributes are asserted so accidental no-op resolution cannot pass.

### Evidence boundaries and remaining gaps

This workbench runs compiled source in jsdom. It does not establish real-browser event behavior,
CSS or layout correctness, independently installed package resolution, or split-build server
component and client-island equivalence. The corpus's query-selected server artifact is full-root
SSR, not proof of those separate build paths. Existing focused suites remain necessary.

When expanding coverage, distinguish these axes explicitly:

- authored form and selected compiler specialization or supported general path;
- initial creation, retained updates, replacement, removal, and final cleanup;
- client mount, full-root SSR/hydration, and split-build islands;
- workspace source, separately compiled components, and installed release artifacts;
- simulated DOM behavior and browser behavior.

Extend the installed production workbench below with additional split-build island transitions next.
Reuse the same observations through adapters where possible. Confirm that an adapter actually
selects its claimed path with focused compilation or build assertions. Do not label one successful
source-fixture run as evidence for the other axes, and do not expand every trivial scenario into
the full Cartesian product.

## Installed production workbench

`npm run test:packed-workbench` is a deterministic acceptance command, separate from `npm run build`.
It uses npm tarballs, an operating-system temporary directory outside the checkout, and Playwright
Chromium. No agent, screenshot interpretation, or manual browser operation is involved.

The runner packs the candidate framework dependency closure, builds and packs an independent
control library with an optional enhancement provider, then installs those packages into generated
consumer applications. The application source imports only the control library. Provider activation
must therefore be discovered through the packaged library's build facts. Compiler overrides and
`NODE_PATH` are removed from subprocesses, and installed package paths must remain inside the
consumer's own `node_modules` tree.

One browser journey runs against four production configurations: single-file browser output and
paired server/client output, each with the optional provider installed and absent. It checks
callback replacement, second interaction, retained control and row identity, derived output,
handler removal, row cleanup, focus, and edited form values. For SSR it delays the entry script,
records server DOM and edits the input before hydration, then asserts adoption without replacement.
The source corpus remains responsible for final explicit unmount observations; closing a browser
context is not evidence that a component's unmount callback ran.

### Running and maintaining the command

Install repository dependencies, build the candidate packages, and install Chromium with
`npx playwright install chromium`. Supply a native compiler tarball matching the host platform and
architecture in `.tmp/native-artifact/native-package-artifacts`, or set
`EXACT_NATIVE_PACKAGE_DIRECTORY` to its containing directory. There must be exactly one matching
tarball. To prepare one locally, run `npm run build:native-compiler -- --package`, create the artifact
directory, and run `npm pack ./.tmp/native-packages/compiler-native-<platform>-<arch>
--pack-destination .tmp/native-artifact/native-package-artifacts`. The compiler build requires Go.
Then run `npm run test:packed-workbench`.

Fixture source lives in `scripts/test-support/packed-workbench`; browser assertions live in
`scripts/packed-workbench-journey.mjs`. Extend the shared journey for new failures rather than
adding manual reproduction steps to the release procedure. Consumer builds execute installed
packages. The provider build uses the repository's component-library build script, resolving the compiler
from the provider's own installed dependency graph. It must not depend on a native executable
built in the repository checkout.

CI runs this command in the existing acceptance job for relevant framework, packaging, toolchain,
or acceptance changes on pull requests, and unconditionally on main and manual release runs.
Git comparison errors fail the job. The release publication job depends on acceptance succeeding.
The selection and process-lifetime tests run in the dependency-free build-script suite.

Successful runs delete temporary projects and discard browser traces. Failed browser journeys save
traces under `.tmp/packed-workbench-failures`; CI retains them for seven days. Failed builds print
captured command diagnostics. Servers, browser contexts, and temporary installations are released
on either success or failure. These generated outputs must never be committed.

This adds installed-package and browser evidence for the listed transitions. It does not establish
coverage of every component, streaming boundary, island arrangement, or browser engine. The wider
execution-path inventory still requires explicit scenario-by-scenario evidence.

## Installed shipping continuations

`npm run test:packed-shipping` complements the workbench with Parcel Lab's generated server
continuations. It copies authored shipping-app inputs into an isolated temporary installation,
installs packed candidate packages, generates artifacts, builds both production targets, and
runs the app's Playwright suite against an owned Node host. It uses the same native-package and
Chromium prerequisites as the workbench command above. The isolated Playwright runner uses the
checkout's locked Playwright version so it matches the installed Chromium revision. No agent
browser operation is involved.

The suite checks server DOM adoption without an initial quote redispatch, repeated route and
price updates, transport-failure recovery, and superseded response handling across three viewport
and appearance configurations. The delayed-response test holds a real server response while a
newer edit completes. It proves that an obsolete reply cannot replace current browser output;
it does not prove that a carrier cancels its upstream request. Provider cancellation and request
lifetime remain responsibilities of the app's focused tests.

Only the deterministic fictional DOOP provider participates. The runner never copies environment
files and removes live-carrier credentials from build and server environments. Browser failures
retain traces in `.tmp/packed-shipping-failures`; temporary installs and servers are cleaned up on
success and failure. CI runs this command in the acceptance job for pull requests, main, and manual
release runs, and retains failure evidence for seven days. Publication depends on that job passing.
