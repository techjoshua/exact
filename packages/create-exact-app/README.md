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
- Optional React 18 or React 19 component compatibility
- Optional installation of the portable eXact Agent Skill in `.agents/skills`
- Optional dependency installation

For repeatable automation, pass the choices as flags:

```sh
npm create @exactjs/exact-app@latest my-app -- \
	--bundler vite \
	--runtime hapi \
	--test-runner vitest \
	--react 19 \
	--skill \
	--no-install
```

The target directory must be empty, apart from an existing `.git` directory. Generated projects
use the public `@exactjs` package scope and contain a minimal reactive component, build
configuration, optional server endpoint, and runner-appropriate component test.

Generated applications use TypeScript 7 for editor and command-line type-checking. The eXact
compiler is a small JavaScript host package plus one npm-selected native binary for the current
operating system and architecture. It does not install or expose the retired JavaScript compiler.
