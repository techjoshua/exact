import { testComponent } from '@exactjs/testing';
import { expect, it } from '@jest/globals';
import { Counter } from './Counter.js';

it('mounts eXact components and installs the shared matchers', async () => {
	const view = await testComponent(Counter).mount();
	const button = view.getByRole('button');
	await button.click();
	expect(button).toHaveText('Count: 1');
	view.unmount();
});
