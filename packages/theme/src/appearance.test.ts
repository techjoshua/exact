// @vitest-environment jsdom
import '@exactjs/dom/framework/enhancements';
import '@exactjs/core/runtime/contexts';
import { expect, it, vi } from 'vitest';
import { hydrate } from '@exactjs/hydrate';
import { flushSync } from '@exactjs/reactive';
import { renderToHydratableString } from '@exactjs/ssr';
import { inverseThemeDocumentRoot } from './theme-document.fixtures.js';
import { inverseThemeDocumentRoot as serverInverseThemeDocumentRoot } from './theme-document.fixtures.js?exact-target=server';

it('keeps relative appearance context and CSS attributes synchronized through activation and updates', async () => {
	const listeners = new Set<() => void>();
	let dark = true;
	vi.stubGlobal('matchMedia', (query: string) => ({
		get matches() {
			return query.includes('color-scheme') && dark;
		},
		addEventListener(_type: string, listener: () => void) {
			listeners.add(listener);
		},
		removeEventListener(_type: string, listener: () => void) {
			listeners.delete(listener);
		}
	}));
	try {
		const rendered = await renderToHydratableString(serverInverseThemeDocumentRoot());
		const container = document.createElement('div');
		container.innerHTML = rendered.html;
		const scopes = [...container.querySelectorAll<HTMLElement>('[data-exact-theme]')];
		const outputs = [...container.querySelectorAll<HTMLOutputElement>('output')];
		const input = container.querySelector('input')!;
		input.value = 'Edited before activation';
		expect(outputs.map((output) => output.dataset.appearance)).toEqual([
			'unknown',
			'unknown',
			'unknown',
			'unknown'
		]);
		expect(
			scopes.every((scope) => !scope.hasAttribute('data-exact-theme-resolved-appearance'))
		).toBe(true);
		const mounted = hydrate(inverseThemeDocumentRoot(), container, {
			onMismatch: 'throw',
			resumptions: rendered.resumptions
		});
		const expectAppearances = (expected: string[]) => {
			expect(outputs.map((output) => output.dataset.appearance)).toEqual(expected);
			expect(scopes.map((scope) => scope.dataset.exactThemeResolvedAppearance)).toEqual(expected);
		};
		try {
			flushSync();
			expectAppearances(['dark', 'light', 'light', 'light']);
			dark = false;
			for (const listener of listeners) listener();
			flushSync();
			expectAppearances(['light', 'dark', 'dark', 'dark']);
			container.querySelector('button')!.click();
			flushSync();
			expectAppearances(['dark', 'light', 'light', 'dark']);
			container.querySelector('button')!.click();
			flushSync();
			expectAppearances(['light', 'dark', 'dark', 'dark']);
			expect([...container.querySelectorAll('[data-exact-theme]')]).toEqual(scopes);
			expect(container.querySelector('input')).toBe(input);
			expect(input.value).toBe('Edited before activation');
		} finally {
			mounted.dispose();
		}
		expect(listeners.size).toBe(0);
	} finally {
		vi.unstubAllGlobals();
	}
}, 20_000);
