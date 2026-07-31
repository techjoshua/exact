# eXact documentation app

This workspace contains the routed, client-only eXact documentation site. It is intentionally isolated from the framework packages: its source, build orchestration, and generated output all live under `apps/docs`.

The public learning sequence includes dedicated current guides for coordinated
actions and optimistic state, enhanced forms, and finite eager/lazy component
registries. It also documents the compiler-aware no-emit service, language
server, VS Code presentation, and safe task refactors. Keep route metadata in
`src/docs-manifest.ts` aligned with
the engineering references under `docs` and with package-level READMEs.

The tasks guide is the practical entry point for understanding task
definitions, activations, and generations; seeing what the compiler infers;
using `TaskContext` policy deliberately; understanding setup dependencies and
captured inputs; distinguishing effects from results; composing scheduling
policy; and separating JavaScript `async`/`await` from Suspense readiness.

The Learn sequence introduces each feature from its ownership and compiler/runtime model before
showing explicit APIs or configuration. Inferred ordinary TypeScript is the starting point;
factories, task policy, generated machinery, and deployment controls follow the reason they are
needed.
The state guide distinguishes component-owned setup derivations from region-owned view
calculations, including when the compiler can elide a safe single-consumer scalar or forwarded
identity without changing the authored source definition.
The DevTools guide presents the live component-instance tree and bounded Profiler capture with
causal frames aggregated into per-component-type waterfall lanes, including reliable Stop-time
finalization from retained event history.

Native documentation components use function-defined tasks for transient UI
work. Known browser APIs infer placement and cancellation; authored
`TaskContext` policy remains only when behavior such as latest-wins repeated
copy feedback is not inferable. Examples should rely on attached task
generations and compiler stale-write fencing instead of teaching manual
revision, signal plumbing, or post-await cancellation checks.

## Develop

From the repository root:

```sh
npm run dev -w @exactjs/docs
```

Development and production both mount directly into an empty document root. The standalone
GitHub Pages artifact is intentionally client-only; SSR and hydration are demonstrated and tested
by their owning framework packages and server-capable applications.

The Vite integration uses the same native-only compiler path as generated applications. npm
selects one platform-specific `exactc-native` package; the docs app does not carry a JavaScript
compiler fallback.

## Build

```sh
npm run build -w @exactjs/docs
```

The build compiles the browser application, then embeds its JavaScript and extracted CSS into an
empty application document. Temporary build directories are removed. The only final artifact is:

```text
apps/docs/dist/index.html
```

The build fails if the output contains an external script or stylesheet, if more than one output
file is present, or if the application root contains prerendered component markers.

## Verify

```sh
npm run verify -w @exactjs/docs
```

This runs the package-local typecheck followed by the standalone production build.
The build also exercises mixed JSX ownership: explicitly React-owned demo
modules remain in the TypeScript project while the native eXact compiler passes
them to the React compatibility pipeline.

## Preview the production artifact

The standalone file supports direct `file://` opening, including hash navigation. A local HTTP preview is still useful because it matches GitHub Pages more closely:

```sh
npm run preview -w @exactjs/docs
```

Then open `http://127.0.0.1:4175/`.

## GitHub Pages

The `Publish Pages apps` workflow runs after every push to `main`, including a
merged pull request. It builds this standalone document and Sudoku, assembles
the Pages root, and publishes it to the `gh-pages` branch. The docs application
becomes `index.html`; Sudoku becomes `sudoku.html` with its PWA companions.

The application uses hash routing, so every documentation route can be opened
or refreshed on GitHub Pages without a rewrite rule. No base-path substitution
is required because the final page has no external script or stylesheet.
