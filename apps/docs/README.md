# eXact documentation app

This workspace contains the routed, client-only eXact documentation site. It is intentionally isolated from the framework packages: its source, build orchestration, and generated output all live under `apps/docs`.

## Develop

From the repository root:

```sh
npm run dev -w @exactjs/docs
```

Development uses Vite and falls back from an empty document to the normal client render. The production build additionally prerenders the initial documentation route and hydrates that existing markup.

## Build

```sh
npm run build -w @exactjs/docs
```

The build performs two eXact compilations:

1. A browser bundle containing routing, theme controls, search, demos, and hydration.
2. An SSR bundle used only during the build to render the initial route with hydration markers.

It then embeds the browser JavaScript and extracted CSS into the prerendered document. Temporary build directories are removed. The only final artifact is:

```text
apps/docs/dist/index.html
```

The build fails if the output contains an external script or stylesheet, if more than one output file is present, or if prerendered content and hydration markers are missing.

## Verify

```sh
npm run verify -w @exactjs/docs
```

This runs the package-local typecheck followed by the standalone production build.

## Preview the production artifact

The standalone file supports direct `file://` opening, including hash navigation. A local HTTP preview is still useful because it matches GitHub Pages more closely:

```sh
npm run preview -w @exactjs/docs
```

Then open `http://127.0.0.1:4175/`.

## GitHub Pages

Publish `apps/docs/dist` as the Pages artifact after running the build. The application uses hash routing, so every documentation route can be opened or refreshed on GitHub Pages without a rewrite rule. No base-path substitution is required because the final page has no external assets.

The repository-level Pages workflow is deliberately not included here: the implementation was scoped to this new package only.
