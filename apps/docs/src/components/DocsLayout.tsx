import type { Component } from '@exactjs/core';
import { Outlet, RouteContext } from '@exactjs/router';
import { DocsHeader } from './DocsHeader.jsx';
import { DocsSearch } from './DocsSearch.jsx';
import { DocsSidebar } from './DocsSidebar.jsx';

type LayoutState = {
	mobileOpen: boolean;
	searchOpen: boolean;
};

/** Owns the responsive documentation shell, route scrolling, and search visibility. */
export function DocsLayout(this: Component<LayoutState>) {
	const route = this.getContext(RouteContext);
	this.state.mobileOpen = false;
	this.state.searchOpen = false;

	const scrollToRoute = (_locationKey: string) => {
		window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
	};
	scrollToRoute(route.location.key);

	const closeNavigation = () => {
		this.state.mobileOpen = false;
	};

	return () => (
		<div className="docs-app">
			<a className="skip-link" href="#article">
				Skip to content
			</a>
			<DocsHeader
				mobileOpen={this.state.mobileOpen}
				onToggleNavigation={() => {
					this.state.mobileOpen = !this.state.mobileOpen;
				}}
				onCloseNavigation={closeNavigation}
				onOpenSearch={() => {
					this.state.searchOpen = true;
				}}
			/>
			<div className="docs-frame">
				<DocsSidebar open={this.state.mobileOpen} onNavigate={closeNavigation} />
				<main id="article" className="content-panel" tabindex="-1">
					<Outlet />
				</main>
			</div>
			{this.state.searchOpen ? (
				<DocsSearch
					onClose={() => {
						this.state.searchOpen = false;
					}}
				/>
			) : null}
		</div>
	);
}
