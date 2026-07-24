import { describe, expect, it } from 'bun:test';
import { testComponent } from '../dist/index.js';
import { Counter } from './Counter.js';

describe('@exactjs/bun-test', () => {
	it('compiles, mounts, interacts with, and matches an eXact component', async () => {
		const view = await testComponent(Counter).mount();

		await view.getByRole('button').click();

		expect(view.root).toHaveState({ count: 1 });
		expect(view.getByRole('button')).toHaveText('Count: 1');
		view.unmount();
	});
});
