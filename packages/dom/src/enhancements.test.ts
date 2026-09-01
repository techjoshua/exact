/**
 * @vitest-environment jsdom
 */
import './framework/enhancements.js';
import '@exactjs/core/runtime/refs';
import {
	createEnhancementNode,
	Fragment,
	Target,
	TargetOverrides,
	type Child,
	type RootLifecycle
} from '@exactjs/core';
import {
	createDynamicChild,
	createPreparedRenderProgram,
	prepareCompiledRenderProgram,
	type ExactRenderProgramBindingTarget
} from '@exactjs/core/runtime/render';
import { computed, flushSync, reactive } from '@exactjs/reactive';
import { indexedReactiveObjects } from '@exactjs/reactive/framework/indexed-objects';
import { createEffectScope } from '@exactjs/reactive/framework/runtime';
import { describe, expect, it, vi } from 'vitest';
import { legacyTestRenderProgram, renderTestTree as render } from './testing.js';
import { inspectDomRoot, type DomInspectionNode } from './testing.js';
import {
	createCompiledComponentOperation,
	createOperation
} from './test-support/native-operations.js';
import {
	applyCompiledProgramText,
	beginCompiledProgramClaims,
	bindCompiledProgramText,
	bindCompiledStateComponentUpdate,
	claimCompiledProgramText
} from './runtime/render-program.js';
import {
	DirectEnhancementConsumer,
	DirectEnhancementProvider,
	ActionContribution,
	AsideWrapper,
	CompiledOwnerProvider,
	EnhancementSurface,
	EnhancementWrapper,
	FieldContribution,
	getReactiveEnhancementOwner,
	InnerContribution,
	LayeredOuter,
	NestedDirectConsumer,
	NestedDirectProvider,
	OuterContribution,
	ReactiveEnhancementApp,
	ReactiveEnhancementProvider,
	reactiveEnhancementIdentity,
	TransparentMotion
} from './test-support/enhancements/enhancement-behavior.fixtures.js';

const identity = '@test/motion#motion';

function* walkInspection(node: DomInspectionNode): Generator<DomInspectionNode> {
	yield node;
	for (const child of node.children) yield* walkInspection(child);
}

describe('renderer enhancements', () => {
	it('activates a transparent enhancement as an ordinary component around its intrinsic target', () => {
		const setup = vi.fn();
		let target!: RootLifecycle<HTMLElement>;
		const button = createOperation('button', {
			id: 'save',
			__exactEnhancements: createEnhancementNode([
				{
					identity,
					props: {
						onSetup: setup,
						onRoot: (root: RootLifecycle<HTMLElement>) => (target = root)
					}
				}
			])
		});
		const container = document.createElement('div');

		render(button, container, { enhancementCatalog: new Map([[identity, TransparentMotion]]) });

		expect(container.innerHTML).toBe('<button id="save"></button>');
		expect(setup).toHaveBeenCalledTimes(1);
		expect(target.current).toBe(container.firstElementChild);
		expect(target.presented).toBe(true);
	});

	it('allows an active enhancement component to wrap its target', () => {
		const released = vi.fn();
		const container = document.createElement('div');
		const marker = createEnhancementNode([
			{ identity, props: { className: 'motion-shell', onUnmount: released } }
		]);

		render(createOperation('button', { __exactEnhancements: marker }, 'Save'), container, {
			enhancementCatalog: new Map([[identity, EnhancementWrapper]])
		});

		expect(container.innerHTML).toBe('<div class="motion-shell"><button>Save</button></div>');

		const updated = createEnhancementNode([
			{ identity, props: { className: 'motion-shell updated', onUnmount: released } }
		]);
		render(createOperation('button', { __exactEnhancements: updated }, 'Saved'), container, {
			enhancementCatalog: new Map([[identity, EnhancementWrapper]])
		});
		expect(container.innerHTML).toBe(
			'<div class="motion-shell updated"><button>Saved</button></div>'
		);
		const target = container.querySelector('button');

		render(createOperation('button', null, 'Plain'), container, {
			enhancementCatalog: new Map([[identity, EnhancementWrapper]])
		});
		expect(container.innerHTML).toBe('<button>Plain</button>');
		expect(container.firstElementChild).toBe(target);
		expect(released).toHaveBeenCalledOnce();
	});

	it('preserves compiler-owned form bindings through target contributions', () => {
		const publish = vi.fn();
		const container = document.createElement('div');

		render(
			createOperation('select', {
				__exactBindChange: publish,
				__exactEnhancements: createEnhancementNode([{ identity, props: {} }])
			}),
			container,
			{ enhancementCatalog: new Map([[identity, FieldContribution]]) }
		);
		container.querySelector('select')!.dispatchEvent(new Event('change', { bubbles: true }));

		expect(publish).toHaveBeenCalledOnce();
		expect(container.querySelector('select')?.className).toBe('field');
	});

	it('preserves compiler-specialized interaction handlers through target contributions', () => {
		const publish = vi.fn();
		const container = document.createElement('div');

		render(
			createOperation(
				'button',
				{
					'__exactClosedInteraction:onClick': publish,
					__exactEnhancements: createEnhancementNode([{ identity, props: {} }])
				},
				'Save'
			),
			container,
			{ enhancementCatalog: new Map([[identity, ActionContribution]]) }
		);
		container.querySelector('button')!.click();

		expect(publish).toHaveBeenCalledOnce();
		expect(container.querySelector('button')?.className).toBe('action');
	});

	it('composes an enhancement directly around an underscore fragment boundary', () => {
		const container = document.createElement('div');

		render(
			createOperation(
				Fragment,
				{ __exactEnhancements: createEnhancementNode([{ identity, props: {} }]) },
				'Before',
				createOperation('strong', null, 'After')
			),
			container,
			{ enhancementCatalog: new Map([[identity, AsideWrapper]]) }
		);

		expect(container.innerHTML).toBe('<aside>Before<strong>After</strong></aside>');
	});

	it('constructs direct target descendants beneath enhancement-provided context', () => {
		const consumerSetups = vi.fn();
		const marker = createEnhancementNode([{ identity, props: { value: 'ready' } }]);
		const container = document.createElement('div');

		render(
			createOperation(
				Fragment,
				{ __exactEnhancements: marker },
				createOperation(
					'div',
					null,
					createOperation(DirectEnhancementConsumer, { onSetup: consumerSetups })
				)
			),
			container,
			{ enhancementCatalog: new Map([[identity, DirectEnhancementProvider]]) }
		);

		expect(container.innerHTML).toBe('<section><div><output>ready</output></div></section>');

		render(
			createOperation(
				Fragment,
				{
					__exactEnhancements: createEnhancementNode([{ identity, props: { value: 'updated' } }])
				},
				createOperation(
					'div',
					null,
					createOperation(DirectEnhancementConsumer, { onSetup: consumerSetups })
				)
			),
			container,
			{ enhancementCatalog: new Map([[identity, DirectEnhancementProvider]]) }
		);

		expect(container.innerHTML).toBe('<section><div><output>updated</output></div></section>');
		expect(consumerSetups).toHaveBeenCalledOnce();
	});

	it('composes multiple direct target contributors around one authored intrinsic', () => {
		const container = document.createElement('div');
		const outerIdentity = '@test/direct-enhancement-outer#outer';
		const innerIdentity = '@test/direct-enhancement-inner#inner';

		render(
			createOperation('input', {
				id: 'search',
				__exactEnhancements: createEnhancementNode([
					{ identity: outerIdentity, props: {} },
					{ identity: innerIdentity, props: {} }
				])
			}),
			container,
			{
				enhancementCatalog: new Map([
					[outerIdentity, OuterContribution],
					[innerIdentity, InnerContribution]
				])
			}
		);

		const input = container.querySelector('input');
		expect(input?.id).toBe('search');
		expect(input?.className).toBe('themed');
		expect(input?.lang).toBe('fr');
	});

	it('keeps compiled updates owned by the authored component through a direct enhancement', () => {
		const updates = {
			bindings: [[0, 1, 0]] as const,
			apply(targets: readonly (object | undefined)[], dirtyLow: number) {
				if ((dirtyLow & 1) !== 0 && targets[0])
					applyCompiledProgramText(targets[0] as ExactRenderProgramBindingTarget, 0);
			}
		};
		const program = prepareCompiledRenderProgram(
			legacyTestRenderProgram({
				version: 6,
				id: '@test/compiled-update-enhancement-owner',
				namespace: 'html',
				template: '<output><!---->\ue000exact:0\ue001<!----></output>',
				directClaims: true,
				bind(target) {
					if (beginCompiledProgramClaims(target, 'output', 'html', 1, 1)) {
						claimCompiledProgramText(target, 0, 0, true);
						return;
					}
					bindCompiledProgramText(target, 0, true);
					bindCompiledStateComponentUpdate(target, 0, updates);
				}
			})
		);
		const ownerScope = createEffectScope();
		const state = indexedReactiveObjects<{ count: number }>(['count']);
		state.count = 0;
		const owner = { state, scope: ownerScope };
		const container = document.createElement('div');

		render(
			createOperation(
				'section',
				{
					__exactEnhancements: createEnhancementNode([{ identity, props: {} }])
				},
				createPreparedRenderProgram(program, [() => state.count], owner)
			),
			container,
			{ enhancementCatalog: new Map([[identity, CompiledOwnerProvider]]) }
		);
		expect(container.innerHTML).toBe('<section class="provided"><output>0</output></section>');

		state.count = 1;
		flushSync();
		expect(container.querySelector('output')?.textContent).toBe('1');
		ownerScope.stop();
	});

	it('nests direct enhancement providers through fragment and intrinsic targets', () => {
		const enhanced = (value: string, child: Child) =>
			createOperation(
				Fragment,
				{
					__exactEnhancements: createEnhancementNode([{ identity, props: { value } }])
				},
				child
			);
		const container = document.createElement('div');

		render(
			enhanced(
				'outer',
				createOperation(
					'main',
					null,
					enhanced('inner', createCompiledComponentOperation(NestedDirectConsumer, null))
				)
			),
			container,
			{ enhancementCatalog: new Map([[identity, NestedDirectProvider]]) }
		);

		expect(container.querySelector('output')?.textContent).toBe('outer/inner');
	});

	it('tracks reactive props owned outside a nested direct provider chain', () => {
		const container = document.createElement('div');
		render(createCompiledComponentOperation(ReactiveEnhancementApp, null), container, {
			enhancementCatalog: new Map([[reactiveEnhancementIdentity, ReactiveEnhancementProvider]])
		});

		getReactiveEnhancementOwner().state.inner = 'updated';
		flushSync();

		expect(container.querySelector('output')?.textContent).toBe('updated');
	});

	it('forwards layered target properties through ordinary component composition', () => {
		const calls: string[] = [];
		const refs = (name: string) => ({
			fulfill(value: unknown) {
				if (value instanceof Element) calls.push(`ref:${name}`);
			}
		});
		const container = document.createElement('div');
		render(
			createCompiledComponentOperation(LayeredOuter, {
				onRef(name: string, value: unknown) {
					if (value instanceof Element) calls.push(`ref:${name}`);
				},
				onEvent: (name: string) => calls.push(name),
				children: createOperation(
					'button',
					{
						title: 'authored',
						className: 'authored shared',
						style: { color: 'green' },
						'aria-describedby': 'authored shared',
						ref: refs('authored'),
						onClick: () => calls.push('authored')
					},
					'Save'
				)
			}),
			container
		);

		const button = container.querySelector('button')!;
		expect(button.title).toBe('authored');
		expect(button.className).toBe('authored shared inner outer');
		expect(button.getAttribute('style')).toContain('color: green');
		expect(button.getAttribute('style')).toContain('padding-top: 4px');
		expect(button.getAttribute('style')).toContain('margin-top: 2px');
		expect(button.getAttribute('aria-describedby')).toBe('authored shared inner outer');
		expect(new Set(calls)).toEqual(new Set(['ref:authored', 'ref:inner', 'ref:outer']));
		calls.length = 0;
		button.click();
		expect(calls).toEqual(['authored', 'inner', 'outer']);
		expect(container.querySelector('section')).not.toBeNull();
	});

	it('keeps target event subscriptions independent and honors immediate propagation stops', () => {
		const calls: string[] = [];
		const container = document.createElement('div');
		render(
			createOperation(
				Target,
				{ onClick: () => calls.push('outer') },
				createOperation(
					Target,
					{ onClick: () => calls.push('inner') },
					createOperation(
						'button',
						{
							onClick: (event: Event) => {
								calls.push('authored');
								event.stopImmediatePropagation();
							}
						},
						'Save'
					)
				)
			),
			container
		);

		container.querySelector('button')!.click();
		expect(calls).toEqual(['authored']);
	});

	it('allows framework projections to replace only declared authored fallbacks', () => {
		const container = document.createElement('div');
		render(
			createOperation(
				Target,
				{ title: 'Translated', [TargetOverrides]: ['title'] },
				createOperation('button', { title: 'Fallback', id: 'stable' }, 'Save')
			),
			container
		);

		expect(container.innerHTML).toBe('<button title="Translated" id="stable">Save</button>');
	});

	it('does not reroute target ownership for unrelated structural changes', () => {
		const state = reactive({ sibling: false });
		const refCalls: unknown[] = [];
		const target = {
			fulfill(value: unknown) {
				refCalls.push(value);
			}
		};
		const container = document.createElement('div');
		render(
			createOperation(
				Fragment,
				null,
				createOperation(Target, { ref: target }, createOperation('button', null, 'Stable')),
				createDynamicChild(() =>
					state.sibling
						? createOperation('aside', null, 'Changed')
						: createOperation('span', null, 'Initial')
				)
			),
			container
		);

		expect(refCalls).toHaveLength(1);
		state.sibling = true;
		flushSync();
		expect(refCalls).toHaveLength(1);
		expect(container.querySelector('button')?.textContent).toBe('Stable');
	});

	it('exposes target owners, live contribution values, and effective props to inspection', () => {
		const state = reactive({ title: 'contributed' });
		const container = document.createElement('div');
		render(
			createOperation(
				Target,
				{ title: computed(() => state.title), className: 'layer' },
				createOperation('button', { className: 'authored' }, 'Inspect')
			),
			container
		);

		state.title = 'updated';
		flushSync();
		const nodes = [...walkInspection(inspectDomRoot(container)!)];
		const boundary = nodes.find((node) => node.target?.selected)!;
		const intrinsic = nodes.find((node) => node.target?.contributions.length)!;
		expect(boundary.target?.selected).toBe(container.querySelector('button'));
		expect(intrinsic.target?.contributions[0]?.props.title).toBe('updated');
		expect(intrinsic.target?.effectiveProps?.className).toBe('authored layer');
	});

	it('uses the same target forwarding when an ordinary component is enhancement-invoked', () => {
		let root!: RootLifecycle<HTMLElement>;
		const container = document.createElement('div');

		render(
			createOperation('input', {
				className: 'authored',
				__exactEnhancements: createEnhancementNode([
					{
						identity,
						props: {
							tone: 'enhanced',
							onRoot: (value: RootLifecycle<HTMLElement>) => (root = value)
						}
					}
				])
			}),
			container,
			{ enhancementCatalog: new Map([[identity, EnhancementSurface]]) }
		);

		const input = container.querySelector('input')!;
		expect(input.className).toBe('authored enhanced');
		expect(input.getAttribute('aria-describedby')).toBe('surface-help');
		expect(container.querySelector('label.surface > small#surface-help')?.textContent).toBe('Help');
		expect(root.current).toBe(input);
	});
});
import './runtime/target.js';
import '@exactjs/core/runtime/contexts';
