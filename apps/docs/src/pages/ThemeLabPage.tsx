import type { Component } from '@exactjs/core';
import { _ } from '@exactjs/jsx';
import { builtInThemeKeys } from '@exactjs/theme';
// The compiler consumes this namespace through the theme:* enhancement syntax below.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as theme from '@exactjs/theme/enhancements' with { type: 'exact-enhancement' };
import { ThemeSpecimen } from '@exactjs/theme-fixture';
import { Article } from './Article.jsx';

type Temperament =
	| 'balanced'
	| 'restrained'
	| 'expressive'
	| 'dramatic'
	| 'soft'
	| 'stark'
	| 'monochrome';
type Appearance = 'inherit' | 'system' | 'light' | 'dark';
type Density = 'compact' | 'comfortable' | 'spacious';
type Shape = 'square' | 'soft' | 'round' | 'pill';
type Depth = 'flat' | 'bordered' | 'elevated';
type Typography = 'system' | 'humanist' | 'geometric' | 'editorial' | 'monospace';
type Key = 'teal' | 'blue' | 'violet' | 'amber' | 'rose' | 'green';
type KeyChoice = Key | 'custom';
type NestedKeyChoice = 'inherit' | KeyChoice;
type NestedTemperament = 'inherit' | Temperament;
type LabState = {
	key: string;
	keyChoice: KeyChoice;
	keyColor: string;
	temperament: Temperament;
	appearance: Appearance;
	highContrast: boolean;
	density: Density;
	shape: Shape;
	depth: Depth;
	typography: Typography;
	reducedMotion: boolean;
	nestedKey: string;
	nestedKeyChoice: NestedKeyChoice;
	nestedKeyColor: string;
	nestedTemperament: NestedTemperament;
	nestedAppearance: Appearance;
	nestedHighContrast: boolean;
};

const temperaments: readonly Temperament[] = [
	'balanced',
	'restrained',
	'expressive',
	'dramatic',
	'soft',
	'stark',
	'monochrome'
];
const keys: readonly Key[] = ['teal', 'blue', 'violet', 'amber', 'rose', 'green'];

/** Interactive acceptance application for generated, nested, and externally derived themes. */
export function ThemeLabPage(this: Component<LabState>) {
	this.state.key = 'teal';
	this.state.keyChoice = 'teal';
	this.state.keyColor = builtInThemeKeys.teal;
	this.state.temperament = 'balanced';
	this.state.appearance = 'system';
	this.state.highContrast = false;
	this.state.density = 'comfortable';
	this.state.shape = 'soft';
	this.state.depth = 'elevated';
	this.state.typography = 'system';
	this.state.reducedMotion = false;
	this.state.nestedKey = 'violet';
	this.state.nestedKeyChoice = 'violet';
	this.state.nestedKeyColor = builtInThemeKeys.violet;
	this.state.nestedTemperament = 'dramatic';
	this.state.nestedAppearance = 'inherit';
	this.state.nestedHighContrast = false;
	return () => (
		<Article
			eyebrow="Example / @exactjs/theme"
			title="Theme Lab"
			description="Change a compact visual source and watch native controls, nested scopes, portable components, and derived chart colors react without remounting."
			previous={{ path: '/components/theme', label: 'Theming' }}
			next={{ path: '/components/date-time', label: 'Date & time' }}
		>
			<div className="theme-lab-workbench">
				<aside
					theme:surface="raised"
					className="theme-lab-root-controls"
					aria-label="Root theme configuration"
				>
					<h2>Root theme source</h2>
					<div className="theme-lab-controls">
						<label>
							Tonic preset{' '}
							<select
								theme:field
								value={this.state.keyChoice}
								onChange={(event: Event) => {
									const value = (event.currentTarget as HTMLSelectElement).value as KeyChoice;
									this.state.keyChoice = value;
									if (value === 'custom') this.state.key = this.state.keyColor;
									else {
										this.state.key = value;
										this.state.keyColor = builtInThemeKeys[value];
									}
								}}
							>
								{keys.map((value) => (
									<option value={value}>{value}</option>
								))}
								<option value="custom">custom</option>
							</select>
						</label>
						<label className="theme-lab-tonic-color">
							Custom tonic
							<span>
								<input
									theme:field
									type="color"
									aria-label="Root custom tonic color"
									value={this.state.keyColor}
									onInput={(event: Event) => {
										const value = (event.currentTarget as HTMLInputElement).value;
										this.state.keyColor = value;
										this.state.key = value;
										this.state.keyChoice = 'custom';
									}}
								/>
								<output>{this.state.keyColor}</output>
							</span>
						</label>
						<label>
							Temperament{' '}
							<select theme:field value:onChange={this.state.temperament}>
								{temperaments.map((value) => (
									<option value={value}>{value}</option>
								))}
							</select>
						</label>
						<label>
							Mode{' '}
							<select theme:field value:onChange={this.state.appearance}>
								<option value="system">system</option>
								<option value="light">light</option>
								<option value="dark">dark</option>
							</select>
						</label>
						<label>
							Density{' '}
							<select theme:field value:onChange={this.state.density}>
								<option value="compact">compact</option>
								<option value="comfortable">comfortable</option>
								<option value="spacious">spacious</option>
							</select>
						</label>
						<label>
							Shape{' '}
							<select theme:field value:onChange={this.state.shape}>
								<option value="square">square</option>
								<option value="soft">soft</option>
								<option value="round">round</option>
								<option value="pill">pill</option>
							</select>
						</label>
						<label>
							Depth{' '}
							<select theme:field value:onChange={this.state.depth}>
								<option value="flat">flat</option>
								<option value="bordered">bordered</option>
								<option value="elevated">elevated</option>
							</select>
						</label>
						<label>
							Typography{' '}
							<select theme:field value:onChange={this.state.typography}>
								<option value="system">system</option>
								<option value="humanist">humanist</option>
								<option value="geometric">geometric</option>
								<option value="editorial">editorial</option>
								<option value="monospace">monospace</option>
							</select>
						</label>
						<label>
							<input theme:selection type="checkbox" checked:onChange={this.state.highContrast} />{' '}
							High contrast
						</label>
						<label>
							<input theme:selection type="checkbox" checked:onChange={this.state.reducedMotion} />{' '}
							Reduced motion
						</label>
					</div>
				</aside>
				<_
					theme:scope
					theme:element="section"
					theme:tonic={this.state.key}
					theme:temperament={this.state.temperament}
					theme:appearance={this.state.appearance}
					theme:contrast={this.state.highContrast ? 'more' : 'standard'}
					theme:density={this.state.density}
					theme:shape={this.state.shape}
					theme:depth={this.state.depth}
					theme:typography={this.state.typography}
					theme:motion={this.state.reducedMotion ? 'reduced' : 'full'}
				>
					<div className="theme-lab-scope">
						<section className="theme-lab-depth-preview" aria-labelledby="theme-depth-heading">
							<h2 id="theme-depth-heading" theme:text="heading">
								Surface depth comparison
							</h2>
							<p theme:text="supporting">
								Change Depth while these four surfaces remain visible beside the source controls.
							</p>
							<div className="theme-lab-depth-grid">
								<div theme:surface="base">Base</div>
								<div theme:surface="raised">Raised</div>
								<div theme:surface="floating">Floating</div>
								<div theme:surface="sunken">Sunken</div>
							</div>
						</section>
						<ThemeSpecimen label="Root theme" />
						<_
							theme:scope
							theme:element="aside"
							theme:tonic={this.state.nestedKey}
							theme:temperament={this.state.nestedTemperament}
							theme:appearance={this.state.nestedAppearance}
							theme:contrast={this.state.nestedHighContrast ? 'more' : 'inherit'}
							theme:background="canvas"
						>
							<div className="theme-lab-nested-controls" theme:surface="sunken">
								<h2 theme:text="heading">Nested theme source</h2>
								<p theme:text="supporting">
									Each source axis can inherit independently. Density, shape, depth, typography, and
									motion always inherit in this specimen.
								</p>
								<label>
									Tonic preset{' '}
									<select
										value={this.state.nestedKeyChoice}
										onChange={(event: Event) => {
											const value = (event.currentTarget as HTMLSelectElement)
												.value as NestedKeyChoice;
											this.state.nestedKeyChoice = value;
											this.state.nestedKey =
												value === 'custom'
													? this.state.nestedKeyColor
													: value === 'inherit'
														? 'inherit'
														: value;
											if (value !== 'custom' && value !== 'inherit')
												this.state.nestedKeyColor = builtInThemeKeys[value];
										}}
										theme:field
									>
										<option value="inherit">inherit</option>
										{keys.map((value) => (
											<option value={value}>{value}</option>
										))}
										<option value="custom">custom</option>
									</select>
								</label>
								<label className="theme-lab-tonic-color">
									Custom tonic
									<span>
										<input
											type="color"
											aria-label="Nested custom tonic color"
											value={this.state.nestedKeyColor}
											onInput={(event: Event) => {
												const value = (event.currentTarget as HTMLInputElement).value;
												this.state.nestedKeyColor = value;
												this.state.nestedKey = value;
												this.state.nestedKeyChoice = 'custom';
											}}
											theme:field
										/>
										<output theme:text="supporting">{this.state.nestedKeyColor}</output>
									</span>
								</label>
								<label>
									Temperament{' '}
									<select value:onChange={this.state.nestedTemperament} theme:field>
										<option value="inherit">inherit</option>
										{temperaments.map((value) => (
											<option value={value}>{value}</option>
										))}
									</select>
								</label>
								<label>
									Mode{' '}
									<select value:onChange={this.state.nestedAppearance} theme:field>
										<option value="inherit">inherit</option>
										<option value="system">system</option>
										<option value="light">light</option>
										<option value="dark">dark</option>
									</select>
								</label>
								<label>
									<input
										type="checkbox"
										checked:onChange={this.state.nestedHighContrast}
										theme:field
									/>{' '}
									High contrast
								</label>
							</div>
							<ThemeSpecimen label="Nested theme" />
						</_>
					</div>
				</_>
			</div>
		</Article>
	);
}
