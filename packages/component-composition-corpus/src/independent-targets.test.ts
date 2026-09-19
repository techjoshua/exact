import { renderToHydratableString } from '@exactjs/ssr';
import { hydrate } from '@exactjs/hydrate';
import { flushSync } from '@exactjs/reactive';
import '@exactjs/dom/runtime/target';
import { describe, expect, it } from 'vitest';
import { renderCompiledComponentRoot as renderTestTree } from '../../dom/src/framework/component-root.js';
import { registerDomEnhancementIntegration } from '../../dom/src/renderer/enhancement-integration.js';
registerDomEnhancementIntegration();
import { unmount } from '@exactjs/dom';
import { createSsrContext } from '../../ssr/src/render/context.js';
import { renderChildren } from '../../ssr/src/render/children.js';
import { LeftShell, RightShell } from './scenarios/independent-target-implementations.fixtures.js';
import { PreparedEnhancement, preparationAudit } from './prototypes/preparation.fixtures.js';
import {
	LeftShell as ServerLeft,
	RightShell as ServerRight
} from './scenarios/independent-target-implementations.fixtures.js?exact-target=server';
import {
	independentTargetsRoot,
	emptyFirstFallback,
	textFragmentRoot,
	scalarRoot,
	scalarOwner,
	fallbackTargetsRoot,
	projectionTargetRoot,
	dormantTargetsRoot,
	retargetRoot,
	retargetOwner,
	emptyTargetOwner
} from './scenarios/independent-targets.fixtures.js';
import {
	independentTargetsRoot as serverRoot,
	emptyFirstFallback as serverEmptyFirst,
	textFragmentRoot as serverTextFragment,
	scalarRoot as serverScalar,
	retargetRoot as serverRetarget,
	fallbackTargetsRoot as serverFallback,
	projectionTargetRoot as serverProjection,
	duplicateTargetsRoot
} from './scenarios/independent-targets.fixtures.js?exact-target=server';

const left = './independent-target-routing.fixtures.js#left';
const right = './independent-target-routing.fixtures.js#right';

describe('independent namespace roots', () => {
	it.each(['moving', 'retained'])(
		'retains unaffected ownership with a %s transparent peer beside a structural peer',
		(transparent) => {
			const container = document.createElement('div');
			const setup = preparationAudit.setup;
			const disposed = preparationAudit.disposed;
			try {
				renderTestTree(retargetRoot, container, {
					enhancementCatalog: new Map([
						[left, transparent === 'moving' ? PreparedEnhancement : LeftShell],
						[right, transparent === 'retained' ? PreparedEnhancement : RightShell]
					])
				});
				const first = container.querySelector('#first');
				const second = container.querySelector('#second');
				const peer = container.querySelector('[data-enhancement="right"]');
				retargetOwner.state.first = false;
				flushSync();
				expect(container.querySelector('#first')).toBe(first);
				expect(container.querySelector('#second')).toBe(second);
				if (transparent === 'moving') {
					expect(container.querySelector('[data-enhancement="right"]')).toBe(peer);
					expect(first?.getAttribute('title')).toBeNull();
					expect(second?.getAttribute('title')).toBe('prepared');
				} else {
					expect(first?.getAttribute('title')).toBe('prepared');
					expect(container.querySelector('aside > #second')).toBe(second);
					expect(preparationAudit.setup - setup).toBe(1);
					expect(preparationAudit.disposed - disposed).toBe(0);
				}
			} finally {
				unmount(container);
			}
			expect(preparationAudit.disposed - disposed).toBe(preparationAudit.setup - setup);
		}
	);
	it('continues bounded fallback past an empty component in SSR and hydration', async () => {
		const result = await renderToHydratableString(serverEmptyFirst, {
			enhancementCatalog: new Map([[left, ServerLeft]])
		});
		const container = document.createElement('div');
		container.innerHTML = result.html;
		const button = container.querySelector('aside > button');
		try {
			expect(button, result.html).not.toBeNull();
			hydrate(emptyFirstFallback, container, {
				enhancementCatalog: new Map([[left, LeftShell]]),
				resumptions: result.resumptions,
				onMismatch: 'throw'
			});
			expect(container.querySelector('aside > button')).toBe(button);
			expect(container.querySelectorAll('aside')).toHaveLength(1);
		} finally {
			unmount(container);
		}
	});
	it('retargets after hydration while retaining unrelated peer output', async () => {
		const result = await renderToHydratableString(serverRetarget, {
			enhancementCatalog: new Map([
				[left, ServerLeft],
				[right, ServerRight]
			])
		});
		const container = document.createElement('div');
		container.innerHTML = result.html;
		try {
			hydrate(retargetRoot, container, {
				enhancementCatalog: new Map([
					[left, LeftShell],
					[right, RightShell]
				]),
				resumptions: result.resumptions,
				onMismatch: 'throw'
			});
			const peer = container.querySelector('div[data-enhancement="right"]');
			const first = container.querySelector('#first');
			retargetOwner.state.first = false;
			flushSync();
			expect(container.querySelector('aside > #second')).not.toBeNull();
			expect(container.querySelector('#first')).toBe(first);
			expect(container.querySelector('div[data-enhancement="right"]')).toBe(peer);
		} finally {
			unmount(container);
		}
	});

	it('selects scalar component output as a Text target', () => {
		const container = document.createElement('div');
		try {
			renderTestTree(scalarRoot, container, { enhancementCatalog: new Map([[left, LeftShell]]) });
			expect(container.querySelector('aside')?.textContent).toBe('scalar-only');
			const wrapper = container.querySelector('aside');
			scalarOwner.state.text = 'updated';
			flushSync();
			expect(container.querySelector('aside')).toBe(wrapper);
			expect(wrapper?.textContent).toBe('updated');
		} finally {
			unmount(container);
		}
	});
	it('wraps a text-only fragment root without losing its text', () => {
		const container = document.createElement('div');
		try {
			renderTestTree(textFragmentRoot, container, {
				enhancementCatalog: new Map([[left, LeftShell]])
			});
			expect(container.querySelector('aside')?.textContent).toBe('text-only');
		} finally {
			unmount(container);
		}
	});
	it('keeps projected selectors outside the receiving component frame', () => {
		const container = document.createElement('div');
		try {
			renderTestTree(projectionTargetRoot, container, {
				enhancementCatalog: new Map([[left, LeftShell]])
			});
			expect(container.querySelector('aside > section > button')?.textContent).toBe('projected');
			expect(container.querySelectorAll('aside')).toHaveLength(1);
		} finally {
			unmount(container);
		}
	});
	it('retains an unrelated namespace wrapper when another selector changes', () => {
		const container = document.createElement('div');
		try {
			renderTestTree(retargetRoot, container, {
				enhancementCatalog: new Map([
					[left, LeftShell],
					[right, RightShell]
				])
			});
			const peer = container.querySelector('div[data-enhancement="right"]');
			const input = container.querySelector('input');
			const first = container.querySelector('#first');
			retargetOwner.state.first = false;
			flushSync();
			expect(container.querySelector('aside > #second')).not.toBeNull();
			expect(container.querySelector('#first')).toBe(first);
			expect(container.querySelector('div[data-enhancement="right"]')).toBe(peer);
			expect(container.querySelector('input')).toBe(input);
		} finally {
			unmount(container);
		}
	});
	it.each([
		[serverRoot, independentTargetsRoot, false],
		[serverTextFragment, textFragmentRoot, false],
		[serverScalar, scalarRoot, false],
		[serverProjection, projectionTargetRoot, false],
		[serverFallback, fallbackTargetsRoot, false],
		[serverRoot, independentTargetsRoot, true],
		[serverFallback, fallbackTargetsRoot, true]
	])(
		'hydrates structural roots without replacing server elements',
		async (server, client, markerless) => {
			const result = await renderToHydratableString(server, {
				markerlessRoot: markerless ? true : undefined,
				enhancementCatalog: new Map([
					[left, ServerLeft],
					[right, ServerRight]
				])
			});
			const container = document.createElement('div');
			container.innerHTML = result.html;
			const elements = [...container.querySelectorAll('*')];
			if (server === serverScalar)
				expect(container.querySelector('aside')?.textContent).toBe('scalar-only');
			try {
				hydrate(client, container, {
					enhancementCatalog: new Map([
						[left, LeftShell],
						[right, RightShell]
					]),
					resumptions: result.resumptions,
					onMismatch: 'throw'
				});
				expect([...container.querySelectorAll('*')]).toEqual(elements);
				for (const [index, element] of elements.entries())
					expect(container.querySelectorAll('*')[index]).toBe(element);
				if (server === serverScalar) {
					const wrapper = container.querySelector('aside');
					scalarOwner.state.text = 'hydrated update';
					flushSync();
					expect(container.querySelector('aside')).toBe(wrapper);
					expect(wrapper?.textContent).toBe('hydrated update');
				}
			} finally {
				unmount(container);
			}
		}
	);
	it('keeps an empty explicit child dormant and activates only when its own output becomes ready', () => {
		const container = document.createElement('div');
		try {
			renderTestTree(dormantTargetsRoot, container, {
				enhancementCatalog: new Map([[left, LeftShell]])
			});
			const fallback = container.querySelector('#fallback');
			expect(container.querySelector('aside')).toBeNull();
			emptyTargetOwner.state.visible = true;
			flushSync();
			expect(container.querySelector('aside > #ready')).not.toBeNull();
			expect(container.querySelector('#fallback')).toBe(fallback);
			emptyTargetOwner.state.visible = false;
			flushSync();
			expect(container.querySelector('aside')).toBeNull();
			expect(container.querySelector('#fallback')).toBe(fallback);
		} finally {
			unmount(container);
		}
	});
	it('selects different authored roots despite a nested target placement in DOM and SSR', async () => {
		const container = document.createElement('div');
		try {
			renderTestTree(independentTargetsRoot, container, {
				enhancementCatalog: new Map([
					[left, LeftShell],
					[right, RightShell]
				])
			});
			expect(
				container.querySelector(
					'aside[data-enhancement="left"] > section > div[data-enhancement="right"] > input'
				)
			).not.toBeNull();
		} finally {
			unmount(container);
		}
		const context = createSsrContext({
			enhancementCatalog: new Map([
				[left, ServerLeft],
				[right, ServerRight]
			])
		});
		container.innerHTML = await renderChildren(context, [serverRoot], undefined, {});
		expect(
			container.querySelector(
				'aside[data-enhancement="left"] > section > div[data-enhancement="right"] > input'
			)
		).not.toBeNull();
		expect(container.querySelectorAll('aside')).toHaveLength(1);
		expect(container.querySelectorAll('input')).toHaveLength(1);
	});

	it('rejects duplicate active namespace roots during server preparation', async () => {
		const context = createSsrContext({ enhancementCatalog: new Map([[left, ServerLeft]]) });
		await expect(renderChildren(context, [duplicateTargetsRoot], undefined, {})).rejects.toThrow(
			'Multiple active enhancement roots'
		);
	});
});
