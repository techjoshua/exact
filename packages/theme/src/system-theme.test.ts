import { expect, it } from 'vitest';
import {
	createThemeScopeDefinition,
	createThemeScopePresentation,
	resolveThemeScope
} from './system-theme.js';

it('retains inherited system preferences separately from a reference resolution', () => {
	const parent = createThemeScopeDefinition({ appearance: 'system', contrast: 'more' });
	const child = createThemeScopeDefinition({ appearance: 'inherit', motion: 'full' }, parent);
	expect(createThemeScopePresentation(child).preferences).toEqual({
		appearance: 'system',
		contrast: 'more',
		motion: 'full'
	});
	expect(
		resolveThemeScope(child, { appearance: 'dark', contrast: 'standard', motion: 'reduced' }).source
	).toMatchObject({ appearance: 'dark', contrast: 'more', motion: 'full' });
});

it('omits alternate CSS for a fully explicit scope and restores it for system mode', () => {
	const explicit = createThemeScopeDefinition({
		appearance: 'dark',
		contrast: 'standard',
		motion: 'full'
	});
	expect(createThemeScopePresentation(explicit).css).toBe('');
	const system = createThemeScopeDefinition({ ...explicit.source, appearance: 'system' });
	expect(createThemeScopePresentation(system).css).toContain('(prefers-color-scheme: dark)');
	expect(createThemeScopePresentation(system).css).not.toContain('prefers-reduced-motion');
});

it('snapshots source data before caching without freezing the caller', () => {
	const color = { colorSpace: 'srgb' as const, components: [1, 0, 0] as [number, number, number] };
	const before = createThemeScopeDefinition({ keyColor: color });
	color.components[0] = 0;
	color.components[2] = 1;
	const after = createThemeScopeDefinition({ keyColor: color });
	const environment = { appearance: 'light', contrast: 'standard', motion: 'full' } as const;
	expect(resolveThemeScope(before, environment).key.css).not.toBe(
		resolveThemeScope(after, environment).key.css
	);
});
