import type { ComponentFunction } from '@exactjs/core';
import { AdvancedPage } from './pages/AdvancedPage.jsx';
import { AsyncInterfacesPage } from './pages/AsyncInterfacesPage.jsx';
import { ComparisonPage } from './pages/ComparisonPage.jsx';
import { ComponentsPage } from './pages/ComponentsPage.jsx';
import { FormsPage } from './pages/FormsPage.jsx';
import { GettingStartedPage } from './pages/GettingStartedPage.jsx';
import { IntroductionPage } from './pages/IntroductionPage.jsx';
import { ListsPage } from './pages/ListsPage.jsx';
import { LogoLabPage } from './pages/LogoLabPage.jsx';
import { MicrofrontendsPluginPage } from './pages/MicrofrontendsPluginPage.jsx';
import { PackagesPage } from './pages/PackagesPage.jsx';
import { PluginsPage } from './pages/PluginsPage.jsx';
import { ReactCompatibilityPage } from './pages/ReactCompatibilityPage.jsx';
import { RoutingPage } from './pages/RoutingPage.jsx';
import { RuntimesPage } from './pages/RuntimesPage.jsx';
import { SecretsPluginPage } from './pages/SecretsPluginPage.jsx';
import { ServerExecutionPage } from './pages/ServerExecutionPage.jsx';
import { StatePage } from './pages/StatePage.jsx';
import { TasksPage } from './pages/TasksPage.jsx';
import { TestingPage } from './pages/TestingPage.jsx';

/** Describes one routable and searchable documentation article. */
export type DocPage = {
	/** @exact key */
	path: string;
	label: string;
	summary: string;
	keywords: string;
	component: ComponentFunction<any, any>;
};

/** Groups related documentation pages under one navigation heading. */
export type DocGroup = {
	/** @exact key */
	label: string;
	pages: DocPage[];
};

/** Ordered documentation navigation and route metadata. */
export const docGroups: DocGroup[] = [
	{
		label: 'Start here',
		pages: [
			{
				path: '/',
				label: 'Introduction',
				summary:
					'Why eXact runs component setup once, keeps state inspectable, and compiles precise client/server updates.',
				keywords:
					'overview component compiler reactive TypeScript JSX React Vue Svelte comparison state virtual DOM',
				component: IntroductionPage
			},
			{
				path: '/getting-started',
				label: 'Quick start',
				summary: 'Scaffold and run an eXact application with compatible package versions.',
				keywords: 'create exact app install scaffold vite runtime test runner agent skill',
				component: GettingStartedPage
			},
			{
				path: '/runtimes',
				label: 'Runtimes & integrations',
				summary: 'Compare the current support depth for compiler hosts and deployment runtimes.',
				keywords:
					'runtime adapter integration status Vite Webpack Bun Node Express Fastify Hapi Koa Deno Cloudflare serverless Fetch',
				component: RuntimesPage
			}
		]
	},
	{
		label: 'Learn',
		pages: [
			{
				path: '/learn/components',
				label: 'Components',
				summary: 'Instances, props, events, and lifecycle.',
				keywords: 'component props lifecycle refs events',
				component: ComponentsPage
			},
			{
				path: '/learn/state',
				label: 'State & derived values',
				summary: 'Direct state with precise reactive updates.',
				keywords: 'state reactive computed derived batch',
				component: StatePage
			},
			{
				path: '/learn/lists',
				label: 'Keyed lists',
				summary: 'Keep identity stable while collections move.',
				keywords: 'list map key reorder identity',
				component: ListsPage
			},
			{
				path: '/learn/tasks',
				label: 'Tasks & cleanup',
				summary: 'Own asynchronous work with the component.',
				keywords: 'task async abort signal cleanup effects',
				component: TasksPage
			},
			{
				path: '/learn/async-interfaces',
				label: 'Suspense, Activity & scheduling',
				summary:
					'Await task values, coordinate readiness, retain inactive trees, and schedule deferred work.',
				keywords:
					'async await task Suspense Activity parked background deferred blocking scheduling readiness cancellation',
				component: AsyncInterfacesPage
			},
			{
				path: '/learn/server-execution',
				label: 'Server execution',
				summary:
					'Understand distributed component continuations, SSR resumption, and server-only dependency isolation.',
				keywords:
					'server task continuation state machine C# async SSR hydration context Apollo TanStack bundle shared secret',
				component: ServerExecutionPage
			}
		]
	},
	{
		label: 'Build for the web',
		pages: [
			{
				path: '/guides/routing',
				label: 'Routing',
				summary: 'Nested routes for browsers and servers.',
				keywords: 'router route link outlet hash history',
				component: RoutingPage
			},
			{
				path: '/guides/forms',
				label: 'Accessible forms',
				summary:
					'Bind native inputs and compose accessible validation without surrendering your data.',
				keywords: 'form input binding value change checked field validation label accessible',
				component: FormsPage
			},
			{
				path: '/guides/testing',
				label: 'Testing',
				summary: 'Exercise real components through user behavior.',
				keywords: 'test vitest jest query click mount',
				component: TestingPage
			},
			{
				path: '/guides/react-compatibility',
				label: 'React compatibility',
				summary: 'Bring supported React code and packages into an eXact application.',
				keywords: 'React compatibility hooks components migration interop adapter',
				component: ReactCompatibilityPage
			}
		]
	},
	{
		label: 'Extend eXact',
		pages: [
			{
				path: '/plugins',
				label: 'Plugin system',
				summary: 'Package cross-cutting behavior as a validated, multi-host extension.',
				keywords: 'plugin compiler server render client testing configuration package',
				component: PluginsPage
			},
			{
				path: '/plugins/microfrontends',
				label: 'Microfrontends',
				summary: 'Expose and consume independently built eXact component roots.',
				keywords: 'plugin microfrontends remotes exposes binding recovery deployment',
				component: MicrofrontendsPluginPage
			},
			{
				path: '/plugins/secrets',
				label: 'Secrets',
				summary: 'Load server secrets while preserving compiler-visible data boundaries.',
				keywords: 'plugin secrets server provider environment consume security',
				component: SecretsPluginPage
			}
		]
	},
	{
		label: 'Explore',
		pages: [
			{
				path: '/examples/logo-lab',
				label: 'Logo lab',
				summary: 'Program a turtle and watch eXact coordinate the work.',
				keywords: 'logo turtle interpreter canvas demo playground',
				component: LogoLabPage
			},
			{
				path: '/compare',
				label: 'Framework comparison',
				summary: 'Compare eXact with React, Vue, and Svelte without a winner-takes-all scorecard.',
				keywords: 'compare React Vue Svelte reactivity compiler components ecosystem',
				component: ComparisonPage
			},
			{
				path: '/advanced',
				label: 'Beyond the browser',
				summary: 'SSR, hydration, server components, and adapters.',
				keywords: 'SSR hydration server stream React compatibility',
				component: AdvancedPage
			},
			{
				path: '/packages',
				label: 'Package map',
				summary: 'Find the package that owns the job at hand.',
				keywords: 'packages core dom compiler hydrate testing',
				component: PackagesPage
			}
		]
	}
];

/** Flat page inventory used by routing, search, and static generation. */
export const docPages = docGroups.flatMap((group) => group.pages);
