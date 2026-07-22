# Future Work

These are candidate directions rather than committed roadmap items. The first
two are related compiler/build-system investigations; the documentation site
and Sudoku app are useful dogfooding projects that can expose weaknesses in
those systems.

## Secrets as reactive primitives

Reevaluate whether secrets should participate directly in eXact's reactive
model instead of being plain runtime values with compiler-visible
qualification.

The appealing model is that a secret source can change and its server-side
consumers react normally. This could support rotation, provider refresh, and
late availability without introducing a separate observation API. It must not
weaken the current rule that secret-qualified values cannot enter client
artifacts or framework-controlled server-to-client transfers.

The central complication is compilation across package boundaries. It is not
enough to recognize a reactive secret in the application source if a value
passes through a separately compiled library. The compiler needs a durable
cross-package contract describing at least:

- secret qualification and how it propagates through exported APIs;
- reactive source identity and dependency behavior;
- legal consumption/declassification points;
- server-only residency and serialization restrictions;
- enough provenance for package allowlists and useful diagnostics.

Questions to answer:

- Is `Secret<T>` itself reactive, or does a secret provider expose something
  like `ReactiveValue<Secret<T>>`?
- Does reading a secret track its value, its availability, its version, or all
  three?
- What happens to in-flight work when a secret rotates?
- Can ordinary reactive combinators preserve secret qualification without
  secret-specific runtime branches?
- Which facts must survive package publication, and in what form?
- Can TypeScript declarations and generated JavaScript descriptors carry the
  required contract, or is separate compiler metadata unavoidable?
- How should an opaque or uncompiled dependency fail: conservatively
  server-only, explicitly annotated, or rejected?

A useful spike would compile a provider package, an intermediate library, and
an application independently, then prove that rotation invalidates only the
expected server work and that no derived secret reaches a client artifact,
hydration state, log, error payload, or server patch.

## Reduce or eliminate manifest files

Investigate removing the generated `*.exact.manifest.json` files, preferably
entirely. The goal is to eliminate user-visible build artifacts and the
coordination burden around producing, finding, watching, loading, versioning,
and merging them.

The current producers, consumers, descriptor-based island path, and likely
reduction points are inventoried in
[manifest-usage-inventory.md](manifest-usage-inventory.md).
The clean-break implementation plan is
[remove-compiler-manifests-plan.md](remove-compiler-manifests-plan.md).

This does not necessarily mean eliminating manifest information. Today that
information is used for cross-file and cross-package placement, artifact
resolution, component and boundary identity, hydration registration, server
allowlists, state/context contracts, and policy auditing. The first step is to
inventory every producer and consumer and separate:

1. compile-time graph information;
2. runtime security and dispatch information;
3. published cross-package contracts;
4. optional diagnostics and audit data.

Possible replacements include:

- keeping project-wide metadata in compiler/build-adapter memory;
- attaching serializable descriptors to emitted ESM exports;
- emitting a generated ESM metadata module instead of per-source JSON;
- encoding publication contracts in package exports or a single
  package-scoped artifact;
- deriving runtime allowlists from composed component descriptors at startup;
- retaining a manifest only as an optional inspection/debugging output.

The design should avoid simply moving the same complexity into a differently
named file. Success would mean that application authors never import or manage
a generated manifest, incremental builds do not depend on stale sidecar files,
and independently published packages still preserve enough information for
safe compilation and runtime enforcement.

This investigation should be considered alongside reactive secrets: both need
a reliable cross-package compiler contract. A shared solution may replace much
of the current manifest machinery; separate ad hoc mechanisms would likely
make the package boundary harder to reason about.

## Documentation site and guide

Create an official documentation site built with eXact itself. It should use
static SSR/prerendering so the output is plain deployable files suitable for
GitHub Pages, with client JavaScript used only where examples or navigation
need interactivity.

Initial goals:

- a learning-oriented guide in addition to API reference material;
- fast, accessible, responsive pages with useful no-JavaScript output;
- prerendered routes, correct GitHub Pages project-path handling, and
  refresh-safe links;
- generated navigation, table of contents, code highlighting, and page
  metadata;
- a GitHub Actions build/deploy path;
- framework-versioned examples that are compiled and tested in CI;
- dogfooding of SSR, hydration, routing, assets, and package publication.

A sensible first guide path is:

1. installation and the smallest component;
2. state, derived values, tasks, and lifecycle;
3. events, forms, lists, and styling;
4. routing and data loading;
5. SSR, hydration, and server components;
6. compiler/build-tool integration;
7. testing, deployment, security, and production guidance.

The site should not require a live eXact server on GitHub Pages. Any
server-dependent demo should either run entirely in the browser with a local
fixture or link to a separately hosted example.

## Reactive Sudoku sample application

Build a polished Sudoku app as a framework showcase rather than a minimal
counter-style demo. It is a good stress test for fine-grained updates,
structured state, derived calculations, keyboard and pointer interaction,
accessibility, and undoable state transitions.

### Core experience

- Load a valid puzzle and distinguish givens from player-entered values.
- Select a cell with touch, pointer, keyboard, or an on-screen number pad.
- Support arrow-key navigation and direct number entry.
- Highlight the selected cell, matching values, and its row, column, and
  3-by-3 house.
- When an entered value conflicts with the current board, highlight all
  involved invalid cells and identify the conflicting row, column, or house.
- Support pencil marks/possible values, including a clear visual distinction
  from committed values.
- Support undo (and preferably redo) for value edits, pencil marks, and bulk
  changes.
- Detect completion and distinguish a filled board from a correctly solved
  board.

### Interaction details to decide

- Pencil mode can be explicit, keyboard-modified, or inferred from the input
  control used.
- Entering a committed value may remove that candidate from peers; if enabled,
  this must be one undoable transaction.
- Invalid-entry feedback may allow conflicts for exploration or reject the
  edit. Allowing the edit better demonstrates derived validation state.
- Mobile input should not summon an inappropriate text keyboard and should
  remain usable one-handed.
- Keyboard shortcuts should cover erase, pencil mode, undo/redo, and movement
  across row boundaries without trapping focus.

### State model

Keep the puzzle definition, current entries, candidate sets, selection, and
history distinct. Rows, columns, houses, peer cells, conflicts, matching cells,
completion, and available candidates should be derived rather than copied into
multiple mutable stores.

Undo should record domain operations or compact before/after patches, not a
second independently mutable board. Group automatic candidate cleanup with the
initiating edit so one user action always corresponds to one history step.

### Quality bar

- Complete touch, pointer, and keyboard support.
- Screen-reader-friendly grid semantics, labels, instructions, and
  announcements that do not rely on color alone.
- Responsive layout with no precision tapping requirement.
- Unit tests for board rules and history plus interaction tests for keyboard,
  touch-equivalent controls, conflicts, candidates, and completion.
- No full-board rerender for a single-cell edit; use the app to measure and
  demonstrate eXact's fine-grained reactivity.

Potential later additions include difficulty selection, puzzle generation,
hints, elapsed time, persistence, shareable puzzle URLs, import/export, and an
optional daily puzzle. These should follow the core interaction and
accessibility work rather than define the first version.

## Suggested order

1. Inventory manifest producers/consumers and define the cross-package
   contract needed by both placement and secret policy.
2. Spike reactive secrets across three independently compiled packages.
3. Prototype a manifest-free in-memory application build, then validate the
   same approach with a published component package.
4. Build the documentation site to harden static SSR and GitHub Pages
   deployment.
5. Build Sudoku as the richer client-side reactivity and interaction showcase.
