import { describe, expect, it } from 'vitest';
import { renderToString } from './index.js';
import { createOperation } from './test-support/native-operations.js';

describe('@exactjs/ssr modal binding', () => {
	it('does not serialize modal top-layer state or compiler-owned handlers', async () => {
		const html = (
			await renderToString(
				createOperation(
					'dialog',
					{
						__exactModalOpen: true,
						__exactBindModalToggle: () => undefined,
						__exactBindModalClose: () => undefined
					},
					'Settings'
				)
			)
		).html;
		expect(html).not.toMatch(/\sopen(?:[=>\s])/u);
		expect(html).not.toContain('__exactModal');
		expect(html).not.toContain('__exactBindModal');
	});

	it('emits camel-cased commandFor as the native commandfor attribute', async () => {
		const html = (
			await renderToString(
				createOperation('button', { commandFor: 'settings', command: 'show-modal' }, 'Settings')
			)
		).html;
		expect(html).toContain(' commandfor="settings"');
		expect(html).toContain(' command="show-modal"');
	});
});
