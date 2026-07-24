import type { Component } from '@exactjs/core';
import { Article, Callout } from './Article.jsx';

type IntegrationStatus = {
	/** @exact key */
	name: string;
	status: string;
	package: string;
	coverage: string;
	boundary: string;
};

const buildIntegrations: IntegrationStatus[] = [
	{
		name: 'Vite 5–8',
		status: 'First-class',
		package: '@exactjs/vite-plugin',
		coverage:
			'Compiler transforms, HMR, JSX configuration, target conditions, and plugin integration.',
		boundary: 'The recommended default and the most complete development-server integration.'
	},
	{
		name: 'Webpack 5',
		status: 'Supported',
		package: '@exactjs/webpack-plugin',
		coverage:
			'Compiler loader, source maps, resolver conditions, diagnostics, and React compatibility.',
		boundary: 'Webpack configuration continues to own serving and the surrounding asset pipeline.'
	},
	{
		name: 'Bun 1.3+',
		status: 'Native and tested',
		package: '@exactjs/bun-plugin',
		coverage:
			'Native Bun.build transforms, target conditions, source maps, and plugin composition.',
		boundary: 'Build integration is separate from the Bun.serve runtime adapter.'
	},
	{
		name: 'Precompiled output',
		status: 'Portable fallback',
		package: '@exactjs/compiler',
		coverage: 'The exactc CLI emits compiled JavaScript before another tool consumes it.',
		boundary: 'You must configure asset handling, export conditions, and client/server entrypoints.'
	}
];

const runtimeIntegrations: IntegrationStatus[] = [
	{
		name: 'Browser only',
		status: 'First-class',
		package: '@exactjs/dom',
		coverage:
			'Client rendering, routing, forms, tasks, and component testing need no server adapter.',
		boundary: 'Server rendering, server tasks, actions, and refreshes are unavailable.'
	},
	{
		name: 'Fetch API',
		status: 'Portable foundation',
		package: '@exactjs/fetch-adapter',
		coverage: 'Standard Request-to-Response handler used by Fetch-compatible hosts.',
		boundary:
			'The host still owns routing, deployment hooks, document responses, and static assets.'
	},
	{
		name: 'Node HTTP',
		status: 'Supported',
		package: '@exactjs/node-adapter',
		coverage: 'Normalizes node:http requests, responses, streaming, and disconnect cancellation.',
		boundary: 'A low-level endpoint handler rather than an application server.'
	},
	{
		name: 'Express',
		status: 'Supported',
		package: '@exactjs/express-adapter',
		coverage: 'Middleware bridge for parsed requests and Express response methods.',
		boundary: 'The application owns body parsing and route registration.'
	},
	{
		name: 'Fastify',
		status: 'Supported',
		package: '@exactjs/fastify-adapter',
		coverage: 'Route handler bridge for Fastify requests and replies.',
		boundary: 'The application owns JSON parsing and route registration.'
	},
	{
		name: 'Koa',
		status: 'Supported',
		package: '@exactjs/koa-adapter',
		coverage: 'Middleware bridge that delegates unmatched requests to downstream middleware.',
		boundary: 'The application owns route ordering, document rendering, and assets.'
	},
	{
		name: 'Hapi 21',
		status: 'Native plugin and tested',
		package: '@exactjs/hapi-adapter',
		coverage:
			'Real Hapi registration tests, route limits, streaming conversion, and disconnect handling.',
		boundary:
			'The plugin mounts the eXact endpoint; application GET routes and assets remain yours.'
	},
	{
		name: 'Bun 1.3+',
		status: 'Native and tested',
		package: '@exactjs/bun-adapter',
		coverage: 'Bun.serve handler with integration coverage in the Bun runtime.',
		boundary: 'Use @exactjs/bun-plugin separately when Bun also performs the build.'
	},
	{
		name: 'Deno',
		status: 'Adapter available',
		package: '@exactjs/deno-adapter',
		coverage: 'Deno.serve signature over the portable Fetch handler.',
		boundary:
			'The contract is tested outside Deno; a Deno-native integration suite is still missing.'
	},
	{
		name: 'Cloudflare Workers',
		status: 'Adapter available',
		package: '@exactjs/cloudflare-adapter',
		coverage: 'Worker fetch signature with env and execution context forwarded to server work.',
		boundary: 'A Workers-native deployment or Miniflare integration suite is still missing.'
	},
	{
		name: 'Generic serverless',
		status: 'Adapter available',
		package: '@exactjs/serverless-adapter',
		coverage: 'AWS Lambda/API Gateway-style event and response conversion.',
		boundary:
			'Responses are buffered; provider-specific streaming and lifecycle APIs are not abstracted.'
	}
];

function StatusTable(
	this: Component<{}>,
	props: { caption: string; integrations: IntegrationStatus[] }
) {
	return () => (
		<div className="table-scroll">
			<table>
				<caption>{props.caption}</caption>
				<thead>
					<tr>
						<th>Host</th>
						<th>Status</th>
						<th>Package</th>
						<th>What is covered</th>
						<th>Current boundary</th>
					</tr>
				</thead>
				<tbody>
					{props.integrations.map((integration) => (
						<tr>
							<td>
								<strong>{integration.name}</strong>
							</td>
							<td>{integration.status}</td>
							<td>
								<code>{integration.package}</code>
							</td>
							<td>{integration.coverage}</td>
							<td>{integration.boundary}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export function RuntimesPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Start here"
			title="Choose a supported build and runtime"
			description="eXact separates the tool that compiles components from the host that serves them. This matrix shows what is available today, how deeply each integration is exercised, and where application-owned wiring begins."
			previous={{ path: '/getting-started', label: 'Quick start' }}
			next={{ path: '/learn/components', label: 'Components' }}
		>
			<Callout title="Two choices, not one" tone="tip">
				<p>
					A compiler integration handles TSX and client/server artifacts. A runtime adapter connects
					eXact actions and refreshes to an HTTP host. For example, an application can build with
					Vite and serve through Hapi, or use Bun for both jobs with two separate packages.
				</p>
			</Callout>

			<section>
				<h2>Compiler and bundler integrations</h2>
				<p>
					Every eXact application must run the compiler. A first-class or supported plugin embeds it
					in the host build; <code>exactc</code> remains the escape hatch for other pipelines.
				</p>
				<StatusTable caption="Build integration status" integrations={buildIntegrations} />
			</section>

			<section>
				<h2>Browser and server runtimes</h2>
				<p>
					Runtime adapters are deliberately transport layers. Protocol validation, action dispatch,
					refresh handling, and request limits stay centralized in <code>@exactjs/server</code>{' '}
					instead of being reimplemented by every framework.
				</p>
				<StatusTable caption="Runtime integration status" integrations={runtimeIntegrations} />
			</section>

			<section>
				<h2>What “supported” means here</h2>
				<p>
					Every listed package has a public API, TypeScript declarations, focused tests, and a
					scaffolder option where applicable. “Native and tested” additionally means the repository
					exercises the real host runtime or framework. “Adapter available” means the platform
					signature is implemented over a shared standards contract, but native-host integration
					coverage is still a known gap.
				</p>
			</section>

			<section>
				<h2>Integrations not yet provided</h2>
				<p>
					There are no dedicated Rollup, esbuild, Rspack, or Parcel plugins today. Those pipelines
					can consume <code>exactc</code> output, but they do not yet receive automatic target
					conditions, asset coordination, HMR behavior, or eXact diagnostics from a native plugin.
					Provider-specific adapters for platforms such as Vercel Functions, Netlify Functions, and
					individual AWS streaming modes are also future integration work; use the Fetch or generic
					serverless adapter only when its documented request and response model fits.
				</p>
			</section>
		</Article>
	);
}
