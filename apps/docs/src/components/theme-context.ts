import { createContext } from '@exactjs/core';

/** A persisted documentation color preference or delegation to the operating system. */
export type ThemePreference = 'system' | 'light' | 'dark';

/** The theme preference and mutation operation shared by the docs shell. */
export type ThemeContextValue = {
	readonly preference: ThemePreference;
	setPreference(preference: ThemePreference): void;
};

/** Shares the current documentation theme and its persistent mutation operation. */
export const ThemeContext = createContext<ThemeContextValue>('exact.docs.theme');

/** Checks whether a string is a supported documentation theme preference. */
export function isThemePreference(value: string): value is ThemePreference {
	return value === 'system' || value === 'light' || value === 'dark';
}
