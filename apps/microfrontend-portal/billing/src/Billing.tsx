import type { Component } from '@exact/core';
import { PortalContext } from '@exact/sample-microfrontend-portal/shared';
import './billing.css';

type BillingProps = { accountId?: string };
type BillingState = {
	showDetails: boolean;
};

function InvoiceIsland(this: Component<{ adjustments: number }>) {
	const portal = this.getContext(PortalContext);
	this.state.adjustments = 0;
	return () => (
		<button data-testid="billing-island" onClick={() => this.state.adjustments++}>
			Invoice island for {portal.accountId}: {this.state.adjustments} local adjustments
		</button>
	);
}

function LateBillingIsland(this: Component<Record<string, never>>) {
	const portal = this.getContext(PortalContext);
	return () => (
		<aside data-testid="late-billing-island">
			Late island inherited {portal.tenant} / {portal.mode}
		</aside>
	);
}

/** Renders the independently loaded billing root against page-owned reactive context. */
export default function Billing(this: Component<BillingState>, props: BillingProps) {
	const portal = this.getContext(PortalContext);
	this.state.showDetails = false;

	return () => (
		<section class="billing-card" data-testid="billing-root">
			<p class="ownership">Remote billing root</p>
			<h2>Billing for {props.accountId ?? portal.accountId}</h2>
			<p data-testid="billing-context">
				Live context: {portal.tenant} · {portal.mode} · {portal.accent}
			</p>
			<div class="billing-actions">
				<button onClick={() => (this.state.showDetails = !this.state.showDetails)}>
					Toggle late island
				</button>
			</div>
			<InvoiceIsland />
			{this.state.showDetails ? <LateBillingIsland /> : null}
		</section>
	);
}
