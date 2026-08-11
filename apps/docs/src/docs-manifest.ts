import type { ComponentFunction } from '@exactjs/core';
import { AdvancedPage } from './pages/AdvancedPage.jsx';
import { AccessibilityPage } from './pages/AccessibilityPage.jsx';
import { AsyncInterfacesPage } from './pages/AsyncInterfacesPage.jsx';
import { CompilerTourPage } from './pages/CompilerTourPage.jsx';
import { ComponentsPage } from './pages/ComponentsPage.jsx';
import { ComponentRegistriesPage } from './pages/ComponentRegistriesPage.jsx';
import { ComponentLibraryTrustPage } from './pages/ComponentLibraryTrustPage.jsx';
import { DevtoolsPage } from './pages/DevtoolsPage.jsx';
import { EnhancementsPage } from './pages/EnhancementsPage.jsx';
import { FormsPage } from './pages/FormsPage.jsx';
import { GettingStartedPage } from './pages/GettingStartedPage.jsx';
import { GesturesPage } from './pages/GesturesPage.jsx';
import { GravityPage } from './pages/GravityPage.jsx';
import { IntroductionPage } from './pages/IntroductionPage.jsx';
import { InternationalizationPage } from './pages/InternationalizationPage.jsx';
import { ListsPage } from './pages/ListsPage.jsx';
import { LanguageToolsPage } from './pages/LanguageToolsPage.jsx';
import { LogoLabPage } from './pages/LogoLabPage.jsx';
import { MicrofrontendsPluginPage } from './pages/MicrofrontendsPluginPage.jsx';
import { MotionPage } from './pages/MotionPage.jsx';
import { PhysicsPage } from './pages/PhysicsPage.jsx';
import { PackagesPage } from './pages/PackagesPage.jsx';
import { PluginsPage } from './pages/PluginsPage.jsx';
import { ReactCompatibilityPage } from './pages/ReactCompatibilityPage.jsx';
import { RoutingPage } from './pages/RoutingPage.jsx';
import { RuntimesPage } from './pages/RuntimesPage.jsx';
import { SamplesPage } from './pages/SamplesPage.jsx';
import { SecretsPluginPage } from './pages/SecretsPluginPage.jsx';
import { ServerExecutionPage } from './pages/ServerExecutionPage.jsx';
import { StatePage } from './pages/StatePage.jsx';
import { StoryPage } from './pages/StoryPage.jsx';
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
					'How eXact compiles ordinary TypeScript components into inspectable reactive state machines spanning client and server.',
				keywords:
					'overview component compiler reactive TypeScript JSX state precise updates client server',
				component: IntroductionPage
			},
			{
				path: '/story',
				label: 'The story behind eXact',
				summary:
					'How async/await inspired eXact’s compiler-led model for components, reactivity, and coordinated server work.',
				keywords:
					'story history async await compiler state machine React JSX reactivity server components philosophy',
				component: StoryPage
			},
			{
				path: '/getting-started',
				label: 'Quick start',
				summary: 'Scaffold and run an eXact application with compatible package versions.',
				keywords:
					'create exact app install scaffold vite runtime test runner agent skill native compiler platform binary TypeScript 7',
				component: GettingStartedPage
			},
			{
				path: '/samples',
				label: 'Sample applications',
				summary: 'Explore the hosted Sudoku demo and complete repository applications.',
				keywords:
					'samples applications Sudoku shipping calculator kanban workbench microfrontend server components hosted GitHub Pages',
				component: SamplesPage
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
				path: '/learn/tasks',
				label: 'Tasks, dependencies & scheduling',
				summary:
					'Understand task definitions and generations, compiler inference, explicit policy, dependencies, scheduling, and Suspense readiness.',
				keywords:
					'task function create captured parameter default snapshot dependency effect result async await Suspense readiness blocking nonblocking priority deferred abort signal cleanup optimistic invocation concurrency latest queue key keyed status pending aggregate owner tree structured',
				component: TasksPage
			},
			{
				path: '/learn/compiler-tour',
				label: 'Inside the compiler',
				summary:
					'Compare an ordinary eXact component with the precise runtime machinery generated for it.',
				keywords:
					'compiler native TypeScript Go generated output lowering transform reactive helpers task binding map JSX',
				component: CompilerTourPage
			},
			{
				path: '/learn/lists',
				label: 'Keyed lists',
				summary: 'Keep identity stable while collections move.',
				keywords: 'list map key reorder identity',
				component: ListsPage
			},
			{
				path: '/learn/component-registries',
				label: 'Dynamic components',
				summary: 'Choose components through branches, finite registries, or an open fallback.',
				keywords:
					'component registry dynamic lazy eager key identity preload SSR hydration placement bundle createDynamicComponent provider client only',
				component: ComponentRegistriesPage
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
					'Understand distributed continuations, dependency-driven SSR execution, and server-only isolation.',
				keywords:
					'server task continuation dependency watcher component execution subgraph root blueprint cache slot state machine C# async SSR scheduler hydration context Apollo TanStack bundle shared secret',
				component: ServerExecutionPage
			},
			{
				path: '/learn/language-tools',
				label: 'Language tools',
				summary:
					'Inspect compiler regions, reasons, diagnostics, and safe task refactors while editing.',
				keywords:
					'language tools VS Code extension LSP TypeScript plugin IntelliSense completion component this enhancement namespace props semantic tokens hover CodeLens inlay hints diagnostics refactor compiler inspection inferred authored TaskContext policy task no emit',
				component: LanguageToolsPage
			},
			{
				path: '/learn/devtools',
				label: 'Full-stack DevTools',
				summary:
					'Inspect durable browser and server components across authorized microfrontend roots.',
				keywords:
					'DevTools Chromium component inspection state contexts tasks invocations arguments results errors execution history timeline server cooperation allowDebug catalog redaction secrets microfrontend federation CDP agent',
				component: DevtoolsPage
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
					'Bind component callbacks and native controls while preserving explicit state ownership.',
				keywords:
					'form input component binding callback value change checked details toggle field validation label accessible',
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
				keywords:
					'React compatibility direct JSX components reactive props hooks migration interop adapter',
				component: ReactCompatibilityPage
			}
		]
	},
	{
		label: 'Component libraries',
		pages: [
			{
				path: '/components/enhancements',
				label: 'Enhancements',
				summary: 'Apply optional ordinary components through finite namespaced JSX.',
				keywords: 'enhancement component library activator target composition optional namespace',
				component: EnhancementsPage
			},
			{
				path: '/components/accessibility',
				label: 'Accessibility',
				summary:
					'Add ref relationships, bounded focus lifecycle, composite navigation, and package-owned guidance while preserving native HTML behavior.',
				keywords:
					'accessibility a11y ARIA label description relationship ref focus dialog modal command keyboard navigation roving tabindex active descendant listbox tablist radiogroup toolbar grid LSP diagnostics enhancement',
				component: AccessibilityPage
			},
			{
				path: '/components/trust',
				label: 'Server trust',
				summary: 'Authorize resolved component packages before server execution.',
				keywords:
					'component library trust authorization marker policy allow deny server bundler supply chain',
				component: ComponentLibraryTrustPage
			},
			{
				path: '/components/motion',
				label: 'Motion',
				summary: 'Animate committed state with prepared definitions and task-owned playback.',
				keywords: 'component library enhancement motion animation presets task Web Animations',
				component: MotionPage
			},
			{
				path: '/components/gestures',
				label: 'Gestures',
				summary: 'Recognize semantic pointer and keyboard intent with owned sessions.',
				keywords: 'component library enhancement gestures drag pan pointer keyboard accessibility',
				component: GesturesPage
			},
			{
				path: '/components/physics',
				label: 'Physics',
				summary: 'Simulate deterministic 2D worlds and optionally project body pose.',
				keywords:
					'component library enhancement physics body force collision fixed step projection',
				component: PhysicsPage
			},
			{
				path: '/components/gravity',
				label: 'Gravity',
				summary: 'Compose pure bounded acceleration fields through the physics force seam.',
				keywords: 'component library enhancement gravity field force physics acceleration',
				component: GravityPage
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
				path: '/plugins/internationalization',
				label: 'Internationalization',
				summary:
					'Localize enhancement-authored messages with semantic inference and XLIFF catalogs.',
				keywords:
					'plugin internationalization intl i18n locale translation catalog XLIFF extraction source message plural ordinal currency unit CLDR date time Temporal analyzer enhancement Vite Bun Webpack test bed reorder fragments',
				component: InternationalizationPage
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
				keywords: 'packages core dom compiler native platform binary hydrate testing',
				component: PackagesPage
			}
		]
	}
];

/** Flat page inventory used by routing, search, and static generation. */
export const docPages = docGroups.flatMap((group) => group.pages);
