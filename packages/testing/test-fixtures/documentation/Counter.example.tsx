import { expect, it } from 'vitest';
import { testComponent } from '@exactjs/testing';
import { Counter } from './Counter.js';

it('updates the existing button after a click', async () => {
	const view = await testComponent(Counter).props({ initial: 1 }).mount();
	try {
		const button = view.getByRole('button', { name: 'Count: 1' });
		const element = button.element;
		await button.click();
		expect(view.getByRole('button', { name: 'Count: 2' }).element).toBe(element);
		expect(view.root.state().count).toBe(2);
	} finally {
		view.unmount();
	}
});
