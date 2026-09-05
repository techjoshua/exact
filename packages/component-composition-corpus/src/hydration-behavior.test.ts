import { hydrate } from '@exactjs/hydrate/enhanced';
import { exactEnhancementPassThrough } from '@exactjs/core';
import { render } from '@exactjs/dom';
import { flushSync } from '@exactjs/reactive';
import { renderToHydratableString, renderToHydratableStringAsync } from '@exactjs/ssr/enhanced';
import { describe, expect, it } from 'vitest';
import {
	capabilitiesOwner,
	capabilitiesRoot,
	contextOnlyRoot,
	keyedOnlyRoot,
	refLifecycleOnlyRoot
} from './scenarios/capabilities.fixtures.js';
import {
	capabilitiesRoot as serverCapabilitiesRoot,
	contextOnlyRoot as serverContextOnlyRoot,
	keyedOnlyRoot as serverKeyedOnlyRoot,
	refLifecycleOnlyRoot as serverRefLifecycleOnlyRoot
} from './scenarios/capabilities.fixtures.js?exact-target=server';
import { enhancementsRoot } from './scenarios/enhancements.fixtures.js';
import { enhancementsRoot as serverEnhancementsRoot } from './scenarios/enhancements.fixtures.js?exact-target=server';
import { corpus as corpusEnhancement } from './scenarios/enhancement-implementation.fixtures.js';
import { dynamicRoot } from './scenarios/dynamic.fixtures.js';
import { dynamicRoot as serverDynamicRoot } from './scenarios/dynamic.fixtures.js?exact-target=server';
import { fundamentalsRoot } from './scenarios/fundamentals.fixtures.js';
import { fundamentalsRoot as serverFundamentalsRoot } from './scenarios/fundamentals.fixtures.js?exact-target=server';
import { registryRoot } from './scenarios/registry.fixtures.js';
import { registryRoot as serverRegistryRoot } from './scenarios/registry.fixtures.js?exact-target=server';
import {
	inputProjectionRoot,
	snapshotProjectionRoot,
	stateOwner,
	stateRoot
} from './scenarios/state.fixtures.js';
import {
	inputProjectionRoot as serverInputProjectionRoot,
	snapshotProjectionRoot as serverSnapshotProjectionRoot,
	stateRoot as serverStateRoot
} from './scenarios/state.fixtures.js?exact-target=server';
import { structureRoot } from './scenarios/structure.fixtures.js';
import { structureRoot as serverStructureRoot } from './scenarios/structure.fixtures.js?exact-target=server';

describe('composition corpus hydration behavior', () => {
	it('adopts static, nested, and registry DOM without replacement', () => {
		for (const [serverOperation, clientOperation, selector] of [
			[serverFundamentalsRoot('ready'), fundamentalsRoot('ready'), 'main'],
			[serverRegistryRoot('first'), registryRoot('first'), '[data-view="first"]']
		] as const) {
			const { container, resumptions } = serverContainer(serverOperation);
			const serverNode = container.querySelector(selector);
			const following = container.querySelector('[data-role="after-label"]');
			hydrate(clientOperation, container, { onMismatch: 'throw', resumptions });
			expect(container.querySelector(selector)).toBe(serverNode);
			if (following) {
				expect(container.querySelector('[data-role="label-suffix"]')?.textContent).toBe('!');
				expect(container.querySelector('[data-role="after-label"]')).toBe(following);
			}
		}
	});

	it('activates an acknowledged open dynamic component from an inert server range', async () => {
		const { container, resumptions } = await asyncServerContainer(serverDynamicRoot());
		expect(container.querySelector('[data-dynamic]')).toBeNull();
		hydrate(dynamicRoot(), container, { onMismatch: 'throw', resumptions });
		await expect.poll(() => container.querySelector('[data-dynamic]')?.textContent).toBe('first');
	});

	it('activates indexed state bindings on adopted DOM', () => {
		const { container, resumptions } = serverContainer(serverStateRoot('count'));
		const output = container.querySelector('output');
		const projected = container.querySelector('[data-role="adjacent-text"]');
		const textarea = container.querySelector<HTMLTextAreaElement>(
			'[data-role="static-native-attributes"]'
		);
		const progress = container.querySelector<HTMLProgressElement>(
			'[data-role="direct-state-property"]'
		);
		const button = container.querySelector('button');
		hydrate(stateRoot('count'), container, { onMismatch: 'throw', resumptions });
		stateOwner().state.count = 3;
		stateOwner().state.enabled = false;
		flushSync();
		expect(container.querySelector('output')).toBe(output);
		expect(container.querySelector('button')).toBe(button);
		expect(output?.textContent).toBe('count:3');
		expect(container.querySelector('[data-role="adjacent-text"]')).toBe(projected);
		expect(container.querySelector('[data-role="static-native-attributes"]')).toBe(textarea);
		expect(projected?.textContent).toBe('Count & 3');
		expect(textarea?.maxLength).toBe(2000);
		expect(textarea?.required).toBe(true);
		expect(textarea?.getAttribute('aria-label')).toBe('count');
		expect(progress?.value).toBe(3);
		expect(button?.hasAttribute('disabled')).toBe(true);
	});

	it('applies indexed input state and nested prop operands while adopting the server range', () => {
		const { container, resumptions } = serverContainer(
			serverInputProjectionRoot({ label: 'hydrated' })
		);
		const output = container.querySelector('[data-scenario="input-projection"]');
		const nested = container.querySelector('[data-role="nested-prop-label"]');
		hydrate(inputProjectionRoot({ label: 'hydrated' }), container, {
			onMismatch: 'throw',
			resumptions
		});
		expect(container.querySelector('[data-scenario="input-projection"]')).toBe(output);
		expect(output?.textContent).toBe('ready:hydrated:idle');
		expect(container.querySelector('[data-role="nested-prop-label"]')).toBe(nested);
		expect(nested?.textContent).toBe('hydrated');

		render(inputProjectionRoot({ label: 'adopted update' }), container);
		flushSync();
		expect(container.querySelector('[data-role="nested-prop-label"]')).toBe(nested);
		expect(nested?.textContent).toBe('adopted update');

		const snapshot = serverContainer(serverSnapshotProjectionRoot('retained'));
		const snapshotOutput = snapshot.container.querySelector(
			'[data-scenario="snapshot-projection"]'
		);
		hydrate(snapshotProjectionRoot('retained'), snapshot.container, {
			onMismatch: 'throw',
			resumptions: snapshot.resumptions
		});
		expect(snapshot.container.querySelector('[data-scenario="snapshot-projection"]')).toBe(
			snapshotOutput
		);
		expect(snapshotOutput?.textContent).toBe('retained');
	});

	it('adopts context, keyed ranges, and both enhancement target forms', () => {
		for (const [serverOperation, clientOperation, selector] of [
			[serverContextOnlyRoot, contextOnlyRoot, '[data-scenario="context-only"]'],
			[serverKeyedOnlyRoot, keyedOnlyRoot, '[data-scenario="keyed-only"]'],
			[serverRefLifecycleOnlyRoot, refLifecycleOnlyRoot, '[data-scenario="ref-only"]']
		] as const) {
			const atom = serverContainer(serverOperation);
			const serverNode = atom.container.querySelector(selector);
			hydrate(clientOperation, atom.container, { resumptions: atom.resumptions });
			expect(atom.container.querySelector(selector), selector).toBe(serverNode);
		}

		const capability = serverContainer(serverCapabilitiesRoot);
		const capabilitySection = capability.container.querySelector('section');
		hydrate(capabilitiesRoot, capability.container, {
			onMismatch: 'throw',
			resumptions: capability.resumptions
		});
		expect(capability.container.querySelector('section')).toBe(capabilitySection);
		expect(capability.container.querySelector('[data-role="context"]')?.textContent).toBe(
			'provided'
		);
		const adoptedLabel = capability.container.querySelector(
			'[data-id="b"] [data-role="item-label"]'
		);
		capabilitiesOwner().state.items[1]!.label = 'Beta hydrated';
		flushSync();
		expect(capability.container.querySelector('[data-id="b"] [data-role="item-label"]')).toBe(
			adoptedLabel
		);
		expect(adoptedLabel?.textContent).toBe('Beta hydrated');
		expect(
			[...capability.container.querySelectorAll('[data-id="a"] [data-role="nested-value"]')].map(
				(node) => node.textContent
			)
		).toEqual(['a:mean', 'a:p50']);
		expect(
			[...capability.container.querySelectorAll('[data-id="b"] [data-role="nested-value"]')].map(
				(node) => node.textContent
			)
		).toEqual(['b:mean', 'b:p50']);

		const enhanced = serverContainer(serverEnhancementsRoot, {
			enhancementCatalog: new Map([
				['./enhancement-routing.fixtures.js#corpus', exactEnhancementPassThrough]
			])
		});
		const intrinsic = enhanced.container.querySelector('[data-role="intrinsic-target"]');
		hydrate(enhancementsRoot, enhanced.container, {
			onMismatch: 'throw',
			resumptions: enhanced.resumptions,
			enhancementCatalog: new Map([['./enhancement-routing.fixtures.js#corpus', corpusEnhancement]])
		});
		expect(enhanced.container.querySelector('[data-role="intrinsic-target"]')).toBe(intrinsic);
		expect(intrinsic?.getAttribute('data-corpus-tone')).toBe('intrinsic');
		expect(
			enhanced.container
				.querySelector('[data-role="component-target"]')
				?.getAttribute('data-corpus-tone')
		).toBe('component');
	});

	it('recovers a structural mismatch at the compiler-owned component root', () => {
		const { container, resumptions } = serverContainer(serverStructureRoot);
		const serverRoot = container.querySelector('[data-scenario="structure"]');
		container.querySelector('[data-role="conditional"]')!.replaceWith(document.createElement('i'));
		hydrate(structureRoot, container, { onMismatch: 'replace', resumptions });
		expect(container.querySelector('[data-scenario="structure"]')).not.toBe(serverRoot);
		expect(container.querySelector('[data-role="before"]')?.textContent).toBe('before');
		expect(container.querySelector('[data-role="after"]')?.textContent).toBe('after');
		expect(container.querySelector('[data-role="conditional"]')?.textContent).toBe('visible');
	});
});

function serverContainer(
	operation: Parameters<typeof renderToHydratableString>[0],
	options?: Parameters<typeof renderToHydratableString>[1]
) {
	const rendered = renderToHydratableString(operation, options);
	const container = document.createElement('div');
	container.innerHTML = rendered.html;
	return { container, resumptions: rendered.resumptions };
}

async function asyncServerContainer(
	operation: Parameters<typeof renderToHydratableStringAsync>[0],
	options?: Parameters<typeof renderToHydratableStringAsync>[1]
) {
	const rendered = await renderToHydratableStringAsync(operation, options);
	const container = document.createElement('div');
	container.innerHTML = rendered.html;
	return { container, resumptions: rendered.resumptions };
}
