import type { Component } from '@exactjs/core';
import { testComponent } from '../dist/index.js';
import { expect, it } from 'bun:test';

function Counter(this: Component<{ count: number }>) {
	this.state.count = 0;
	return () => (
		<button className={{ selected: this.state.count > 0 }} onClick={() => this.state.count++}>
			Count: {this.state.count}
		</button>
	);
}

it('compiles an inline test component and retains its control through an interaction', async () => {
	const view = await testComponent(Counter).mount();
	try {
		const control = view.getByRole('button', { name: 'Count: 0' });
		await control.click();
		expect(view.getByRole('button', { name: 'Count: 1' }).element).toBe(control.element);
		expect(control).toHaveClass('selected');
	} finally {
		view.unmount();
	}
});
