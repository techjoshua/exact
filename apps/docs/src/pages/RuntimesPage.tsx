import type { Component } from '@exactjs/core';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';
import { CodeBlock } from '../CodeBlock.jsx';

const pairedViteBuildSource = `import { buildExactViteApplication } from '@exactjs/vite-plugin/build';

await buildExactViteApplication([
  'vite.config.ts',
  'vite.server.config.ts'
]);`;

type Integration = {
	/** @exact key */
	name: string;
	package: string;
	coverage: string;
	application: string;
};

const buildIntegrations: Integration[] = [
	{
		name: 'Vite 5–8',
		package: '@exactjs/vite-plugin',
		coverage:
			'Compiler transforms, HMR, JSX configuration, target conditions, and plugin integration.',
		application: 'Configure the Vite development server, assets, and application entry points.'
	},
	{
		name: 'Webpack 5',
		package: '@exactjs/webpack-plugin',
		coverage:
			'Compiler loader, source maps, resolver conditions, compiler feedback, and React compatibility.',
		application: 'Configure serving and the surrounding Webpack asset pipeline.'
	},
	{
		name: 'Bun 1.3+',
		package: '@exactjs/bun-plugin',
		coverage:
			'Native Bun.build transforms, target conditions, source maps, and plugin composition, exercised in Bun CI.',
		application: 'Add @exactjs/bun-adapter separately when Bun also serves the application.'
	},
	{
		name: 'Precompiled output',
		package: '@exactjs/compiler',
		coverage: 'The native exactc CLI emits compiled JavaScript before another tool consumes it.',
		application:
			'The surrounding pipeline must configure asset handling, export conditions, and client/server entrypoints.'
	}
];

const runtimeIntegrations: Integration[] = [
	{
		name: 'Browser only',
		package: '@exactjs/dom',
		coverage:
			'Client rendering, routing, forms, tasks, and component testing need no server adapter.',
		application: 'Use a server adapter when the application needs SSR, server tasks, or refreshes.'
	},
	{
		name: 'Fetch API',
		package: '@exactjs/fetch-adapter',
		coverage: 'Standard Request-to-Response handler used by Fetch-compatible hosts.',
		application:
			'The host still owns routing, deployment hooks, document responses, and static assets.'
	},
	{
		name: 'Node HTTP',
		package: '@exactjs/node-adapter',
		coverage: 'Normalizes node:http requests, responses, streaming, and disconnect cancellation.',
		application:
			'Register the endpoint and provide document routes, assets, and application policy.'
	},
	{
		name: 'Express',
		package: '@exactjs/express-adapter',
		coverage: 'Middleware bridge for parsed requests and Express response methods.',
		application: 'Configure body parsing and register the eXact route.'
	},
	{
		name: 'Fastify',
		package: '@exactjs/fastify-adapter',
		coverage: 'Route handler bridge for Fastify requests and replies.',
		application: 'Configure JSON parsing and register the eXact route.'
	},
	{
		name: 'Koa',
		package: '@exactjs/koa-adapter',
		coverage: 'Middleware bridge that delegates unmatched requests to downstream middleware.',
		application: 'Own route ordering, document rendering, and static assets.'
	},
	{
		name: 'Hapi 21',
		package: '@exactjs/hapi-adapter',
		coverage:
			'Real Hapi registration tests, route limits, streaming conversion, and disconnect handling.',
		application:
			'The plugin mounts the eXact endpoint; application GET routes and assets remain yours.'
	},
	{
		name: 'Bun 1.3+',
		package: '@exactjs/bun-adapter',
		coverage: 'Bun.serve handler with release-gating integration coverage in the Bun runtime.',
		application: 'Add @exactjs/bun-plugin separately when Bun also performs the build.'
	},
	{
		name: 'Deno',
		package: '@exactjs/deno-adapter',
		coverage: 'Deno.serve signature over the portable Fetch handler.',
		application:
			'The contract is tested outside Deno; a Deno-native integration suite is still missing.'
	},
	{
		name: 'Cloudflare Workers',
		package: '@exactjs/cloudflare-adapter',
		coverage: 'Worker fetch signature with env and execution context forwarded to server work.',
		application: 'Provide deployment configuration; native Workers integration coverage is pending.'
	},
	{
		name: 'Generic serverless',
		package: '@exactjs/serverless-adapter',
		coverage: 'AWS Lambda/API Gateway-style event and response conversion.',
		application:
			'Responses are buffered; provider-specific streaming and lifecycle APIs are not abstracted.'
	}
];

function IntegrationTable(
	this: Component<{}>,
	props: { caption: string; integrations: Integration[] }
) {
	return () => (
		<div className="integration-table">
			<table>
				<caption>{props.caption}</caption>
				<thead>
					<tr>
						<th>Host</th>
						<th>Package</th>
						<th>What it handles</th>
						<th>What you provide</th>
					</tr>
				</thead>
				<tbody>
					{props.integrations.map((integration) => (
						<tr>
							<td data-label="Host">
								<strong>{integration.name}</strong>
							</td>
							<td data-label="Package">
								<code>{integration.package}</code>
							</td>
							<td data-label="What it handles">{integration.coverage}</td>
							<td data-label="What you provide">{integration.application}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

/** Reports current support depth and limitations for bundlers and runtime adapters. */
export function RuntimesPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Start here"
			title="Build and run eXact your way"
			description="Choose the compiler integration that fits your toolchain and the runtime adapter that fits your host. The two decisions remain independent."
			previous={{ path: '/getting-started', label: 'Quick start' }}
			next={{ path: '/learn/components', label: 'Components' }}
		>
			<Callout title="Choose a compiler host and server runtime" tone="tip">
				<p>
					A compiler integration handles TSX and client/server artifacts. A runtime adapter connects
					eXact task invocations and refreshes to an HTTP host. For example, an application can
					build with Vite and serve through Hapi, or use Bun for both jobs with two separate
					packages.
				</p>
			</Callout>

			<section>
				<h2>Compiler and bundler integrations</h2>
				<p>
					Every eXact application must run the compiler. A first-class or supported plugin embeds it
					in the host build; <code>exactc</code> remains the escape hatch for other pipelines. All
					four routes use the same persistent native compiler and expose no alternate backend.
				</p>
				<p>
					Native source maps are composed through mapped host transforms. Framework-generated
					regions stay unmapped, and adapter recovery maps follow matching token positions instead
					of guessing that generated and authored line numbers still correspond.
				</p>
				<IntegrationTable caption="Build integrations" integrations={buildIntegrations} />
				<h3>Build paired Vite targets together</h3>
				<p>
					When an application has separate browser and server Vite configs, build them in one
					process. The two emissions then reuse one native compiler project generation instead of
					starting and analyzing the project twice.
				</p>
				<CodeBlock source={pairedViteBuildSource} language="ts" title="build.mjs" />
			</section>

			<section>
				<h2>Browser and server runtimes</h2>
				<p>
					Runtime adapters are deliberately transport layers. Protocol validation, operation
					dispatch, refresh handling, and request limits stay centralized in
					<code>@exactjs/server</code> instead of being reimplemented by every framework.
				</p>
				<IntegrationTable caption="Runtime integrations" integrations={runtimeIntegrations} />
			</section>

			<section>
				<h2>Integrations not yet provided</h2>
				<p>
					There are no dedicated Rollup, esbuild, Rspack, or Parcel plugins today. Those pipelines
					can consume <code>exactc</code> output, but they do not yet receive automatic target
					conditions, asset coordination, HMR behavior, or compiler feedback from a native plugin.
					Provider-specific adapters for platforms such as Vercel Functions, Netlify Functions, and
					individual AWS streaming modes are also future integration work; use the Fetch or generic
					serverless adapter only when its documented request and response model fits.
				</p>
				<p>
					Runtime support is designed to be extended. <code>@exactjs/server</code> handles the eXact
					protocol, validation, dispatch, refreshes, and request lifecycle. Each adapter translates
					its host&apos;s request, response, streaming, and cancellation conventions into that
					shared contract. Fetch-compatible environments require especially little adaptation, so
					adding support for another runtime generally means building and testing a small host
					bridge rather than reimplementing eXact&apos;s server behavior.
				</p>
			</section>
		</Article>
	);
}
