/** @vitest-environment jsdom */
import { type AnyComponentFunction } from '@exactjs/core';
import { describe, expect, it } from 'vitest';
import { createExactClient, hydrateClientIslands, lazyClientIsland } from './index.js';
import {
	DomainCounter,
	InteractionChoice,
	InteractionCounter,
	InteractionForm,
	InteractionInput,
	readInteractionClicks,
	readInteractionDomain,
	readInteractionInputValue,
	readInteractionSubmissions,
	ReplacementCounter,
	resetInteractionFixture
} from './test-support/island-interaction.fixtures.js';

function interactionIsland(
	component: AnyComponentFunction,
	id: string,
	type: 'click' | 'input' | 'submit',
	replay: 'native-click' | 'latest-value' | 'request-submit'
) {
	return lazyClientIsland(async () => component, {
		mode: 'interaction',
		reasons: [],
		targets: [{ id, events: [{ type, replay }] }]
	});
}

async function releaseInteraction(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('@exactjs/hydrate interaction-island adoption', () => {
	it('adopts before delivering the first click', async () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="counter" data-exact-client-name="Counter" data-exact-client-hydration="interaction" data-exact-client-generation="1"><button data-exact-id="counter-button">Count</button></div>';
		const serverButton = container.querySelector('button')!;
		resetInteractionFixture();

		expect(
			hydrateClientIslands(container, {
				Counter: interactionIsland(InteractionCounter, 'counter-button', 'click', 'native-click')
			})
		).toBe(0);
		serverButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await releaseInteraction();

		expect(readInteractionClicks()).toBe(1);
		expect(container.querySelector('button')).toBe(serverButton);
		expect(
			container
				.querySelector('[data-exact-client-boundary="counter"]')
				?.getAttribute('data-exact-client-hydrated')
		).toBe('true');
	});

	it('registers the loaded component in the owning client domain', async () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="counter" data-exact-client-name="Counter" data-exact-client-hydration="interaction"><button data-exact-id="counter-button">Count</button></div>';
		resetInteractionFixture();
		const client = createExactClient(container, {
			islands: {
				Counter: interactionIsland(DomainCounter, 'counter-button', 'click', 'native-click')
			}
		});

		expect(readInteractionDomain()).toBeUndefined();
		container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await releaseInteraction();

		expect(readInteractionDomain()).toBe(client.domain);
	});

	it('preserves dirty input while replaying its compiled binding', async () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="form" data-exact-client-name="FormIsland" data-exact-client-hydration="interaction"><input data-exact-id="name" value="server"></div>';
		const serverInput = container.querySelector('input')!;
		serverInput.value = 'typed';
		resetInteractionFixture();

		hydrateClientIslands(container, {
			FormIsland: interactionIsland(InteractionInput, 'name', 'input', 'latest-value')
		});
		serverInput.dispatchEvent(new Event('input', { bubbles: true }));
		await releaseInteraction();

		expect(container.querySelector('input')).toBe(serverInput);
		expect(serverInput.value).toBe('typed');
		expect(readInteractionInputValue()).toBe('typed');
	});

	it('preserves one native checkbox toggle while activating its handler', async () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="choice" data-exact-client-name="Choice" data-exact-client-hydration="interaction"><input data-exact-id="choice-box" type="checkbox"></div>';
		const serverInput = container.querySelector('input')!;
		resetInteractionFixture();

		hydrateClientIslands(container, {
			Choice: interactionIsland(InteractionChoice, 'choice-box', 'click', 'native-click')
		});
		serverInput.click();
		await releaseInteraction();

		expect(readInteractionClicks()).toBe(1);
		expect(container.querySelector('input')).toBe(serverInput);
		expect(serverInput.checked).toBe(true);
	});

	it('activates a form before delivering its first submit once', async () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="form" data-exact-client-name="FormIsland" data-exact-client-hydration="interaction"><form data-exact-id="profile-form"><button type="submit">Save</button></form></div>';
		const form = container.querySelector('form')!;
		resetInteractionFixture();

		hydrateClientIslands(container, {
			FormIsland: interactionIsland(InteractionForm, 'profile-form', 'submit', 'request-submit')
		});
		form.requestSubmit(form.querySelector('button')!);
		await releaseInteraction();

		expect(readInteractionSubmissions()).toBe(1);
		expect(container.querySelector('form')).toBe(form);
	});

	it('replays once against a replacement target after an adoption mismatch', async () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<div data-exact-client-boundary="counter" data-exact-client-name="Counter" data-exact-client-hydration="interaction" data-exact-client-generation="1"><button data-exact-id="counter-button"><span>Server</span></button></div>';
		const serverButton = container.querySelector('button')!;
		resetInteractionFixture();

		hydrateClientIslands(container, {
			Counter: interactionIsland(ReplacementCounter, 'counter-button', 'click', 'native-click')
		});
		serverButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		await releaseInteraction();

		expect(container.querySelector('button')).not.toBe(serverButton);
		expect(container.querySelector('button')?.textContent).toBe('Client');
		expect(readInteractionClicks()).toBe(1);
	});
});
