import '@exactjs/dom/runtime/target';
import '@exactjs/dom/structural-boundaries';
import { createEnhancementNode } from '@exactjs/core';
import {
	createCompiledActivityReceipt,
	createCompiledFragmentReceipt,
	createCompiledComponentInputReceipt
} from '@exactjs/core/runtime/component-operations';
import { computed, flushSync, reactive } from '@exactjs/reactive';
import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { expect, it, vi } from 'vitest';
import { ownCorpusCompilation } from './test-support/compiler-case.js';
import { registerDomEnhancementIntegration } from '../../dom/src/renderer/enhancement-integration.js';
import {
	PreparedEnhancement,
	preparationAudit,
	preparationInstance,
	preparationRef
} from './prototypes/preparation.fixtures.js';
import { PreparedEnhancement as ServerEnhancement } from './prototypes/preparation.fixtures.js?exact-target=server';
import { prototypeRoot } from './prototypes/placement.fixtures.js';
import { prototypeRoot as serverRoot } from './prototypes/placement.fixtures.js?exact-target=server';
import {
	StaleRegistryApp,
	staleRegistryAppInstance
} from '../../dom/src/test-support/components/component-registry.fixtures.js';
import {
	resetStaleRegistryFixture,
	releaseStaleRegistryFixture,
	staleRegistryLoadCount,
	staleRegistrySetupCount,
	staleRegistryStartCount,
	waitForStaleRegistryStart
} from '../../dom/src/test-support/components/component-registry-lazy-control.js';
it.each(['mount', 'hydrate'])(
	'retains a contributed fragment host and owner through Activity parking after %s',
	async (mode) => {
		registerDomEnhancementIntegration();
		const state = reactive({ mode: 'active' as 'active' | 'parked', value: 'before' });
		const operation = createCompiledActivityReceipt(
			{ mode: computed(() => state.mode) },
			createCompiledFragmentReceipt(
				{ __exactEnhancements: createEnhancementNode([{ identity: 'prepared', props: {} }]) },
				computed(() => state.value)
			)
		);
		const container = document.createElement('div');
		const setup = preparationAudit.setup;
		const disposed = preparationAudit.disposed;
		const options = { enhancementCatalog: new Map([['prepared', PreparedEnhancement]]) };
		try {
			if (mode === 'hydrate') {
				const rendered = await renderToHydratableString(serverRoot(operation), {
					enhancementCatalog: new Map([['prepared', ServerEnhancement]])
				});
				container.innerHTML = rendered.html;
				hydrate(prototypeRoot(operation), container, {
					...options,
					resumptions: rendered.resumptions,
					onMismatch: 'throw'
				});
			} else render(prototypeRoot(operation), container, options);
			const host = container.querySelector('span')!;
			const text = [...host.childNodes].find((node) => node.nodeType === 3);
			expect(preparationInstance!.ref(preparationRef).current).toBe(host);
			state.mode = 'parked';
			flushSync();
			expect(container.querySelector('span')).toBeNull();
			state.value = 'after';
			state.mode = 'active';
			flushSync();
			expect(container.querySelector('span')).toBe(host);
			expect(host.textContent).toBe('after');
			expect([...host.childNodes].find((node) => node.nodeType === 3)).toBe(text);
			expect(preparationInstance!.ref(preparationRef).current).toBe(host);
			expect(preparationAudit.setup - setup).toBe(1);
			expect(preparationAudit.disposed - disposed).toBe(0);
		} finally {
			unmount(container);
		}
		expect(preparationAudit.disposed - disposed).toBe(1);
		expect(preparationInstance!.ref(preparationRef).current).toBeUndefined();
	}
);
it('fences a stale lazy branch without replacing or resurrecting its fragment enhancement', async (context) => {
	const compile = ownCorpusCompilation(context);
	registerDomEnhancementIntegration();
	resetStaleRegistryFixture();
	const container = document.createElement('div');
	const setup = preparationAudit.setup;
	const disposed = preparationAudit.disposed;
	let cleanup: Promise<void> | undefined;
	// Release the controlled module gate and join its import even when Vitest cancels the case.
	const releaseOwnedImport = () =>
		(cleanup ??= (async () => {
			releaseStaleRegistryFixture();
			unmount(container);
			await vi.dynamicImportSettled();
		})());
	context.onTestFinished(releaseOwnedImport);
	try {
		render(
			prototypeRoot(
				createCompiledFragmentReceipt(
					{ __exactEnhancements: createEnhancementNode([{ identity: 'prepared', props: {} }]) },
					createCompiledComponentInputReceipt(StaleRegistryApp, {})
				)
			),
			container,
			{ enhancementCatalog: new Map([['prepared', PreparedEnhancement]]) }
		);
		const host = container.querySelector('span');
		expect(host?.textContent).toBe('loading');
		// Exercise cancellation after loader entry rather than racing dynamic import selection.
		await compile(() => waitForStaleRegistryStart());
		expect(staleRegistryStartCount()).toBe(1);
		staleRegistryAppInstance().state.selected = 'ready';
		flushSync();
		await vi.waitFor(() => expect(container.textContent).toBe('ready'));
		expect(container.querySelector('span')).toBe(host);
		expect(preparationAudit.setup - setup).toBe(1);
		expect(preparationAudit.disposed - disposed).toBe(0);
		unmount(container);
		releaseStaleRegistryFixture();
		await vi.waitFor(() => expect(staleRegistryLoadCount()).toBe(1));
		await Promise.resolve();
		expect(staleRegistrySetupCount()).toBe(0);
		expect(container.childNodes).toHaveLength(0);
		expect(preparationAudit.disposed - disposed).toBe(1);
	} finally {
		await releaseOwnedImport();
	}
}, 0);
