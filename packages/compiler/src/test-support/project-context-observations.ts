import { expect } from 'vitest';
import { render, unmount } from '@exactjs/dom';
import { flushSync } from '@exactjs/reactive';
import { renderToHydratableString } from '@exactjs/ssr';

type Module = Record<string, unknown>;
type Root = Parameters<typeof render>[0];

/** Existing owned corpus programs selected for independent project-context perturbation. */
export const projectContextCases = [
	{
		fixture: 'fundamentals',
		root: 'fundamentalsRoot',
		selector: '[data-role="label"]',
		initial: 'ready'
	},
	{ fixture: 'state', root: 'stateRoot', selector: 'output', initial: 'count:1' },
	{
		fixture: 'structure',
		root: 'structureRoot',
		selector: '[data-scenario="structure"]',
		initial: 'beforevisibleafter'
	},
	{ fixture: 'registry', root: 'registryRoot', selector: '[data-view]', initial: 'first' },
	{ fixture: 'tasks', root: 'taskRoot', selector: 'output', initial: 'ready' }
] as const;

/** A scenario retains its hand-authored semantic oracle independently of compiler output. */
export type ProjectContextCase = (typeof projectContextCases)[number];

function rootFor(module: Module, name: string, args: readonly unknown[] = []): Root {
	const value = module[name];
	expect(value, `missing authored root ${name}`).toBeDefined();
	return (typeof value === 'function' ? value(...args) : value) as Root;
}

/** Observes SSR and repeated client transitions, asserting identity and disposal before comparison. */
export async function observeProjectContextCase(
	test: ProjectContextCase,
	client: Module,
	server: Module
) {
	const serverRoot = test.fixture === 'tasks' ? 'serverTaskRoot' : test.root;
	const rendered = await renderToHydratableString(rootFor(server, serverRoot));
	const serverContainer = document.createElement('div');
	serverContainer.innerHTML = rendered.htmlWithHydration;
	const serverSelector = test.fixture === 'tasks' ? '[data-scenario="server-task"]' : test.selector;
	const ssr = serverContainer.querySelector(serverSelector)?.textContent;
	expect(ssr).toBe(test.initial);
	const container = document.createElement('div');
	const values: string[] = [];
	try {
		render(rootFor(client, test.root), container);
		await expect.poll(() => container.querySelector(test.selector)?.textContent).toBe(test.initial);
		const original = container.querySelector(test.selector)!;
		values.push(original.textContent!);
		for (let step = 1; step <= 2; step++) {
			if (test.fixture === 'fundamentals') {
				const value = `updated-${step}`;
				render(rootFor(client, test.root, [value]), container);
				expect(container.querySelector(test.selector)).toBe(original);
				expect(original.textContent).toBe(value);
			} else if (test.fixture === 'state') {
				container.querySelector('button')!.click();
				flushSync();
				expect(container.querySelector(test.selector)).toBe(original);
				expect(original.textContent).toBe(`count:${step + 1}`);
			} else if (test.fixture === 'structure') {
				const owner = (client.structureOwner as () => { state: { visible: boolean } })();
				owner.state.visible = step === 2;
				flushSync();
				expect(container.querySelector(test.selector)).toBe(original);
				expect(original.textContent).toBe(step === 1 ? 'beforeafter' : 'beforevisibleafter');
			} else if (test.fixture === 'registry') {
				const previous = container.querySelector(test.selector);
				const selection = step === 1 ? 'first' : 'second';
				render(rootFor(client, test.root, [selection]), container);
				flushSync();
				if (step === 1) expect(container.querySelector(test.selector)).toBe(previous);
				else expect(container.querySelector(test.selector)).not.toBe(previous);
				expect(container.querySelector(test.selector)?.textContent).toBe(selection);
			} else {
				container.querySelector('button')!.click();
				await expect
					.poll(() => container.querySelector('data')?.textContent)
					.toBe(String(step + 1));
				await expect.poll(() => container.querySelector(test.selector)?.textContent).toBe('ready');
				expect(container.querySelector(test.selector)).toBe(original);
			}
			values.push(container.querySelector(test.selector)!.textContent!);
		}
	} finally {
		unmount(container);
	}
	expect(container.childNodes.length).toBe(0);
	if (test.fixture === 'registry') {
		const lazy = document.createElement('div');
		try {
			render(rootFor(client, 'lazyRegistryRoot'), lazy);
			await expect.poll(() => lazy.querySelector('[data-view]')?.textContent).toBe('lazy second');
			values.push(lazy.textContent!);
		} finally {
			unmount(lazy);
		}
		const lazySsr = await renderToHydratableString(rootFor(server, 'lazyRegistryRoot'));
		const html = document.createElement('div');
		html.innerHTML = lazySsr.htmlWithHydration;
		expect(html.querySelector('[data-view]')?.textContent).toBe('lazy second');
	}
	return { ssr, values };
}
