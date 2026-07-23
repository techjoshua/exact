import type { ComponentFunction } from '@exact/core';
import {
	AdvancedPage,
	ComponentsPage,
	FormsPage,
	GettingStartedPage,
	IntroductionPage,
	ListsPage,
	LogoLabPage,
	PackagesPage,
	RoutingPage,
	StatePage,
	TasksPage,
	TestingPage
} from './pages.jsx';

export type DocPage = {
	/** @exact key */
	path: string;
	label: string;
	summary: string;
	keywords: string;
	component: ComponentFunction<any, any>;
};

export type DocGroup = {
	/** @exact key */
	label: string;
	pages: DocPage[];
};

export const docGroups: DocGroup[] = [
	{
		label: 'Start here',
		pages: [
			{
				path: '/',
				label: 'Introduction',
				summary: 'The small mental model behind eXact.',
				keywords: 'overview compiler reactive TypeScript JSX',
				component: IntroductionPage
			},
			{
				path: '/getting-started',
				label: 'Quick start',
				summary: 'Build and mount a tiny browser app.',
				keywords: 'install vite setup tsconfig render',
				component: GettingStartedPage
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
				summary: 'Compose fields without surrendering your data.',
				keywords: 'form field validation label accessible',
				component: FormsPage
			},
			{
				path: '/guides/testing',
				label: 'Testing',
				summary: 'Exercise real components through user behavior.',
				keywords: 'test vitest jest query click mount',
				component: TestingPage
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
				keywords: 'packages core dom compiler hydrate testing',
				component: PackagesPage
			}
		]
	}
];

export const docPages = docGroups.flatMap((group) => group.pages);
