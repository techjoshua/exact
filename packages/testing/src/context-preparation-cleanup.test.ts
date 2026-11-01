// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { createContext } from '@exactjs/core';
import { mountTest } from './index.js';

it.each([false, true])(
	'releases owned containers when context preparation fails (borrowed=%s)',
	async (borrowed) => {
		const before = [...document.body.children];
		const container = borrowed ? document.createElement('section') : undefined;
		if (container) document.body.append(container);
		const reason = new Error('context iteration failed');
		const token = createContext<number>('testing.preparation');
		const contexts = {
			*[Symbol.iterator]() {
				yield [token, 1] as const;
				throw reason;
			}
		};
		try {
			await expect(mountTest('ready', { container, contexts })).rejects.toBe(reason);
			expect([...document.body.children]).toEqual(container ? [...before, container] : before);
			const view = await mountTest('ready', { container, contexts: [[token, 2]] });
			try {
				expect(view.root.providedContext(token)).toBe(2);
			} finally {
				view.unmount();
			}
			expect([...document.body.children]).toEqual(container ? [...before, container] : before);
		} finally {
			container?.remove();
		}
	}
);
