// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { testComponent, mountClientServerTest } from './index.js';
import {
	RetiredControls,
	RetiredChild,
	OrderedControls
} from './test-support/retired-controls.fixtures.test.js';
import {
	verifyRetiredTestControl,
	verifyRetiredTestComponent
} from '../../component-composition-corpus/test-support/testing-control-lifetime-journey.js';

it.each(['replace', 'unmount'] as const)(
	'rejects retired control interactions before mutation (%s)',
	async (mode) => {
		const view = await testComponent(RetiredControls).mount();
		try {
			const control = view.getByRole('textbox');
			await control.input('retained');
			expect(control.value()).toBe('retained');
			await verifyRetiredTestControl(control, () =>
				mode === 'replace' ? view.root.setState({ retired: true }) : view.unmount()
			);
			if (mode === 'replace') {
				expect(view.getByText('Replacement').text()).toBe('Replacement');
				await view.root.setState({ retired: false });
				const next = view.getByRole('textbox');
				expect(next.element).not.toBe(control.element);
				await next.input('next');
				expect(next.value()).toBe('next');
			}
		} finally {
			view.unmount();
		}
	}
);

it.each(['replace', 'unmount'] as const)(
	'rejects retired component state updates (%s)',
	async (mode) => {
		const view = await testComponent(RetiredControls).mount();
		try {
			const child = view.component(RetiredChild);
			await child.setState({ count: 1 });
			expect(child.state().count).toBe(1);
			await verifyRetiredTestComponent(child, () =>
				mode === 'replace' ? view.root.setState({ retired: true }) : view.unmount()
			);
			if (mode === 'replace') {
				await view.root.setState({ retired: false });
				const next = view.component(RetiredChild);
				expect(next.instance).not.toBe(child.instance);
				await next.setState({ count: 2 });
				expect(next.getByRole('button', { name: 'Save 2' })).toBeDefined();
			}
		} finally {
			view.unmount();
		}
	}
);

it.each(['replace', 'unmount'] as const)(
	'rejects retired paired-view controls (%s)',
	async (mode) => {
		const view = await mountClientServerTest({
			server: { html: '<form><input value="before"></form>' },
			islands: {},
			handle: () => {
				throw new Error('Unexpected server dispatch');
			}
		});
		try {
			const control = view.getByRole('textbox');
			await control.input('retained');
			await verifyRetiredTestControl(control, () =>
				mode === 'replace'
					? view.action(() => control.element.closest('form')!.remove())
					: view.unmount()
			);
			if (mode === 'replace') {
				await view.action(() => {
					view.container.innerHTML = '<input value="next">';
				});
				const next = view.getByRole('textbox');
				await next.change('ready');
				expect(next.value()).toBe('ready');
			}
		} finally {
			view.unmount();
		}
	}
);

it.each(['ordinary', 'paired'] as const)(
	'rejects queries after view unmount (%s)',
	async (mode) => {
		const view =
			mode === 'ordinary'
				? await testComponent(RetiredControls).mount()
				: await mountClientServerTest({
						server: {
							html: '<form><input aria-label="Name" value="before"><button>Save</button></form>'
						},
						islands: {},
						handle: () => {
							throw new Error('Unexpected dispatch');
						}
					});
		try {
			expect(view.getByRole('textbox')).toBeDefined();
			view.unmount();
			for (const query of [
				() => view.getBySelector('input'),
				() => view.queryBySelector('input'),
				() => view.getAllBySelector('input'),
				() => view.getByRole('textbox'),
				() => view.queryByRole('textbox'),
				() => view.getAllByRole('textbox'),
				() => view.getByLabelText('Name'),
				() => view.queryByLabelText('Name'),
				() => view.getAllByLabelText('Name'),
				() => view.getByText('Save'),
				() => view.queryByText('Save'),
				() => view.getAllByText('Save'),
				() => view.getByTestId('field'),
				() => view.queryByTestId('field'),
				() => view.getAllByTestId('field')
			])
				expect(query).toThrow('unmounted');
		} finally {
			view.unmount();
		}
	}
);

it('preserves component order and parent identity through intrinsic wrappers', async () => {
	const view = await testComponent(OrderedControls).mount();
	try {
		const children = view.root.children(RetiredChild);
		expect(children.map((child) => child.state().count)).toEqual([1, 2, 3]);
		expect(view.root.findAll(RetiredChild).map((child) => child.instance)).toEqual(
			children.map((child) => child.instance)
		);
		expect(children.every((child) => child.parent()?.instance === view.root.instance)).toBe(true);
		expect(() => view.component(RetiredChild)).toThrow('found 3');
	} finally {
		view.unmount();
	}
});
