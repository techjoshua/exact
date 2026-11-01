// @vitest-environment jsdom
import { render, unmount } from '@exactjs/dom';
import { expect, it } from 'vitest';
import { cardRoot } from './runtime.fixtures.js';
import { installExactDevtoolsRuntime } from './runtime.js';

it('restores owned highlights after their elements leave the document', async () => {
	const installation = installExactDevtoolsRuntime();
	const container = document.createElement('main');
	document.body.append(container);
	try {
		render(cardRoot(), container);
		await installation.hook.connect();
		const card = container.querySelector<HTMLElement>('#card')!;
		card.style.setProperty('outline', '1px solid red', 'important');
		installation.hook.highlight(installation.hook.ownerOfElement(card)!);
		container.remove();
		installation.hook.clearHighlight();
		expect(card.hasAttribute('data-exact-devtools-highlight')).toBe(false);
		expect(card.style.getPropertyValue('outline')).toBe('1px solid red');
		expect(card.style.getPropertyPriority('outline')).toBe('important');
		document.body.append(container);
		installation.hook.clearHighlight();
		expect(card.style.outline).toBe('1px solid red');
	} finally {
		unmount(container);
		container.remove();
		await installation.dispose();
	}
});

it('leaves highlight markers and styles owned by another installation alone', async () => {
	const installation = installExactDevtoolsRuntime();
	const foreign = document.createElement('div');
	foreign.setAttribute('data-exact-devtools-highlight', '');
	foreign.style.outline = '3px solid green';
	document.body.append(foreign);
	try {
		installation.hook.clearHighlight();
		expect(foreign.hasAttribute('data-exact-devtools-highlight')).toBe(true);
		expect(foreign.style.outline).toBe('3px solid green');
	} finally {
		foreign.remove();
		await installation.dispose();
	}
});

it.each(['value', 'priority'] as const)(
	'preserves an authored outline %s changed while the inspector highlight is active',
	async (change) => {
		const installation = installExactDevtoolsRuntime();
		const container = document.createElement('main');
		document.body.append(container);
		try {
			render(cardRoot(), container);
			await installation.hook.connect();
			const card = container.querySelector<HTMLElement>('#card')!;
			installation.hook.highlight(installation.hook.ownerOfElement(card)!);
			const authored =
				change === 'value' ? '3px solid green' : card.style.getPropertyValue('outline');
			card.style.setProperty('outline', authored, 'important');
			installation.hook.clearHighlight();
			expect(card.style.getPropertyValue('outline')).toBe(authored);
			expect(card.style.getPropertyPriority('outline')).toBe('important');
		} finally {
			unmount(container);
			container.remove();
			await installation.dispose();
		}
	}
);

it.each(['disconnect', 'dispose'] as const)(
	'does not borrow a replacement session after %s',
	async (action) => {
		const previous = installExactDevtoolsRuntime();
		let replacement: ReturnType<typeof installExactDevtoolsRuntime> | undefined;
		const container = document.createElement('main');
		document.body.append(container);
		try {
			render(cardRoot(), container);
			await previous.hook.connect();
			if (action === 'disconnect') await previous.hook.disconnect();
			else await previous.dispose();
			replacement = installExactDevtoolsRuntime();
			await replacement.hook.connect();
			const card = container.querySelector<HTMLElement>('#card')!;
			const identity = replacement.hook.ownerOfElement(card)!;
			expect(identity).toBeDefined();
			previous.hook.highlight(identity);
			expect(card.hasAttribute('data-exact-devtools-highlight')).toBe(false);
			expect(card.style.outline).toBe('1px solid red');
		} finally {
			previous.hook.clearHighlight();
			await previous.dispose();
			await replacement?.dispose();
			unmount(container);
			container.remove();
		}
	}
);
