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
			'Native Bun.build transforms, target conditions, source maps, and plugin composition.',
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
		coverage: 'Hapi registration, route limits, streaming conversion, and disconnect handling.',
		application:
			'The plugin mounts the eXact endpoint; application GET routes and assets remain yours.'
	},
	{
		name: 'Bun 1.3+',
		package: '@exactjs/bun-adapter',
		coverage: 'Bun.serve handler with native text and streaming SSR output.',
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
				<p>
					The default development and CI runtimes are Node.js 26 and Bun 1.4.2. Node.js 24 remains
					supported and is included in the compatibility matrix.
				</p>
				<p>
					Node 26.8.1 bundles Undici 8.10.0. Its fetch client schedules idle HTTP/1.1 socket
					validation through a zero-delay timer. On Windows hosts with coarse timer resolution, this
					can add roughly 15 ms to sequential keep-alive requests. Bun's native fetch client does
					not use that Undici path. See the{' '}
					<a href="https://github.com/nodejs/undici/pull/5606">upstream scheduling change</a>. Burst
					completion also includes application data fetching. Its latency distribution should not be
					read as rendering time alone.
				</p>
				<h2>Compiler and bundler integrations</h2>
				<p>
					Every eXact application must run the compiler. A first-class or supported plugin embeds it
					in the host build; <code>exactc</code> remains the escape hatch for other pipelines. All
					four routes use the same persistent native compiler and expose no alternate backend. A
					direct compiler call without a target emits a client artifact; select <code>server</code>{' '}
					explicitly or request paired artifacts when producing server output.
				</p>
				<p>
					Native source maps are composed through mapped host transforms. Framework-generated
					regions stay unmapped, and adapter recovery maps follow matching token positions instead
					of guessing that generated and authored line numbers still correspond.
				</p>
				<IntegrationTable caption="Build integrations" integrations={buildIntegrations} />
				<p>
					Bun remote builds publish their actual entry URLs through <code>onRemoteEntries</code>.
					Use those URLs instead of predicting filenames. <code>exactBuild()</code> normalizes an
					asset prefix such as <code>/assets</code> to <code>/assets/</code> for linked chunks.
				</p>
				<p>
					An SSR-only server entry can set <code>renderMode: 'server-render'</code> to omit
					continuation-dispatch executors. Keep the default server mode when the same bundle also
					handles continuation requests.
				</p>
				<p>
					A Vite development server can use one <code>exact()</code> plugin for hydrated browser
					modules and middleware SSR. Vite SSR module requests automatically receive the paired
					server compilation target, including native components imported from generated{' '}
					<code>.exact.server</code> modules. The plugin keeps installed eXact packages in the SSR
					module graph so configured enhancements render on the server in development too; no manual
					catalog registration or framework-specific externalization setting is needed.
				</p>
				<p>
					Bun and Webpack server builds apply component-library authorization before loading an
					enhancement provider, including concurrent imports. An explicitly excluded optional
					enhancement leaves the authored content in place without executing the provider. Published
					component libraries resolve optional enhancements in the consuming application with all
					three build adapters. A missing optional provider remains inactive; an invalid installed
					provider produces an error. Local components within the application package remain
					application-owned and need no component-library authorization entry.
				</p>
				<p>
					Bun component tests use <code>@exactjs/bun-test</code> with{' '}
					<code>bun --conditions=browser test</code>. The browser condition selects DOM-facing
					compiled artifacts before Bun executes the test preload.
				</p>
				<h3>Deliver one offline browser file</h3>
				<p>
					Use <code>plugins: [exactSingleFile()]</code> from <code>@exactjs/vite-plugin</code>
					instead of <code>exact()</code> for one HTML entry. The build embeds imported assets and
					folds dynamic imports into its script. Use hash navigation for <code>file:</code> URLs.
					External CSS or modules, unresolved assets, separate worker files, and server operations
					produce build errors. Application network features remain explicit opt-ins.
				</p>

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
				<p>
					Precompiled Node applications can load the React compatibility adapter with{' '}
					<code>node --import @exactjs/react-compat/register</code>. It uses synchronous module
					hooks when available, with an asynchronous fallback for older Node hosts.
				</p>
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
