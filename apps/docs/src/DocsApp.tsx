import { type Component, type Child } from '@exact/core';
import {
	Link,
	NavLink,
	Outlet,
	Route,
	Router,
	type LocationSource
} from '@exact/router';
import { docGroups, docPages } from './docs-manifest.js';
import { NotFoundPage } from './pages.jsx';

type DocsAppProps = { source?: LocationSource };

export function DocsApp(this: Component<{}>, props: DocsAppProps = {}) {
	return () => (
		<Router mode="hash" source={props.source}>
			<Route component={DocsLayout}>
				{docPages.map((page) =>
					page.path === '/' ? (
						<Route index component={page.component} />
					) : (
						<Route path={page.path.slice(1)} component={page.component} />
					)
				)}
				<Route path="*" component={NotFoundPage} />
			</Route>
		</Router>
	);
}

type ThemePreference = 'system' | 'light' | 'dark';
type LayoutState = {
	theme: ThemePreference;
	mobileOpen: boolean;
	searchOpen: boolean;
	query: string;
};

function DocsLayout(this: Component<LayoutState>) {
	this.state.theme = 'system';
	this.state.mobileOpen = false;
	this.state.searchOpen = false;
	this.state.query = '';

	this.onMount(() => {
		const stored = localStorage.getItem('exact-docs-theme');
		if (stored === 'light' || stored === 'dark') this.state.theme = stored;
	});

	const chooseTheme = (value: ThemePreference) => {
		this.state.theme = value;
		if (value === 'system') {
			document.documentElement.removeAttribute('data-theme');
			localStorage.removeItem('exact-docs-theme');
		} else {
			document.documentElement.dataset.theme = value;
			localStorage.setItem('exact-docs-theme', value);
		}
	};

	const closeNavigation = () => {
		this.state.mobileOpen = false;
	};

	return () => {
		const normalizedQuery = this.state.query.trim().toLowerCase();
		const matches = normalizedQuery
			? docPages.filter((page) =>
					`${page.label} ${page.summary} ${page.keywords}`.toLowerCase().includes(normalizedQuery)
				)
			: docPages;

		return (
			<div className="docs-app">
				<a className="skip-link" href="#article">
					Skip to content
				</a>
				<header className="topbar">
					<button
						className="mobile-menu-button"
						type="button"
						aria-label="Open documentation navigation"
						aria-expanded={this.state.mobileOpen}
						onClick={() => {
							this.state.mobileOpen = !this.state.mobileOpen;
						}}
					>
						<span aria-hidden="true">☰</span>
					</button>
					<Link className="brand" to="/" onClick={closeNavigation}>
						<span className="brand-mark" aria-hidden="true">
							eX
						</span>
						<span>eXact</span>
						<small>docs</small>
					</Link>
					<div className="topbar-actions">
						<button
							className="search-trigger"
							type="button"
							onClick={() => {
								this.state.searchOpen = true;
							}}
						>
							<span aria-hidden="true">⌕</span> Search
						</button>
						<label className="theme-control">
							<span>Appearance</span>
							<select
								value={this.state.theme}
								onChange={(event: Event) => {
									chooseTheme((event.currentTarget as HTMLSelectElement).value as ThemePreference);
								}}
							>
								<option value="system">System</option>
								<option value="light">Light</option>
								<option value="dark">Dark</option>
							</select>
						</label>
						<a className="github-link" href="https://github.com" target="_blank" rel="noreferrer">
							GitHub <span aria-hidden="true">↗</span>
						</a>
					</div>
				</header>

				<div className="docs-frame">
					<aside className={this.state.mobileOpen ? 'sidebar is-open' : 'sidebar'}>
						<nav aria-label="Documentation">
							{docGroups.map((group) => (
								<section className="nav-group">
									<h2>{group.label}</h2>
									{group.pages.map((page) => (
										<NavLink
											to={page.path}
											end={page.path === '/'}
											className={(active) => (active ? 'nav-link is-active' : 'nav-link')}
											onClick={closeNavigation}
										>
											{page.label}
										</NavLink>
									))}
								</section>
							))}
						</nav>
						<p className="sidebar-note">Experimental, carefully documented, and still being shaped.</p>
					</aside>

					<main id="article" className="content-panel" tabindex="-1">
						<Outlet />
					</main>
				</div>

				{this.state.searchOpen ? (
					<div className="search-backdrop" role="presentation">
						<section className="search-dialog" role="dialog" aria-modal="true" aria-label="Search documentation">
							<div className="search-input-row">
								<label>
									<span className="visually-hidden">Search documentation</span>
									<input
										autofocus
										type="search"
										placeholder="Search components, tasks, routing…"
										value={this.state.query}
										onInput={(event: Event) => {
											this.state.query = (event.currentTarget as HTMLInputElement).value;
										}}
									/>
								</label>
								<button
									type="button"
									onClick={() => {
										this.state.searchOpen = false;
									}}
								>
									Close
								</button>
							</div>
							<div className="search-results">
								{matches.map((page) => (
									<Link
										className="search-result"
										to={page.path}
										onClick={() => {
											this.state.searchOpen = false;
											this.state.query = '';
										}}
									>
										<strong>{page.label}</strong>
										<span>{page.summary}</span>
									</Link>
								))}
								{matches.length === 0 ? <p className="empty-search">No matching page yet.</p> : null}
							</div>
						</section>
					</div>
				) : null}
			</div>
		);
	};
}

export function PageNavigation(
	this: Component<{}>,
	props: { previous?: { path: string; label: string }; next?: { path: string; label: string } }
) {
	const item = (direction: string, page: { path: string; label: string } | undefined): Child =>
		page ? (
			<Link className="page-nav-link" to={page.path}>
				<small>{direction}</small>
				<strong>{page.label}</strong>
			</Link>
		) : (
			<span />
		);
	return () => (
		<nav className="page-navigation" aria-label="Page navigation">
			{item('Previous', props.previous)}
			{item('Next', props.next)}
		</nav>
	);
}
