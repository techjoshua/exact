import type { Child, Component } from '@exact/core';
import { PortalContext } from '@exact/sample-microfrontend-portal/shared';
import './branding.css';

export type BrandShellProps = {
	navigation?: Child;
	account?: Child;
	content?: Child;
};

function BrandPulse(this: Component<{ pulses: number }>) {
	const portal = this.getContext(PortalContext);
	this.state.pulses = 0;
	return () => (
		<button data-testid="branding-island" onClick={() => this.state.pulses++}>
			Branding island: {portal.mode} · {this.state.pulses}
		</button>
	);
}

export default function BrandShell(this: Component<Record<string, never>>, props: BrandShellProps) {
	const portal = this.getContext(PortalContext);

	return () => (
		<section
			class="brand-shell"
			data-testid="branding-shell"
			style={{ '--brand-accent': portal.accent } as Record<string, string>}
		>
			<header class="brand-header">
				<div>
					<p class="ownership">Remote branding root</p>
					<h1>{portal.tenant} Account Center</h1>
				</div>
				{props.navigation}
				{props.account}
			</header>
			<div class="brand-tools">
				<BrandPulse />
			</div>
			<main>{props.content}</main>
		</section>
	);
}
