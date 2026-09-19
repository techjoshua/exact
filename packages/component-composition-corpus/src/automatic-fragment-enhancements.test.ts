import '@exactjs/dom/runtime/target';
import { createEnhancementNode, readExactEnhancementContexts } from '@exactjs/core';
import { createCompiledFragmentReceipt } from '@exactjs/core/runtime/component-operations';
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import {
	ImplicitPreparedEnhancement,
	StructuralPreparedEnhancement,
	structuralPreparationOwner,
	PreparedEnhancement,
	preparationAudit
} from './prototypes/preparation.fixtures.js';
import type { Mounted } from '../../dom/src/types.js';
import {
	ImplicitPreparedEnhancement as ServerEnhancement,
	StructuralPreparedEnhancement as ServerStructural
} from './prototypes/preparation.fixtures.js?exact-target=server';
import { createRendererRoot } from '../../dom/src/renderer/root-construction.js';
import { registerDomEnhancementIntegration } from '../../dom/src/renderer/enhancement-integration.js';
import { mountDetachedOperation } from '../../dom/src/renderer/mounting/children.js';
import { placeMountedBefore } from '../../dom/src/placement.js';
import { disposeMounted } from '../../dom/src/renderer/teardown.js';
import { adoptStaticChildren } from '../../dom/src/renderer/adoption/boundaries.js';
import { createSsrContext } from '../../ssr/src/render/context.js';
import { renderChildren } from '../../ssr/src/render/children.js';
import { createEffectScope } from '@exactjs/reactive/framework/runtime';
import { patchChildren } from '../../dom/src/renderer/patching/children.js';
import {
	automaticFragmentRoot,
	automaticPageRoot
} from './scenarios/automatic-fragment.fixtures.js';
import { automaticPageRoot as serverPageRoot } from './scenarios/automatic-fragment.fixtures.js?exact-target=server';
import { renderToHydratableString } from '@exactjs/ssr';
import { hydrate } from '@exactjs/hydrate';
import { unmount } from '@exactjs/dom';

describe('automatic fragment presentation', () => {
	it('keeps structural output between independently shared contribution groups across renderers', async () => {
		registerDomEnhancementIntegration();
		const entries = ['outer', 'structure', 'inner'].map((identity) => ({ identity, props: {} }));
		const operation = createCompiledFragmentReceipt(
			{ __exactEnhancements: createEnhancementNode(entries) },
			'structural text'
		);
		const catalog = new Map([
			['outer', ImplicitPreparedEnhancement],
			['structure', StructuralPreparedEnhancement],
			['inner', ImplicitPreparedEnhancement]
		]);
		const serverCatalog = new Map([
			['outer', ServerEnhancement],
			['structure', ServerStructural],
			['inner', ServerEnhancement]
		]);
		const container = document.createElement('div');
		const root = createRendererRoot(
			container,
			operation,
			{ enhancementCatalog: catalog },
			{ version: 1 }
		);
		const mounted = mountDetachedOperation(root, operation, undefined, undefined, container);
		try {
			placeMountedBefore(root, container, mounted);
			expect(
				container.querySelector('span > article > span > span')?.textContent,
				container.innerHTML
			).toBe('structural text');
			expect(container.querySelector('article > span')?.getAttribute('title')).toBe('structural');
			const retained = container.querySelector('article > span');
			structuralPreparationOwner.state.title = 'updated';
			flushSync();
			expect(container.querySelector('article > span')).toBe(retained);
			expect(retained?.getAttribute('title')).toBe('updated');
		} finally {
			disposeMounted(container, mounted);
		}
		const context = createSsrContext({ enhancementCatalog: serverCatalog, markers: true });
		container.innerHTML = await renderChildren(context, [operation], undefined, {});
		const original = [...container.querySelectorAll('*')];
		const scope = createEffectScope();
		const hydratedRoot = createRendererRoot(
			container,
			operation,
			{ enhancementCatalog: catalog },
			{ version: 1, mode: 'hydrated' }
		);
		const adopted = adoptStaticChildren(
			hydratedRoot,
			[operation],
			[...container.childNodes],
			undefined,
			scope
		);
		try {
			expect(adopted).toBeDefined();
			expect(
				container.querySelector('span > article > span > span')?.textContent,
				container.innerHTML
			).toBe('structural text');
			for (const [index, element] of original.entries())
				expect(container.querySelectorAll('*')[index]).toBe(element);
		} finally {
			for (const child of adopted ?? []) disposeMounted(container, child);
			scope.stop();
		}
	});
	it('preserves the prepared host through public component-root hydration', async () => {
		registerDomEnhancementIntegration();
		const identity = './automatic-routing.fixtures.js#implicit';
		const result = await renderToHydratableString(serverPageRoot, {
			enhancementCatalog: new Map([[identity, ServerEnhancement]])
		});
		const container = document.createElement('div');
		container.innerHTML = result.html;
		const host = container.querySelector('em');
		expect(host).not.toBeNull();
		try {
			hydrate(automaticPageRoot, container, {
				onMismatch: 'throw',
				resumptions: result.resumptions,
				enhancementCatalog: new Map([[identity, ImplicitPreparedEnhancement]])
			});
			expect(container.querySelectorAll('em')).toHaveLength(1);
			expect(container.querySelector('em')).toBe(host);
		} finally {
			unmount(container);
		}
	});
	it('connects authored fragment configuration to automatic component preparation', () => {
		registerDomEnhancementIntegration();
		const container = document.createElement('div');
		const root = createRendererRoot(
			container,
			automaticFragmentRoot,
			{
				enhancementCatalog: new Map([
					['./automatic-routing.fixtures.js#implicit', ImplicitPreparedEnhancement]
				])
			},
			{ version: 1 }
		);
		const mounted = mountDetachedOperation(
			root,
			automaticFragmentRoot,
			undefined,
			undefined,
			container
		);
		try {
			placeMountedBefore(root, container, mounted);
			expect(container.querySelector('em')?.textContent).toBe('authored');
			expect(container.querySelector('em')?.title).toBe('implicit');
		} finally {
			disposeMounted(container, mounted);
		}
	});
	it('releases only the removed component owner and preserves the other instances', () => {
		registerDomEnhancementIntegration();
		Object.assign(preparationAudit, { setup: 0, mounted: 0, disposed: 0 });
		const entries = ['first', 'middle', 'last'].map((identity) => ({ identity, props: {} }));
		const operation = createCompiledFragmentReceipt(
			{ __exactEnhancements: createEnhancementNode(entries) },
			'owned'
		);
		const container = document.createElement('div');
		const root = createRendererRoot(
			container,
			operation,
			{
				enhancementCatalog: new Map(entries.map(({ identity }) => [identity, PreparedEnhancement]))
			},
			{ version: 1 }
		);
		let mounted = mountDetachedOperation(root, operation, undefined, undefined, container);
		const instances = (node: Mounted): NonNullable<Mounted['instance']>[] => [
			...(node.instance ? [node.instance] : []),
			...node.children.flatMap(instances)
		];
		try {
			placeMountedBefore(root, container, mounted);
			const original = instances(mounted);
			expect(original).toHaveLength(3);
			const span = container.querySelector('span');
			const next = createCompiledFragmentReceipt(
				{ __exactEnhancements: createEnhancementNode([entries[0]!, entries[2]!]) },
				'owned'
			);
			mounted = patchChildren(root, container, [mounted], [next])[0]!;
			flushSync();
			expect(instances(mounted)).toEqual([original[0], original[2]]);
			expect(original[1]!.scope.active).toBe(false);
			expect(container.querySelector('span')).toBe(span);
			expect(preparationAudit).toEqual({ setup: 3, mounted: 3, disposed: 1 });
			const restored = createCompiledFragmentReceipt(
				{ __exactEnhancements: createEnhancementNode(entries) },
				'owned'
			);
			mounted = patchChildren(root, container, [mounted], [restored])[0]!;
			flushSync();
			const reinserted = instances(mounted);
			expect(reinserted[0]).toBe(original[0]);
			expect(reinserted[2]).toBe(original[2]);
			expect(reinserted[1]).not.toBe(original[1]);
			expect(container.querySelector('span')).toBe(span);
			expect(container.querySelectorAll('span')).toHaveLength(1);
			expect(container.textContent).toBe('owned');
			expect(preparationAudit).toEqual({ setup: 4, mounted: 4, disposed: 1 });
			const reconfigured = createCompiledFragmentReceipt(
				{
					__exactEnhancements: createEnhancementNode([
						entries[0]!,
						{ ...entries[1]!, intrinsicFragment: 'em' },
						entries[2]!
					])
				},
				'owned'
			);
			mounted = patchChildren(root, container, [mounted], [reconfigured])[0]!;
			flushSync();
			expect(instances(mounted)[0]).toBe(original[0]);
			expect(instances(mounted)[2]).toBe(original[2]);
			expect(container.querySelector('span')).toBe(span);
			expect(container.querySelector('span > em > span')?.textContent).toBe('owned');
			expect(preparationAudit).toEqual({ setup: 5, mounted: 5, disposed: 2 });
		} finally {
			disposeMounted(container, mounted);
		}
		expect(preparationAudit.disposed).toBe(5);
	});
	it.each(['span', 'em'])(
		'shares %s hosts through normal mounting and server adoption',
		async (tag) => {
			registerDomEnhancementIntegration();
			expect(readExactEnhancementContexts(ImplicitPreparedEnhancement)?.transparentTarget).toBe(
				true
			);
			const entries = ['first', 'middle', 'second'].map((identity) => ({
				identity,
				props: {},
				intrinsicFragment: tag
			}));
			const operation = createCompiledFragmentReceipt(
				{ __exactEnhancements: createEnhancementNode(entries) },
				'text'
			);
			const catalog = new Map(
				entries.map(({ identity }) => [identity, ImplicitPreparedEnhancement])
			);
			const container = document.createElement('div');
			const root = createRendererRoot(
				container,
				operation,
				{ enhancementCatalog: catalog },
				{ version: 1 }
			);
			let mounted = mountDetachedOperation(root, operation, undefined, undefined, container);
			try {
				placeMountedBefore(root, container, mounted);
				flushSync();
				expect(container.querySelectorAll(tag)).toHaveLength(1);
				expect(container.querySelector(tag)?.textContent).toBe('text');
				const host = container.querySelector(tag);
				const text = host!.lastChild;
				const updated = createCompiledFragmentReceipt(
					{ __exactEnhancements: createEnhancementNode(entries) },
					'updated'
				);
				expect(patchChildren(root, container, [mounted], [updated])[0]).toBe(mounted);
				flushSync();
				expect(container.querySelector(tag)).toBe(host);
				expect(host!.lastChild).toBe(text);
				expect(host!.textContent).toBe('updated');
				const reduced = createCompiledFragmentReceipt(
					{ __exactEnhancements: createEnhancementNode([entries[0]!, entries[2]!]) },
					'updated'
				);
				expect(patchChildren(root, container, [mounted], [reduced])[0]).toBe(mounted);
				flushSync();
				expect(container.querySelectorAll(tag)).toHaveLength(1);
				expect(container.querySelector(tag)).toBe(host);
				expect(host!.textContent).toBe('updated');
				const plain = createCompiledFragmentReceipt(null, 'updated');
				mounted = patchChildren(root, container, [mounted], [plain])[0]!;
				flushSync();
				expect(container.querySelector(tag)).toBeNull();
				expect(container.textContent).toBe('updated');
			} finally {
				disposeMounted(container, mounted);
			}
			const context = createSsrContext({
				enhancementCatalog: new Map(entries.map(({ identity }) => [identity, ServerEnhancement]))
			});
			container.innerHTML = await renderChildren(context, [operation], undefined, {});
			const original = container.querySelector(tag);
			expect(original).not.toBeNull();
			const scope = createEffectScope();
			try {
				const adopted = adoptStaticChildren(
					root,
					[operation],
					[...container.childNodes],
					undefined,
					scope
				);
				expect(adopted).toHaveLength(1);
				expect(container.querySelector(tag)).toBe(original);
				for (const child of adopted!) disposeMounted(container, child);
			} finally {
				scope.stop();
			}
		}
	);
});
