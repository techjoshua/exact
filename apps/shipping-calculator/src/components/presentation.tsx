import type { Component } from '@exactjs/core';
import { usStatePaths } from '../data/us-state-paths.js';
import type { ExtraService, ProviderId, RateQuote, RouteResult } from '../types.js';

/** Performs the route map domain operation. */
export function RouteMap(
	this: Component<{}>,
	props: { route: RouteResult; origin: string; destination: string }
) {
	return () => {
		const start = props.route.origin
			? project(props.route.origin.latitude, props.route.origin.longitude)
			: undefined;
		const end = props.route.destination
			? project(props.route.destination.latitude, props.route.destination.longitude)
			: undefined;
		const arc = start && end ? arcPath(start, end) : undefined;
		return (
			<div className="map-wrap">
				<svg
					className="route-map"
					viewBox="0 0 800 370"
					role="img"
					aria-label={
						start && end
							? `Approximate route from ${props.origin} to ${props.destination}`
							: 'Approximate United States route map; one or both ZIP codes are unavailable'
					}
				>
					<g className="map-states">
						{usStatePaths.map((state) => (
							<path className={`land state state-${state.abbreviation.toLowerCase()}`} d={state.d}>
								<title>{state.name}</title>
							</path>
						))}
					</g>
					{arc ? <path className="route-arc" d={arc} /> : null}
					{start ? (
						<>
							<circle className="map-point origin" cx={start.x} cy={start.y} r="6" />
							<circle className="map-halo" cx={start.x} cy={start.y} r="12" />
						</>
					) : null}
					{end ? (
						<>
							<circle className="map-point destination" cx={end.x} cy={end.y} r="6" />
							<circle className="map-halo" cx={end.x} cy={end.y} r="12" />
						</>
					) : null}
				</svg>
				{!start || !end ? (
					<p className="map-unavailable">Map location unavailable for one or both ZIP codes.</p>
				) : null}
			</div>
		);
	};
}

/** Performs the rate card domain operation. */
export function RateCard(
	this: Component<{}>,
	props: { quote: RateQuote; best: boolean; refreshing: boolean }
) {
	return () => (
		<article
			className={`rate-card${props.quote.compatible ? '' : ' incompatible'}${props.refreshing ? ' refreshing' : ''}`}
		>
			<div className="rate-main">
				<div className="carrier-row">
					<span className={`carrier-logo ${props.quote.providerId}`}>
						{carrierInitials(props.quote.providerId)}
					</span>
					<div>
						<p>
							{props.quote.providerName}
							<span className={`source ${props.quote.source}`}>
								{props.quote.source === 'mock'
									? 'Fictional'
									: props.quote.accountRate
										? 'Account'
										: 'Live'}
							</span>
						</p>
						<h3>{props.quote.serviceName}</h3>
					</div>
				</div>
				<div className="delivery">
					<small>Estimated delivery</small>
					<strong>{deliveryLabel(props.quote)}</strong>
					{props.quote.delivery.guaranteed ? <span>Guaranteed</span> : null}
				</div>
				<div className="price">
					<small>Total estimate</small>
					<strong>{money(props.quote.totalPriceCents)}</strong>
					{props.best ? <span className="best">Best value</span> : null}
				</div>
			</div>
			<div className="feature-row">
				{props.quote.features.map((feature) => (
					<Feature feature={feature} />
				))}
			</div>
			<details className="breakdown">
				<summary>Price details</summary>
				<dl>
					{props.quote.charges.map((charge) => (
						<>
							<dt>{charge.name}</dt>
							<dd>{money(charge.amountCents)}</dd>
						</>
					))}
				</dl>
			</details>
			{props.quote.warnings.map((warning) => (
				<p className="quote-warning">{warning}</p>
			))}
		</article>
	);
}

/** Performs the feature domain operation. */
export function Feature(this: Component<{}>, props: { feature: ExtraService }) {
	return () => (
		<span
			className={`feature ${props.feature.availability}${props.feature.selected ? ' selected' : ''}`}
			title={props.feature.explanation}
		>
			{props.feature.availability === 'included'
				? '✓'
				: props.feature.availability === 'available'
					? '+'
					: '×'}{' '}
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

/** Performs the capitalize domain operation. */
export function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}
/** Performs the provider name domain operation. */
export function providerName(id: ProviderId): string {
	return (
		{ doop: 'DOOP', usps: 'USPS', ups: 'UPS', fedex: 'FedEx', dhl: 'DHL Express' } as Record<
			ProviderId,
			string
		>
	)[id];
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
function project(latitude: number, longitude: number): { x: number; y: number } {
	if (latitude > 50 && longitude < -130)
		return { x: 76 + (longitude + 170) * 4.2, y: 316 - (latitude - 50) * 4.1 };
	if (latitude < 23 && longitude < -150)
		return { x: 205 + (longitude + 161) * 8, y: 337 - (latitude - 18) * 7 };
	if (latitude < 20 && longitude > -70)
		return { x: 671 + (longitude + 68) * 12, y: 337 - (latitude - 17.5) * 10 };
	return { x: 84 + ((longitude + 125) / 59) * 634, y: 52 + ((50 - latitude) / 26) * 235 };
}
function arcPath(start: { x: number; y: number }, end: { x: number; y: number }): string {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const length = Math.hypot(dx, dy) || 1;
	const lift = Math.min(90, Math.max(28, length * 0.2));
	const middle = {
		x: (start.x + end.x) / 2 + (dy / length) * lift,
		y: (start.y + end.y) / 2 - (dx / length) * lift
	};
	return `M ${start.x} ${start.y} Q ${middle.x} ${middle.y} ${end.x} ${end.y}`;
}
