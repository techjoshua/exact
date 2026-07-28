import type { Component } from '@exactjs/core';
import { PortalContext } from '@exactjs/sample-microfrontend-portal/shared';

/** Keeps page-local reactive state while the instance is displayed inside a remote root. */
export function AccountBadge(this: Component<{ visits: number }>) {
	const portal = this.getContext(PortalContext);
	this.state.visits = 0;

	return () => (
		<button
			class="account-badge"
			data-owner="page"
			data-testid="page-owned-account"
			onClick={() => this.state.visits++}
		>
			{portal.accountId} · local clicks {this.state.visits}
		</button>
	);
}
