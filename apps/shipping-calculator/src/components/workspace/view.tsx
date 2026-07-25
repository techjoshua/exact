import { rankQuotes } from '../../model.js';
import type { InitialModel } from '../../types.js';
import { RateCard, RouteMap, capitalize, providerName } from '../presentation.js';
import type { WorkspaceState } from './contracts.js';
import type { createWorkspaceInputs } from './inputs.js';

/** Renders the calculator workspace from reactive state and bound input operations. */
export function renderWorkspace(
	state: WorkspaceState,
	props: { initial: InitialModel },
	inputs: ReturnType<typeof createWorkspaceInputs>
) {
	const { change, text, checked, select, applyPreset } = inputs;
	const visibleProviders = state.providers.filter((provider) =>
		state.enabledFilters.includes(provider.providerId)
	);
	const quotes = rankQuotes(
		visibleProviders.flatMap((provider) => provider.quotes),
		state.sort
	);
	return (
		<section className="calculator" aria-label="Shipping calculator">
			<div className="calculator-grid">
				<form className="shipment-card" onSubmit={(event) => event.preventDefault()}>
					<div className="section-heading">
						<div>
							<p className="step">01</p>
							<h2>Shipment</h2>
						</div>
						{state.restored ? <span className="restored">Recent trip restored</span> : null}
					</div>

					<fieldset className="route-fields">
						<legend>Route</legend>
						<label>
							From ZIP
							<input
								name="originZip"
								inputMode="numeric"
								autoComplete="postal-code"
								value={state.draft.originZip}
								onInput={text('originZip')}
							/>
						</label>
						<button
							className="swap"
							type="button"
							aria-label="Swap origin and destination"
							onClick={() => {
								const origin = state.draft.originZip;
								state.draft.originZip = state.draft.destinationZip;
								state.draft.destinationZip = origin;
								state.revision++;
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
								value={state.draft.destinationZip}
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
									className={state.draft.kind === kind ? 'active' : ''}
									aria-pressed={state.draft.kind === kind}
									onClick={() => change('kind', kind)}
								>
									{capitalize(kind)}
								</button>
							))}
						</div>
						<label>
							Preset
							<select value={state.draft.preset} onChange={applyPreset}>
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
									value={state.draft.pounds}
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
									value={state.draft.ounces}
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
									value={state.draft.length}
									onInput={text('length')}
								/>
							</label>
							<label>
								{state.draft.kind === 'parcel' ? 'Width' : 'Height'} <span>in</span>
								<input
									type="number"
									min="0.01"
									step="0.1"
									value={state.draft.width}
									onInput={text('width')}
								/>
							</label>
							<label>
								{state.draft.kind === 'parcel' ? 'Height' : 'Thickness'} <span>in</span>
								<input
									type="number"
									min="0.001"
									step="0.1"
									value={state.draft.height}
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
								value={state.draft.declaredValue}
								onInput={text('declaredValue')}
							/>
						</label>
						<label className="check-row">
							<input
								type="checkbox"
								checked={state.draft.tracking}
								onChange={checked('tracking')}
							/>
							<span>
								<strong>Require tracking</strong>
								<small>Included where possible, priced when it is an add-on.</small>
							</span>
						</label>
						<label>
							Signature
							<select value={state.draft.signature} onChange={select('signature')}>
								<option value="none">No signature required</option>
								<option value="standard">Signature required</option>
								<option value="adult">Adult signature required</option>
							</select>
						</label>
						<label className="check-row">
							<input
								type="checkbox"
								checked={state.draft.insurance}
								disabled={!state.draft.declaredValue}
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
									checked={state.draft.residential}
									onChange={checked('residential')}
								/>
								<span>Residential destination</span>
							</label>
							<label className="check-row">
								<input
									type="checkbox"
									checked={state.draft.machinable}
									onChange={checked('machinable')}
								/>
								<span>Machinable mailpiece</span>
							</label>
							<label>
								Mailing date
								<input type="date" value={state.draft.shipDate} onInput={text('shipDate')} />
							</label>
						</div>
					</details>
					<p className="validation" role="alert">
						{state.error ?? 'Rates update automatically after you pause typing.'}
					</p>
				</form>

				<section className="visual-card" aria-labelledby="route-title">
					<div className="section-heading">
						<div>
							<p className="step">02</p>
							<h2 id="route-title">Route</h2>
						</div>
						<span className="distance">
							{state.route.distanceMiles
								? `${state.route.distanceMiles.toLocaleString()} mi`
								: 'Approximate'}
						</span>
					</div>
					<RouteMap
						route={state.route}
						origin={state.draft.originZip}
						destination={state.draft.destinationZip}
					/>
					<div className="route-caption">
						<span>
							<small>Origin</small>
							<strong>{state.draft.originZip || '—'}</strong>
						</span>
						<span className="route-line" aria-hidden="true"></span>
						<span>
							<small>Destination</small>
							<strong>{state.draft.destinationZip || '—'}</strong>
						</span>
					</div>
				</section>

				<section
					className="results-card"
					aria-labelledby="rates-title"
					aria-busy={state.loading.length > 0 || undefined}
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
								<select value:change={state.sort}>
									<option value="recommended">Recommended</option>
									<option value="cheapest">Cheapest</option>
									<option value="fastest">Fastest</option>
									<option value="carrier">Carrier</option>
								</select>
							</label>
							<div className="provider-filters" aria-label="Filter carriers">
								{props.initial.configuredProviders.map((id) => (
									<label>
										<input type="checkbox" value={id} checked:change={state.enabledFilters} />
										{providerName(id)}
									</label>
								))}
							</div>
						</div>
					</div>
					<p className="status-line" role="status" aria-live="polite">
						{state.loading.length
							? `Refreshing ${state.loading.map(providerName).join(', ')}…`
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
								refreshing={state.loading.includes(quote.providerId)}
							/>
						))}
						{!quotes.length && !state.loading.length ? (
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
}
