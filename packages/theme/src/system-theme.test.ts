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

it.each(['light', 'dark'] as const)(
	'resolves relative appearances against a %s browser preference',
	(appearance) => {
		const environment = { appearance, contrast: 'standard', motion: 'full' } as const;
		const opposite = appearance === 'light' ? 'dark' : 'light';
		const root = createThemeScopeDefinition({ appearance: 'system' });
		const inverse = createThemeScopeDefinition({ appearance: 'inverse' }, root);
		const inherited = createThemeScopeDefinition({}, inverse);
		const twice = createThemeScopeDefinition({ appearance: 'inverse' }, inverse);
		expect(resolveThemeScope(inverse, environment).source.appearance).toBe(opposite);
		expect(resolveThemeScope(inherited, environment).source.appearance).toBe(opposite);
		expect(resolveThemeScope(twice, environment).source.appearance).toBe(appearance);
		expect(
			resolveThemeScope(createThemeScopeDefinition({ appearance: 'inverse' }), environment).source
				.appearance
		).toBe(opposite);
		const explicit = createThemeScopeDefinition({ appearance: 'dark' });
		expect(
			resolveThemeScope(
				createThemeScopeDefinition({ appearance: 'inverse' }, explicit),
				environment
			).source.appearance
		).toBe('light');
		expect(
			resolveThemeScope(
				createThemeScopeDefinition({ appearance: 'inverse-system' }, explicit),
				environment
			).source.appearance
		).toBe(opposite);
	}
);

it('publishes unknown system appearance and correct CSS branches without guessing the browser', () => {
	const inverse = createThemeScopeDefinition({
		appearance: 'inverse-system',
		contrast: 'standard',
		motion: 'full'
	});
	const presentation = createThemeScopePresentation(inverse);
	expect(presentation.appearance).toBeUndefined();
	expect(presentation.preferences.appearance).toBe('inverse-system');
	expect(presentation.style).toContain('color-scheme:var(--exact-theme-media-color-scheme)');
	const [lightBrowser, darkBrowser] = presentation.css.split('@media (prefers-color-scheme: dark)');
	expect(lightBrowser).toContain('--exact-theme-media-color-scheme:dark');
	expect(darkBrowser).toContain('--exact-theme-media-color-scheme:light');
	const explicit = createThemeScopeDefinition({
		appearance: 'dark',
		contrast: 'standard',
		motion: 'full'
	});
	const child = createThemeScopePresentation(
		createThemeScopeDefinition({ appearance: 'inverse' }, explicit)
	);
	expect(child.appearance).toBe('light');
	expect(child.css).toBe('');
	expect(child.style).toContain('color-scheme:light');
});

it('rejects cyclic scope ancestry through direct and indirect writable aliases', () => {
	const environment = { appearance: 'light', contrast: 'standard', motion: 'full' } as const;
	for (const indirect of [false, true]) {
		const first = createThemeScopeDefinition({});
		const parent = indirect ? createThemeScopeDefinition({}, first) : first;
		const alias: { parent?: typeof first } = first;
		alias.parent = parent;
		expect(() => resolveThemeScope(first, environment)).toThrow(/cyclic theme scope ancestry/i);
		expect(() => createThemeScopePresentation(first)).toThrow(/cyclic theme scope ancestry/i);
	}
});

it('resolves deep scope ancestry without consuming the call stack', () => {
	let definition = createThemeScopeDefinition({
		appearance: 'dark',
		contrast: 'more',
		motion: 'reduced'
	});
	for (let depth = 0; depth < 20000; depth++)
		definition = createThemeScopeDefinition({}, definition);
	const theme = resolveThemeScope(definition, {
		appearance: 'light',
		contrast: 'standard',
		motion: 'full'
	});
	expect(theme.source.appearance).toBe('dark');
	expect(theme.source.contrast).toBe('more');
	expect(theme.source.motion).toBe('reduced');
});

it('captures each parent link once across CSS branches and requested preferences', () => {
	const parent = createThemeScopeDefinition({ appearance: 'dark', contrast: 'more' });
	const child = createThemeScopeDefinition({});
	let reads = 0;
	Object.defineProperty(child, 'parent', {
		get() {
			reads++;
			return parent;
		}
	});
	const presentation = createThemeScopePresentation(child);
	expect(reads).toBe(1);
	expect(presentation.preferences).toMatchObject({ appearance: 'dark', contrast: 'more' });
});

it('rejects missing definitions before palette publication', () => {
	const environment = { appearance: 'light', contrast: 'standard', motion: 'full' } as const;
	expect(() => resolveThemeScope(undefined as never, environment)).toThrow(/scope definition/);
	expect(() => createThemeScopePresentation(undefined as never)).toThrow(/scope definition/);
});
