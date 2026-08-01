# eXact documentation app

The public documentation site for learning and evaluating eXact.

## Run locally

```sh
npm run dev -w @exactjs/docs
```

The site uses hash routing and runs as a client-only eXact application.

## Build and preview

```sh
npm run build -w @exactjs/docs
npm run preview -w @exactjs/docs
```

The build produces a self-contained `apps/docs/dist/index.html` suitable for GitHub Pages or
direct local opening. Use `npm run verify -w @exactjs/docs` to run its typecheck and production
build together.

The documentation covers components, reactivity, tasks, forms, routing, server execution, React
compatibility, language tools, DevTools, plugins, and deployment examples.
