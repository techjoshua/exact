import { describe, expect, it } from 'vitest';
import { renderToString } from './index.js';
import { createVNode } from './test-support/native-vnode.js';

describe('@exactjs/ssr modal binding', () => {
	it('does not serialize modal top-layer state or compiler-owned handlers', () => {
		const html = renderToString(
			createVNode(
				'dialog',
				{
					__exactModalOpen: true,
					__exactBindModalToggle: () => undefined,
					__exactBindModalClose: () => undefined
				},
				'Settings'
			)
		).html;
		expect(html).not.toMatch(/\sopen(?:[=>\s])/u);
		expect(html).not.toContain('__exactModal');
		expect(html).not.toContain('__exactBindModal');
	});

	it('emits camel-cased commandFor as the native commandfor attribute', () => {
		const html = renderToString(
			createVNode('button', { commandFor: 'settings', command: 'show-modal' }, 'Settings')
		).html;
		expect(html).toContain(' commandfor="settings"');
		expect(html).toContain(' command="show-modal"');
	});
});
