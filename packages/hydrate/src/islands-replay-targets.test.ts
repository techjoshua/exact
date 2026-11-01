import { verifyRetiredInteractionBroker } from '../../component-composition-corpus/test-support/island-generation-journey.js';
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

it('retains an unlabelled submitter after adoption consumes the boundary marker', async () => {
	const root = document.createElement('main');
	root.innerHTML =
		'<div data-exact-client-boundary="one" data-exact-client-hydration="interaction"><form data-exact-id="form"><button type="submit">Save</button></form></div>';
	onTestFinished(() => disposeInteractionHydration(root));
	let ready!: (value: boolean) => void;
	const pending = new Promise<boolean>((resolve) => {
		ready = resolve;
	});
	ensureInteractionHydration(
		root,
		() => pending,
		['submit'],
		() => ({ type: 'submit', replay: 'request-submit' }),
		{}
	);
	const form = root.querySelector('form')!;
	const button = root.querySelector('button')!;
	form.dispatchEvent(
		new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: button })
	);
	let actual: HTMLElement | null | undefined;
	form.addEventListener('submit', (event) => {
		event.preventDefault();
		actual = event.submitter;
	});
	root.firstElementChild!.removeAttribute('data-exact-client-boundary');
	// Hydration may insert empty text anchors without changing the authored element structure.
	form.prepend(document.createTextNode(''));
	root.firstElementChild!.prepend(document.createTextNode(''));
	root.firstElementChild!.setAttribute('data-exact-client-hydrated', 'true');
	ready(true);
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(actual).toBe(button);
});

it.each(['shared-name', 'id-and-name'] as const)(
	'coalesces values by target rather than shared attribute text: %s',
	async (identity) => {
		const root = document.createElement('main');
		root.innerHTML =
			'<div data-exact-client-boundary="one" data-exact-client-hydration="interaction"><input name="value"><input name="value"></div>';
		onTestFinished(() => disposeInteractionHydration(root));
		const inputs = [...root.querySelectorAll('input')];
		if (identity === 'id-and-name') inputs[0]!.id = 'value';
		let ready!: (value: boolean) => void;
		const pending = new Promise<boolean>((resolve) => {
			ready = resolve;
		});
		ensureInteractionHydration(
			root,
			() => pending,
			['input'],
			() => ({ type: 'input', replay: 'latest-value' }),
			{}
		);
		for (const [index, value] of [
			[0, 'old'],
			[1, 'second'],
			[0, 'first']
		] as const) {
			inputs[index]!.value = value;
			inputs[index]!.dispatchEvent(new Event('input', { bubbles: true }));
		}
		const seen: string[] = [];
		for (const [index, input] of inputs.entries())
			input.oninput = () => {
				seen.push(index + ':' + input.value);
			};
		root.firstElementChild!.prepend(inputs[1]!);
		root.firstElementChild!.setAttribute('data-exact-client-hydrated', 'true');
		ready(true);
		await tick();
		expect(seen).toEqual(['1:second', '0:first']);
		inputs[1]!.value = 'next';
		inputs[1]!.dispatchEvent(new Event('input', { bubbles: true }));
		expect(seen.at(-1)).toBe('1:next');
	}
);

it.each(['name', 'position'] as const)(
	'does not redirect a removed control through an ambiguous %s',
	async (identity) => {
		const root = document.createElement('main');
		root.innerHTML =
			'<div data-exact-client-boundary="one" data-exact-client-hydration="interaction"><input><input></div>';
		onTestFinished(() => disposeInteractionHydration(root));
		const [first, second] = [...root.querySelectorAll('input')];
		if (identity === 'name') {
			first!.name = 'value';
			second!.name = 'value';
		}
		let ready!: (value: boolean) => void;
		const pending = new Promise<boolean>((resolve) => {
			ready = resolve;
		});
		ensureInteractionHydration(
			root,
			() => pending,
			['input'],
			() => ({ type: 'input', replay: 'latest-value' }),
			{}
		);
		first!.value = 'removed';
		first!.dispatchEvent(new Event('input', { bubbles: true }));
		first!.remove();
		const seen: string[] = [];
		second!.oninput = () => {
			seen.push(second!.value);
		};
		root.firstElementChild!.setAttribute('data-exact-client-hydrated', 'true');
		ready(true);
		await tick();
		expect(seen).toEqual([]);
		expect(second!.value).toBe('');
		second!.value = 'next';
		second!.dispatchEvent(new Event('input', { bubbles: true }));
		expect(seen).toEqual(['next']);
	}
);

it.each(['resolve', 'reject'] as const)(
	'does not let an old %s retire a newer generation queue',
	async (completion) => {
		const root = document.createElement('main');
		root.innerHTML =
			'<div data-exact-client-boundary="one" data-exact-client-hydration="interaction" data-exact-client-generation="1"><button data-exact-id="action">Go</button></div>';
		onTestFinished(() => disposeInteractionHydration(root));
		const boundary = root.firstElementChild!;
		const button = root.querySelector('button')!;
		let oldResolve!: (value: boolean) => void;
		let oldReject!: (reason: unknown) => void;
		const old = new Promise<boolean>((resolve, reject) => {
			oldResolve = resolve;
			oldReject = reject;
		});
		let nextResolve!: (value: boolean) => void;
		const next = new Promise<boolean>((resolve) => {
			nextResolve = resolve;
		});
		let activations = 0;
		const reports: unknown[] = [];
		ensureInteractionHydration(
			root,
			() => (++activations === 1 ? old : next),
			['click'],
			() => ({ type: 'click', replay: 'native-click' }),
			{
				logger: {
					log: (entry) => {
						reports.push(entry);
					}
				}
			}
		);
		button.click();
		boundary.setAttribute('data-exact-client-generation', '2');
		button.click();
		if (completion === 'resolve') oldResolve(true);
		else oldReject(new Error('retired generation'));
		await tick();
		button.click();
		expect(activations).toBe(2);
		let calls = 0;
		button.onclick = () => {
			calls++;
		};
		boundary.setAttribute('data-exact-client-hydrated', 'true');
		nextResolve(true);
		await tick();
		expect(calls).toBe(2);
		expect(reports).toEqual([]);
		button.click();
		expect(calls).toBe(3);
	}
);

it('rejects capture registration under already-aborted ownership and permits the next owner', () => {
	verifyRetiredInteractionBroker(
		{ ensureInteractionHydration, disposeInteractionHydration },
		document
	);
});

it.each(['false-result', 'null-rejection', 'undefined-rejection'] as const)(
	'settles %s with one fallback and a usable next owner',
	async (outcome) => {
		const root = document.createElement('main');
		root.innerHTML =
			'<div data-exact-client-boundary="one" data-exact-client-hydration="interaction"><button>Go</button></div>';
		onTestFinished(() => disposeInteractionHydration(root));
		const button = root.querySelector('button')!;
		let calls = 0;
		let loads = 0;
		button.onclick = () => {
			calls++;
		};
		const reports: unknown[] = [];
		const policy = () => ({ type: 'click' as const, replay: 'native-click' as const });
		ensureInteractionHydration(
			root,
			() => {
				loads++;
				return outcome === 'false-result'
					? Promise.resolve(false)
					: Promise.reject(outcome === 'null-rejection' ? null : undefined);
			},
			['click'],
			policy,
			{
				logger: {
					log: (entry) => {
						reports.push(entry);
					}
				}
			}
		);
		button.click();
		expect(calls).toBe(0);
		await tick();
		expect(calls).toBe(1);
		expect(reports).toHaveLength(outcome === 'false-result' ? 0 : 1);
		button.click();
		expect(calls).toBe(2);
		expect(loads).toBe(1);
		ensureInteractionHydration(
			root,
			(boundary) => {
				loads++;
				boundary.setAttribute('data-exact-client-hydrated', 'true');
				return true;
			},
			['click'],
			policy,
			{}
		);
		button.click();
		expect(calls).toBe(3);
		button.click();
		expect(calls).toBe(4);
		expect(loads).toBe(2);
	}
);
