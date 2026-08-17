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
});
