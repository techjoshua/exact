/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { hydrateClientIslands, lazyClientIsland } from './index.js';
import {
	LazyCheckoutForm,
	LazyCounter,
	LazyFocus,
	LazyInput,
	LazyRelease,
	LazyStaticCounter,
	readFocusNotifications,
	readInteractionClicks,
	readInteractionInputValues,
	resetInteractionFixture
} from './test-support/island-interaction.fixtures.js';

function activation(
	id: string,
	type: 'click' | 'input' | 'submit' | 'focusin',
	replay: 'native-click' | 'latest-value' | 'request-submit' | 'notification'
) {
	return {
		mode: 'interaction' as const,
		reasons: [],
		targets: [{ id, events: [{ type, replay }] }]
	};
}

describe('@exactjs/hydrate lazy islands', () => {
	it('loads an interaction island once and replays ordered invocations after adoption', async () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="counter" data-exact-client-name="Counter" data-exact-client-hydration="interaction" data-exact-client-generation="1"><button data-exact-id="counter-button">Count</button></div>';
		resetInteractionFixture();
		let loads = 0;
		let resolveLoad!: (component: typeof LazyCounter) => void;
		const loaded = new Promise<typeof LazyCounter>((resolve) => {
			resolveLoad = resolve;
		});

		hydrateClientIslands(container, {
			Counter: lazyClientIsland(
				() => {
					loads++;
					return loaded;
				},
				activation('counter-button', 'click', 'native-click')
			)
		});
		const button = container.querySelector('button')!;
		button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		expect(loads).toBe(1);
		expect(readInteractionClicks()).toBe(0);
		resolveLoad(LazyCounter);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(readInteractionClicks()).toBe(2);
		expect(container.querySelector('button')).toBe(button);
	});

	it('coalesces state-like interactions while a lazy island loads', async () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="form" data-exact-client-name="Form" data-exact-client-hydration="interaction"><input data-exact-id="name"></div>';
		resetInteractionFixture();
		let resolveLoad!: (component: typeof LazyInput) => void;
		const loaded = new Promise<typeof LazyInput>((resolve) => {
			resolveLoad = resolve;
		});

		hydrateClientIslands(container, {
			Form: lazyClientIsland(() => loaded, activation('name', 'input', 'latest-value'))
		});
		const input = container.querySelector('input')!;
		input.value = 'a';
		input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
		input.value = 'latest';
		input.setSelectionRange(2, 4, 'backward');
		input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
		// A server range may refresh the control while the lazy artifact is loading.
		// Replay must restore the last browser-owned mutation, not that later fallback value.
		input.value = 'server-refresh';
		input.setSelectionRange(0, 0);
		resolveLoad(LazyInput);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(readInteractionInputValues()).toEqual(['latest']);
		expect(container.querySelector('input')).toBe(input);
		expect(input.value).toBe('latest');
		expect(input.selectionStart).toBe(2);
		expect(input.selectionEnd).toBe(4);
		expect(input.selectionDirection).toBe('backward');
	});

	it('ignores events that are not authorized for the dormant target', () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="counter" data-exact-client-name="Counter" data-exact-client-hydration="interaction"><button data-exact-id="counter-button">Count</button></div>';
		let loads = 0;
		hydrateClientIslands(container, {
			Counter: lazyClientIsland(
				async () => {
					loads++;
					return LazyStaticCounter;
				},
				activation('counter-button', 'click', 'native-click')
			)
		});

		container.querySelector('button')!.dispatchEvent(new Event('focusin', { bubbles: true }));
		expect(loads).toBe(0);
	});

	it('replays only handler notification after native focus state has changed', async () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="focus" data-exact-client-name="Focus" data-exact-client-hydration="interaction"><input data-exact-id="focus-input"></div>';
		resetInteractionFixture();
		let resolveLoad!: (component: typeof LazyFocus) => void;
		const loaded = new Promise<typeof LazyFocus>((resolve) => (resolveLoad = resolve));
		hydrateClientIslands(container, {
			Focus: lazyClientIsland(() => loaded, activation('focus-input', 'focusin', 'notification'))
		});
		const input = container.querySelector('input') as HTMLInputElement;
		input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
		resolveLoad(LazyFocus);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(readFocusNotifications()).toBe(1);
		expect(container.querySelector('input')).toBe(input);
	});

	it('keeps an all-submit queue bounded and rejects the newest submit', async () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="form" data-exact-client-name="Form" data-exact-client-hydration="interaction"><form data-exact-id="checkout"></form></div>';
		let resolveLoad!: (component: typeof LazyCheckoutForm) => void;
		const loaded = new Promise<typeof LazyCheckoutForm>((resolve) => (resolveLoad = resolve));
		const original = HTMLFormElement.prototype.requestSubmit;
		let submissions = 0;
		HTMLFormElement.prototype.requestSubmit = function () {
			submissions++;
		};
		try {
			hydrateClientIslands(container, {
				Form: lazyClientIsland(() => loaded, activation('checkout', 'submit', 'request-submit'))
			});
			const form = container.querySelector('form')!;
			for (let index = 0; index < 257; index++)
				form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
			resolveLoad(LazyCheckoutForm);
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(submissions).toBe(256);
		} finally {
			HTMLFormElement.prototype.requestSubmit = original;
		}
	});

	it('performs a canceled native click fallback exactly once when loading fails', async () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="failure" data-exact-client-name="Failure" data-exact-client-hydration="interaction"><button data-exact-id="failure-button">Open</button></div>';
		let rejectLoad!: (error: Error) => void;
		const loaded = new Promise<never>((_resolve, reject) => (rejectLoad = reject));
		let loads = 0;
		hydrateClientIslands(container, {
			Failure: lazyClientIsland(
				() => {
					loads++;
					return loaded;
				},
				activation('failure-button', 'click', 'native-click')
			)
		});
		const button = container.querySelector('button') as HTMLButtonElement;
		let nativeFallbacks = 0;
		button.click = () => nativeFallbacks++;
		button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		rejectLoad(new Error('unavailable'));
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(nativeFallbacks).toBe(1);
		button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		expect(loads).toBe(1);
	});

	it('rejects mismatched replay metadata before listeners are installed', () => {
		expect(() =>
			lazyClientIsland(
				async () => {
					throw new Error('not loaded');
				},
				activation('button', 'click', 'latest-value')
			)
		).toThrow(/bounded replay policy/);
	});

	it('ignores loader completion after root abort or generation replacement', async () => {
		for (const release of ['abort', 'generation'] as const) {
			const container = document.createElement('main');
			container.innerHTML =
				'<div data-exact-client-boundary="release" data-exact-client-name="Release" data-exact-client-hydration="interaction" data-exact-client-generation="1"><button data-exact-id="release-button">Open</button></div>';
			const controller = new AbortController();
			resetInteractionFixture();
			let resolveLoad!: (component: typeof LazyRelease) => void;
			const loaded = new Promise<typeof LazyRelease>((resolve) => (resolveLoad = resolve));
			hydrateClientIslands(
				container,
				{
					Release: lazyClientIsland(
						() => loaded,
						activation('release-button', 'click', 'native-click')
					)
				},
				{ signal: controller.signal }
			);
			container
				.querySelector('button')!
				.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
			if (release === 'abort') controller.abort();
			else
				container
					.querySelector('[data-exact-client-boundary]')!
					.setAttribute('data-exact-client-generation', '2');
			resolveLoad(LazyRelease);
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(readInteractionClicks()).toBe(0);
			expect(container.querySelector('[data-exact-client-hydrated="true"]')).toBeNull();
		}
	});
});
