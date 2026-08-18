import type { Component } from '@exactjs/core';
import type { DocsThemeSettings, ThemeSettingName } from './theme-context.js';
import { ThemeContext } from './theme-context.js';

const options = {
	preference: ['system', 'light', 'dark'],
	tonic: ['teal', 'blue', 'violet', 'amber', 'rose', 'green'],
	temperament: ['balanced', 'restrained', 'expressive', 'dramatic', 'soft', 'stark', 'monochrome'],
	density: ['compact', 'comfortable', 'spacious'],
	shape: ['square', 'soft', 'round', 'pill'],
	depth: ['flat', 'bordered', 'elevated'],
	typography: ['system', 'humanist', 'geometric', 'editorial', 'monospace'],
	contrast: ['system', 'standard', 'more'],
	motion: ['system', 'full', 'reduced']
} as const satisfies { [Name in ThemeSettingName]: readonly DocsThemeSettings[Name][] };

function ThemeField<Name extends ThemeSettingName>(props: {
	label: string;
	name: Name;
	value: DocsThemeSettings[Name];
	onChange(name: Name, value: DocsThemeSettings[Name]): void;
}) {
	return () => (
		<label className="theme-control-field">
			<span theme:text="supporting">{props.label}</span>
			<select
				theme:field="subtle"
				value={props.value}
				onChange={(event) =>
					props.onChange(props.name, event.currentTarget.value as DocsThemeSettings[Name])
				}
			>
				{options[props.name].map((value) => (
					<option value={value}>{value[0].toUpperCase() + value.slice(1)}</option>
				))}
			</select>
		</label>
	);
}

/** Renders the theme selector backed by the nearest documentation theme provider. */
export function ThemeControl(this: Component<{}>) {
	const theme = this.getContext(ThemeContext);
	const update = <Name extends ThemeSettingName>(name: Name, value: DocsThemeSettings[Name]) =>
		theme.setSetting(name, value);

	return () => (
		<div className="theme-control">
			<label className="theme-appearance-control">
				<span theme:text="supporting">Appearance</span>
				<select
					theme:field="subtle"
					value={theme.settings.preference}
					onChange={(event) =>
						update('preference', event.currentTarget.value as DocsThemeSettings['preference'])
					}
				>
					{options.preference.map((value) => (
						<option value={value}>{value[0].toUpperCase() + value.slice(1)}</option>
					))}
				</select>
			</label>
			<details className="theme-customize-control">
				<summary theme:action="quiet">Customize</summary>
				<div theme:surface="overlay" className="theme-control-panel">
					<div className="theme-customize-heading">
						<strong theme:text="heading">Customize</strong>
						<span theme:text="supporting">Tune the documentation theme.</span>
					</div>
					<div className="theme-customize-grid">
						<ThemeField label="Color" name="tonic" value={theme.settings.tonic} onChange={update} />
						<ThemeField
							label="Temperament"
							name="temperament"
							value={theme.settings.temperament}
							onChange={update}
						/>
						<ThemeField
							label="Density"
							name="density"
							value={theme.settings.density}
							onChange={update}
						/>
						<ThemeField label="Shape" name="shape" value={theme.settings.shape} onChange={update} />
						<ThemeField label="Depth" name="depth" value={theme.settings.depth} onChange={update} />
						<ThemeField
							label="Typography"
							name="typography"
							value={theme.settings.typography}
							onChange={update}
						/>
						<ThemeField
							label="Contrast"
							name="contrast"
							value={theme.settings.contrast}
							onChange={update}
						/>
						<ThemeField
							label="Motion"
							name="motion"
							value={theme.settings.motion}
							onChange={update}
						/>
					</div>
				</div>
			</details>
		</div>
	);
}
