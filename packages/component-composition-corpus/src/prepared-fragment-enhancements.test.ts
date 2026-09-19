import '@exactjs/dom/runtime/target';
import { createCompiledFragmentReceipt } from '@exactjs/core/runtime/component-operations';
import { createRendererRoot } from '../../dom/src/renderer/root-construction.js';
import { mountPreparedFragmentEnhancements } from '../../dom/src/renderer/prepared-fragment-enhancements.js';
import { disposeMounted } from '../../dom/src/renderer/teardown.js';
import { placeMountedBefore } from '../../dom/src/placement.js';
import { flushSync } from '@exactjs/reactive';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	PreparedEnhancement,
	ImplicitPreparedEnhancement,
	DestructuredPreparedEnhancement,
	PreparedContextProvider,
	PreparedContextConsumer,
	RefOnlyEnhancement,
	preparationAudit,
	preparationInstance
} from './prototypes/preparation.fixtures.js';
import {
	PreparedEnhancement as ServerEnhancement,
	ImplicitPreparedEnhancement as ServerImplicitEnhancement,
	DestructuredPreparedEnhancement as ServerDestructuredEnhancement,
	PreparedContextProvider as ServerContextProvider,
	PreparedContextConsumer as ServerContextConsumer,
	RefOnlyEnhancement as ServerRefOnlyEnhancement,
	preparationAudit as serverAudit
} from './prototypes/preparation.fixtures.js?exact-target=server';
import { createSsrContext } from '../../ssr/src/render/context.js';
import { renderPreparedFragmentEnhancements } from '../../ssr/src/render/prepared-fragment-enhancements.js';
import { adoptStaticChildren } from '../../dom/src/renderer/adoption/boundaries.js';

beforeEach(() => Object.assign(preparationAudit, { setup: 0, mounted: 0, disposed: 0 }));

describe('prepared fragment enhancement chain', () => {
	it.each([false, true])(
		'reorders live peers without recreating owners or text (mixed tags: %s)',
		(mixed) => {
			const entries = ['one', 'two', 'three'].map((identity, index) => ({
				identity,
				props: {},
				intrinsicFragment: mixed ? ['span', 'em', 'b'][index] : 'span'
			}));
			const target = createCompiledFragmentReceipt(null, 'retained');
			const container = document.createElement('div');
			const root = createRendererRoot(
				container,
				target,
				{
					enhancementCatalog: new Map(entries.map((entry) => [entry.identity, PreparedEnhancement]))
				},
				{ version: 1 }
			);
			const mounted = mountPreparedFragmentEnhancements(
				root,
				entries,
				target,
				undefined,
				undefined,
				container
			);
			try {
				placeMountedBefore(root, container, mounted);
				const host = container.querySelector(mixed ? 'b' : 'span')!;
				const text = [...host.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
				expect(mounted.receivePreparedEnhancements?.([...entries].reverse(), target)).toBe(true);
				flushSync();
				expect(preparationAudit).toEqual({ setup: 3, mounted: 3, disposed: 0 });
				expect(container.textContent).toBe('retained');
				expect(container.querySelector(mixed ? 'b' : 'span')).toBe(host);
				expect(container.contains(text!)).toBe(true);
				if (mixed) expect(container.querySelector('b > em > span')).not.toBeNull();
			} finally {
				disposeMounted(container, mounted);
			}
			expect(preparationAudit.disposed).toBe(3);
		}
	);
	it.each([false, true])(
		'places the implicit child on client and server (destructured: %s)',
		async (destructured) => {
			const entries = [{ identity: 'implicit', props: { label: 'implicit' } }];
			const target = createCompiledFragmentReceipt(null, 'supplied');
			const container = document.createElement('div');
			const root = createRendererRoot(
				container,
				target,
				{
					enhancementCatalog: new Map([
						[
							'implicit',
							destructured ? DestructuredPreparedEnhancement : ImplicitPreparedEnhancement
						]
					])
				},
				{ version: 1 }
			);
			const mounted = mountPreparedFragmentEnhancements(
				root,
				entries,
				target,
				undefined,
				undefined,
				container
			);
			try {
				placeMountedBefore(root, container, mounted);
				expect(container.querySelector('span')?.textContent).toBe('supplied');
				expect(container.querySelector('span')?.title).toBe('implicit');
			} finally {
				disposeMounted(container, mounted);
			}
			const context = createSsrContext({
				markers: false,
				enhancementCatalog: new Map([
					['implicit', destructured ? ServerDestructuredEnhancement : ServerImplicitEnhancement]
				])
			});
			expect(
				await renderPreparedFragmentEnhancements(context, entries, target, undefined, {})
			).toBe('<span title="implicit">supplied</span>');
		}
	);
	it('constructs providers before consumers and rejects a contradictory order before setup', async () => {
		const entries = [
			{ identity: 'provider', props: {} },
			{ identity: 'consumer', props: {} }
		];
		const target = createCompiledFragmentReceipt(null, 'context');
		const container = document.createElement('div');
		const root = createRendererRoot(
			container,
			target,
			{
				enhancementCatalog: new Map([
					['provider', PreparedContextProvider],
					['consumer', PreparedContextConsumer]
				])
			},
			{ version: 1 }
		);
		expect(() =>
			mountPreparedFragmentEnhancements(
				root,
				[...entries].reverse(),
				target,
				undefined,
				undefined,
				container
			)
		).toThrow(/source order conflict.*consumer.*provider/);
		expect(preparationAudit.setup).toBe(0);
		const mounted = mountPreparedFragmentEnhancements(
			root,
			entries,
			target,
			undefined,
			undefined,
			container
		);
		try {
			placeMountedBefore(root, container, mounted);
			expect(container.querySelector('span')?.title).toBe('provided');
			expect(preparationAudit.setup).toBe(2);
		} finally {
			disposeMounted(container, mounted);
		}
		expect(preparationAudit.disposed).toBe(2);
		Object.assign(serverAudit, { setup: 0, mounted: 0, disposed: 0 });
		const context = createSsrContext({
			markers: false,
			enhancementCatalog: new Map([
				['provider', ServerContextProvider],
				['consumer', ServerContextConsumer]
			])
		});
		expect(() =>
			renderPreparedFragmentEnhancements(context, [...entries].reverse(), target, undefined, {})
		).toThrow(/source order conflict.*consumer.*provider/);
		expect(serverAudit.setup).toBe(0);
		expect(await renderPreparedFragmentEnhancements(context, entries, target, undefined, {})).toBe(
			'<span title="provided">context</span>'
		);
		expect(serverAudit).toEqual({ setup: 2, mounted: 0, disposed: 2 });
	});
	it('keeps a ref-only contribution host across adoption', async () => {
		const entries = [{ identity: 'ref', props: {} }];
		const target = createCompiledFragmentReceipt(null, 'ref text');
		const context = createSsrContext({
			enhancementCatalog: new Map([['ref', ServerRefOnlyEnhancement]])
		});
		const container = document.createElement('div');
		container.innerHTML = await renderPreparedFragmentEnhancements(
			context,
			entries,
			target,
			undefined,
			{}
		);
		const span = container.querySelector('span');
		expect(span).not.toBeNull();
		expect(span!.attributes).toHaveLength(0);
		const root = createRendererRoot(
			container,
			target,
			{ enhancementCatalog: new Map([['ref', RefOnlyEnhancement]]) },
			{ version: 1, mode: 'hydrated' }
		);
		const mounted = mountPreparedFragmentEnhancements(
			root,
			entries,
			target,
			undefined,
			undefined,
			container,
			new Map(),
			{
				attach(output, scope) {
					const adopted = adoptStaticChildren(
						root,
						[output],
						[...container.childNodes],
						undefined,
						scope
					);
					if (!adopted || adopted.length !== 1) throw new Error('Ref-only host did not match');
					return adopted[0]!;
				}
			}
		);
		try {
			expect(container.querySelector('span')).toBe(span);
		} finally {
			disposeMounted(container, mounted);
		}
	});
	it.each([false, true])(
		'constructs each enhancement once during adoption (replace: %s)',
		async (replace) => {
			const entries = [
				{ identity: 'outer', props: {} },
				{ identity: 'inner', props: {} }
			];
			const target = createCompiledFragmentReceipt(null, 'adopted text');
			const context = createSsrContext({
				enhancementCatalog: new Map([
					['outer', ServerEnhancement],
					['inner', ServerEnhancement]
				])
			});
			const container = document.createElement('div');
			container.innerHTML = await renderPreparedFragmentEnhancements(
				context,
				entries,
				target,
				undefined,
				{}
			);
			if (replace) {
				const opening = [...container.childNodes].find(
					(node) => node instanceof Comment && node.data.startsWith('exact:component:')
				) as Comment;
				const closing = [...container.childNodes].find(
					(node) => node instanceof Comment && node.data === `/${opening.data}`
				) as Comment;
				opening.data += '-stale';
				closing.data = `/${opening.data}`;
			}
			const span = container.querySelector('span')!;
			const text = [...span.childNodes].find(
				(node) => node.nodeType === Node.TEXT_NODE && node.textContent
			);
			const root = createRendererRoot(
				container,
				target,
				{
					enhancementCatalog: new Map([
						['outer', PreparedEnhancement],
						['inner', PreparedEnhancement]
					])
				},
				{ version: 1, mode: 'hydrated' }
			);
			const mounted = mountPreparedFragmentEnhancements(
				root,
				entries,
				target,
				undefined,
				undefined,
				container,
				new Map(),
				{
					attach(output, scope) {
						const adopted = adoptStaticChildren(
							root,
							[output],
							[...container.childNodes],
							undefined,
							scope
						);
						if (!adopted || adopted.length !== 1)
							throw new Error('Prepared fragment did not match server output');
						return adopted[0]!;
					}
				}
			);
			try {
				if (replace) expect(container.querySelector('span')).not.toBe(span);
				else expect(container.querySelector('span')).toBe(span);
				expect([...span.childNodes]).toContain(text);
				expect(preparationAudit).toEqual({ setup: 2, mounted: 2, disposed: 0 });
				preparationInstance!.state.label = 'adopted update';
				flushSync();
				if (replace) expect(container.querySelector('span')).not.toBe(span);
				else expect(container.querySelector('span')).toBe(span);
				expect(container.querySelector('span')!.title).toBe('adopted update');
			} finally {
				disposeMounted(container, mounted);
			}
			expect(preparationAudit.disposed).toBe(2);
		}
	);
	it.each([false, true])(
		'prepares the same shared hosts through request-owned server sinks (mixed tags: %s)',
		async (mixed) => {
			Object.assign(serverAudit, { setup: 0, mounted: 0, disposed: 0 });
			const context = createSsrContext({
				markers: false,
				enhancementCatalog: new Map([
					['outer', ServerEnhancement],
					['inner', ServerEnhancement]
				])
			});
			const html = await renderPreparedFragmentEnhancements(
				context,
				[
					{ identity: 'outer', props: {} },
					{ identity: 'inner', props: {} }
				],
				createCompiledFragmentReceipt(null, 'owned text'),
				undefined,
				{},
				new Map(mixed ? [['outer', 'em']] : [])
			);
			expect(html).toBe(
				mixed
					? '<em title="prepared"><span title="prepared">owned text</span></em>'
					: '<span title="prepared">owned text</span>'
			);
			expect(serverAudit).toEqual({ setup: 2, mounted: 0, disposed: 2 });
		}
	);
	it.each([false, true])(
		'retains separate component owners across planned hosts (mixed tags: %s)',
		(mixed) => {
			const target = createCompiledFragmentReceipt(null, 'owned text');
			const container = document.createElement('div');
			const entries = [
				{ identity: 'outer', props: {} },
				{ identity: 'inner', props: {} }
			];
			const root = createRendererRoot(
				container,
				target,
				{
					enhancementCatalog: new Map([
						['outer', PreparedEnhancement],
						['inner', PreparedEnhancement]
					])
				},
				{ version: 1 }
			);
			const mounted = mountPreparedFragmentEnhancements(
				root,
				entries,
				target,
				undefined,
				undefined,
				container,
				new Map(mixed ? [['outer', 'em']] : [])
			);
			const scope = mounted.scope;
			try {
				expect(preparationAudit).toEqual({ setup: 2, mounted: 0, disposed: 0 });
				placeMountedBefore(root, container, mounted);
				expect(preparationAudit).toEqual({ setup: 2, mounted: 2, disposed: 0 });
				expect(container.querySelectorAll('span')).toHaveLength(1);
				expect(container.querySelectorAll('em')).toHaveLength(mixed ? 1 : 0);
				const span = container.querySelector('span')!;
				const text = [...span.childNodes].find(
					(node) => node.nodeType === Node.TEXT_NODE && node.textContent
				);
				expect(span.textContent).toBe('owned text');
				if (mixed) expect(container.querySelector('em')!.contains(span)).toBe(true);
				preparationInstance!.state.label = 'inner update';
				flushSync();
				expect(container.querySelector('span')).toBe(span);
				expect([...span.childNodes]).toContain(text);
				expect(span.title).toBe('inner update');
				expect(preparationAudit.setup).toBe(2);
			} finally {
				disposeMounted(container, mounted);
			}
			expect(scope.active).toBe(false);
			expect(preparationAudit.disposed).toBe(2);
			expect(root.preparedComponents).toBeUndefined();
		}
	);
});
