import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

describe('documentation theme isolation', () => {
	it('keeps page hover, focus, and disabled rules off themed controls', () => {
		expect(stylesheet).toContain(
			'button:not(.exact-theme-action):not(.exact-theme-selection):hover:not(:disabled)'
		);
		expect(stylesheet).toContain(
			':focus-visible:not(.exact-theme-action):not(.exact-theme-field):not(.exact-theme-selection)'
		);
		expect(stylesheet).toContain(
			'button:not(.exact-theme-action):not(.exact-theme-selection):disabled'
		);
		expect(stylesheet).not.toMatch(/(?:^|\n)button:hover:not\(:disabled\)/);
	});

	it('derives code surfaces and syntax roles from the active semantic theme', () => {
		expect(stylesheet).toContain('--code-surface: var(--exact-theme-neutral-subtle)');
		expect(stylesheet).toContain('--syntax-keyword: var(--exact-theme-accent-text)');
		expect(stylesheet).toContain('--syntax-string: var(--exact-theme-success-text)');
		expect(stylesheet).toContain('--syntax-keyword: var(--exact-theme-accent-solid-active)');
		expect(stylesheet).toContain('--syntax-string: var(--exact-theme-success-solid-active)');
		expect(stylesheet).toContain('--syntax-invalid: var(--exact-theme-danger-solid)');
		expect(stylesheet).not.toMatch(/--syntax-(?:keyword|type|function|string|number):\s*#/);
	});
});
