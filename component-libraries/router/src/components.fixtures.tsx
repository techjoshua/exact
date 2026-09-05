import { type Child, ErrorContext, type Component, type ErrorContextValue } from '@exactjs/core';
import { createMemoryLocationSource, Link, NavLink, RouteContext, Router } from './components.js';

/** Provides the nested outlet layout used by native router tests. */
export function NestedLayout(this: Component<{}>, props: { children?: Child | Child[] }) {
	return () => <main>{props.children}</main>;
}

/** Displays the active route parameter through native route context. */
export function UserPage(this: Component<{}>) {
	const route = this.getContext(RouteContext);
	return () => <p>User {route.params.id}</p>;
}

/** Provides the index route link used by navigation tests. */
export function HomePage() {
	return () => <Link to="/users/42">Open</Link>;
}

/** Provides the basename-aware navigation link fixture. */
export function BasenamePage() {
	return () => <NavLink to="/start">Start</NavLink>;
}

/** Displays hash-router search state and a query-only link. */
export function HashPage(this: Component<{}>) {
	const route = this.getContext(RouteContext);
	return () => (
		<>
			<p>{route.location.search}</p>
			<Link to="?page=2">Next</Link>
		</>
	);
}

/** Provides navigation and an outlet for generated route fixtures. */
export function GeneratedLayout(this: Component<{}>, props: { children?: Child | Child[] }) {
	return () => (
		<>
			<nav>
				<NavLink to="/guides/routing">Routing</NavLink>
				<NavLink to="/learn/state">State</NavLink>
			</nav>
			{props.children}
		</>
	);
}

/** Identifies the generated route branch in rendered output. */
export function GeneratedPage() {
	return () => <p>Generated route</p>;
}

/** Identifies the state route branch in rendered output. */
export function StatePage() {
	return () => <p>State route</p>;
}

/** Identifies the fallback route branch in rendered output. */
export function MissingPage() {
	return () => <p>Missing route</p>;
}

/** Provides query-only and fragment-only link targets. */
export function TargetLinksPage() {
	return () => (
		<>
			<Link to="?page=2">Query</Link>
			<Link to="#details">Hash</Link>
		</>
	);
}

/** Identifies the partial-basename negative-match route. */
export function ApplePage() {
	return () => <p>Apple</p>;
}

/** Provides a link whose consumer callback rejects asynchronously. */
export function RejectedLinkPage() {
	return () => (
		<Link
			to="/next"
			onClick={async () => {
				throw new Error('link failed');
			}}
		>
			Next
		</Link>
	);
}

/** Installs error context around the rejected-link route fixture. */
export function ErrorLinkApp(this: Component<{}>, props: { errors: ErrorContextValue }) {
	this.setContext(ErrorContext, props.errors);
	return () => (
		<Router
			source={createMemoryLocationSource('https://example.test/')}
			routes={[{ index: true, render: () => <RejectedLinkPage /> }]}
		/>
	);
}
