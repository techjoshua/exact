import type { Component } from '@exactjs/core';
import { NavLink } from '@exactjs/router';
import { docGroups } from '../docs-manifest.js';

type DocsSidebarProps = {
	open: boolean;
	onNavigate(): void;
};

/** Renders grouped documentation routes and closes mobile navigation after selection. */
export function DocsSidebar(this: Component<{}>, props: DocsSidebarProps) {
	return () => (
		<aside className="sidebar" className:is-open={props.open}>
			<nav aria-label="Documentation">
				{docGroups.map((group) => (
					<section className="nav-group">
						<h2>{group.label}</h2>
						{group.pages.map((page) => (
							<NavLink
								to={page.path}
								end
								className={(active) => (active ? 'nav-link is-active' : 'nav-link')}
								onClick={props.onNavigate}
							>
								{page.label}
							</NavLink>
						))}
					</section>
				))}
			</nav>
			<p className="sidebar-note">Compiler-led components, from state to server boundaries.</p>
		</aside>
	);
}
