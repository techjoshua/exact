/** @vitest-environment jsdom */
import { expect, it, onTestFinished } from 'vitest';
import { ensureInteractionHydration, disposeInteractionHydration } from './islands/interaction.js';

it.each(['different-id', 'nested-owner', 'same-id'] as const)(
	'resolves queued actions within their original target identity: %s',
	async (change) => {
		const root = document.createElement('main');
		root.innerHTML =
			'<div data-exact-client-boundary="one" data-exact-client-hydration="interaction"><button data-exact-id="first">First</button><button data-exact-id="second">Second</button></div>';
		onTestFinished(() => disposeInteractionHydration(root));
		let ready!: (value: boolean) => void;
		const loaded = new Promise<boolean>((resolve) => {
			ready = resolve;
		});
		ensureInteractionHydration(
			root,
			() => loaded,
			['click'],
			() => ({ type: 'click', replay: 'native-click' }),
			{}
		);
		const [first, second] = Array.from(root.querySelectorAll('button'));
		let firstCalls = 0;
		let replacementCalls = 0;
		first!.click();
		second!.click();
		first!.onclick = () => {
			firstCalls++;
			const replacement = document.createElement('button');
			replacement.setAttribute('data-exact-id', change === 'different-id' ? 'third' : 'second');
			replacement.onclick = () => {
				replacementCalls++;
			};
			if (change === 'nested-owner') {
				const nested = document.createElement('aside');
				nested.setAttribute('data-exact-client-boundary', 'child');
				nested.append(replacement);
				second!.replaceWith(nested);
			} else second!.replaceWith(replacement);
		};
		root.firstElementChild!.setAttribute('data-exact-client-hydrated', 'true');
		ready(true);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(firstCalls).toBe(1);
		expect(replacementCalls).toBe(change === 'same-id' ? 1 : 0);
		root.querySelectorAll('button')[1]!.click();
		expect(replacementCalls).toBe(change === 'same-id' ? 2 : 1);
	}
);

it('can replay against the boundary element itself', async () => {
	const root = document.createElement('main');
	root.innerHTML =
		'<button data-exact-client-boundary="one" data-exact-client-hydration="interaction" data-exact-id="action">Go</button>';
	onTestFinished(() => disposeInteractionHydration(root));
	let ready!: (value: boolean) => void;
	const pending = new Promise<boolean>((resolve) => {
		ready = resolve;
	});
	ensureInteractionHydration(
		root,
		() => pending,
		['click'],
		() => ({ type: 'click', replay: 'native-click' }),
		{}
	);
	const button = root.querySelector('button')!;
	let calls = 0;
	button.click();
	button.onclick = () => {
		calls++;
	};
	button.setAttribute('data-exact-client-hydrated', 'true');
	ready(true);
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(calls).toBe(1);
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
it.each(['unchanged', 'removed', 'type', 'foreign-form'] as const)(
	'revalidates the queued submitter: %s',
	async (change) => {
		const root = document.createElement('main');
		root.innerHTML =
			'<div data-exact-client-boundary="one" data-exact-client-hydration="interaction"><form data-exact-id="form"><button type="submit" data-exact-id="save">Save</button></form><form id="other"></form></div>';
		let ready!: (value: boolean) => void;
		const pending = new Promise<boolean>((resolve) => (ready = resolve));
		ensureInteractionHydration(
			root,
			() => pending,
			['submit'],
			() => ({ type: 'submit', replay: 'request-submit' }),
			{}
		);
		const form = root.querySelector('form')!,
			button = root.querySelector('button')!;
		let calls = 0;
		try {
			form.dispatchEvent(
				new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: button })
			);
			form.addEventListener('submit', (event) => {
				event.preventDefault();
				calls++;
			});
			if (change === 'removed') button.remove();
			if (change === 'type') button.type = 'button';
			if (change === 'foreign-form') root.querySelector('#other')!.append(button);
			root.firstElementChild!.setAttribute('data-exact-client-hydrated', 'true');
			ready(true);
			await tick();
			expect(calls).toBe(change === 'unchanged' ? 1 : 0);
		} finally {
			disposeInteractionHydration(root);
		}
	}
);
