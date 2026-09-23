import type { CreateExactAppOptions } from './project-generation.js';

/** Describes the generated output and its platform-owned deployment boundary. */
export function generatedReadme(options: CreateExactAppOptions): string {
	const server = options.output === 'server' && !options.operationsOnly;
	const single = options.output === 'single-file';
	return `# ${options.name}

An eXact application. Components own durable state; mutate \`this.state\` directly.

## Development

\`\`\`sh
npm install
npm run typecheck
npm run dev
\`\`\`

Edit \`src/App.tsx\`. ${server ? 'The development server renders HTML and serves the continuation endpoint at `/__exact` on port 3000. Source edits regenerate the reachable component graph and reload the page. The owned development process closes Vite and its compiler when stopped.' : 'The development server serves the browser application.'}
${options.testRunner === 'none' ? '' : '\nRun `npm test` for the starter component test.\n'}

## Build and run

\`\`\`sh
npm run build
${server ? (options.runtime === 'fetch' || options.runtime === 'serverless' ? '# Connect dist/server/server.js to the selected host' : 'npm start') : single ? '# Open dist/index.html directly from disk' : options.bundler === 'vite' ? 'npm run preview' : '# Serve dist/ with a static HTTP server'}
\`\`\`

${
	server
		? `The client assets are in \`dist/client\`; the compiled host entry is \`dist/server/server.js\`.
The default Node host serves the generated assets, document shell, hydrated application, and server tasks.
\`src/application.tsx\` owns the document and request rendering. Generated registration under \`.exact\`
is recreated by \`npm run generate\` and must not be edited. Public framework bootstrap discovers
its configuration alongside the application root.

The selected deployment runtime is **${options.runtime}**. Fetch and serverless entries are exported
handlers, so connect them to your platform and serve \`dist/client\` through its static asset host.
Cloudflare uses the generated ASSETS binding. Bun and Deno hosts serve the emitted asset allowlist.
Local development uses the Node adapter for every runtime. Test platform-specific bindings in the
chosen platform's emulator before deployment.

For the Node host, build and run the included container:

\`\`\`sh
docker build -t ${options.name.replaceAll('/', '-').replace('@', '')} .
docker run --rm -p 3000:3000 ${options.name.replaceAll('/', '-').replace('@', '')}
\`\`\`

The container example targets Node. Adapt the launch command and base image for other hosts.
Commit your lockfile and use \`npm ci\` for reproducible deployments.

## Source workspace packages

Declare sibling packages as normal workspace dependencies. A package exporting ordinary TypeScript
can be bundled by adding its name to \`ssr.noExternal\` in \`vite.server.config.ts\`, for example
\`ssr: { noExternal: ['@my-app/shared'] }\`. Keep other dependencies external by default.
For eXact component libraries, use the component-library packaging contract so client and server
artifacts retain the same identity. Restart the dev server after changing workspace package exports.
`
		: single
			? `The build emits exactly one \`dist/index.html\`, with scripts, styles, imported images, and fonts
embedded. Dynamic imports are folded into the script. Open it through a \`file:\` URL with networking
disabled to verify the offline baseline. Use hash navigation, not server path routing.

Import assets through Vite rather than referencing public-directory URLs. External module imports,
remote CSS, unresolved asset URLs, separate worker files, and server operations are rejected.
Network features such as fetch remain application-owned opt-ins. Browser permissions, secure-context
APIs, storage, and service workers may behave differently or be unavailable under \`file:\` URLs.
`
			: `The browser output is in \`dist/\`. Serve it with a static HTTP server.
${options.operationsOnly ? 'This project explicitly opts out of SSR. `src/server.ts` is a separate transport endpoint; connect your generated operation contract and run the platform host independently.' : ''}
`
}
The application checker is \`exactc --check\`, which checks compiler-owned TSX and ordinary TypeScript.

[Documentation](https://techjoshua.github.io/exact/#/getting-started)
`;
}
