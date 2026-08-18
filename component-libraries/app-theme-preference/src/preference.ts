/** Storage key shared by repository applications on the same origin. */
export const themeAppearanceStorageKey = 'exact-theme-appearance';

/** Concrete light or dark appearance currently painted by an application. */
export type EffectiveThemeAppearance = 'light' | 'dark';

/** Persisted choice, where system delegates appearance to the operating system. */
export type ThemeAppearancePreference = 'system' | EffectiveThemeAppearance;

/** Returns the effective appearance for a preference and current system appearance. */
export function resolveThemeAppearance(
	preference: ThemeAppearancePreference,
	systemAppearance: EffectiveThemeAppearance
): EffectiveThemeAppearance {
	return preference === 'system' ? systemAppearance : preference;
}

/**
 * Plans the opposite appearance, delegating back to system instead of retaining an equivalent
 * override.
 */
export function toggleThemeAppearance(
	effectiveAppearance: EffectiveThemeAppearance,
	systemAppearance: EffectiveThemeAppearance
): ThemeAppearancePreference {
	const target = effectiveAppearance === 'dark' ? 'light' : 'dark';
	return target === systemAppearance ? 'system' : target;
}

/** Parses the only values allowed in shared appearance storage. */
export function parseStoredThemeAppearance(value: string | null): ThemeAppearancePreference {
	return value === 'light' || value === 'dark' ? value : 'system';
}

/** Persists an override or removes it when the application delegates to system. */
export function persistThemeAppearance(preference: ThemeAppearancePreference): void {
	if (preference === 'system') localStorage.removeItem(themeAppearanceStorageKey);
	else localStorage.setItem(themeAppearanceStorageKey, preference);
}
