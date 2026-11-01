// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { mountClientServerTest } from './index.js';

it('distinguishes an empty accessible-name filter from an omitted filter', async () => {
	const view = await mountClientServerTest({
		server: {
			html: '<button aria-label="">Unlabelled</button><button>Named</button><button hidden aria-label="">Hidden</button>'
		},
		islands: {},
		handle: () => {
			throw new Error('Unexpected dispatch');
		}
	});
	try {
		expect(view.getAllByRole('button')).toHaveLength(2);
		expect(view.getAllByRole('button', { name: '' }).map((control) => control.text())).toEqual([
			'Unlabelled'
		]);
		expect(view.getByRole('button', { name: '' }).text()).toBe('Unlabelled');
		expect(view.queryByRole('button', { name: 'Missing' })).toBeUndefined();
		expect(() => view.getByRole('button', { name: 'Missing' })).toThrow('found 0');
		const pattern = /Named/g;
		for (let attempt = 0; attempt < 2; attempt++)
			expect(view.getByRole('button', { name: pattern }).text()).toBe('Named');
	} finally {
		view.unmount();
	}
});
