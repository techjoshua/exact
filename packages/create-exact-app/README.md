# @exactjs/create-exact-app

Interactive project scaffolder for eXact applications.

## Create an application

```sh
npm create @exactjs/exact-app@latest
```

Use version 0.5.1 or newer for the corrected standalone installation and build flow.

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

Generated projects use `exactc --check .` for no-emit application checking. This checks ordinary
TypeScript as well as the lowered representation of compiler-owned TSX syntax.

## Check and build

After installation, run `npm run typecheck`, `npm test` (if tests were selected), and
`npm run build`. The browser output is in `dist/`; Vite also provides `npm run preview`.
`npm run dev` serves the browser app. With Bun, refresh after source edits are rebuilt.

Selecting a server runtime adds a transport endpoint example, not a complete SSR deployment.
Connect compiler-generated server contracts and configure page rendering, assets, and hosting
for the chosen platform. The generated README identifies any separate server command.

[Documentation](https://techjoshua.github.io/exact/#/getting-started) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/packages/create-exact-app)
