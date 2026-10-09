/** @vitest-environment jsdom */
import { expect, it, onTestFinished } from 'vitest';
import { createErrorContext, ErrorContext } from '@exactjs/core';
import { testComponent } from './index.js';
import {
	AliasContextCounter,
	AliasContextChild,
	aliasCleanup
} from './test-support/client.fixtures.test.js';

it('retains captured component state across context callbacks and releases its child once', async () => {
	aliasCleanup.count = 0;
	const errors = createErrorContext();
	const view = await testComponent(AliasContextCounter).context(ErrorContext, errors).mount();
	onTestFinished(() => view.unmount());
	const output = view.getByText('1');
	const child = view.component(AliasContextChild);
	expect(output.text()).toBe('1');
	for (const value of [2, 3]) {
		await child.getByRole('button', { name: 'Increment' }).click();
		expect(view.root.state().count).toBe(value);
		expect(output.text()).toBe(String(value));
		expect(view.component(AliasContextChild).instance).toBe(child.instance);
	}
	view.unmount();
	view.unmount();
	expect(aliasCleanup.count).toBe(1);
	expect(errors.errors).toEqual([]);
});
