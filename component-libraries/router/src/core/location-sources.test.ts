import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExactRouter } from './router.js';
import { createBrowserLocationSource } from './location-sources.js';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('browser location sources', () => {
	it('navigates hash routes on opaque file origins without history state APIs', async () => {
		const listeners = new Set<(event: Event) => void>();
		const location = {
			origin: 'null',
			protocol: 'file:',
			href: 'file:///workspace/docs/index.html#/',
			hash: '#/',
			replace: vi.fn((value: string) => {
				location.hash = value;
				for (const listener of listeners) listener(new Event('hashchange'));
			})
		};
		const history = {
			state: undefined,
			pushState: vi.fn(() => {
				throw new DOMException('opaque origin', 'SecurityError');
			}),
			replaceState: vi.fn(() => {
				throw new DOMException('opaque origin', 'SecurityError');
			}),
			go: vi.fn()
		};
		vi.stubGlobal('window', {
			location,
			history,
			addEventListener(type: string, listener: (event: Event) => void) {
				if (type === 'hashchange') listeners.add(listener);
			},
			removeEventListener(type: string, listener: (event: Event) => void) {
				if (type === 'hashchange') listeners.delete(listener);
			}
		});

		const source = createBrowserLocationSource('hash')!;
		expect(source.location().href).toBe('http://exact.local/');
		const router = createExactRouter({
			source,
			mode: 'hash',
			routes: [
				{
					id: 'root',
					children: [
						{ id: 'home', index: true },
						{ id: 'state', path: 'learn/state' },
						{ id: 'missing', path: '*' }
					]
				}
			]
		});

		await router.navigate('/learn/state');

		expect(location.hash).toBe('#/learn/state');
		expect(history.pushState).not.toHaveBeenCalled();
		expect(router.getSnapshot().matches.map((match) => match.id)).toEqual(['root', 'state']);
		expect(router.getSnapshot().location.pathname).toBe('/learn/state');
	});
});
