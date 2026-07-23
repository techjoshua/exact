import type { Child, Component } from '@exact/core';
import { PortalContext } from '@exact/sample-microfrontend-portal/shared';
import type { BrandShellProps } from './BrandShell.js';
import './branding.css';

/** Renders the compact exposure from the same remote build and shared page context. */
export default function CompactShell(
	this: Component<Record<string, never>>,
	props: BrandShellProps & { children?: Child }
) {
	const portal = this.getContext(PortalContext);
	return () => (
		<section class="brand-shell compact" data-testid="compact-branding-shell">
			<header class="brand-header">
				<strong>{portal.tenant} Compact</strong>
				{props.navigation}
				{props.account}
			</header>
			<main>{props.content}</main>
		</section>
	);
}
