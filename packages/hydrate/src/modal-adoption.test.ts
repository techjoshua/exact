/**
 * @vitest-environment jsdom
 */
import '@exactjs/dom/runtime/modal';
import { createExpression } from '@exactjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import { hydrate } from './index.js';
import { installDialogPlatform } from './test-support/dialog-platform.js';
import { createCompiledVNode } from './test-support/native-vnode.js';
import { noopLogger } from './test-support/responses.js';

const restorations: Array<() => void> = [];

afterEach(() => {
	for (const restore of restorations.splice(0).reverse()) restore();
});

describe('@exactjs/hydrate modal adoption', () => {
	it('adopts a native modal opened before hydration and publishes its state', () => {
		restorations.push(installDialogPlatform());
		const container = document.createElement('div');
		container.innerHTML = '<dialog data-exact-id="settings"></dialog>';
		const dialog = container.querySelector('dialog')!;
		dialog.showModal();
		let open = false;
		const publish = (event: Event) => {
			open = (event.currentTarget as HTMLDialogElement).matches(':modal');
		};

		hydrate(
			createCompiledVNode('dialog', {
				'data-exact-id': 'settings',
				__exactModalOpen: createExpression(() => open),
				__exactBindModalToggle: publish,
				__exactBindModalClose: publish
			}),
			container,
			{ allowMarkerless: true, logger: noopLogger }
		);

		const adopted = container.querySelector('dialog')!;
		expect(adopted.matches(':modal')).toBe(true);
		expect(open).toBe(true);
	});
});
