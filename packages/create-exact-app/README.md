# @exactjs/create-exact-app

Interactive project scaffolder for eXact applications.

## Create an application

```sh
npm create @exactjs/exact-app@latest
```

The SSR and single-file outputs target the 0.6.0 package family (currently an unpublished candidate).

The CLI can configure Vite, Webpack, or Bun; browser-only or server runtime adapters; Vitest, Jest,
or Bun tests; optional React compatibility; dependency installation; and the portable eXact agent
skill. The generated skill lives in `.agents/skills/exact-web-development`. For Claude Code,
expose it through `.claude/skills/exact-web-development` using the
[agent skill installation guide](https://github.com/techjoshua/exact/tree/main/agents/exact-skill#claude-code).

## Automated use

```sh
npm create --yes @exactjs/exact-app@latest my-app -- \
	--bundler vite \
	--runtime hapi \
	--test-runner vitest \
	--react 19 \
	--skill --yes
```

The first `--yes` accepts npm's package-download prompt; the last accepts scaffolder defaults.
Add `--no-install` to generate files without installing dependencies.

Run with `--help` for all flags. The target directory must be empty apart from an optional
`.git` directory.

Generated projects use `exactc --check --project tsconfig.json` for no-emit application checking. This checks ordinary
TypeScript as well as the lowered representation of compiler-owned TSX syntax.

## Check and build

After installation, run `npm run typecheck`, `npm test` (if tests were selected), and
`npm run build`. The browser output is in `dist/`; Vite also provides `npm run preview`.
`npm run dev` serves the browser app. With Bun, refresh after source edits are rebuilt.

A Vite server runtime defaults to SSR plus hydration, generated registration, a continuation
endpoint, assets, and a production host. Run `npm start` after building; Node output includes a
container example and source-workspace guidance. Fetch and serverless outputs export deployment
handlers. Local development uses Node; validate platform bindings in the selected runtime.
Use `--operations-only` for a transport-only starter, including Webpack or Bun server projects.
The CLI rejects unsupported SSR selections early and explains which flags to use.
`--yes` accepts the runtime-based delivery default without prompting.

For one offline browser file, use `--output single-file --runtime browser --bundler vite`.
Open `dist/index.html` directly. Scripts, styles, imported images, and fonts are embedded; use
hash navigation. Import assets through Vite. Unresolved assets, remote CSS/modules, separate workers,
and server operations are rejected. File-origin browser API limits still apply.

See the [scaffolding reference](https://github.com/techjoshua/exact/blob/main/docs/application-scaffolding.md)
for output contracts and deployment boundaries.

[Documentation](https://techjoshua.github.io/exact/#/getting-started) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/packages/create-exact-app)
