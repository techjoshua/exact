import type { Component } from '@exact/core';
import { exactClient } from './client-runtime.js';
import { usStatePaths } from './data/us-state-paths.js';
import { resolveRoute } from './geography.js';
import {
	defaultDraft,
	draftFromUrl,
	draftUrl,
	emptyInitialModel,
	normalizeDraft,
	packagePresets,
	rankQuotes
} from './model.js';
import { configuredProviderIds, quoteProvider } from './providers/index.js';
import type {
	ExtraService,
	InitialModel,
	ProviderId,
	ProviderResult,
	QuoteSort,
	RateQuote,
	RouteResult,
	ShipmentDraft
} from './types.js';

type PageState = { model: InitialModel };

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

type WorkspaceState = {
	draft: ShipmentDraft;
	providers: ProviderResult[];
	route: RouteResult;
	revision: number;
	loading: ProviderId[];
	error?: string;
	sort: QuoteSort;
	enabledFilters: ProviderId[];
	restored: boolean;
};

export function CalculatorWorkspace(
	this: Component<WorkspaceState>,
	props: { initial: InitialModel }
) {
	this.state.draft = cloneDraft(props.initial.draft);
	this.state.providers = props.initial.providers;
	this.state.route = props.initial.route;
	this.state.revision = 0;
	this.state.loading = [];
	this.state.error = undefined;
	this.state.sort = 'recommended';
	this.state.enabledFilters = [...props.initial.configuredProviders];
	this.state.restored = false;

	this.task(() => {
		if (props.initial.explicitUrlState) return;
		try {
			const saved = localStorage.getItem('parcel-lab:last-shipment');
			if (!saved) return;
			const candidate = { ...defaultDraft, ...JSON.parse(saved) } as ShipmentDraft;
			normalizeDraft(candidate);
			this.state.draft = candidate;
			this.state.restored = true;
			this.state.revision++;
		} catch {
			localStorage.removeItem('parcel-lab:last-shipment');
		}
	});

	this.task(this.state.revision, async (_revision, { signal }) => {
		await delay(450, signal);
		let request;
		try {
			request = normalizeDraft(this.state.draft);
			this.state.error = undefined;
		} catch (error) {
			this.state.error = error instanceof Error ? error.message : 'Check the shipment details';
			this.state.loading = [];
			return;
		}
		history.replaceState(null, '', draftUrl(this.state.draft, new URL(location.href)));
		const generation = this.state.revision;
		const ids = props.initial.configuredProviders;
		this.state.loading = [...ids];
		const client = exactClient();
		const routePromise = client.invokeAction('route.resolve', request);
		const providerPromises = ids.map((id) =>
			client.invokeAction(`quote.${id}`, request).then((result) => ({ id, result }))
		);
		routePromise
			.then((result) => {
				if (generation === this.state.revision && result.state)
					this.state.route = result.state as RouteResult;
			})
			.catch(() => undefined);
		await Promise.all(
			providerPromises.map((promise) =>
				promise
					.then(({ id, result }) => {
						if (generation !== this.state.revision) return;
						const provider = result.state as ProviderResult;
						this.state.providers = [
							...this.state.providers.filter((item) => item.providerId !== id),
							provider
						];
						this.state.loading = this.state.loading.filter((item) => item !== id);
					})
					.catch(() => undefined)
			)
		);
		if (generation !== this.state.revision) return;
		this.state.loading = [];
		if (this.state.providers.some((provider) => provider.status === 'success')) {
			localStorage.setItem('parcel-lab:last-shipment', JSON.stringify(this.state.draft));
		}
	});

	const change = <K extends keyof ShipmentDraft>(key: K, value: ShipmentDraft[K]) => {
		this.state.draft[key] = value;
		this.state.revision++;
	};
	const text =
		<K extends keyof ShipmentDraft>(key: K) =>
		(event: Event) =>
			change(key, (event.currentTarget as HTMLInputElement).value as ShipmentDraft[K]);
	const checked =
		<K extends keyof ShipmentDraft>(key: K) =>
		(event: Event) =>
			change(key, (event.currentTarget as HTMLInputElement).checked as ShipmentDraft[K]);
	const select =
		<K extends keyof ShipmentDraft>(key: K) =>
		(event: Event) =>
			change(key, (event.currentTarget as HTMLSelectElement).value as ShipmentDraft[K]);
	const applyPreset = (event: Event) => {
		const preset = (event.currentTarget as HTMLSelectElement).value as ShipmentDraft['preset'];
		Object.assign(this.state.draft, packagePresets[preset], { preset });
		this.state.revision++;
	};
	const toggleProvider = (id: ProviderId, event: Event) => {
		const include = (event.currentTarget as HTMLInputElement).checked;
		this.state.enabledFilters = include
			? [...new Set([...this.state.enabledFilters, id])]
			: this.state.enabledFilters.filter((item) => item !== id);
	};

	return () => {
		const visibleProviders = this.state.providers.filter((provider) =>
			this.state.enabledFilters.includes(provider.providerId)
		);
		const quotes = rankQuotes(
			visibleProviders.flatMap((provider) => provider.quotes),
			this.state.sort
		);
		return (
			<section className="calculator" aria-label="Shipping calculator">
				<div className="calculator-grid">
					<form className="shipment-card" onSubmit={(event: Event) => event.preventDefault()}>
						<div className="section-heading">
							<div>
								<p className="step">01</p>
								<h2>Shipment</h2>
							</div>
							{this.state.restored ? <span className="restored">Recent trip restored</span> : null}
						</div>

						<fieldset className="route-fields">
							<legend>Route</legend>
							<label>
								From ZIP
								<input
									name="originZip"
									inputMode="numeric"
									autoComplete="postal-code"
									value={this.state.draft.originZip}
									onInput={text('originZip')}
								/>
							</label>
							<button
								className="swap"
								type="button"
								aria-label="Swap origin and destination"
								onClick={() => {
									const origin = this.state.draft.originZip;
									this.state.draft.originZip = this.state.draft.destinationZip;
									this.state.draft.destinationZip = origin;
									this.state.revision++;
								}}
							>
								⇄
							</button>
							<label>
								To ZIP
								<input
									name="destinationZip"
									inputMode="numeric"
									autoComplete="postal-code"
									value={this.state.draft.destinationZip}
									onInput={text('destinationZip')}
								/>
							</label>
						</fieldset>

						<fieldset>
							<legend>Mailpiece</legend>
							<div className="segmented" role="group" aria-label="Mailpiece type">
								{(['parcel', 'envelope', 'flat'] as const).map((kind) => (
									<button
										type="button"
										className={this.state.draft.kind === kind ? 'active' : ''}
										aria-pressed={this.state.draft.kind === kind}
										onClick={() => change('kind', kind)}
									>
										{capitalize(kind)}
									</button>
								))}
							</div>
							<label>
								Preset
								<select value={this.state.draft.preset} onChange={applyPreset}>
									<option value="custom">Custom dimensions</option>
									<option value="mailer">Poly mailer</option>
									<option value="small-box">Small box</option>
									<option value="medium-box">Medium box</option>
									<option value="large-box">Large box</option>
									<option value="letter">Letter envelope</option>
									<option value="large-envelope">Large envelope</option>
								</select>
							</label>
						</fieldset>

						<fieldset>
							<legend>Weight & dimensions</legend>
							<div className="measure-grid weight-grid">
								<label>
									Pounds
									<input
										type="number"
										min="0"
										max="70"
										step="1"
										value={this.state.draft.pounds}
										onInput={text('pounds')}
									/>
								</label>
								<label>
									Ounces
									<input
										type="number"
										min="0"
										max="15.999"
										step="0.1"
										value={this.state.draft.ounces}
										onInput={text('ounces')}
									/>
								</label>
							</div>
							<div className="measure-grid dimension-grid">
								<label>
									Length <span>in</span>
									<input
										type="number"
										min="0.01"
										step="0.1"
										value={this.state.draft.length}
										onInput={text('length')}
									/>
								</label>
								<label>
									{this.state.draft.kind === 'parcel' ? 'Width' : 'Height'} <span>in</span>
									<input
										type="number"
										min="0.01"
										step="0.1"
										value={this.state.draft.width}
										onInput={text('width')}
									/>
								</label>
								<label>
									{this.state.draft.kind === 'parcel' ? 'Height' : 'Thickness'} <span>in</span>
									<input
										type="number"
										min="0.001"
										step="0.1"
										value={this.state.draft.height}
										onInput={text('height')}
									/>
								</label>
							</div>
						</fieldset>

						<fieldset>
							<legend>Protection & confirmation</legend>
							<label>
								Declared value <span className="input-prefix">$</span>
								<input
									className="with-prefix"
									type="number"
									min="0"
									max="50000"
									step="0.01"
									placeholder="Optional"
									value={this.state.draft.declaredValue}
									onInput={text('declaredValue')}
								/>
							</label>
							<label className="check-row">
								<input
									type="checkbox"
									checked={this.state.draft.tracking}
									onChange={checked('tracking')}
								/>
								<span>
									<strong>Require tracking</strong>
									<small>Included where possible, priced when it is an add-on.</small>
								</span>
							</label>
							<label>
								Signature
								<select value={this.state.draft.signature} onChange={select('signature')}>
									<option value="none">No signature required</option>
									<option value="standard">Signature required</option>
									<option value="adult">Adult signature required</option>
								</select>
							</label>
							<label className="check-row">
								<input
									type="checkbox"
									checked={this.state.draft.insurance}
									disabled={!this.state.draft.declaredValue}
									onChange={checked('insurance')}
								/>
								<span>
									<strong>Price insurance</strong>
									<small>Enter a declared value to compare coverage.</small>
								</span>
							</label>
						</fieldset>

						<details>
							<summary>Advanced details</summary>
							<div className="advanced-grid">
								<label className="check-row">
									<input
										type="checkbox"
										checked={this.state.draft.residential}
										onChange={checked('residential')}
									/>
									<span>Residential destination</span>
								</label>
								<label className="check-row">
									<input
										type="checkbox"
										checked={this.state.draft.machinable}
										onChange={checked('machinable')}
									/>
									<span>Machinable mailpiece</span>
								</label>
								<label>
									Mailing date
									<input type="date" value={this.state.draft.shipDate} onInput={text('shipDate')} />
								</label>
							</div>
						</details>
						<p className="validation" role="alert">
							{this.state.error ?? 'Rates update automatically after you pause typing.'}
						</p>
					</form>

					<section className="visual-card" aria-labelledby="route-title">
						<div className="section-heading">
							<div>
								<p className="step">02</p>
								<h2 id="route-title">Route</h2>
							</div>
							<span className="distance">
								{this.state.route.distanceMiles
									? `${this.state.route.distanceMiles.toLocaleString()} mi`
									: 'Approximate'}
							</span>
						</div>
						<RouteMap
							route={this.state.route}
							origin={this.state.draft.originZip}
							destination={this.state.draft.destinationZip}
						/>
						<div className="route-caption">
							<span>
								<small>Origin</small>
								<strong>{this.state.draft.originZip || '—'}</strong>
							</span>
							<span className="route-line" aria-hidden="true"></span>
							<span>
								<small>Destination</small>
								<strong>{this.state.draft.destinationZip || '—'}</strong>
							</span>
						</div>
					</section>

					<section
						className="results-card"
						aria-labelledby="rates-title"
						aria-busy={this.state.loading.length > 0 || undefined}
					>
						<div className="results-header">
							<div className="section-heading">
								<div>
									<p className="step">03</p>
									<h2 id="rates-title">Rates</h2>
								</div>
								<span className="quote-count">
									{quotes.length} option{quotes.length === 1 ? '' : 's'}
								</span>
							</div>
							<div className="quote-tools">
								<label>
									Sort
									<select
										value={this.state.sort}
										onChange={(event: Event) => {
											this.state.sort = (event.currentTarget as HTMLSelectElement)
												.value as QuoteSort;
										}}
									>
										<option value="recommended">Recommended</option>
										<option value="cheapest">Cheapest</option>
										<option value="fastest">Fastest</option>
										<option value="carrier">Carrier</option>
									</select>
								</label>
								<div className="provider-filters" aria-label="Filter carriers">
									{props.initial.configuredProviders.map((id) => (
										<label>
											<input
												type="checkbox"
												checked={this.state.enabledFilters.includes(id)}
												onChange={(event: Event) => toggleProvider(id, event)}
											/>
											{providerName(id)}
										</label>
									))}
								</div>
							</div>
						</div>
						<p className="status-line" role="status" aria-live="polite">
							{this.state.loading.length
								? `Refreshing ${this.state.loading.map(providerName).join(', ')}…`
								: `Showing rates from ${visibleProviders.filter((item) => item.status === 'success').length} source${visibleProviders.filter((item) => item.status === 'success').length === 1 ? '' : 's'}.`}
						</p>
						{visibleProviders
							.filter((provider) => provider.status === 'error')
							.map((provider) => (
								<div className="provider-error">
									<strong>{provider.providerName}</strong>
									<span>{provider.error?.message}</span>
								</div>
							))}
						<div className="quote-list">
							{quotes.map((quote, index) => (
								<RateCard
									quote={quote}
									best={index === 0 && quote.compatible}
									refreshing={this.state.loading.includes(quote.providerId)}
								/>
							))}
							{!quotes.length && !this.state.loading.length ? (
								<div className="empty-results">
									<strong>No compatible rates yet.</strong>
									<span>Check the shipment details or enable a provider on the server.</span>
								</div>
							) : null}
						</div>
					</section>
				</div>
			</section>
		);
	};
}

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

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(resolve, milliseconds);
		const abort = () => {
			clearTimeout(timer);
			reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
		};
		if (signal.aborted) abort();
		else signal.addEventListener('abort', abort, { once: true });
	});
}
function cloneDraft(draft: ShipmentDraft): ShipmentDraft {
	return { ...draft };
}
function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}
function providerName(id: ProviderId): string {
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
