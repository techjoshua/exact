/**
 * @vitest-environment jsdom
 */
import '@exactjs/core/runtime/lists';
import '@exactjs/core/runtime/refs';
import {
	exactEnhancementPassThrough,
	attemptCleanup,
	attachSuppressedCleanupFailure,
	createCleanupFailure,
	throwCleanupFailure,
	unsafeHtml,
	type Child,
	type Component,
	type AnyComponentInstance,
	createRef,
	type RefBinding,
	type LogEvent,
	type Logger,
	type RootLifecycle
} from '@exactjs/core';
import '@exactjs/dom/runtime/target';
import '@exactjs/dom/framework/enhancements';
import '@exactjs/dom/unsafe-html';
import { render, unmount, dispose } from '@exactjs/dom';
import {
	adoptCompiledComponentInputRoot,
	adoptMarkerlessCompiledComponentInputRoot
} from '@exactjs/dom/framework/component-root';
import { createComponentDomain, withComponentDomain } from '@exactjs/core';
import { createCompiledComponentInputReceipt as clientReceipt } from '@exactjs/core/runtime/component-operations';
import { createPreparedServerComponentInputReference as serverReceipt } from '@exactjs/core/framework/server-render-structure';
import { findElementOwner, inspectDomRoot } from '@exactjs/dom/testing';
import { flushSync } from '@exactjs/reactive';
import { createEffectScope, registerEffectScopeCleanup } from '@exactjs/reactive/framework/runtime';
import { createFrameworkFixtureComponentInstance } from '@exactjs/core/testing';
import { roots } from '../../dom/src/state.js';
import type { Mounted } from '../../dom/src/types.js';
import type { ExactComponentExecutableArtifact } from '@exactjs/core/framework/component-contracts';
import { effectScopeParent, type EffectScope } from '@exactjs/reactive/framework/runtime';
import { readClientComponentInput } from '../../dom/src/renderer/component-input-admission.js';
import * as parkingOwner from '../../dom/src/renderer/mounting/operation-parking.js';
import * as receiptOwner from '../../dom/src/renderer/mounting/native-component-artifact.js';
import { releaseUnpublishedAdoption } from '../../dom/src/renderer/teardown.js';
import { createRendererRoot } from '../../dom/src/renderer/root-construction.js';
import { adoptRenderProgram } from '../../dom/src/renderer/render-program.js';
import { adoptStaticChildren } from '../../dom/src/renderer/adoption/boundaries.js';
import { renderToHydratableString, renderToString } from '@exactjs/ssr';
import { describe, expect, it, vi } from 'vitest';
import { hydrate } from './index.js';
import { noopLogger } from './test-support/responses.js';
import {
	interruptEndpointRoot,
	emptyEndpointRoot,
	multiEndpointRoot,
	nestedEndpointRoot,
	InitialTransferLeaf,
	UnpublishedLifetimeParent,
	unpublishedLifetimeProgram,
	UnpublishedLifetimeSiblings,
	SameNodeLifetimeParent,
	configureSameNodeTitle,
	ParkedReceiveLeaf,
	configureInitialLifetimeObservers,
	InitialTransferShell,
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
	interruptEndpointRoot as serverInterruptEndpointRoot,
	emptyEndpointRoot as serverEmptyEndpointRoot,
	multiEndpointRoot as serverMultiEndpointRoot,
	nestedEndpointRoot as serverNestedEndpointRoot,
	InitialTransferLeaf as ServerInitialTransferLeaf,
	UnpublishedLifetimeParent as ServerUnpublishedLifetimeParent,
	unpublishedLifetimeProgram as serverUnpublishedLifetimeProgram,
	UnpublishedLifetimeSiblings as ServerUnpublishedLifetimeSiblings,
	SameNodeLifetimeParent as ServerSameNodeLifetimeParent,
	ParkedReceiveLeaf as ServerParkedReceiveLeaf,
	InitialTransferShell as ServerInitialTransferShell,
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
	it('adopts target-forwarded attributes without replacing the intrinsic', async () => {
		const root = document.createElement('div');
		const resumptions = await prepareServerHydration(root, serverTargetForwardingRoot);
		const serverButton = root.querySelector('button')!;

		hydrate(targetForwardingRoot, root, { logger: noopLogger, resumptions });

		expect(root.querySelector('button')).toBe(serverButton);
		expect(serverButton.className).toBe('authored forwarded');
		expect(serverButton.getAttribute('aria-describedby')).toBe('help');
	});

	it('adopts nested target owners with independent refs and event subscriptions', async () => {
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
		const resumptions = await prepareServerHydration(root, serverNestedTargetRoot);
		const serverButton = root.querySelector('button')!;

		hydrate(nestedTargetRoot, root, { logger: noopLogger, resumptions });
		serverButton.click();

		expect(root.querySelector('button')).toBe(serverButton);
		expect(serverButton.className).toBe('authored inner outer');
		expect(refs).toEqual([serverButton, serverButton, serverButton]);
		expect(calls).toEqual(['authored']);
	});

	it('releases each nested adopted target ref after one initial publication', async () => {
		const values: unknown[] = [];
		configureNestedTargetRoot({
			onAuthored() {},
			onInner() {},
			onOuter() {},
			ref: { fulfill: (value: unknown) => values.push(value) } as never
		});
		const container = document.createElement('div');
		const resumptions = await prepareServerHydration(container, serverNestedTargetRoot);
		const button = container.querySelector('button')!;
		const client = hydrate(nestedTargetRoot, container, { logger: noopLogger, resumptions });
		try {
			expect(container.querySelector('button')).toBe(button);
			expect(values).toEqual([button, button, button]);
			const root = findElementOwner(button)!.refs.root();
			expect(root.introduction).toBe('hydration');
			expect(root.generation).toBe(1);
			client.dispose();
			expect(values).toEqual([button, button, button, undefined, undefined, undefined]);
			client.dispose();
			expect(values).toHaveLength(6);
		} finally {
			client.dispose();
		}
	});

	it('preserves a newer root selected during the initial target commit epilogue', async () => {
		const container = document.createElement('div');
		let obsolete: ReturnType<typeof findElementOwner>;
		const captured: { newer: Element | null } = { newer: null };
		let reentered = false;
		configureNestedTargetRoot({
			onAuthored() {},
			onInner() {},
			onOuter() {},
			ref: {
				fulfill(value: unknown) {
					if (!(value instanceof Element) || reentered) return;
					reentered = true;
					obsolete = findElementOwner(value);
					render(paragraphRoot('newer', 'current'), container);
					captured.newer = container.querySelector('p');
				}
			} as never
		});
		const resumptions = await prepareServerHydration(container, serverNestedTargetRoot);
		let client: ReturnType<typeof hydrate> | undefined;
		try {
			client = hydrate(nestedTargetRoot, container, { logger: noopLogger, resumptions });
			expect(reentered).toBe(true);
			expect(obsolete).toBeDefined();
			expect(obsolete!.scope.active).toBe(false);
			expect(container.querySelector('p')).toBe(captured.newer);
			expect(captured.newer?.textContent).toBe('newer');
			expect(findElementOwner(captured.newer!)?.scope.active).toBe(true);
			expect(container.querySelector('button')).toBeNull();
			client.dispose();
			expect(container.querySelector('p')).toBe(captured.newer);
			expect(findElementOwner(captured.newer!)?.scope.active).toBe(true);
			expect(container.querySelector('button')).toBeNull();
		} finally {
			client?.dispose();
			unmount(container);
		}
	});

	it('preserves a committed same-node transfer from the initial SSR input slice', async () => {
		const container = document.createElement('div');
		const page = createComponentDomain({ executionRoot: 'initial-page' });
		const initialShell = createComponentDomain({ executionRoot: 'initial-shell' });
		const nextShell = createComponentDomain({ executionRoot: 'next-shell' });
		const mounted = vi.fn();
		const unmounted = vi.fn();
		const serverMounted = vi.fn();
		const serverUnmounted = vi.fn();
		const leaf = withComponentDomain(page, () =>
			clientReceipt(InitialTransferLeaf, { mounted, unmounted })
		);
		const initial = withComponentDomain(initialShell, () =>
			clientReceipt(InitialTransferShell, { active: true, children: leaf })
		);
		const successor = withComponentDomain(nextShell, () =>
			clientReceipt(InitialTransferShell, { active: false, children: leaf })
		);
		let reentered = false;
		configureNestedTargetRoot({
			onAuthored() {},
			onInner() {},
			onOuter() {},
			ref: {
				fulfill(value: unknown) {
					if (!(value instanceof Element) || reentered) return;
					reentered = true;
					render(successor, container);
				}
			} as never
		});
		const resumptions = await prepareServerHydration(
			container,
			serverReceipt(ServerInitialTransferShell, {
				active: true,
				children: serverReceipt(ServerInitialTransferLeaf, {
					mounted: serverMounted,
					unmounted: serverUnmounted
				})
			})
		);
		expect(serverUnmounted).toHaveBeenCalledOnce();
		expect(unmounted).not.toHaveBeenCalled();
		const original = container.querySelector('strong');
		const client = hydrate(initial, container, { logger: noopLogger, resumptions });
		try {
			expect(reentered).toBe(true);
			expect(container.querySelector('strong')).toBe(original);
			expect(original?.textContent).toBe('Retained');
			expect(findElementOwner(original!)?.scope.active).toBe(true);
			expect(mounted).toHaveBeenCalledOnce();
			expect(unmounted).not.toHaveBeenCalled();
			expect(container.querySelector('button')).toBeNull();
			client.dispose();
			expect(container.querySelector('strong')).toBe(original);
			expect(unmounted).not.toHaveBeenCalled();
			unmount(container);
			expect(unmounted).toHaveBeenCalledOnce();
		} finally {
			client.dispose();
			unmount(container);
		}
	});

	it('keeps inactive SSR markup available to a newer adoption', async () => {
		const container = document.createElement('div');
		const values: unknown[] = [];
		const captured: { outcome?: string } = {};
		let reentered = false;
		configureNestedTargetRoot({
			onAuthored() {},
			onInner() {},
			onOuter() {},
			ref: {
				fulfill(value: unknown) {
					if (!(value instanceof Element) || reentered) return;
					reentered = true;
					dispose(container, false);
					configureNestedTargetRoot({
						onAuthored() {},
						onInner() {},
						onOuter() {},
						ref: { fulfill: (next: unknown) => values.push(next) } as never
					});
					captured.outcome = adoptCompiledComponentInputRoot(nestedTargetRoot, container).outcome;
				}
			} as never
		});
		const resumptions = await prepareServerHydration(container, serverNestedTargetRoot);
		const original = container.querySelector('button');
		const client = hydrate(nestedTargetRoot, container, { logger: noopLogger, resumptions });
		try {
			expect(captured.outcome).toBe('adopted');
			expect(container.querySelector('button')).toBe(original);
			expect(values).toEqual([original, original, original]);
			expect(findElementOwner(original!)?.scope.active).toBe(true);
			client.dispose();
			expect(container.querySelector('button')).toBe(original);
			expect(findElementOwner(original!)?.scope.active).toBe(true);
			unmount(container);
			expect(values).toEqual([original, original, original, undefined, undefined, undefined]);
		} finally {
			client.dispose();
			unmount(container);
		}
	});

	it('releases failed initial target commit ownership before a valid hydration', async () => {
		const container = document.createElement('div');
		let unpublished: ReturnType<typeof findElementOwner>;
		let failed = false;
		configureNestedTargetRoot({
			onAuthored() {},
			onInner() {},
			onOuter() {},
			ref: {
				fulfill(value: unknown) {
					if (!(value instanceof Element)) return;
					failed = true;
					unpublished = findElementOwner(value);
					throw new Error('initial target commit failure');
				}
			} as never
		});
		const resumptions = await prepareServerHydration(container, serverNestedTargetRoot);
		try {
			expect(() =>
				hydrate(nestedTargetRoot, container, {
					logger: noopLogger,
					resumptions,
					onMismatch: 'throw'
				})
			).toThrow();
			expect(failed).toBe(true);
			expect(unpublished).toBeDefined();
			expect(unpublished!.scope.active).toBe(false);
			expect(inspectDomRoot(container)).toBeUndefined();
			const values: unknown[] = [];
			configureNestedTargetRoot({
				onAuthored() {},
				onInner() {},
				onOuter() {},
				ref: { fulfill: (value: unknown) => values.push(value) } as never
			});
			const next = await prepareServerHydration(container, serverNestedTargetRoot);
			const button = container.querySelector('button');
			const client = hydrate(nestedTargetRoot, container, {
				logger: noopLogger,
				resumptions: next
			});
			try {
				expect(container.querySelector('button')).toBe(button);
				expect(values).toEqual([button, button, button]);
			} finally {
				client.dispose();
			}
		} finally {
			unmount(container);
		}
	});

	it('activates bundle-local enhancements after adopting their authored target', async () => {
		const roots: RootLifecycle<HTMLElement>[] = [];
		configureAdoptionEnhancement((root) => roots.push(root));
		const root = document.createElement('div');
		const enhancementCatalog = new Map([[adoptionEnhancementIdentity, AdoptionEnhancement]]);
		const serverEnhancementCatalog = new Map([
			[adoptionEnhancementIdentity, exactEnhancementPassThrough]
		]);
		const rendered = await renderToString(serverEnhancedPageRoot, {
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

	it('adopts compatible static marker-wrapped SSR nodes', async () => {
		const root = document.createElement('div');
		const resumptions = await prepareServerHydration(root, serverParagraphRoot('server', 'ready'));
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

	it('adopts normalized static class-list values without replacing the server node', async () => {
		const root = document.createElement('div');
		const resumptions = await prepareServerHydration(
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

	it('patches an adopted static root without appending a second tree', async () => {
		const root = document.createElement('div');
		const resumptions = await prepareServerHydration(root, serverParagraphRoot('server'));
		const serverNode = root.querySelector('p')!;
		hydrate(paragraphRoot('server'), root, { logger: noopLogger, resumptions });
		render(paragraphRoot('client'), root);
		expect(root.querySelectorAll('p')).toHaveLength(1);
		expect(root.querySelector('p')).toBe(serverNode);
		expect(root.textContent).toBe('client');
	});

	it('adopts an SSR root component boundary without replacing its DOM', async () => {
		const root = document.createElement('div');
		const resumptions = await prepareServerHydration(root, serverGreetingRoot);
		const serverNode = root.querySelector('p')!;
		hydrate(greetingRoot, root, { logger: noopLogger, resumptions });
		expect(root.querySelector('p')).toBe(serverNode);
		render(greetingRoot, root);
		expect(root.querySelector('p')).toBe(serverNode);
	});

	it('adopts nested component marker boundaries', async () => {
		const root = document.createElement('div');
		const resumptions = await prepareServerHydration(root, serverNestedParentRoot);
		const serverChild = root.querySelector('em')!;
		hydrate(nestedParentRoot, root, { logger: noopLogger, resumptions });
		expect(root.querySelector('em')).toBe(serverChild);
	});

	it('adopts compiler cell marker boundaries', async () => {
		const root = document.createElement('div');
		let instance!: Component<{ label: string }>;
		const resumptions = await prepareServerHydration(root, serverLabelStateRoot());
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

	it('adopts a compiler cell at the hydration root without replacing server DOM', async () => {
		const root = document.createElement('div');
		const resumptions = await prepareServerHydration(root, serverLabelPropsRoot('server'));
		const serverNode = root.querySelector('p')!;

		hydrate(labelPropsRoot('server'), root, { logger: noopLogger, resumptions });

		expect(root.querySelector('p')).toBe(serverNode);
		hydrate(labelPropsRoot('client'), root, { logger: noopLogger });
		expect(root.querySelector('p')).toBe(serverNode);
		expect(serverNode.textContent).toBe('client');
	});

	it('adopts keyed SSR item ranges and reorders their existing DOM', async () => {
		const root = document.createElement('div');
		root.innerHTML = (await renderToString(serverKeyedListRoot)).html;
		const [a, b] = Array.from(root.querySelectorAll('li'));
		hydrate(keyedListRoot, root, { logger: noopLogger });
		mountedKeyedList().state.items.splice(0, 2, { id: 'b', title: 'B' }, { id: 'a', title: 'A' });
		flushSync();
		expect(Array.from(root.querySelectorAll('li'))).toEqual([b, a]);
	});

	it('adopts a dynamic marker range and updates it after hydration', async () => {
		const root = document.createElement('div');
		let client!: Component<{ label: string }>;
		const resumptions = await prepareServerHydration(root, serverDynamicLabelRoot());
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

	it('activates a client-only dynamic component inside its SSR-owned range', async () => {
		const root = document.createElement('div');
		const resumptions = await prepareServerHydration(root, serverDynamicPanelRoot);
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

	it('attaches JSX events while adopting a component root', async () => {
		const root = document.createElement('div');
		const resumptions = await prepareServerHydration(root, serverCounterRoot);
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
		const resumptions = await prepareServerHydration(root, serverCounterRoot);
		hydrate(counterRoot, root, { logger, resumptions });

		root.querySelector('button')!.click();
		await vi.waitFor(() =>
			expect(events.some((event) => event.message === 'performance interaction settled')).toBe(true)
		);
	});

	it('fulfills component refs while adopting existing elements', async () => {
		const root = document.createElement('div');
		let instance!: Component<{}>;
		const resumptions = await prepareServerHydration(root, serverButtonRefRoot());
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

	it('adopts static fragment siblings inside a marker range', async () => {
		const root = document.createElement('div');
		const resumptions = await prepareServerHydration(root, serverSiblingRoot({}));
		const [first, second] = Array.from(root.querySelectorAll('p'));
		hydrate(siblingRoot({}), root, { logger: noopLogger, resumptions });
		expect(root.querySelectorAll('p')[0]).toBe(first);
		expect(root.querySelectorAll('p')[1]).toBe(second);
	});

	it('adopts nested static fragments inside a marker range', async () => {
		const root = document.createElement('div');
		const resumptions = await prepareServerHydration(root, serverSiblingRoot({}));
		const [first, second] = Array.from(root.querySelectorAll('p'));
		hydrate(siblingRoot({}), root, { logger: noopLogger, resumptions });
		expect(root.querySelectorAll('p')[0]).toBe(first);
		expect(root.querySelectorAll('p')[1]).toBe(second);
	});

	it('repairs an unexpected SSR attribute without replacing compatible markup', async () => {
		const root = document.createElement('div');
		const resumptions = await prepareServerHydration(root, serverParagraphRoot('server'));
		const serverNode = root.querySelector('p')!;
		serverNode.setAttribute('data-stale', 'yes');
		hydrate(paragraphRoot('server'), root, { logger: noopLogger, resumptions });
		expect(root.querySelector('p')).toBe(serverNode);
		expect(root.querySelector('p')?.hasAttribute('data-stale')).toBe(false);
	});

	it('repairs only the mismatched child of an adopted static fragment', async () => {
		const root = document.createElement('div');
		const resumptions = await prepareServerHydration(root, serverSiblingRoot({}));
		root.querySelectorAll('p')[1]!.textContent = 'stale';
		const first = root.querySelectorAll('p')[0]!;
		const stale = root.querySelectorAll('p')[1]!;
		hydrate(siblingRoot({}), root, { logger: noopLogger, resumptions });
		expect(root.querySelectorAll('p')[0]).toBe(first);
		expect(root.querySelectorAll('p')[1]).toBe(stale);
		expect(root.textContent).toBe('onetwo');
	});

	it('repairs a stale static attribute without replacing compatible siblings', async () => {
		const root = document.createElement('div');
		const resumptions = await prepareServerHydration(
			root,
			serverSiblingRoot({ firstClass: 'stale' })
		);
		const stale = root.querySelectorAll('p')[0]!;
		const sibling = root.querySelectorAll('p')[1]!;
		hydrate(siblingRoot({ firstClass: 'fresh' }), root, { logger: noopLogger, resumptions });
		expect(root.querySelectorAll('p')[0]).toBe(stale);
		expect(root.querySelectorAll('p')[0]?.className).toBe('fresh');
		expect(root.querySelectorAll('p')[1]).toBe(sibling);
	});

	it('restores focus and selection when local static repair replaces an input', async () => {
		const root = document.createElement('div');
		document.body.appendChild(root);
		const resumptions = await prepareServerHydration(root, serverSiblingRoot({ input: true }));
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

	it('recovers a mismatched registry entry without replacing adjacent adopted DOM', async () => {
		const container = document.createElement('div');
		const resumptions = await prepareServerHydration(container, serverRegistryRoot);
		const stable = container.querySelector('span');
		configureRegistrySelection('second');

		hydrate(registryRoot, container, { logger: noopLogger, resumptions });

		expect(container.querySelector('span')).toBe(stable);
		expect(container.querySelector('p')?.textContent).toBe('second');
	});
});

async function prepareServerHydration(container: Element, operation: Child) {
	const rendered = await renderToHydratableString(operation);
	container.innerHTML = rendered.html;
	return rendered.resumptions;
}

describe('initial lifetime consequential boundaries', () => {
	it('qualifies acquired client-child cleanup before parent intrinsic publication', async () => {
		const container = document.createElement('div');
		let acquired: AnyComponentInstance | undefined;
		let constructions = 0;
		let cleanups = 0;
		let atParent: { count: number; active: boolean | undefined } | undefined;
		let newer: Element | null = null;
		let reentered = false;
		configureInitialLifetimeObservers({
			acquired(instance) {
				acquired = instance;
				constructions++;
			},
			released() {
				cleanups++;
			},
			receive() {},
			parentRef(value) {
				if (!value || reentered) return;
				reentered = true;
				atParent = { count: constructions, active: acquired?.scope.active };
				render(paragraphRoot('current child successor'), container);
				newer = container.querySelector('p');
			}
		});
		const rendered = await renderToHydratableString(
			serverReceipt(ServerUnpublishedLifetimeParent, {})
		);
		container.innerHTML = rendered.html;
		let client: ReturnType<typeof hydrate> | undefined;
		try {
			client = hydrate(clientReceipt(UnpublishedLifetimeParent, {}), container, {
				logger: noopLogger,
				resumptions: rendered.resumptions,
				onMismatch: 'throw'
			});
			console.log(
				'LIFETIME_QUALIFICATION',
				JSON.stringify({
					case: 'unpublished-child',
					atParent,
					constructions,
					cleanups,
					html: container.innerHTML,
					ssr: rendered.html
				})
			);
			expect(atParent, 'actual client construction must precede the parent ref').toEqual({
				count: 1,
				active: true
			});
			expect(acquired?.scope.active).toBe(false);
			expect(cleanups).toBe(1);
			expect(container.querySelector('p')).toBe(newer);
			expect(container.querySelector('strong')).toBeNull();
			expect(container.querySelector('div')).toBeNull();
			client.dispose();
			expect(container.querySelector('p')).toBe(newer);
			expect(cleanups).toBe(1);
		} finally {
			client?.dispose();
			unmount(container);
		}
	});

	it('settles an ordinary parked reactive ref after replacement while retaining its instance', async () => {
		const container = document.createElement('div');
		const page = createComponentDomain({ executionRoot: 'settled-page' });
		const first = createComponentDomain({ executionRoot: 'settled-first' });
		const second = createComponentDomain({ executionRoot: 'settled-second' });
		const phases: string[] = [];
		let cleanups = 0;
		configureInitialLifetimeObservers({
			acquired() {},
			released() {
				cleanups++;
			},
			parentRef() {},
			receive(phase) {
				phases.push(phase);
			}
		});
		const before = withComponentDomain(page, () =>
			clientReceipt(ParkedReceiveLeaf, { phase: 'initial' })
		);
		const after = withComponentDomain(page, () =>
			clientReceipt(ParkedReceiveLeaf, { phase: 'receiving' })
		);
		const initial = withComponentDomain(first, () =>
			clientReceipt(InitialTransferShell, { active: false, children: before })
		);
		const successor = withComponentDomain(second, () =>
			clientReceipt(InitialTransferShell, { active: false, children: after })
		);
		const rendered = await renderToHydratableString(
			serverReceipt(ServerInitialTransferShell, {
				active: false,
				children: serverReceipt(ServerParkedReceiveLeaf, { phase: 'initial' })
			})
		);
		container.innerHTML = rendered.html;
		const original = container.querySelector('strong');
		const client = hydrate(initial, container, {
			logger: noopLogger,
			resumptions: rendered.resumptions,
			onMismatch: 'throw'
		});
		try {
			const artifact = readClientComponentInput(before)!.contract.artifact;
			const retained = findMountedArtifact(roots.get(container)?.mounted, artifact)!;
			expect(retained.instance).toBeDefined();
			render(successor, container);
			// This arbitrary-JavaScript ref reader uses ordinary post-call reactive settlement.
			// It is not evidence of synchronous execution inside the artifact receive owner.
			flushSync();
			expect(phases).toEqual(['initial', 'receiving']);
			expect(findMountedArtifact(roots.get(container)?.mounted, artifact)).toBe(retained);
			expect(container.querySelector('strong')).toBe(original);
			expect(retained.scope.active).toBe(true);
			expect(cleanups).toBe(0);
			client.dispose();
			expect(container.querySelector('strong')).toBe(original);
			unmount(container);
			expect(cleanups).toBe(1);
		} finally {
			client.dispose();
			unmount(container);
		}
	});

	for (const effect of ['reenter', 'throw'] as const) {
		it(`preserves internal parked commit ownership when the receive owner ${effect}s`, async () => {
			const container = document.createElement('div');
			const page = createComponentDomain({ executionRoot: `internal-page-${effect}` });
			const first = createComponentDomain({ executionRoot: `internal-first-${effect}` });
			const second = createComponentDomain({ executionRoot: `internal-second-${effect}` });
			const primary = new Error('owned internal receive failure');
			const secondary = new Error('owned obsolete shell cleanup failure');
			let childCleanups = 0;
			let oldShellCleanups = 0;
			let clicks = 0;
			const bindings: RefBinding<HTMLDivElement>[] = [];
			configureSameNodeTitle('current parked successor');
			configureInitialLifetimeObservers({
				acquired() {},
				released() {
					childCleanups++;
				},
				parentRef() {},
				parentBinding(binding) {
					bindings.push(binding);
				},
				receive(phase) {
					if (phase === 'click') clicks++;
				}
			});
			const before = withComponentDomain(page, () =>
				clientReceipt(ParkedReceiveLeaf, { phase: 'initial' })
			);
			const after = withComponentDomain(page, () =>
				clientReceipt(ParkedReceiveLeaf, { phase: 'receiving' })
			);
			const initial = withComponentDomain(first, () =>
				clientReceipt(InitialTransferShell, { active: false, children: before })
			);
			const successor = withComponentDomain(second, () =>
				clientReceipt(InitialTransferShell, { active: false, children: after })
			);
			const rendered = await renderToHydratableString(
				serverReceipt(ServerInitialTransferShell, {
					active: false,
					children: serverReceipt(ServerParkedReceiveLeaf, { phase: 'initial' })
				})
			);
			container.innerHTML = rendered.html;
			const client = hydrate(initial, container, {
				logger: noopLogger,
				resumptions: rendered.resumptions,
				onMismatch: 'throw'
			});
			const root = roots.get(container)!;
			const previous = root.mounted!;
			const incoming = readClientComponentInput(after)!;
			const leaf = findMountedArtifact(previous, incoming.contract.artifact)!;
			const instance = leaf.instance;
			const oldParent = effectScopeParent(leaf.scope);
			const take = parkingOwner.takeParkedOperation;
			const receive = receiptOwner.receiveComponentReceipt;
			let selected = false;
			let commitEntries = 0;
			let receivingScope: EffectScope | undefined;
			let delivered = 0;
			const current: { node: Element | null; metadata: string | null } = {
				node: null,
				metadata: null
			};
			let thrown: unknown;
			let testFailed = false;
			let testFailure: unknown;
			expect(root.initialCommitComplete).toBe(true);
			expect(instance).toBeDefined();
			expect(leaf.componentReceipt?.domain).toBe(page);
			expect(incoming.domain).toBe(page);
			expect(leaf.clientArtifact).toBe(incoming.contract.artifact);
			expect(leaf.componentReceipt?.key).toBe(incoming.key);
			if (effect === 'throw')
				registerEffectScopeCleanup(previous.scope, () => {
					oldShellCleanups++;
					throw secondary;
				});
			const takeSpy = vi
				.spyOn(parkingOwner, 'takeParkedOperation')
				.mockImplementation((...args) => {
					const parking = args[0].replacementParking;
					const offered = [...(parking?.mounts.values() ?? [])]
						.flat()
						.some((row) => row.mounted === leaf);
					const result = take(...args);
					if (result === leaf) {
						console.log(
							'INTERNAL_PARKING_OWNER',
							JSON.stringify({
								effect,
								stage: 'selected',
								offered,
								sameOperation: args[1] === after,
								commits: parking?.commits.length,
								sameArtifact: leaf.clientArtifact === incoming.contract.artifact,
								sameDomain: leaf.componentReceipt?.domain === incoming.domain,
								sameKey: leaf.componentReceipt?.key === incoming.key
							})
						);
						expect(offered).toBe(true);
						expect(args[1]).toBe(after);
						expect(parking?.commits).toHaveLength(1);
						if (!parking) throw new Error('Expected the selected replacement parking owner');
						const commit = parking.commits[0]!;
						parking.commits[0] = () => {
							commitEntries++;
							commit();
						};
						receivingScope = args[3];
						selected = true;
					}
					return result;
				});
			// Internal helper-contract injection. The original owner still invokes the actual
			// compiler-selected artifact. No authored ref callback is claimed synchronous here.
			const receiveSpy = vi
				.spyOn(receiptOwner, 'receiveComponentReceipt')
				.mockImplementation((...args) => {
					if (args[0] !== leaf) return receive(...args);
					console.log(
						'INTERNAL_PARKING_OWNER',
						JSON.stringify({
							effect,
							stage: 'receive-entry',
							selected,
							commitEntries,
							active: leaf.scope.active,
							sameTransferredScope: effectScopeParent(leaf.scope) === receivingScope,
							sameInstance: leaf.instance === instance,
							html: container.innerHTML
						})
					);
					expect(selected).toBe(true);
					expect(commitEntries).toBe(1);
					expect(args[1].admitted.operation).toBe(after);
					expect(args[1].contract.artifact).toBe(leaf.clientArtifact);
					expect(leaf.instance).toBe(instance);
					expect(leaf.scope.active).toBe(true);
					expect(effectScopeParent(leaf.scope)).toBe(receivingScope);
					expect(effectScopeParent(leaf.scope)).not.toBe(oldParent);
					expect(effectScopeParent(leaf.scope)?.active).toBe(true);
					const delivery = receive(...args);
					console.log(
						'INTERNAL_PARKING_OWNER',
						JSON.stringify({
							effect,
							stage: 'receive-return',
							committed: delivery.committed,
							current: delivery.isCurrent(),
							phase: leaf.componentReceiptBinding?.acceptedInputs?.props.phase,
							html: container.innerHTML,
							ssr: rendered.html
						})
					);
					expect(delivery.committed).toBe(true);
					expect(delivery.isCurrent()).toBe(true);
					expect(leaf.componentReceiptBinding?.pending).toBeUndefined();
					expect(leaf.componentReceiptBinding?.acceptedInputs?.props.phase).toBe('receiving');
					delivered++;
					if (effect === 'throw') throw primary;
					render(clientReceipt(SameNodeLifetimeParent, {}), container);
					current.node = container.querySelector('div');
					current.metadata = current.node?.getAttribute('data-exact-id') ?? null;
					return delivery;
				});
			try {
				try {
					render(successor, container);
				} catch (error) {
					thrown = error;
				}
				console.log(
					'INTERNAL_PARKING_OWNER',
					JSON.stringify({
						effect,
						stage: 'replacement-return',
						selected,
						commitEntries,
						delivered,
						exactPrimary: thrown === primary,
						thrown:
							thrown instanceof Error
								? { name: thrown.name, message: thrown.message, stack: thrown.stack }
								: String(thrown),
						childCleanups,
						html: container.innerHTML,
						ssr: rendered.html
					})
				);
				expect(selected).toBe(true);
				expect(delivered).toBe(1);
				if (effect === 'throw') {
					expect(thrown).toBe(primary);
					// Exercise the existing logical rollback owner explicitly. This is not a
					// claim that the public renderer automatically rolls back a throwing commit.
					releaseUnpublishedAdoption(root, [previous], primary);
					expect(oldShellCleanups).toBe(1);
					expect(Reflect.get(primary, 'suppressed')).toContain(secondary);
					expect(leaf.scope.active).toBe(true);
					expect(leaf.instance).toBe(instance);
					expect(childCleanups).toBe(0);
					render(paragraphRoot('valid after internal failure'), container);
					expect(container.querySelector('p')?.textContent).toBe('valid after internal failure');
					expect(childCleanups).toBe(1);
				} else {
					expect(thrown).toBeUndefined();
					expect(current.node).not.toBeNull();
					expect(container.querySelector('div')).toBe(current.node);
					expect(current.node?.getAttribute('data-exact-id')).toBe(current.metadata);
					expect(current.metadata).not.toBeNull();
					expect(bindings[0]?.current).toBe(current.node);
					expect(findElementOwner(current.node!)).toBe(bindings[0]?.owner);
					expect(current.node?.getAttribute('title')).toBe('current parked successor');
					current.node?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
					expect(clicks).toBe(1);
					expect(leaf.scope.active).toBe(false);
					expect(childCleanups).toBe(1);
					client.dispose();
					expect(container.querySelector('div')).toBe(current.node);
					expect(bindings[0]?.current).toBe(current.node);
					expect(current.node?.getAttribute('data-exact-id')).toBe(current.metadata);
					current.node?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
					expect(clicks).toBe(2);
					unmount(container);
					expect(childCleanups).toBe(2);
					expect(bindings[0]?.current).toBeUndefined();
				}
			} catch (error) {
				testFailed = true;
				testFailure = error;
				throw error;
			} finally {
				receiveSpy.mockRestore();
				takeSpy.mockRestore();
				const failure = createCleanupFailure();
				attemptCleanup(failure, () => releaseUnpublishedAdoption(root, [previous], thrown));
				attemptCleanup(failure, () => client.dispose());
				attemptCleanup(failure, () => unmount(container));
				if (failure.failed && testFailed)
					attachSuppressedCleanupFailure(testFailure, failure.error);
				else throwCleanupFailure(failure);
			}
		});
	}
});

describe('unpublished adoption resource ownership', () => {
	for (const secondaryFailure of [false, true]) {
		it(`preserves exact primary program error with child cleanup (secondary ${secondaryFailure})`, async () => {
			const container = document.createElement('div');
			const primary = new Error('owned parent ref failure');
			const secondary = new Error('owned child scope cleanup failure');
			let acquisitions = 0;
			let cleanups = 0;
			let activeAtRef = false;
			let child: AnyComponentInstance | undefined;
			configureInitialLifetimeObservers({
				acquired(instance) {
					acquisitions++;
					child = instance;
					if (secondaryFailure)
						registerEffectScopeCleanup(instance.scope, () => {
							throw secondary;
						});
				},
				released() {
					cleanups++;
				},
				parentRef() {},
				receive() {}
			});
			const owner = createFrameworkFixtureComponentInstance(function RefOwner() {
				return () => null;
			}, {});
			const ordinary = owner.ref(createRef<HTMLDivElement>('owned-throw'));
			const binding: RefBinding<HTMLDivElement> = {
				...ordinary,
				fulfill(value) {
					ordinary.fulfill(value);
					if (value) {
						activeAtRef = child?.scope.active === true;
						throw primary;
					}
				}
			};
			const rendered = await renderToHydratableString(serverUnpublishedLifetimeProgram());
			container.innerHTML = rendered.html;
			const scope = createEffectScope();
			const program = unpublishedLifetimeProgram(binding);
			const root = createRendererRoot(container, program, {}, { version: 1, mode: 'hydrated' });
			let thrown: unknown;
			let testFailed = false;
			let testFailure: unknown;
			try {
				try {
					adoptRenderProgram(
						root,
						program,
						container.firstElementChild!,
						scope,
						owner,
						(values, nodes, parent, childScope, start, end, _compiled, physicalParent) =>
							adoptStaticChildren(
								root,
								[...values],
								nodes,
								parent,
								childScope,
								start,
								end,
								physicalParent
							)
					);
				} catch (error) {
					thrown = error;
				}
				console.log(
					'UNPUBLISHED_ERROR',
					JSON.stringify({
						acquisitions,
						activeAtRef,
						cleanups,
						primary: thrown === primary,
						secondaryFailure,
						thrownMessage: thrown instanceof Error ? thrown.message : undefined,
						thrownStack: thrown instanceof Error ? thrown.stack : undefined,
						suppressed: Reflect.get(primary, 'suppressed'),
						ssr: rendered.html,
						dom: container.innerHTML
					})
				);
				expect(acquisitions).toBe(1);
				expect(activeAtRef).toBe(true);
				expect(thrown).toBe(primary);
				expect(cleanups).toBe(1);
				expect(child?.scope.active).toBe(false);
				if (secondaryFailure) expect(Reflect.get(primary, 'suppressed')).toContain(secondary);
				const resumptions = await prepareServerHydration(container, serverGreetingRoot);
				const client = hydrate(greetingRoot, container, { logger: noopLogger, resumptions });
				try {
					expect(container.querySelector('p')).not.toBeNull();
				} finally {
					client.dispose();
				}
				expect(cleanups).toBe(1);
			} catch (error) {
				testFailed = true;
				testFailure = error;
				throw error;
			} finally {
				const cleanup = createCleanupFailure();
				attemptCleanup(cleanup, () => scope.stop());
				attemptCleanup(cleanup, () => owner.unmount());
				attemptCleanup(cleanup, () => unmount(container));
				if (cleanup.failed && testFailed)
					attachSuppressedCleanupFailure(testFailure, cleanup.error);
				else throwCleanupFailure(cleanup);
			}
		});
	}

	it('retains same-node successor refs listeners metadata and ownership after old instance cleanup', async () => {
		const container = document.createElement('div');
		const instances: AnyComponentInstance[] = [];
		const bindings: RefBinding<HTMLDivElement>[] = [];
		let cleanups = 0;
		let clicks = 0;
		let reentered = false;
		let adopted: string | undefined;
		let same: HTMLDivElement | undefined;
		let originalStrong: Element | null = null;
		let currentMetadata: string | null = null;
		configureSameNodeTitle('obsolete');
		configureInitialLifetimeObservers({
			acquired(instance) {
				instances.push(instance);
			},
			released() {
				cleanups++;
			},
			receive(phase) {
				if (phase === 'click') clicks++;
			},
			parentBinding(binding) {
				bindings.push(binding);
			},
			parentRef(value) {
				if (!value || reentered) return;
				reentered = true;
				same = value;
				originalStrong = value.querySelector('strong');
				dispose(container, false);
				configureSameNodeTitle('current-host');
				adopted = adoptCompiledComponentInputRoot(
					clientReceipt(SameNodeLifetimeParent, {}),
					container
				).outcome;
				currentMetadata = value.getAttribute('data-exact-id');
				expect(bindings[1]?.current).toBe(value);
				expect(value.title).toBe('current-host');
			}
		});
		const rendered = await renderToHydratableString(
			serverReceipt(ServerSameNodeLifetimeParent, {})
		);
		container.innerHTML = rendered.html;
		const client = hydrate(clientReceipt(SameNodeLifetimeParent, {}), container, {
			logger: noopLogger,
			resumptions: rendered.resumptions,
			onMismatch: 'throw'
		});
		try {
			expect(adopted).toBe('adopted');
			expect(instances).toHaveLength(2);
			expect(instances[0]!.scope.active).toBe(false);
			expect(instances[1]!.scope.active).toBe(true);
			expect(cleanups).toBe(1);
			expect(container.querySelector('div')).toBe(same);
			expect(same?.querySelector('strong')).toBe(originalStrong);
			expect(findElementOwner(same!)).toBe(bindings[1]?.owner);
			expect(same?.title).toBe('current-host');
			expect(currentMetadata).not.toBeNull();
			expect(same?.getAttribute('data-exact-id')).toBe(currentMetadata);
			expect(bindings[1]?.current).toBe(same);
			same?.click();
			expect(clicks).toBe(1);
			client.dispose();
			expect(container.querySelector('div')).toBe(same);
			expect(bindings[1]?.current).toBe(same);
			expect(same?.getAttribute('data-exact-id')).toBe(currentMetadata);
			same?.click();
			expect(clicks).toBe(2);
			expect(cleanups).toBe(1);
			unmount(container);
			expect(cleanups).toBe(2);
			expect(bindings[1]?.current).toBeUndefined();
		} finally {
			client.dispose();
			unmount(container);
		}
	});

	it('releases an earlier unaccepted sibling after later ref supersession', async () => {
		const container = document.createElement('div');
		let acquired: AnyComponentInstance | undefined;
		let acquisitions = 0;
		let cleanups = 0;
		let activeAtRef = false;
		let reentered = false;
		let newer: Element | null = null;
		configureInitialLifetimeObservers({
			acquired(instance) {
				acquisitions++;
				acquired = instance;
			},
			released() {
				cleanups++;
			},
			receive() {},
			parentRef(value) {
				if (!value || reentered) return;
				reentered = true;
				activeAtRef = acquired?.scope.active === true;
				render(paragraphRoot('later peer successor'), container);
				newer = container.querySelector('p');
			}
		});
		const rendered = await renderToHydratableString(
			serverReceipt(ServerUnpublishedLifetimeSiblings, {})
		);
		container.innerHTML = rendered.html;
		const client = hydrate(clientReceipt(UnpublishedLifetimeSiblings, {}), container, {
			logger: noopLogger,
			resumptions: rendered.resumptions,
			onMismatch: 'throw'
		});
		try {
			expect(acquisitions).toBe(1);
			expect(activeAtRef).toBe(true);
			expect(acquired?.scope.active).toBe(false);
			expect(cleanups).toBe(1);
			expect(container.querySelector('p')).toBe(newer);
			expect(container.querySelector('strong')).toBeNull();
			expect(container.querySelector('div')).toBeNull();
			client.dispose();
			expect(container.querySelector('p')).toBe(newer);
			expect(cleanups).toBe(1);
		} finally {
			client.dispose();
			unmount(container);
		}
	});
});

describe('created markerless endpoint lifetime', () => {
	it('does not insert late endpoints after a child ref cancels acquisition and a new root progresses', async () => {
		const container = document.createElement('div');
		let child: AnyComponentInstance | undefined;
		let cleanups = 0;
		let activeAtRef = false;
		let retired: Element | null = null;
		let priorNodes: Node[] = [];
		const capture: { current: Element | null } = { current: null };
		let reentered = false;
		configureInitialLifetimeObservers({
			acquired(instance) {
				child = instance;
			},
			released() {
				cleanups++;
			},
			receive() {},
			parentRef(value) {
				if (!value || reentered) return;
				reentered = true;
				activeAtRef = child?.scope.active === true;
				retired = value.parentElement;
				priorNodes = Array.from(retired!.childNodes);
				unmount(container);
				render(paragraphRoot('current after endpoint cancellation'), container);
				capture.current = container.querySelector('p');
			}
		});
		const rendered = await renderToHydratableString(serverInterruptEndpointRoot);
		container.innerHTML = rendered.html;
		const client = hydrate(interruptEndpointRoot, container, {
			logger: noopLogger,
			resumptions: rendered.resumptions,
			onMismatch: 'throw'
		});
		try {
			expect(reentered).toBe(true);
			expect(activeAtRef).toBe(true);
			expect(child?.scope.active).toBe(false);
			expect(cleanups).toBe(1);
			expect(Array.from(retired!.childNodes)).toEqual(priorNodes);
			expect(container.querySelector('p')).toBe(capture.current);
			expect(capture.current?.textContent).toBe('current after endpoint cancellation');
			expect(container.querySelector('section')).toBeNull();
			client.dispose();
			expect(container.querySelector('p')).toBe(capture.current);
			expect(findElementOwner(capture.current!)?.scope.active).toBe(true);
			expect(cleanups).toBe(1);
		} finally {
			client.dispose();
			unmount(container);
		}
	});

	for (const [name, operation, serverOperation] of [
		['empty', emptyEndpointRoot, serverEmptyEndpointRoot],
		['multi', multiEndpointRoot, serverMultiEndpointRoot],
		['nested', nestedEndpointRoot, serverNestedEndpointRoot]
	] as const) {
		it(`re-adopts ${name} markerless children without retiring authored nodes or the next cursor`, async () => {
			const container = document.createElement('div');
			const rendered = await renderToHydratableString(serverOperation);
			container.innerHTML = rendered.html;
			const original = Array.from(container.querySelectorAll('*'));
			const opening = container.firstChild;
			const closing = container.lastChild;
			const client = hydrate(operation, container, {
				logger: noopLogger,
				resumptions: rendered.resumptions,
				onMismatch: 'throw'
			});
			try {
				expect(Array.from(container.querySelectorAll('*'))).toEqual(original);
				dispose(container, false);
				expect(container.firstChild).toBe(opening);
				expect(container.lastChild).toBe(closing);
				expect(Array.from(container.querySelectorAll('*'))).toEqual(original);
				expect(adoptCompiledComponentInputRoot(operation, container).outcome).toBe('adopted');
				expect(Array.from(container.querySelectorAll('*'))).toEqual(original);
				expect(container.querySelector('b')?.textContent).toBe('Next');
				if (name === 'nested') expect(container.querySelector('i')?.textContent).toBe('Outer next');
				client.dispose();
				expect(Array.from(container.querySelectorAll('*'))).toEqual(original);
				expect(findElementOwner(original[0]!)?.scope.active).toBe(true);
				unmount(container);
				expect(container.childNodes).toHaveLength(0);
			} finally {
				client.dispose();
				unmount(container);
			}
		});
	}

	it('releases only created markerless root endpoints on disposal and can adopt the retained markup again', async () => {
		const container = document.createElement('div');
		const rendered = await renderToString(serverGreetingRoot, { markers: false });
		container.innerHTML = rendered.html;
		const paragraph = container.querySelector('p');
		try {
			expect(adoptMarkerlessCompiledComponentInputRoot(greetingRoot, container).outcome).toBe(
				'adopted'
			);
			dispose(container, false);
			expect(Array.from(container.childNodes)).toEqual([paragraph]);
			expect(adoptMarkerlessCompiledComponentInputRoot(greetingRoot, container).outcome).toBe(
				'adopted'
			);
			expect(container.querySelector('p')).toBe(paragraph);
			dispose(container, false);
			expect(Array.from(container.childNodes)).toEqual([paragraph]);
		} finally {
			unmount(container);
		}
	});
});

/** Finds an actual constructed range by its compiler-selected artifact, without fabricating input authority. */
function findMountedArtifact(
	mounted: Mounted | undefined,
	artifact: ExactComponentExecutableArtifact
): Mounted | undefined {
	if (!mounted) return undefined;
	if (mounted.clientArtifact === artifact) return mounted;
	for (const child of mounted.children) {
		const found = findMountedArtifact(child, artifact);
		if (found) return found;
	}
	return undefined;
}
