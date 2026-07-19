import type { Component } from '@exact/core';
import { resolveRoute } from '../geography.js';
import { draftFromUrl, emptyInitialModel, normalizeDraft } from '../model.js';
import { configuredProviderIds, quoteProvider } from '../providers/registry.js';

import { CalculatorWorkspace } from './workspace.js';
import type { PageState } from './workspace/contracts.js';

/** Performs the shipping calculator page domain operation. */
export function ShippingCalculatorPage(this: Component<PageState>, props: { url: string }) {
	const parsed = draftFromUrl(new URL(props.url));
	const request = normalizeDraft(parsed.draft);
	this.state.model = emptyInitialModel(parsed.draft, request, parsed.explicit);
	this.state.model.configuredProviders = configuredProviderIds();

	this.task(async ({ signal }) => {
		const providers = await Promise.all(
			this.state.model.configuredProviders.map((id) => quoteProvider(id, request, signal))
		);
		this.state.model = {
			...this.state.model,
			route: resolveRoute(request.originZip5, request.destinationZip5),
			providers
		};
	});

	return () => (
		<div className="page-shell">
			<header className="site-header">
				<a className="brand" href="/" aria-label="Parcel Lab home">
					<span className="brand-mark" aria-hidden="true">
						PL
					</span>
					<span>
						<strong>Parcel Lab</strong>
						<small>Shipping, measured twice.</small>
					</span>
				</a>
				<span className="header-status">Live calculations · No labels purchased</span>
			</header>
			<main>
				<section className="intro" aria-labelledby="page-title">
					<p className="eyebrow">Multi-carrier rate explorer</p>
					<h1 id="page-title">Find the right way to send it.</h1>
					<p>
						Compare postage, delivery windows, and optional services using real carrier APIs when
						configured—or DOOP's entirely fictional but admirably punctual fleet.
					</p>
				</section>
				<CalculatorWorkspace initial={this.state.model} />
			</main>
			<footer>
				<p>
					Rates are estimates. DOOP is fictional. ZIP map points use 2025 U.S. Census ZCTA
					representative coordinates.
				</p>
			</footer>
		</div>
	);
}
