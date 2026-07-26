import type { ThemeId } from './types.js';

/** Describes a theme choice rendered by the theme picker. */
export type ThemeOption = {
	/** @exact key */
	id: ThemeId;
	name: string;
	description: string;
	swatch: string;
};

/** All visual personalities shipped with Sudoku Atelier. */
export const themes: readonly ThemeOption[] = [
	{ id: 'paper', name: 'Paper', description: 'Warm ink and pencil', swatch: '◌' },
	{ id: 'midnight', name: 'Midnight', description: 'Quiet and luminous', swatch: '●' },
	{ id: 'candy', name: 'Candy Pop', description: 'Sweet, soft and bouncy', swatch: '✿' },
	{ id: 'arcade', name: 'Neon Arcade', description: 'Electric after hours', swatch: '✦' },
	{ id: 'blueprint', name: 'Blueprint', description: 'Measured and precise', swatch: '⌗' },
	{ id: 'botanical', name: 'Botanical', description: 'Calm garden tones', swatch: '❋' },
	{ id: 'solar', name: 'Solar Flare', description: 'Bright kinetic warmth', swatch: '☀' }
];

/**
 * Returns the display name for a theme ID.
 * @exact client
 * @exact pure
 */
export function themeName(theme: ThemeId): string {
	return themes.find((option) => option.id === theme)?.name ?? 'Paper';
}
