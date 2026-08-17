import { createContext } from '@exactjs/core';
import type { BuiltInTemperament, BuiltInThemeKey, TypographyPreset } from '@exactjs/theme';

/** A persisted documentation color preference or delegation to the operating system. */
export type ThemePreference = 'system' | 'light' | 'dark';

/** Persisted theme choices exposed by the documentation shell. */
export type DocsThemeSettings = {
	preference: ThemePreference;
	tonic: BuiltInThemeKey;
	temperament: BuiltInTemperament;
	density: 'compact' | 'comfortable' | 'spacious';
	shape: 'square' | 'soft' | 'round' | 'pill';
	depth: 'flat' | 'bordered' | 'elevated';
	typography: TypographyPreset;
	contrast: 'system' | 'standard' | 'more';
	motion: 'system' | 'full' | 'reduced';
};

export type ThemeSettingName = keyof DocsThemeSettings;

/** The theme preference and mutation operation shared by the docs shell. */
export type ThemeContextValue = {
	readonly settings: Readonly<DocsThemeSettings>;
	setSetting<Name extends ThemeSettingName>(name: Name, value: DocsThemeSettings[Name]): void;
};

/** Shares the current documentation theme and its persistent mutation operation. */
export const ThemeContext = createContext<ThemeContextValue>('exact.docs.theme');

/** Checks whether a string is a supported documentation theme preference. */
export function isThemePreference(value: string): value is ThemePreference {
	return value === 'system' || value === 'light' || value === 'dark';
}
