import {
	createComponentRegistry,
	preloadComponent,
	Suspense,
	type Component,
	type KeyOf
} from '@exactjs/core';
import { intlLocaleMetadata, IntlProvider, type IntlEnvironment } from '@exactjs/intl';
import { _ } from '@exactjs/jsx';

const englishOrdinalRules = new Intl.PluralRules('en-US', { type: 'ordinal' });
const englishOrdinalSuffixes: Readonly<Record<Intl.LDMLPluralRule, string>> = {
	zero: 'th',
	one: 'st',
	two: 'nd',
	few: 'rd',
	many: 'th',
	other: 'th'
};

const LazyRegion = createComponentRegistry(({ lazy }) => ({
	empty: EmptyLazyRegion,
	loaded: lazy(() => import('./lazy-showcase.js').then(({ LazyShowcase }) => LazyShowcase))
}));

/** Finite lazy-region state selected by the parent test-bed controls. */
export type LazyRegionKey = 'empty' | 'loaded';

function registryKey(key: LazyRegionKey): KeyOf<typeof LazyRegion> {
	return key;
}

/** Loads the finite lazy entry and its descriptor companion before selecting its range. */
export function preloadLazyShowcase(): Promise<void> {
	return preloadComponent(LazyRegion.loaded);
}

/** Mutable values shared by each locale panel. */
export interface ShowcaseValues {
	name: string;
	count: number;
	hasMessageCount: boolean;
	role: 'owner' | 'member';
	ready: boolean;
	total: number;
	minimumDistance: number;
	maximumDistance: number;
	height: number;
	temperature: number;
	position: number;
	languageCode: string;
	collaborators: string[];
	publishedAgo: Temporal.Duration;
	lazyRegion: LazyRegionKey;
}

/** Props for one independently localized rendering of the shared values. */
export interface LocaleShowcaseProps extends ShowcaseValues {
	locale: string;
	environment: IntlEnvironment;
}

/** A deliberately ordinary component used only through an opaque named fragment. */
function RecipientBadge(this: Component<Record<string, never>>) {
	return () => (
		<span className="person-badge" translate="no">
			Mina
		</span>
	);
}

/** Empty eager registry entry shown before the lazy example is requested. */
function EmptyLazyRegion(this: Component<Record<string, never>>) {
	return () => (
		<aside className="lazy-result lazy-idle" intl:message="lazy-idle">
			Lazy locale chunk not requested.
		</aside>
	);
}

/** Renders the same enhancement-authored scenarios under one locale environment. */
export function LocaleShowcase(this: Component<Record<string, never>>, props: LocaleShowcaseProps) {
	const CurrentLazyRegion = LazyRegion[registryKey(props.lazyRegion)];
	const eventDate = new Date('2026-08-08T16:30:00Z');
	const rangeStart = new Date('2026-08-08T16:30:00Z');
	const rangeEnd = new Date('2026-08-12T19:00:00Z');

	return () => (
		<IntlProvider environment={props.environment}>
			<article className="locale-panel" intl:locale data-locale={props.locale}>
				<header className="locale-heading">
					<div>
						<span className="locale-code">{props.locale}</span>
						<h2 intl:message="panel-title">The same source, localized</h2>
					</div>
					<span className="direction-chip">
						{intlLocaleMetadata(props.environment.state.locale).dir.toUpperCase()}
					</span>
				</header>

				<section className="scenario" data-scenario="message-structure">
					<p className="scenario-label" intl:message="scenario-structure">
						Message structure
					</p>
					<p intl:message="greeting">
						Hello, {props.name}. Read
						<a href="#catalogs" intl:fragment="catalogs">
							the catalog notes
						</a>
						.
					</p>
					<p intl:message="transfer-order" className="reorder-example">
						Send <strong intl:fragment="report">the quarterly report</strong> to
						<_ intl:fragment="recipient">
							<RecipientBadge />
						</_>
						.
					</p>
					<p className="reorder-note" intl:message="reorder-note">
						The report and recipient are movable, but their implementations are not translated.
					</p>
				</section>

				<section className="scenario" data-scenario="selection">
					<p className="scenario-label" intl:message="scenario-selection">
						Branches and plurality
					</p>
					<p intl:message="inbox-count">
						You have {props.hasMessageCount ? `${props.count}` : 'no'} new
						<_ intl:plural={props.count}>{props.count === 1 ? 'message' : 'messages'}</_>.
					</p>
					<p intl:message="status-selection">
						{props.ready ? 'Ready' : 'Waiting'}: {props.role === 'owner' ? 'Owner' : 'Member'}
					</p>
					<p intl:message="ordinal-position">
						You finished {props.position}
						<sup>{englishOrdinalSuffixes[englishOrdinalRules.select(props.position)]}</sup>
						in the review queue.
					</p>
				</section>

				<section className="scenario" data-scenario="formatters">
					<p className="scenario-label" intl:message="scenario-formatters">
						Native intent inference
					</p>
					<dl className="value-grid">
						<div>
							<dt intl:message="label-currency">Currency</dt>
							<dd intl:currency>${props.total}</dd>
						</div>
						<div>
							<dt intl:message="label-road-range">Road range</dt>
							<dd intl:message="road-range-value">
								Route coverage:
								<_ intl:unit="distance-road">
									{props.minimumDistance}-{props.maximumDistance} miles
								</_>
								.
							</dd>
						</div>
						<div>
							<dt intl:message="label-height">Person height</dt>
							<dd intl:cldr="length/person-height">{props.height} inches</dd>
						</div>
						<div>
							<dt intl:message="label-temperature">Temperature</dt>
							<dd intl:cldr="temperature/weather">{props.temperature} °C</dd>
						</div>
						<div>
							<dt intl:message="label-land-area">Land area</dt>
							<dd intl:unit="area-land">{2} acres</dd>
						</div>
						<div>
							<dt intl:message="label-person-mass">Person mass</dt>
							<dd intl:unit="mass-person">{180} pounds</dd>
						</div>
						<div>
							<dt intl:message="label-liquid-volume">Liquid volume</dt>
							<dd intl:unit="volume-liquid">{12} gallons</dd>
						</div>
						<div>
							<dt intl:message="label-road-speed">Road speed</dt>
							<dd intl:unit="speed-road">{65} mph</dd>
						</div>
						<div>
							<dt intl:message="label-weather-pressure">Weather pressure</dt>
							<dd intl:unit="pressure-weather">{29.92} inHg</dd>
						</div>
						<div>
							<dt intl:message="label-food-energy">Food energy</dt>
							<dd intl:unit="energy-food">{500} kcal</dd>
						</div>
						<div>
							<dt intl:message="label-engine-power">Engine power</dt>
							<dd intl:unit="power-engine">{150} hp</dd>
						</div>
						<div>
							<dt intl:message="label-fuel-economy">Fuel economy</dt>
							<dd intl:unit="fuel-economy-road">{30} mpg</dd>
						</div>
						<div>
							<dt intl:message="label-digital-storage">Digital storage</dt>
							<dd intl:unit="digital-storage">{512} GB</dd>
						</div>
					</dl>
					<p intl:message="date-time">
						Published
						{new Intl.DateTimeFormat('en-US', {
							dateStyle: 'long',
							timeStyle: 'short',
							timeZone: 'UTC'
						}).format(eventDate)}
						.
					</p>
					<p intl:message="date-range">
						Campaign:
						{new Intl.DateTimeFormat('en-US', {
							dateStyle: 'medium',
							timeZone: 'UTC'
						}).formatRange(rangeStart, rangeEnd)}
						.
					</p>
					<p intl:message="relative-duration">
						Posted
						{Math.abs(props.publishedAgo.years) > 0
							? `${Math.abs(props.publishedAgo.years)} year${Math.abs(props.publishedAgo.years) === 1 ? '' : 's'} ago`
							: Math.abs(props.publishedAgo.months) > 0
								? `${Math.abs(props.publishedAgo.months)} month${Math.abs(props.publishedAgo.months) === 1 ? '' : 's'} ago`
								: Math.abs(props.publishedAgo.weeks) > 0
									? `${Math.abs(props.publishedAgo.weeks)} week${Math.abs(props.publishedAgo.weeks) === 1 ? '' : 's'} ago`
									: Math.abs(props.publishedAgo.days) > 0
										? `${Math.abs(props.publishedAgo.days)} day${Math.abs(props.publishedAgo.days) === 1 ? '' : 's'} ago`
										: Math.abs(props.publishedAgo.hours) > 0
											? `${Math.abs(props.publishedAgo.hours)} hour${Math.abs(props.publishedAgo.hours) === 1 ? '' : 's'} ago`
											: Math.abs(props.publishedAgo.minutes) > 0
												? `${Math.abs(props.publishedAgo.minutes)} minute${Math.abs(props.publishedAgo.minutes) === 1 ? '' : 's'} ago`
												: Math.abs(props.publishedAgo.seconds) > 0
													? `${Math.abs(props.publishedAgo.seconds)} second${Math.abs(props.publishedAgo.seconds) === 1 ? '' : 's'} ago`
													: 'just now'}
						.
					</p>
					<p intl:message="display-list">
						Language: {new Intl.DisplayNames('en-US', { type: 'language' }).of(props.languageCode)}.
						Team:
						{new Intl.ListFormat('en-US', { type: 'conjunction' }).format(props.collaborators)}.
					</p>
				</section>

				<section className="scenario" data-scenario="properties">
					<p className="scenario-label" intl:message="scenario-properties">
						Intrinsic properties
					</p>
					<div className="property-row">
						<input
							placeholder="Search messages"
							intl:placeholder
							title="Search the localized inbox"
							intl:title
						/>
						<button
							type="button"
							aria-label={props.languageCode}
							intl:aria-label="display-name:languageCode"
						>
							<span aria-hidden="true">?</span>
						</button>
					</div>
				</section>

				<section className="scenario missing-scenario" data-scenario="unenhanced">
					<p className="scenario-label" intl:message="scenario-unenhanced">
						Intentional non-translated content
					</p>
					<p lang="en-US" dir="ltr" translate="no">
						This sentence is ordinary authored content and is intentionally not translated.
					</p>
				</section>

				<Suspense
					fallback={
						<aside className="lazy-result" intl:message="lazy-loading">
							Loading locale chunk…
						</aside>
					}
				>
					<CurrentLazyRegion />
				</Suspense>
			</article>
		</IntlProvider>
	);
}
