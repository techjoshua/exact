/**
 * @vitest-environment jsdom
 */
import { render } from '@exactjs/dom';
import { describe, expect, it } from 'vitest';
import { hydrate } from './index.js';
import { patchRecoveryRoot } from './test-support/patch-recovery.fixtures.js';
import { noopLogger } from './test-support/responses.js';

describe('@exactjs/hydrate patch recovery', () => {
	it('retries an identical vnode after a partially applied hydrated patch fails', () => {
		const container = document.createElement('div');
		container.innerHTML = '<section><span>before</span></section>';
		hydrate(patchRecoveryRoot({ label: 'before' }), container, {
			allowMarkerless: true,
			logger: noopLogger
		});
		let reject = true;
		const source = {
			get label() {
				if (reject) throw new Error('transient child read failure');
				return 'after';
			}
		};
		const next = patchRecoveryRoot(source);

		expect(() => render(next, container)).toThrow('transient child read failure');
		expect(container.textContent).not.toBe('after');
		reject = false;
		render(patchRecoveryRoot({ label: source.label }), container);

		expect(container.textContent).toBe('after');
	});
});
