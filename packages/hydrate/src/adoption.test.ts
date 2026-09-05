/**
 * @vitest-environment jsdom
 */
import '@exactjs/core/runtime/lists';
import '@exactjs/core/runtime/refs';
import {
	exactEnhancementPassThrough,
	unsafeHtml,
	type Child,
	type Component,
	type LogEvent,
	type Logger,
	type RootLifecycle
} from '@exactjs/core';
import '@exactjs/dom/runtime/target';
import '@exactjs/dom/framework/enhancements';
import '@exactjs/dom/unsafe-html';
import { render } from '@exactjs/dom';
import { flushSync } from '@exactjs/reactive';
import { renderToHydratableString, renderToString } from '@exactjs/ssr';
import { describe, expect, it, vi } from 'vitest';
import { hydrate } from './index.js';
import { noopLogger } from './test-support/responses.js';
import {
	boundInputRoot,
	AdoptionEnhancement,
	adoptionEnhancementIdentity,
	buttonRefKey,
	buttonRefRoot,
	configureAdoptionEnhancement,
	configureNestedTargetRoot,
	configureRegistrySelection,
	counterRoot,
	disclosureRoot,
	dynamicLabelRoot,
	dynamicPanelRoot,
	enhancedPageRoot,
	greetingRoot,
	inputRoot,
	keyedListRoot,
	labelPropsRoot,
	labelStateRoot,
	mountedDynamicPanel,
	mountedKeyedList,
	nestedParentRoot,
	nestedTargetRoot,
	paragraphRoot,
	registryRoot,
	siblingRoot,
	targetForwardingRoot,
	unsafeIframeRoot
} from './test-support/adoption.fixtures.js';
import {
	greetingRoot as serverGreetingRoot,
	buttonRefRoot as serverButtonRefRoot,
	counterRoot as serverCounterRoot,
	dynamicLabelRoot as serverDynamicLabelRoot,
	labelPropsRoot as serverLabelPropsRoot,
	labelStateRoot as serverLabelStateRoot,
	keyedListRoot as serverKeyedListRoot,
	nestedParentRoot as serverNestedParentRoot,
	nestedTargetRoot as serverNestedTargetRoot,
	paragraphRoot as serverParagraphRoot,
	dynamicPanelRoot as serverDynamicPanelRoot,
	enhancedPageRoot as serverEnhancedPageRoot,
	registryRoot as serverRegistryRoot,
	siblingRoot as serverSiblingRoot,
	targetForwardingRoot as serverTargetForwardingRoot
} from './test-support/adoption.fixtures.js?exact-target=server';

describe('@exactjs/hydrate adoption', () => {
	it('adopts target-forwarded attributes without replacing the intrinsic', () => {
		const root = document.createElement('div');
		const resumptions = prepareServerHydration(root, serverTargetForwardingRoot);
		const serverButton = root.querySelector('button')!;

		hydrate(targetForwardingRoot, root, { logger: noopLogger, resumptions });

		expect(root.querySelector('button')).toBe(serverButton);
		expect(serverButton.className).toBe('authored forwarded');
		expect(serverButton.getAttribute('aria-describedby')).toBe('help');
	});

	it('adopts nested target owners with independent refs and event subscriptions', () => {
		const calls: string[] = [];
		const refs: Element[] = [];
		const ref = { fulfill: (value: unknown) => value instanceof Element && refs.push(value) };
		const props = {
			onAuthored: () => calls.push('authored'),
			onInner: () => calls.push('inner'),
			onOuter: () => calls.push('outer'),
			ref: ref as never
		};
		configureNestedTargetRoot(props);
		const root = document.createElement('div');
		const resumptions = prepareServerHydration(root, serverNestedTargetRoot);
		const serverButton = root.querySelector('button')!;

		hydrate(nestedTargetRoot, root, { logger: noopLogger, resumptions });
		serverButton.click();

		expect(root.querySelector('button')).toBe(serverButton);
		expect(serverButton.className).toBe('authored inner outer');
		expect(refs).toEqual([serverButton, serverButton, serverButton]);
		expect(calls).toEqual(['authored']);
	});

	it('activates bundle-local enhancements after adopting their authored target', () => {
		const roots: RootLifecycle<HTMLElement>[] = [];
		configureAdoptionEnhancement((root) => roots.push(root));
		const root = document.createElement('div');
		const enhancementCatalog = new Map([[adoptionEnhancementIdentity, AdoptionEnhancement]]);
		const serverEnhancementCatalog = new Map([
			[adoptionEnhancementIdentity, exactEnhancementPassThrough]
		]);
		const rendered = renderToString(serverEnhancedPageRoot, {
			enhancementCatalog: serverEnhancementCatalog
		});
		root.innerHTML = rendered.html;
		const serverNode = root.querySelector('button')!;

		hydrate(enhancedPageRoot, root, {
			logger: noopLogger,
			enhancementCatalog
		});
		flushSync();

		expect(root.querySelector('button')).toBe(serverNode);
		expect(serverNode.dataset.enhanced).toBe('yes');
		expect(roots).toHaveLength(1);
		expect(roots[0]?.current).toBe(serverNode);
	});

	it('preserves dirty form state entered before hydration', () => {
		const container = document.createElement('div');
		container.innerHTML = '<input value=server>';
		const input = container.querySelector('input')!;
		input.value = 'typed';
		hydrate(inputRoot, container, { allowMarkerless: true, logger: noopLogger });
		expect(container.querySelector('input')?.value).toBe('typed');
	});

	it('publishes preserved dirty state through the compiled binding', () => {
		const container = document.createElement('div');
		container.innerHTML = '<input data-exact-id=name value=server>';
		const input = container.querySelector('input')!;
		input.value = 'typed';
		let value = 'server';
		hydrate(
			boundInputRoot((next) => (value = next)),
			container,
			{
				allowMarkerless: true,
				logger: noopLogger
			}
		);

		expect(value).toBe('typed');
	});

	it('adopts and publishes disclosure changes made before hydration', () => {
		const container = document.createElement('div');
		container.innerHTML = '<details data-exact-id=more data-exact-ssr-open=false></details>';
		const details = container.querySelector('details')!;
		details.open = true;
		let open = false;
		hydrate(
			disclosureRoot((next) => (open = next)),
			container,
			{
				allowMarkerless: true,
				logger: noopLogger
			}
		);

		expect(container.querySelector('details')?.open).toBe(true);
		expect(open).toBe(true);
	});

	it('makes hydration idempotent and exposes idempotent disposal', () => {
		const container = document.createElement('div');
		container.innerHTML = '<p>server</p>';
		const operation = paragraphRoot('server');
		const first = hydrate(operation, container, { allowMarkerless: true, logger: noopLogger });
		expect(hydrate(operation, container, { allowMarkerless: true, logger: noopLogger })).toBe(
			first
		);
		first.dispose();
		first.dispose();
		expect(() => first.applyPatches([])).toThrow('disposed');
	});

	it('adopts compatible static marker-wrapped SSR nodes', () => {
		const root = document.createElement('div');
		const resumptions = prepareServerHydration(root, serverParagraphRoot('server', 'ready'));
		const serverNode = root.querySelector('p')!;
		const observations: unknown[] = [];
		hydrate(paragraphRoot('server', 'ready'), root, {
			logger: noopLogger,
			resumptions,
			onHydration: (observation) => observations.push(observation)
		});
		expect(root.querySelector('p')).toBe(serverNode);
		expect(root.querySelectorAll('p')).toHaveLength(1);
		expect(observations).toEqual([{ kind: 'root', outcome: 'adopted', markers: 'exact' }]);
	});

	it('adopts normalized static class-list values without replacing the server node', () => {
		const root = document.createElement('div');
		const resumptions = prepareServerHydration(
			root,
			serverParagraphRoot('server', ['panel', { active: true, hidden: false }])
		);
		const serverNode = root.querySelector('p');

		hydrate(paragraphRoot('server', ['panel', { active: true, hidden: false }]), root, {
			logger: noopLogger,
			resumptions
		});

		expect(root.querySelector('p')).toBe(serverNode);
	});

	it('adopts opted-in iframe srcdoc through the unsafe HTML capability', () => {
		const root = document.createElement('div');
		root.innerHTML = '<iframe srcdoc="&lt;p&gt;trusted&lt;/p&gt;"></iframe>';
		const serverNode = root.querySelector('iframe');
		const audit: Array<{ characters: number }> = [];
		hydrate(unsafeIframeRoot(unsafeHtml('<p>trusted</p>')), root, {
			allowMarkerless: true,
			logger: noopLogger,
			allowUnsafeHtml: true,
			onUnsafeHtml: (event) => audit.push(event)
		});
		expect(root.querySelector('iframe')).toBe(serverNode);
		expect(audit).toEqual([{ characters: 14 }]);
	});

	it('patches an adopted static root without appending a second tree', () => {
		const root = document.createElement('div');
		const resumptions = prepareServerHydration(root, serverParagraphRoot('server'));
		const serverNode = root.querySelector('p')!;
		hydrate(paragraphRoot('server'), root, { logger: noopLogger, resumptions });
		render(paragraphRoot('client'), root);
		expect(root.querySelectorAll('p')).toHaveLength(1);
		expect(root.querySelector('p')).toBe(serverNode);
		expect(root.textContent).toBe('client');
	});

	it('adopts an SSR root component boundary without replacing its DOM', () => {
		const root = document.createElement('div');
		const resumptions = prepareServerHydration(root, serverGreetingRoot);
		const serverNode = root.querySelector('p')!;
		hydrate(greetingRoot, root, { logger: noopLogger, resumptions });
		expect(root.querySelector('p')).toBe(serverNode);
		render(greetingRoot, root);
		expect(root.querySelector('p')).toBe(serverNode);
	});

	it('adopts nested component marker boundaries', () => {
		const root = document.createElement('div');
		const resumptions = prepareServerHydration(root, serverNestedParentRoot);
		const serverChild = root.querySelector('em')!;
		hydrate(nestedParentRoot, root, { logger: noopLogger, resumptions });
		expect(root.querySelector('em')).toBe(serverChild);
	});

	it('adopts compiler cell marker boundaries', () => {
		const root = document.createElement('div');
		let instance!: Component<{ label: string }>;
		const resumptions = prepareServerHydration(root, serverLabelStateRoot());
		const serverNode = root.querySelector('p')!;
		hydrate(
			labelStateRoot((value) => (instance = value)),
			root,
			{
				logger: noopLogger,
				resumptions
			}
		);
		instance.state.label = 'client';
		flushSync();
		expect(root.querySelector('p')).toBe(serverNode);
		expect(root.querySelector('p')?.textContent).toBe('client');
	});

	it('adopts a compiler cell at the hydration root without replacing server DOM', () => {
		const root = document.createElement('div');
		const resumptions = prepareServerHydration(root, serverLabelPropsRoot('server'));
		const serverNode = root.querySelector('p')!;

		hydrate(labelPropsRoot('server'), root, { logger: noopLogger, resumptions });

		expect(root.querySelector('p')).toBe(serverNode);
		hydrate(labelPropsRoot('client'), root, { logger: noopLogger });
		expect(root.querySelector('p')).toBe(serverNode);
		expect(serverNode.textContent).toBe('client');
	});

	it('adopts keyed SSR item ranges and reorders their existing DOM', () => {
		const root = document.createElement('div');
		root.innerHTML = renderToString(serverKeyedListRoot).html;
		const [a, b] = Array.from(root.querySelectorAll('li'));
		hydrate(keyedListRoot, root, { logger: noopLogger });
		mountedKeyedList().state.items.splice(0, 2, { id: 'b', title: 'B' }, { id: 'a', title: 'A' });
		flushSync();
		expect(Array.from(root.querySelectorAll('li'))).toEqual([b, a]);
	});

	it('adopts a dynamic marker range and updates it after hydration', () => {
		const root = document.createElement('div');
		let client!: Component<{ label: string }>;
		const resumptions = prepareServerHydration(root, serverDynamicLabelRoot());
		const serverNode = root.querySelector('p')!;
		hydrate(
			dynamicLabelRoot((value) => (client = value)),
			root,
			{
				logger: noopLogger,
				resumptions
			}
		);
		client.state.label = 'client';
		flushSync();
		expect(root.querySelector('p')).toBe(serverNode);
		expect(root.querySelector('p')?.textContent).toBe('client');
	});

	it('activates a client-only dynamic component inside its SSR-owned range', () => {
		const root = document.createElement('div');
		const resumptions = prepareServerHydration(root, serverDynamicPanelRoot);
		const siblings = root.querySelectorAll('span');
		const before = siblings[0];
		const after = siblings[1];

		const diagnostics: string[] = [];
		hydrate(dynamicPanelRoot, root, {
			logger: noopLogger,
			resumptions,
			onDiagnostic: (diagnostic) => diagnostics.push(`${diagnostic.code}:${diagnostic.message}`)
		});
		mountedDynamicPanel().state.active = true;
		flushSync();
		expect(root.textContent).toBe('beforeactivatedafter');
		expect(diagnostics).toEqual([]);
		expect(root.querySelectorAll('span')[0]).toBe(before);
		expect(root.querySelectorAll('span')[1]).toBe(after);
	});

	it('attaches JSX events while adopting a component root', () => {
		const root = document.createElement('div');
		const resumptions = prepareServerHydration(root, serverCounterRoot);
		hydrate(counterRoot, root, { logger: noopLogger, resumptions });
		const button = root.querySelector('button')!;
		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		flushSync();
		expect(button.textContent).toBe('1');
	});

	it('propagates the hydration logger into adopted component interactions', async () => {
		const root = document.createElement('div');
		const events: LogEvent[] = [];
		const logger: Logger = {
			isEnabled: (level) => level === 'trace',
			log: (event) => events.push(event)
		};
		const resumptions = prepareServerHydration(root, serverCounterRoot);
		hydrate(counterRoot, root, { logger, resumptions });

		root.querySelector('button')!.click();
		await vi.waitFor(() =>
			expect(events.some((event) => event.message === 'performance interaction settled')).toBe(true)
		);
	});

	it('fulfills component refs while adopting existing elements', () => {
		const root = document.createElement('div');
		let instance!: Component<{}>;
		const resumptions = prepareServerHydration(root, serverButtonRefRoot());
		const serverNode = root.querySelector('button')!;
		hydrate(
			buttonRefRoot((value) => (instance = value)),
			root,
			{
				logger: noopLogger,
				resumptions
			}
		);
		expect(instance.refs.get(buttonRefKey)).toBe(serverNode);
	});

	it('adopts static fragment siblings inside a marker range', () => {
		const root = document.createElement('div');
		const resumptions = prepareServerHydration(root, serverSiblingRoot({}));
		const [first, second] = Array.from(root.querySelectorAll('p'));
		hydrate(siblingRoot({}), root, { logger: noopLogger, resumptions });
		expect(root.querySelectorAll('p')[0]).toBe(first);
		expect(root.querySelectorAll('p')[1]).toBe(second);
	});

	it('adopts nested static fragments inside a marker range', () => {
		const root = document.createElement('div');
		const resumptions = prepareServerHydration(root, serverSiblingRoot({}));
		const [first, second] = Array.from(root.querySelectorAll('p'));
		hydrate(siblingRoot({}), root, { logger: noopLogger, resumptions });
		expect(root.querySelectorAll('p')[0]).toBe(first);
		expect(root.querySelectorAll('p')[1]).toBe(second);
	});

	it('repairs an unexpected SSR attribute without replacing compatible markup', () => {
		const root = document.createElement('div');
		const resumptions = prepareServerHydration(root, serverParagraphRoot('server'));
		const serverNode = root.querySelector('p')!;
		serverNode.setAttribute('data-stale', 'yes');
		hydrate(paragraphRoot('server'), root, { logger: noopLogger, resumptions });
		expect(root.querySelector('p')).toBe(serverNode);
		expect(root.querySelector('p')?.hasAttribute('data-stale')).toBe(false);
	});

	it('repairs only the mismatched child of an adopted static fragment', () => {
		const root = document.createElement('div');
		const resumptions = prepareServerHydration(root, serverSiblingRoot({}));
		root.querySelectorAll('p')[1]!.textContent = 'stale';
		const first = root.querySelectorAll('p')[0]!;
		const stale = root.querySelectorAll('p')[1]!;
		hydrate(siblingRoot({}), root, { logger: noopLogger, resumptions });
		expect(root.querySelectorAll('p')[0]).toBe(first);
		expect(root.querySelectorAll('p')[1]).toBe(stale);
		expect(root.textContent).toBe('onetwo');
	});

	it('repairs a stale static attribute without replacing compatible siblings', () => {
		const root = document.createElement('div');
		const resumptions = prepareServerHydration(root, serverSiblingRoot({ firstClass: 'stale' }));
		const stale = root.querySelectorAll('p')[0]!;
		const sibling = root.querySelectorAll('p')[1]!;
		hydrate(siblingRoot({ firstClass: 'fresh' }), root, { logger: noopLogger, resumptions });
		expect(root.querySelectorAll('p')[0]).toBe(stale);
		expect(root.querySelectorAll('p')[0]?.className).toBe('fresh');
		expect(root.querySelectorAll('p')[1]).toBe(sibling);
	});

	it('restores focus and selection when local static repair replaces an input', () => {
		const root = document.createElement('div');
		document.body.appendChild(root);
		const resumptions = prepareServerHydration(root, serverSiblingRoot({ input: true }));
		const input = root.querySelector('input')!;
		input.setAttribute('value', 'stale');
		input.focus();
		input.setSelectionRange(1, 3);
		try {
			hydrate(siblingRoot({ input: true }), root, { logger: noopLogger, resumptions });
			const repaired = root.querySelector('input')!;
			expect(document.activeElement).toBe(repaired);
			expect(repaired.selectionStart).toBe(1);
			expect(repaired.selectionEnd).toBe(3);
		} finally {
			root.remove();
		}
	});

	it('recovers a mismatched registry entry without replacing adjacent adopted DOM', () => {
		const container = document.createElement('div');
		const resumptions = prepareServerHydration(container, serverRegistryRoot);
		const stable = container.querySelector('span');
		configureRegistrySelection('second');

		hydrate(registryRoot, container, { logger: noopLogger, resumptions });

		expect(container.querySelector('span')).toBe(stable);
		expect(container.querySelector('p')?.textContent).toBe('second');
	});
});

function prepareServerHydration(container: Element, operation: Child) {
	const rendered = renderToHydratableString(operation);
	container.innerHTML = rendered.html;
	return rendered.resumptions;
}
