import type { Component } from '@exactjs/core';
import type { ExtraService, ProviderId, RateQuote } from '../types.js';

type RateCardProps = {
	quote: RateQuote;
	best: boolean;
	refreshing: boolean;
};

/** Renders a provider quote, its delivery promise, features, and price breakdown. */
export function RateCard(this: Component<{}>, { quote, best, refreshing }: RateCardProps) {
	return () => (
		<article
			className="rate-card"
			className:incompatible={!quote.compatible}
			className:refreshing={refreshing}
		>
			<div className="rate-main">
				<div className="carrier-row">
					<span className={['carrier-logo', quote.providerId]}>
						{carrierInitials(quote.providerId)}
					</span>
					<div>
						<p>
							{quote.providerName}
							<span className={['source', quote.source]}>
								{quote.source === 'mock' ? 'Fictional' : quote.accountRate ? 'Account' : 'Live'}
							</span>
						</p>
						<h3>{quote.serviceName}</h3>
					</div>
				</div>
				<div className="delivery">
					<small>Estimated delivery</small>
					<strong>{deliveryLabel(quote)}</strong>
					{quote.delivery.guaranteed ? <span>Guaranteed</span> : null}
				</div>
				<div className="price">
					<small>Total estimate</small>
					<strong>{money(quote.totalPriceCents)}</strong>
					{best ? <span className="best">Best value</span> : null}
				</div>
			</div>
			<div className="feature-row">
				{quote.features.map((feature) => (
					<Feature feature={feature} />
				))}
			</div>
			<details className="breakdown">
				<summary>Price details</summary>
				<dl>
					{quote.charges.map((charge) => (
						<>
							<dt>{charge.name}</dt>
							<dd>{money(charge.amountCents)}</dd>
						</>
					))}
				</dl>
			</details>
			{quote.warnings.map((warning) => (
				<p className="quote-warning">{warning}</p>
			))}
		</article>
	);
}

function Feature(this: Component<{}>, props: { feature: ExtraService }) {
	return () => (
		<span
			className={['feature', props.feature.availability]}
			className:selected={props.feature.selected}
			title={props.feature.explanation}
		>
			{props.feature.availability === 'included'
				? '✓'
				: props.feature.availability === 'available'
					? '+'
					: '×'}
			{props.feature.name}
			{props.feature.selected &&
			props.feature.availability === 'available' &&
			props.feature.priceCents
				? ` ${money(props.feature.priceCents)}`
				: props.feature.availability === 'included'
					? ' included'
					: ''}
		</span>
	);
}

function money(cents: number): string {
	return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function carrierInitials(id: ProviderId): string {
	return { doop: 'D', usps: 'US', ups: 'UP', fedex: 'FX', dhl: 'DH' }[id];
}

function deliveryLabel(quote: RateQuote): string {
	const { minimumDays, maximumDays, estimatedDate } = quote.delivery;
	if (estimatedDate)
		return new Date(`${estimatedDate}T12:00:00`).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric'
		});
	if (minimumDays === undefined && maximumDays === undefined) return 'Carrier estimate';
	if (minimumDays === maximumDays)
		return `${minimumDays} business day${minimumDays === 1 ? '' : 's'}`;
	return `${minimumDays ?? 1}–${maximumDays} business days`;
}
