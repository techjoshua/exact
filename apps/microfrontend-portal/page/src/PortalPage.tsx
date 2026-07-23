import type { Component } from '@exactjs/core';
import { RemoteComponent } from '@exactjs/microfrontends/client';
import { PortalContext, type PortalContextValue } from '@exactjs/sample-microfrontend-portal/shared';

type PortalState = {
	portal: PortalContextValue;
	compact: boolean;
	remoteOffline: boolean;
};

/** Creates page-owned navigation that may be embedded beneath a remote shell. */
export function Navigation() {
	return () => (
		<nav class="portal-navigation" data-owner="page">
			<a href="#overview">Overview</a>
			<a href="#billing">Billing</a>
		</nav>
	);
}

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

/** Mounts the nested billing binding using the account selected by the page context. */
export function BillingSlot(this: Component<Record<string, never>>) {
	const portal = this.getContext(PortalContext);
	return () => (
		<RemoteComponent
			binding="billing"
			fallback={<p role="alert">The billing application is unavailable.</p>}
			props={{ accountId: portal.accountId }}
		/>
	);
}

/** Owns shared portal context and composes page children with independently loaded roots. */
export default function PortalPage(this: Component<PortalState>) {
	this.state.portal = {
		tenant: 'Northwind',
		accountId: 'ACCT-1042',
		accent: '#6750a4',
		mode: 'light'
	};
	this.state.compact = false;
	this.state.remoteOffline = false;
	this.setContext(PortalContext, this.state.portal);

	return () => (
		<div
			class={`page-frame ${this.state.portal.mode}`}
			style={{ '--accent': this.state.portal.accent } as Record<string, string>}
		>
			<section class="page-controls" aria-label="Page host controls">
				<strong data-testid="page-context">
					Page context: {this.state.portal.tenant} / {this.state.portal.accountId}
				</strong>
				<button
					onClick={() => {
						this.state.portal.tenant =
							this.state.portal.tenant === 'Northwind' ? 'Contoso' : 'Northwind';
						this.state.portal.accountId =
							this.state.portal.accountId === 'ACCT-1042' ? 'ACCT-2048' : 'ACCT-1042';
						this.state.portal.accent =
							this.state.portal.accent === '#6750a4' ? '#006c4c' : '#6750a4';
					}}
				>
					Switch live page context
				</button>
				<button
					onClick={() =>
						(this.state.portal.mode = this.state.portal.mode === 'light' ? 'dark' : 'light')
					}
				>
					Toggle theme
				</button>
				<button onClick={() => (this.state.compact = !this.state.compact)}>
					Switch remote exposure
				</button>
				<button onClick={() => (this.state.remoteOffline = !this.state.remoteOffline)}>
					Toggle remote failure
				</button>
			</section>

			<RemoteComponent
				binding={
					this.state.remoteOffline
						? 'missingSample'
						: this.state.compact
							? 'compactBranding'
							: 'branding'
				}
				fallback={<p role="alert">The branding application is unavailable.</p>}
				props={{
					navigation: <Navigation />,
					account: <AccountBadge />,
					content: <BillingSlot />
				}}
			/>
		</div>
	);
}
