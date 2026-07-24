import { testComponent } from '@exactjs/testing';
import { describe, expect, it } from 'vitest';
import { Counter } from './Counter.js';

describe('@exactjs/vitest integration', () => {
	it('compiles components and installs the shared matchers', async () => {
		const view = await testComponent(Counter).mount();
		const button = view.getByRole('button');
		await button.click();
		expect(button).toHaveText('Count: 1');
		view.unmount();
	});
});
