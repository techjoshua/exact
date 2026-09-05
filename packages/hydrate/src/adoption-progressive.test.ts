/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { hydrate } from './index.js';
import { readyParagraphRoot } from './test-support/basic-roots.fixtures.js';
import { noopLogger } from './test-support/responses.js';

describe('@exactjs/hydrate progressive adoption', () => {
	it('claims the deterministic progressive helper when the root hydrates', () => {
		const root = document.createElement('div');
		root.id = 'page';
		root.innerHTML = '<p>ready</p>';
		let hash = 2166136261;
		for (const character of root.id) {
			hash ^= character.charCodeAt(0);
			hash = Math.imul(hash, 16777619);
		}
		const helper = `__xR${(hash >>> 0).toString(36)}`;
		(globalThis as Record<string, unknown>)[helper] = () => undefined;
		hydrate(readyParagraphRoot, root, {
			allowMarkerless: true,
			logger: noopLogger
		});
		expect(helper in globalThis).toBe(false);
	});
});
