import type { Component } from '@exactjs/core';
import { Article, Callout } from './Article.jsx';

type PackageGroup = {
	/** @exact key */ title: string;
	intro: string;
	packages: { /** @exact key */ name: string; purpose: string }[];
};
const packageGroups: PackageGroup[] = [
	{
		title: 'Build an interface',
		intro: 'The small browser-facing center.',
		packages: [
			{
				name: '@exactjs/core',
				purpose: 'Components, state ownership, context, tasks, lifecycle, and errors.'
			},
			{
				name: '@exactjs/dom',
				purpose: 'Browser mounting, patching, events, refs, keyed reconciliation, and CSS units.'
			},
			{ name: '@exactjs/jsx', purpose: 'TypeScript JSX runtime entrypoints and namespace types.' }
		]
	},
	{
		title: 'Add web essentials',
		intro: 'Common application structure without a second component model.',
		packages: [
			{
				name: '@exactjs/router',
				purpose: 'Nested history/hash routing, links, outlets, and data operations.'
			},
			{
				name: '@exactjs/forms',
				purpose: 'Accessible field composition and synchronous or async validation.'
			},
			{
				name: '@exactjs/testing',
				purpose: 'Component mounting, accessible queries, events, state, and runner adapters.'
			}
		]
	},
	{
		title: 'Compile and deliver',
		intro: 'Tools that preserve eXact semantics across build targets.',
		packages: [
			{
				name: '@exactjs/compiler',
				purpose: 'Transforms, analysis, artifacts, manifests, sessions, and the exactc CLI.'
			},
			{ name: '@exactjs/vite-plugin', purpose: 'Vite integration over the shared compiler.' },
			{
				name: '@exactjs/webpack-plugin',
				purpose: 'Webpack resolution, conditions, and transform integration.'
			},
			{ name: '@exactjs/bun-plugin', purpose: 'Bun transform and resolution hooks.' },
			{
				name: '@exactjs/bun-test',
				purpose: 'Bun-native compiler preload, DOM setup, component tests, and matchers.'
			}
		]
	},
	{
		title: 'Cross the server boundary',
		intro: 'Rendering and secure distributed work.',
		packages: [
			{
				name: '@exactjs/ssr',
				purpose: 'String, document, and progressive rendering with hydration markers.'
			},
			{
				name: '@exactjs/hydrate',
				purpose: 'DOM adoption, client operations, and safe server patch application.'
			},
			{ name: '@exactjs/server', purpose: 'Manifest-allowlisted actions and refresh handling.' }
		]
	},
	{
		title: 'Extend and interoperate',
		intro: 'Cross-cutting packages that participate in more than one host.',
		packages: [
			{
				name: '@exactjs/plugin-api',
				purpose:
					'Versioned declarations for configuration, compiler, runtime, output, and lifecycle extensions.'
			},
			{
				name: '@exactjs/plugin-host',
				purpose:
					'Package discovery, ordered configuration, validation, projections, and plugin lifecycle.'
			},
			{
				name: '@exactjs/microfrontends',
				purpose:
					'Remote exposure builds, trusted bindings, logical remote roots, and deployment recovery.'
			},
			{
				name: '@exactjs/secrets',
				purpose:
					'Secret providers, server lifecycle, compiler qualification, and audited consumption.'
			},
			{
				name: '@exactjs/react-compat',
				purpose:
					'React 18/19 compatibility runtimes, build transforms, package adapters, and interop.'
			},
			{
				name: '@exactjs/react-dom-compat',
				purpose: 'React DOM-compatible client, server, and static entrypoints.'
			}
		]
	}
];

export function PackagesPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Explore"
			title="Find the package that owns the job"
			description="The package surface is broad because platform boundaries are explicit. Most browser applications begin with only core, DOM, JSX, and the compiler integration."
			previous={{ path: '/advanced', label: 'Beyond the browser' }}
		>
			{packageGroups.map((group) => (
				<section className="package-group">
					<h2>{group.title}</h2>
					<p>{group.intro}</p>
					<div className="package-list">
						{group.packages.map((item) => (
							<div>
								<code>{item.name}</code>
								<span>{item.purpose}</span>
							</div>
						))}
					</div>
				</section>
			))}
			<Callout title="Living examples" tone="tip">
				<p>
					The repository also includes Kanban, Workbench, Shipping Calculator, server-component, and
					microfrontend applications. They are executable companions to these guides.
				</p>
			</Callout>
		</Article>
	);
}
