import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exactThemeContract } from './token-contract.js';

const stylesheet = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

describe('exact-theme/1 stylesheet contract', () => {
	it('declares every public token and protects the exact role recipe output', () => {
		const declared = new Set(
			[...stylesheet.matchAll(/--exact-theme-([a-z0-9-]+)\s*:/g)].map((match) => match[1])
		);
		expect(Object.keys(exactThemeContract.tokens).filter((name) => !declared.has(name))).toEqual(
			[]
		);
		expect(createHash('sha256').update(stylesheet).digest('hex')).toBe(
			'a05cafd6bdc32ddc37a1fe9aa2c73feec54e3d1de5707111612005612c07362d'
		);
	});

	it('orders default, inferred, and explicit tone aliases by precedence', () => {
		const neutral = stylesheet.indexOf('.exact-theme-action,');
		const primary = stylesheet.indexOf(".exact-theme-action[data-exact-theme-variant='primary']");
		const invalid = stylesheet.indexOf(".exact-theme-field:is(:invalid, [aria-invalid='true'])");
		const explicit = stylesheet.indexOf("[data-exact-theme-tone='neutral']");
		expect(neutral).toBeGreaterThanOrEqual(0);
		expect(neutral).toBeLessThan(primary);
		expect(primary).toBeLessThan(invalid);
		expect(invalid).toBeLessThan(explicit);
	});

	it('keeps visible surface content inside its container geometry', () => {
		expect(stylesheet).toContain(
			'padding: max(var(--exact-theme-space-4), var(--exact-theme-radius-lg));'
		);
		expect(stylesheet).toMatch(
			/\.exact-theme-surface\[data-exact-theme-variant='transparent'\]\s*\{[^}]*padding: 0;/
		);
	});

	it('establishes the generated body typography at every runtime scope', () => {
		expect(stylesheet).toMatch(
			/\[data-exact-theme\]\s*\{[^}]*font-family: var\(--exact-theme-font-body\);[^}]*font-size: var\(--exact-theme-font-size-md\);[^}]*line-height: var\(--exact-theme-line-height-body\);/
		);
	});

	it('aligns native controls with each resolved scope appearance', () => {
		expect(stylesheet).toMatch(
			/\[data-exact-theme\]\[data-exact-theme-appearance='light'\]\s*\{[^}]*color-scheme: light;/
		);
		expect(stylesheet).toMatch(
			/\[data-exact-theme\]\[data-exact-theme-appearance='dark'\]\s*\{[^}]*color-scheme: dark;/
		);
	});

	it('clips native progress fills to the configured field shape', () => {
		expect(stylesheet).toMatch(
			/\.exact-theme-field:is\(progress, meter\)\s*\{[^}]*clip-path: inset\(0 round var\(--exact-theme-radius-md\)\);/
		);
	});

	it('paints progress tracks and fills from reactive theme variables', () => {
		expect(stylesheet).toMatch(
			/\.exact-theme-field:is\(progress\)\s*\{[^}]*appearance: none;[^}]*background: var\(--exact-theme-neutral-subtle\);/
		);
		expect(stylesheet).toMatch(
			/::-webkit-progress-value\s*\{[^}]*background: var\(--_exact-theme-progress-fill\);/
		);
		expect(stylesheet).toMatch(
			/::-moz-progress-bar\s*\{[^}]*background: var\(--_exact-theme-progress-fill\);/
		);
		expect(stylesheet).toMatch(
			/progress\)\[data-exact-theme-tone\]\s*\{[^}]*--_exact-theme-progress-fill: var\(--_exact-theme-tone-solid\);/
		);
	});

	it('maps transient interaction states onto the depth scale', () => {
		expect(stylesheet).toContain('@media (hover: hover)');
		expect(stylesheet).toMatch(/:hover[^\{]+:not\(:active\)[^\{]+\{/);
		expect(stylesheet).toMatch(
			/\.exact-theme-action\[data-exact-theme-variant='primary'\]\s*\{[^}]*var\(--exact-theme-surface-foreground\) 28%[^}]*var\(--exact-theme-shadow-sm\);/
		);
		expect(stylesheet).toMatch(
			/\[data-exact-theme-dragging='true'\][\s\S]*?box-shadow: var\(--exact-theme-shadow-lg\);/
		);
		expect(stylesheet).toMatch(
			/:active:not\(:disabled\)[\s\S]*?box-shadow: var\(--exact-theme-surface-sunken-shadow\);/
		);
		expect(stylesheet).toContain(
			'0 2px 4px color-mix(in oklch, var(--exact-theme-surface-foreground) 32%, transparent)'
		);
		expect(stylesheet).toContain(":not([aria-busy='true'])");
		expect(stylesheet).toContain('background-color: var(--exact-theme-neutral-subtle-hover);');
		expect(stylesheet).toMatch(
			/:is\(\.exact-theme-action, \.exact-theme-field, \.exact-theme-selection\):disabled,[\s\S]*?box-shadow: none;/
		);
	});
});
