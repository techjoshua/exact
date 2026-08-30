/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { hydrate } from './index.js';
import { readyParagraphRoot } from './test-support/basic-roots.fixtures.js';
import { noopLogger } from './test-support/responses.js';

describe('@exactjs/hydrate adoption fallback', () => {
	it('hydrates by falling back to normal render when markers are missing', () => {
		const container = document.createElement('div');
		hydrate(readyParagraphRoot, container, { logger: noopLogger });
		expect(container.querySelector('p')?.textContent).toBe('ready');
	});
});
