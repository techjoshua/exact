# @exactjs/create-exact-app

Interactive scaffolder for a new eXact application.

```sh
npm create @exactjs/exact-app@latest
```

The CLI asks for:

- Vite, Webpack, or Bun compiler integration
- Browser-only, Fetch, Node, Express, Fastify, Hapi, Koa, Bun, Deno, Cloudflare, or generic
  serverless runtime wiring
- Vitest, Jest, Bun's native test runner, or no test runner
- Optional installation of the portable eXact Agent Skill in `.agents/skills`
- Optional dependency installation

For repeatable automation, pass the choices as flags:

```sh
npm create @exactjs/exact-app@latest my-app -- \
	--bundler vite \
	--runtime hapi \
	--test-runner vitest \
	--skill \
	--no-install
```

The target directory must be empty, apart from an existing `.git` directory. Generated projects
use the public `@exactjs` package scope and contain a minimal reactive component, build
configuration, optional server endpoint, and runner-appropriate component test.

Generated applications use TypeScript 7 for editor and command-line type-checking. The eXact
compiler and integrations bring their own aliased TypeScript 6 compatibility API, because
TypeScript 7.0 does not expose a programmatic compiler API. The two versions are intentionally
installed side-by-side and do not require application code to use an older type-checker.
