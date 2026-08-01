import type { Component } from '@exactjs/core';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

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
				purpose:
					'Components, state ownership, context, function-defined tasks, interactions, finite registries, lifecycle, and errors.'
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
				purpose:
					'Nested routing, links, outlets, data operations, and interaction-coordinated navigation.'
			},
			{
				name: '@exactjs/forms',
				purpose: 'Accessible fields, validation, external errors, and coordinated submission state.'
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
				purpose:
					'Native compilation and narrow build products for tasks, registrations, placement, and the exactc CLI.'
			},
			{
				name: '@exactjs/language-server',
				purpose:
					'No-emit compiler workspace ownership and standard LSP projections for eXact semantics.'
			},
			{
				name: '@exactjs/vscode',
				purpose:
					'VS Code startup, trust, semantic presentation, region markers, and component views.'
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
				purpose:
					'DOM adoption, operation results, registry identity recovery, and safe server patch application.'
			},
			{
				name: '@exactjs/server',
				purpose: 'Opaque allowlisted task continuations, refreshes, and transport validation.'
			}
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

/** Maps public eXact packages to their owned framework responsibilities. */
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
			<Callout title="Platform packages are selected, not bundled together">
				<p>
					<code>@exactjs/compiler</code> declares six optional target packages so npm can select the
					one matching macOS, Linux, or Windows on ARM64 or x64. The JavaScript host tarball
					contains no native executables, and a normal install receives only one matching binary
					package.
				</p>
			</Callout>
		</Article>
	);
}
