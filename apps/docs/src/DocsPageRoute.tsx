import { createComponentRegistry, type Component, type KeyOf } from '@exactjs/core';
import { IntroductionPage } from './pages/IntroductionPage.jsx';

/** Finite article inventory; only the landing page belongs to the initial module graph. */
const DocsPages = createComponentRegistry(({ lazy }) => ({
	AdvancedPage: lazy(() =>
		import('./pages/AdvancedPage.jsx').then(({ AdvancedPage }) => AdvancedPage)
	),
	AccessibilityPage: lazy(() =>
		import('./pages/AccessibilityPage.jsx').then(({ AccessibilityPage }) => AccessibilityPage)
	),
	AsyncInterfacesPage: lazy(() =>
		import('./pages/AsyncInterfacesPage.jsx').then(({ AsyncInterfacesPage }) => AsyncInterfacesPage)
	),
	CompilerTourPage: lazy(() =>
		import('./pages/CompilerTourPage.jsx').then(({ CompilerTourPage }) => CompilerTourPage)
	),
	ComponentsPage: lazy(() =>
		import('./pages/ComponentsPage.jsx').then(({ ComponentsPage }) => ComponentsPage)
	),
	ComponentRegistriesPage: lazy(() =>
		import('./pages/ComponentRegistriesPage.jsx').then(
			({ ComponentRegistriesPage }) => ComponentRegistriesPage
		)
	),
	ComponentLibraryTrustPage: lazy(() =>
		import('./pages/ComponentLibraryTrustPage.jsx').then(
			({ ComponentLibraryTrustPage }) => ComponentLibraryTrustPage
		)
	),
	DevtoolsPage: lazy(() =>
		import('./pages/DevtoolsPage.jsx').then(({ DevtoolsPage }) => DevtoolsPage)
	),
	DateTimePage: lazy(() =>
		import('./pages/DateTimePage.jsx').then(({ DateTimePage }) => DateTimePage)
	),
	EnhancementsPage: lazy(() =>
		import('./pages/EnhancementsPage.jsx').then(({ EnhancementsPage }) => EnhancementsPage)
	),
	FormsPage: lazy(() => import('./pages/FormsPage.jsx').then(({ FormsPage }) => FormsPage)),
	FrameworkComparisonPage: lazy(() =>
		import('./pages/FrameworkComparisonPage.jsx').then(
			({ FrameworkComparisonPage }) => FrameworkComparisonPage
		)
	),
	GettingStartedPage: lazy(() =>
		import('./pages/GettingStartedPage.jsx').then(({ GettingStartedPage }) => GettingStartedPage)
	),
	GesturesPage: lazy(() =>
		import('./pages/GesturesPage.jsx').then(({ GesturesPage }) => GesturesPage)
	),
	GravityPage: lazy(() => import('./pages/GravityPage.jsx').then(({ GravityPage }) => GravityPage)),
	IntroductionPage: IntroductionPage,
	InternationalizationPage: lazy(() =>
		import('./pages/InternationalizationPage.jsx').then(
			({ InternationalizationPage }) => InternationalizationPage
		)
	),
	ListsPage: lazy(() => import('./pages/ListsPage.jsx').then(({ ListsPage }) => ListsPage)),
	LanguageToolsPage: lazy(() =>
		import('./pages/LanguageToolsPage.jsx').then(({ LanguageToolsPage }) => LanguageToolsPage)
	),
	LogoLabPage: lazy(() => import('./pages/LogoLabPage.jsx').then(({ LogoLabPage }) => LogoLabPage)),
	MicrofrontendsPluginPage: lazy(() =>
		import('./pages/MicrofrontendsPluginPage.jsx').then(
			({ MicrofrontendsPluginPage }) => MicrofrontendsPluginPage
		)
	),
	MotionPage: lazy(() => import('./pages/MotionPage.jsx').then(({ MotionPage }) => MotionPage)),
	PhysicsPage: lazy(() => import('./pages/PhysicsPage.jsx').then(({ PhysicsPage }) => PhysicsPage)),
	PackagesPage: lazy(() =>
		import('./pages/PackagesPage.jsx').then(({ PackagesPage }) => PackagesPage)
	),
	PluginsPage: lazy(() => import('./pages/PluginsPage.jsx').then(({ PluginsPage }) => PluginsPage)),
	ReactCompatibilityPage: lazy(() =>
		import('./pages/ReactCompatibilityPage.jsx').then(
			({ ReactCompatibilityPage }) => ReactCompatibilityPage
		)
	),
	ReactDevelopersPage: lazy(() =>
		import('./pages/ReactDevelopersPage.jsx').then(({ ReactDevelopersPage }) => ReactDevelopersPage)
	),
	RoutingPage: lazy(() => import('./pages/RoutingPage.jsx').then(({ RoutingPage }) => RoutingPage)),
	RuntimesPage: lazy(() =>
		import('./pages/RuntimesPage.jsx').then(({ RuntimesPage }) => RuntimesPage)
	),
	SamplesPage: lazy(() => import('./pages/SamplesPage.jsx').then(({ SamplesPage }) => SamplesPage)),
	SecretsPluginPage: lazy(() =>
		import('./pages/SecretsPluginPage.jsx').then(({ SecretsPluginPage }) => SecretsPluginPage)
	),
	ServerExecutionPage: lazy(() =>
		import('./pages/ServerExecutionPage.jsx').then(({ ServerExecutionPage }) => ServerExecutionPage)
	),
	StatePage: lazy(() => import('./pages/StatePage.jsx').then(({ StatePage }) => StatePage)),
	StoryPage: lazy(() => import('./pages/StoryPage.jsx').then(({ StoryPage }) => StoryPage)),
	TasksPage: lazy(() => import('./pages/TasksPage.jsx').then(({ TasksPage }) => TasksPage)),
	TestingPage: lazy(() => import('./pages/TestingPage.jsx').then(({ TestingPage }) => TestingPage)),
	ThemeProposalPage: lazy(() =>
		import('./pages/ThemeProposalPage.jsx').then(({ ThemeProposalPage }) => ThemeProposalPage)
	),
	ChartsPage: lazy(() => import('./pages/ChartsPage.jsx').then(({ ChartsPage }) => ChartsPage)),
	PerformancePage: lazy(() =>
		import('./pages/PerformancePage.jsx').then(({ PerformancePage }) => PerformancePage)
	)
}));

/** Compiler-checked article identity shared by navigation and route selection. */
export type DocsPageKey = KeyOf<typeof DocsPages>;

/** Mounts one article through its compiler-owned registry and lazy lifecycle. */
export function DocsPageRoute(this: Component<{}>, props: { page: DocsPageKey }) {
	const Page = DocsPages[props.page];
	return () => <Page />;
}
