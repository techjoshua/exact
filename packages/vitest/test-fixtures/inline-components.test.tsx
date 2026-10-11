import type { Component } from '@exactjs/core';
import { testComponent } from '@exactjs/vitest';
import { expect, it } from 'vitest';

function Counter(this: Component<{ count: number }>) {
	this.state.count = 0;
	return () => (
		<button className={{ selected: this.state.count > 0 }} onClick={() => this.state.count++}>
			Count: {this.state.count}
		</button>
	);
}

it('compiles a local test component beside runner registration and retains its control', async () => {
	const view = await testComponent(Counter).mount();
	try {
		const control = view.getByRole('button', { name: 'Count: 0' });
		await control.click();
		expect(view.getByRole('button', { name: 'Count: 1' }).element).toBe(control.element);
		expect(control).toHaveClass('selected');
		expect(view.root.state().count).toBe(1);
	} finally {
		view.unmount();
	}
});
