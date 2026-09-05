/**
 * @vitest-environment jsdom
 */
import './structural-boundaries.js';
import './framework/enhancements.js';
import '@exactjs/core/runtime/refs';
import {
	Activity,
	createEnhancementNode,
	Target,
	type LogEvent,
	type Logger,
	type RootLifecycle
} from '@exactjs/core';
import { computed, flushSync, reactive } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import { renderTestTree as render } from './testing.js';
import {
	createCompiledComponentOperation,
	createOperation
} from './test-support/native-operations.js';
import {
	getRoutingCardOwner,
	getRoutingSelectorOwner,
	RoutingBoundary,
	RoutingCycleLeft,
	RoutingCycleRight,
	RoutingDualBoundary,
	RoutingDynamicCard,
	RoutingLeftShell,
	RoutingNearCard,
	RoutingOrderingConsumer,
	RoutingOrderingProvider,
	RoutingPortalCard,
	RoutingPortalMotion,
	RoutingRightShell,
	RoutingSelectorBoundary,
	RoutingToneMotion
} from './test-support/enhancements/enhancement-behavior.fixtures.js';
import { motion as RoutingMotion } from './test-support/enhancements/enhancement-routing-motion.fixtures.js';

const identity = './enhancement-routing.fixtures.js#motion';

describe('renderer enhancement target routing', () => {
	it('retains target identity and contributions while Activity parks and restores output', () => {
		const state = reactive({ mode: 'active' as 'active' | 'parked' });
		const container = document.createElement('div');
		render(
			createOperation(
				Activity,
				{ mode: computed(() => state.mode) },
				createOperation(Target, { className: 'owned' }, createOperation('button', null, 'Retained'))
			),
			container
		);
		const button = container.querySelector('button')!;
		expect(button.className).toBe('owned');

		state.mode = 'parked';
		flushSync();
		expect(container.querySelector('button')).toBeNull();
		expect(button.className).toBe('owned');

		state.mode = 'active';
		flushSync();
		expect(container.querySelector('button')).toBe(button);
		expect(button.className).toBe('owned');
	});

	it('forwards declarations through components and merges nearest props at an explicit target', () => {
		const setup = vi.fn();
		const container = document.createElement('div');

		render(
			createCompiledComponentOperation(RoutingNearCard, {
				__exactEnhancements: createEnhancementNode([
					{ identity, props: { tone: 'far', onSetup: setup } }
				])
			}),
			container,
			{ enhancementCatalog: new Map([[identity, RoutingToneMotion]]) }
		);

		expect(container.querySelector('section > div.near > button')?.textContent).toBe('Save');
		expect(setup).toHaveBeenCalledOnce();
		expect(setup).toHaveBeenCalledWith('near');
	});

	it('reroutes a reactive explicit target without activating root-only selector entries', async () => {
		const roots: RootLifecycle<HTMLElement>[] = [];
		const released = vi.fn();
		const tree = (left: boolean) =>
			createCompiledComponentOperation(RoutingBoundary, {
				left,
				__exactEnhancements: createEnhancementNode([
					{
						identity,
						props: {
							preset: 'fade',
							onRoot: (root: RootLifecycle<HTMLElement>) => roots.push(root),
							onUnmount: released
						}
					}
				])
			});
		const container = document.createElement('div');
		const options = { enhancementCatalog: new Map([[identity, RoutingMotion]]) };

		render(tree(true), container, options);
		expect(roots).toHaveLength(1);
		expect(roots[0]?.current?.id).toBe('left');

		render(tree(false), container, options);
		expect(
			Array.from(container.querySelectorAll('button'), (button) => [button.id, button.textContent])
		).toEqual([
			['left', 'Left'],
			['right', 'Right']
		]);
		expect(roots.map((root) => root.current?.id)).toEqual([undefined, 'right']);
		expect(roots[0]?.release?.reason).toBe('enhancement-target-rerouted');
		await vi.waitFor(() => expect(released).toHaveBeenCalledOnce());
	});

	it('observes root selector slots without requiring a component rerender', () => {
		const roots: RootLifecycle<HTMLElement>[] = [];
		const container = document.createElement('div');

		render(
			createCompiledComponentOperation(RoutingSelectorBoundary, {
				__exactEnhancements: createEnhancementNode([
					{
						identity,
						props: {
							preset: 'fade',
							onRoot: (root: RootLifecycle<HTMLElement>) => roots.push(root)
						}
					}
				])
			}),
			container,
			{ enhancementCatalog: new Map([[identity, RoutingMotion]]) }
		);
		expect(roots[0]?.current?.id).toBe('left');

		getRoutingSelectorOwner().state.left = false;
		flushSync();

		expect(roots).toHaveLength(2);
		expect(roots[1]?.current?.id).toBe('right');
	});

	it('leaves unavailable enhancements inert and warns once per root identity', () => {
		const unavailableIdentity = '@test/unavailable-motion#motion';
		const events: LogEvent[] = [];
		const logger: Logger = { log: (event) => events.push(event) };
		const marker = createEnhancementNode([
			{ identity: unavailableIdentity, props: { preset: 'fade' } }
		]);
		const container = document.createElement('div');

		render(createOperation('button', { __exactEnhancements: marker }, 'Save'), container, {
			logger
		});
		render(createOperation('button', { __exactEnhancements: marker }, 'Save'), container, {
			logger
		});

		expect(container.innerHTML).toBe('<button>Save</button>');
		const warnings = events.filter((event) => event.level === 'warn');
		expect(warnings).toHaveLength(1);
		expect(warnings[0]?.message).toContain(unavailableIdentity);
	});

	it('orders co-targeted components from context token effects before setup', () => {
		const observed: string[] = [];
		const providerIdentity = '@test/z-provider#default';
		const consumerIdentity = '@test/a-consumer#default';
		const marker = createEnhancementNode([
			{ identity: consumerIdentity, props: { onSetup: (value: string) => observed.push(value) } },
			{ identity: providerIdentity, props: { onSetup: (value: string) => observed.push(value) } }
		]);
		const container = document.createElement('div');

		render(createOperation('button', { __exactEnhancements: marker }), container, {
			enhancementCatalog: new Map([
				[consumerIdentity, RoutingOrderingConsumer],
				[providerIdentity, RoutingOrderingProvider]
			])
		});

		expect(observed).toEqual(['provider', 'consumer:ready']);
	});

	it('rejects context ordering cycles before enhancement setup', () => {
		const setup = vi.fn();
		const marker = createEnhancementNode([
			{ identity: '@test/left#default', props: { onSetup: setup } },
			{ identity: '@test/right#default', props: { onSetup: setup } }
		]);
		const container = document.createElement('div');
		const reported = vi.spyOn(console, 'error').mockImplementation(() => {});

		try {
			render(createOperation('button', { __exactEnhancements: marker }), container, {
				enhancementCatalog: new Map([
					['@test/left#default', RoutingCycleLeft],
					['@test/right#default', RoutingCycleRight]
				])
			});
			expect(reported).toHaveBeenCalledOnce();
			expect(setup).not.toHaveBeenCalled();
			expect(container.querySelector('[role="alert"]')?.textContent).toContain(
				'Enhancement context ordering cycle: @test/left#default, @test/right#default'
			);
		} finally {
			reported.mockRestore();
		}
	});

	it('lets different enhancements select and structurally wrap different logical targets', () => {
		const leftIdentity = './enhancement-routing-left.fixtures.js#left';
		const rightIdentity = './enhancement-routing-right.fixtures.js#right';
		const container = document.createElement('div');
		render(
			createCompiledComponentOperation(RoutingDualBoundary, {
				__exactEnhancements: createEnhancementNode([
					{ identity: leftIdentity, props: {} },
					{ identity: rightIdentity, props: {} }
				])
			}),
			container,
			{
				enhancementCatalog: new Map([
					[leftIdentity, RoutingLeftShell],
					[rightIdentity, RoutingRightShell]
				])
			}
		);

		expect(container.querySelector('.left-shell > #left')).not.toBeNull();
		expect(container.querySelector('.right-shell > #right')).not.toBeNull();
	});

	it('reroutes an ancestor declaration when a dynamic branch introduces an explicit target', () => {
		const roots: RootLifecycle<HTMLElement>[] = [];
		const container = document.createElement('div');
		render(
			createCompiledComponentOperation(RoutingDynamicCard, {
				__exactEnhancements: createEnhancementNode([
					{
						identity,
						props: {
							preset: 'fade',
							onRoot: (root: RootLifecycle<HTMLElement>) => roots.push(root)
						}
					}
				])
			}),
			container,
			{ enhancementCatalog: new Map([[identity, RoutingMotion]]) }
		);
		expect(roots[0]?.current).toBe(container.querySelector('section'));

		getRoutingCardOwner().state.explicit = true;
		flushSync();

		expect(roots).toHaveLength(2);
		expect(roots[0]?.current).toBeUndefined();
		expect(roots[1]?.current).toBe(container.querySelector('#dynamic'));
	});

	it('resolves explicit targets through logical portal children', () => {
		const portal = document.createElement('div');
		let target!: RootLifecycle<HTMLElement>;
		const container = document.createElement('div');
		render(
			createCompiledComponentOperation(RoutingPortalCard, {
				portal,
				__exactEnhancements: createEnhancementNode([
					{
						identity,
						props: { onRoot: (root: RootLifecycle<HTMLElement>) => (target = root) }
					}
				])
			}),
			container,
			{ enhancementCatalog: new Map([[identity, RoutingPortalMotion]]) }
		);

		expect(target.current).toBe(portal.querySelector('#portal-target'));
		expect(container.querySelector('section')).not.toBeNull();
	});
});
import './runtime/target.js';
