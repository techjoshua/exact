import type { DocsPageKey } from './DocsPageRoute.jsx';

/** Describes one routable and searchable documentation article. */
export type DocPage = {
	/** @exact key */
	path: string;
	label: string;
	summary: string;
	keywords: string;
	component: DocsPageKey;
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
					'Getting a page on screen is straightforward. Keeping it correct as people interact with it takes more work. eXact helps with that coordination.',
				keywords:
					'overview component compiler reactive TypeScript JSX state precise updates client server',
				component: 'IntroductionPage'
			},
			{
				path: '/getting-started',
				label: 'Quick start',
				summary: 'Create a project, run it locally, and change your first component.',
				keywords:
					'create exact app install scaffold vite runtime SSR hydration single file offline HTML test runner agent skill native compiler platform binary TypeScript 7',
				component: 'GettingStartedPage'
			},
			{
				path: '/samples',
				label: 'Sample applications',
				summary:
					'Explore complete applications and open their source to see how the features work together.',
				keywords:
					'samples applications Sudoku shipping calculator kanban workbench microfrontend server components hosted GitHub Pages',
				component: 'SamplesPage'
			}
		]
	},
	{
		label: 'Learn',
		pages: [
			{
				path: '/learn/components',
				label: 'Components',
				summary:
					'Build a component with inputs, its own state, and a view that updates when that state changes.',
				keywords:
					'component props lifecycle refs events children partitionChildren childrenOf withChildren childKinds composition',
				component: 'ComponentsPage'
			},
			{
				path: '/learn/state',
				label: 'State & derived values',
				summary:
					'Store changing values in this.state and use ordinary expressions to display and derive data.',
				keywords: 'state reactive computed derived batch',
				component: 'StatePage'
			},
			{
				path: '/learn/lists',
				label: 'Keyed lists',
				summary:
					'Render a collection and keep each item attached to the same component as the list changes.',
				keywords: 'list map key reorder identity',
				component: 'ListsPage'
			},
			{
				path: '/learn/tasks',
				label: 'Tasks, dependencies & scheduling',
				summary:
					'Run work when an input changes or a user takes an action. Track its status and cancel work that is no longer needed.',
				keywords:
					'task function create captured parameter default snapshot dependency effect result async await Suspense readiness blocking nonblocking priority deferred abort signal cleanup optimistic invocation concurrency latest queue key keyed status pending aggregate owner tree structured',
				component: 'TasksPage'
			},
			{
				path: '/learn/async-interfaces',
				label: 'Suspense, Activity & scheduling',
				summary:
					'Show loading content while work is pending, and keep a hidden view ready to use again.',
				keywords:
					'async await task Suspense Activity parked background deferred blocking scheduling readiness cancellation',
				component: 'AsyncInterfacesPage'
			},
			{
				path: '/learn/component-registries',
				label: 'Dynamic components',
				summary:
					'Choose which component to display, preserve its state, and load less-used views on demand.',
				keywords:
					'component registry dynamic lazy eager key identity preload SSR hydration placement bundle createDynamicComponent provider client only',
				component: 'ComponentRegistriesPage'
			},
			{
				path: '/learn/server-execution',
				label: 'Server execution',
				summary:
					'Use server resources from a component while eXact keeps private code and data out of the browser.',
				keywords:
					'server task continuation dependency watcher component execution subgraph root blueprint cache slot state machine C# async SSR scheduler hydration context Apollo TanStack bundle shared secret',
				component: 'ServerExecutionPage'
			}
		]
	},
	{
		label: 'Build an application',
		pages: [
			{
				path: '/guides/routing',
				label: 'Routing',
				summary: 'Connect URLs to pages, add navigation links, and share layouts between routes.',
				keywords: 'router route link outlet hash history',
				component: 'RoutingPage'
			},
			{
				path: '/guides/forms',
				label: 'Accessible forms',
				summary:
					'Connect form controls to state, label fields, and handle validation and submission.',
				keywords:
					'form input component binding callback value change checked details toggle field validation label accessible',
				component: 'FormsPage'
			},
			{
				path: '/guides/testing',
				label: 'Testing',
				summary: 'Render a component in a test, interact with it, and check what the user sees.',
				keywords: 'test vitest jest query click mount',
				component: 'TestingPage'
			},
			{
				path: '/advanced',
				label: 'Beyond the browser',
				summary:
					'Add server rendering, server tasks, streaming, React packages, and microfrontends when your application needs them.',
				keywords:
					'SSR hydration server stream responses buffered produced cancellation backpressure Node Bun React compatibility Document shell doctype documentOutput assets head body title',
				component: 'AdvancedPage'
			},
			{
				path: '/runtimes',
				label: 'Runtimes & integrations',
				summary:
					'Choose the compiler integration that fits your toolchain and the runtime adapter that fits your host. The two decisions remain independent.',
				keywords:
					'runtime adapter integration status Vite Webpack Bun Node Express Fastify Hapi Koa Deno Cloudflare serverless Fetch NDJSON progress streaming buffering',
				component: 'RuntimesPage'
			}
		]
	},
	{
		label: 'Component libraries',
		pages: [
			{
				path: '/components/enhancements',
				label: 'Enhancements',
				summary:
					'Add optional styling and behavior to existing elements through namespaced JSX attributes.',
				keywords:
					'enhancement component library activator target composition optional namespace fragment intrinsicFragment supplied child',
				component: 'EnhancementsPage'
			},
			{
				path: '/components/theme',
				label: 'Theming',
				summary:
					'Choose colors, typography, spacing, and light or dark appearance for an application or part of a page.',
				keywords:
					'theme theming typography font family inverse inverse-system appearance inheritance temperament palette OKLCH color CSS variables semantic action surface field text status selection nested reactive chart data colors component library enhancement depth hover active dragging interactive busy disabled overlay',
				component: 'ThemePage'
			},
			{
				path: '/components/charts',
				label: 'Charts',
				summary:
					'Display data as accessible SVG charts with labels, legends, and keyboard navigation.',
				keywords:
					'charts graph line area bar stacked range percentile data visualization SVG accessibility tooltip legend keyboard intl localization units theme title description caption children',
				component: 'ChartsPage'
			},
			{
				path: '/components/date-time',
				label: 'Date & time',
				summary: 'Display clocks, countdowns, and relative dates that update as time passes.',
				keywords:
					'time date clock countdown stopwatch relative time Temporal Intl scheduler auto accuracy disabled manual clock enhancement',
				component: 'DateTimePage'
			},
			{
				path: '/components/accessibility',
				label: 'Accessibility',
				summary:
					'Use semantic HTML, connect labels and descriptions, and add focus and keyboard behavior to custom controls.',
				keywords:
					'accessibility a11y ARIA label description relationship ref focus dialog modal command keyboard navigation roving tabindex active descendant listbox tablist radiogroup toolbar grid LSP errors warnings enhancement',
				component: 'AccessibilityPage'
			},
			{
				path: '/components/motion',
				label: 'Motion',
				summary: 'Animate elements as they appear, change, move, and leave the page.',
				keywords: 'component library enhancement motion animation presets task Web Animations',
				component: 'MotionPage'
			},
			{
				path: '/components/gestures',
				label: 'Gestures',
				summary:
					'Handle dragging, panning, and other gestures while keeping controls usable with a keyboard.',
				keywords: 'component library enhancement gestures drag pan pointer keyboard accessibility',
				component: 'GesturesPage'
			},
			{
				path: '/components/physics',
				label: 'Physics',
				summary:
					'Simulate moving bodies and collisions, then display their positions in a component.',
				keywords:
					'component library enhancement physics body force collision fixed step projection',
				component: 'PhysicsPage'
			},
			{
				path: '/components/gravity',
				label: 'Gravity',
				summary: 'Apply uniform gravity or attraction fields to bodies in a physics simulation.',
				keywords: 'component library enhancement gravity field force physics acceleration',
				component: 'GravityPage'
			}
		]
	},
	{
		label: 'Plugins and libraries',
		pages: [
			{
				path: '/plugins',
				label: 'Plugin system',
				summary:
					'Configure packages that add application-wide features such as translation, secrets, and remote components.',
				keywords: 'plugin compiler server render client testing configuration package',
				component: 'PluginsPage'
			},
			{
				path: '/plugins/internationalization',
				label: 'Internationalization',
				summary:
					'Translate messages and format numbers, dates, and units for the reader’s language and region.',
				keywords:
					'plugin internationalization intl i18n locale translation catalog XLIFF extraction source message plural ordinal currency unit CLDR date time Temporal analyzer enhancement Vite Bun Webpack test bed reorder fragments',
				component: 'InternationalizationPage'
			},
			{
				path: '/components/trust',
				label: 'Server trust',
				summary:
					'Choose which component packages may run during server rendering and server tasks.',
				keywords:
					'component library trust authorization marker policy allow deny server bundler supply chain',
				component: 'ComponentLibraryTrustPage'
			},
			{
				path: '/plugins/secrets',
				label: 'Secrets',
				summary:
					'Load server credentials and prevent secret values from being sent to the browser.',
				keywords: 'plugin secrets server provider environment consume security',
				component: 'SecretsPluginPage'
			},
			{
				path: '/plugins/microfrontends',
				label: 'Microfrontends',
				summary: 'Load components from independently built and deployed eXact applications.',
				keywords: 'plugin microfrontends remotes exposes binding recovery deployment',
				component: 'MicrofrontendsPluginPage'
			}
		]
	},
	{
		label: 'Tools and reference',
		pages: [
			{
				path: '/learn/language-tools',
				label: 'Language tools',
				summary: 'Get eXact completions, error explanations, and refactoring help in VS Code.',
				keywords:
					'language tools VS Code extension LSP TypeScript plugin IntelliSense completion component this enhancement namespace props semantic tokens hover CodeLens inlay hints errors warnings refactor compiler inspection inferred authored TaskContext policy task no emit',
				component: 'LanguageToolsPage'
			},
			{
				path: '/learn/devtools',
				label: 'Full-stack DevTools',
				summary:
					'Inspect a running application’s component tree, state, tasks, and server requests.',
				keywords:
					'DevTools Chromium component inspection state contexts tasks invocations arguments results errors execution history timeline server cooperation allowDebug catalog redaction secrets microfrontend federation CDP agent',
				component: 'DevtoolsPage'
			},
			{
				path: '/learn/compiler-tour',
				label: 'How compilation helps',
				summary:
					'See how the compiler turns ordinary TypeScript into precise updates and coordinated server work.',
				keywords:
					'compiler native TypeScript Go generated output lowering browser server artifact pseudocode reactive helpers task binding continuation executor map JSX',
				component: 'CompilerTourPage'
			},
			{
				path: '/packages',
				label: 'Package map',
				summary:
					'Find the package for a feature and understand which packages your application needs.',
				keywords:
					'packages core dom compiler native platform binary hydrate testing npm releases versions ABI compatibility Apache license copyright',
				component: 'PackagesPage'
			}
		]
	},
	{
		label: 'Coming from React',
		pages: [
			{
				path: '/react-developers',
				label: 'eXact for React developers',
				summary: 'Compare state, events, lists, asynchronous work, and cleanup in React and eXact.',
				keywords:
					'React developers migration comparison side by side hooks useState useEffect useMemo state forms binding JSX className keyed lists tasks lifecycle cleanup Server Components RSC Server Functions actions continuations Next.js optimistic',
				component: 'ReactDevelopersPage'
			},
			{
				path: '/guides/react-compatibility',
				label: 'React compatibility',
				summary: 'Use supported React components and packages inside an eXact application.',
				keywords:
					'React compatibility direct JSX components reactive props hooks migration interop adapter',
				component: 'ReactCompatibilityPage'
			}
		]
	},
	{
		label: 'Explore',
		pages: [
			{
				path: '/framework-comparison',
				label: 'Framework comparison',
				summary:
					"The framework comparison suite gives eXact and other frameworks the same incident-operations experience while preserving each framework's idiomatic architecture.",
				keywords:
					'framework comparison benchmark methodology performance complexity incident operations controlled service native full stack reproducible',
				component: 'FrameworkComparisonPage'
			},
			{
				path: '/performance',
				label: 'Performance results',
				summary:
					'Compare page loading, interaction response, memory use, and server throughput for the same application.',
				keywords:
					'performance results charts aggregate mean percentile p50 p75 p95 p99 browser heap evaluation optimistic SSR Node sustained throughput requests per second burst completion closed loop payload allocation normalization',
				component: 'PerformancePage'
			},
			{
				path: '/examples/logo-lab',
				label: 'Logo lab',
				summary:
					'Edit a Logo program and watch a turtle draw it. Try loops, procedures, and changes while it runs.',
				keywords: 'logo turtle interpreter canvas demo playground',
				component: 'LogoLabPage'
			},
			{
				path: '/story',
				label: 'The story behind eXact',
				summary:
					'How async/await inspired eXact’s compiler-led model for components, reactivity, and coordinated server work.',
				keywords:
					'story history async await compiler state machine React JSX reactivity server components philosophy',
				component: 'StoryPage'
			}
		]
	}
];

/** Flat page inventory used by routing, search, and static generation. */
export const docPages = docGroups.flatMap((group) => group.pages);
