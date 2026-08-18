import type { Component } from '@exactjs/core';
import {
	parseStoredThemeAppearance,
	persistThemeAppearance,
	resolveThemeAppearance,
	themeAppearanceStorageKey,
	ThemeModeToggle,
	toggleThemeAppearance,
	type EffectiveThemeAppearance,
	type ThemeAppearancePreference
} from '@exactjs/app-theme-preference';
// The compiler consumes this namespace through the theme:* enhancement syntax below.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as theme from '@exactjs/theme/enhancements' with { type: 'exact-enhancement' };
import {
	comparisonLocales,
	localeEnvironments,
	setComparisonUnitPolicy
} from './locale-environments.js';
import { LocaleShowcase, preloadLazyShowcase, type LazyRegionKey } from './showcase.js';

interface TestbedState {
	name: string;
	count: number;
	role: 'owner' | 'member';
	ready: boolean;
	total: number;
	minimumDistance: number;
	maximumDistance: number;
	height: number;
	temperature: number;
	position: number;
	unitPolicy: 'locale' | 'metric' | 'us';
	lazyRegion: LazyRegionKey;
	lazyLoading: boolean;
	themePreference: ThemeAppearancePreference;
	systemAppearance: EffectiveThemeAppearance;
}

const publishedAgo = {
	years: 0,
	months: 0,
	weeks: 0,
	days: 0,
	hours: 0,
	minutes: 7,
	seconds: 0
} as Temporal.Duration;

/** Owns shared controls so every locale panel receives identical reactive values. */
export function IntlTestbed(this: Component<TestbedState>) {
	this.state.name = 'Avery';
	this.state.count = 2;
	this.state.role = 'owner';
	this.state.ready = true;
	this.state.total = 1249.5;
	this.state.minimumDistance = 12;
	this.state.maximumDistance = 18;
	this.state.height = 68;
	this.state.temperature = 22;
	this.state.position = 21;
	this.state.unitPolicy = 'locale';
	this.state.lazyRegion = 'empty';
	this.state.lazyLoading = false;
	this.state.themePreference = 'system';
	this.state.systemAppearance = 'light';

	const appearance = () =>
		resolveThemeAppearance(this.state.themePreference, this.state.systemAppearance);
	const toggleAppearance = () => {
		this.state.themePreference = toggleThemeAppearance(appearance(), this.state.systemAppearance);
		persistThemeAppearance(this.state.themePreference);
	};
	this.onMount(({ signal }) => {
		const query = matchMedia('(prefers-color-scheme: dark)');
		const syncSystem = () => (this.state.systemAppearance = query.matches ? 'dark' : 'light');
		const syncStorage = (event: StorageEvent) => {
			if (event.key === themeAppearanceStorageKey)
				this.state.themePreference = parseStoredThemeAppearance(event.newValue);
		};
		syncSystem();
		this.state.themePreference = parseStoredThemeAppearance(
			localStorage.getItem(themeAppearanceStorageKey)
		);
		query.addEventListener('change', syncSystem, { signal });
		window.addEventListener('storage', syncStorage, { signal });
	});

	const setUnitPolicy = (policy: TestbedState['unitPolicy']) => {
		this.state.unitPolicy = policy;
		setComparisonUnitPolicy(policy);
	};
	const loadLazyRegion = async () => {
		this.state.lazyLoading = true;
		await preloadLazyShowcase();
		this.state.lazyRegion = 'loaded';
		this.state.lazyLoading = false;
	};

	return () => (
		<main
			theme:scope
			theme:appearance={appearance()}
			theme:tonic="green"
			theme:temperament="balanced"
			theme:depth="elevated"
			theme:typography="humanist"
		>
			<ThemeModeToggle appearance={appearance()} onToggle={toggleAppearance} />
			<header className="hero">
				<a className="docs-link" href="../">
					Documentation
				</a>
				<p className="eyebrow">eXact internationalization test bed</p>
				<h1>Ordinary JSX, four cultural interpretations</h1>
				<p className="hero-copy">
					Change one value and compare every locale at once. Colored fragment outlines make
					structural reordering visible; the source remains a normal fallback when no catalog entry
					exists.
				</p>
				<pre theme:surface="sunken" aria-label="Representative enhancement source">
					<code>{`<p intl:message="transfer-order">
  Send <strong intl:fragment="report">the quarterly report</strong> to
  <_ intl:fragment="recipient"><RecipientBadge /></_>.
</p>`}</code>
				</pre>
			</header>

			<section
				theme:surface="overlay"
				className="control-deck"
				aria-label="Shared scenario controls"
			>
				<label>
					Name
					<input
						theme:field
						value={this.state.name}
						onInput={(event) => (this.state.name = event.currentTarget.value)}
					/>
				</label>
				<label>
					Messages
					<input
						theme:field
						type="number"
						min="0"
						value={this.state.count}
						onInput={(event) => (this.state.count = event.currentTarget.valueAsNumber)}
					/>
				</label>
				<label>
					Queue position
					<input
						theme:field
						type="number"
						min="1"
						value={this.state.position}
						onInput={(event) => (this.state.position = event.currentTarget.valueAsNumber)}
					/>
				</label>
				<label>
					Role
					<select
						theme:field
						value={this.state.role}
						onChange={(event) =>
							(this.state.role = event.currentTarget.value as TestbedState['role'])
						}
					>
						<option value="owner">Owner</option>
						<option value="member">Member</option>
					</select>
				</label>
				<label className="checkbox-control">
					<input
						theme:field
						type="checkbox"
						checked={this.state.ready}
						onChange={(event) => (this.state.ready = event.currentTarget.checked)}
					/>
					Ready
				</label>
				<label>
					Unit policy
					<select
						theme:field
						value={this.state.unitPolicy}
						onChange={(event) =>
							setUnitPolicy(event.currentTarget.value as TestbedState['unitPolicy'])
						}
					>
						<option value="locale">Locale default</option>
						<option value="metric">Metric</option>
						<option value="us">US customary</option>
					</select>
				</label>
				<button
					theme:action="secondary"
					type="button"
					className="lazy-button"
					onClick={loadLazyRegion}
					disabled={this.state.lazyLoading || this.state.lazyRegion === 'loaded'}
				>
					{this.state.lazyLoading ? 'Loading locale chunk…' : 'Load translated lazy panel'}
				</button>
			</section>

			<div className="comparison-key" id="catalogs">
				<span>
					<i className="key-report" /> translator-movable intrinsic
				</span>
				<span>
					<i className="key-recipient" /> movable opaque component
				</span>
			</div>

			<section className="locale-grid" aria-label="Side-by-side locale comparison">
				{comparisonLocales.map((locale) => (
					<LocaleShowcase
						key={locale}
						locale={locale}
						environment={localeEnvironments[locale]}
						name={this.state.name}
						count={this.state.count}
						hasMessageCount={this.state.count !== 0 && !Number.isNaN(this.state.count)}
						role={this.state.role}
						ready={this.state.ready}
						total={this.state.total}
						minimumDistance={this.state.minimumDistance}
						maximumDistance={this.state.maximumDistance}
						height={this.state.height}
						temperature={this.state.temperature}
						position={this.state.position}
						languageCode="ja"
						collaborators={['Avery', 'Mina', 'Samir']}
						publishedAgo={publishedAgo}
						lazyRegion={this.state.lazyRegion}
					/>
				))}
			</section>
		</main>
	);
}
