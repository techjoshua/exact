/**
 * @vitest-environment jsdom
 */
import {
	createEnhancementMarker,
	type Child,
	type Component,
	type LogEvent,
	type Logger,
	type RootLifecycle
} from '@exactjs/core';
import { markTestComponent } from '@exactjs/testing/internal/fixtures';
import { describe, expect, it, vi } from 'vitest';
import { render } from './index.js';
import { createVNode } from './test-support/native-vnode.js';

const identity = '@test/motion#motion';

describe('renderer enhancements', () => {
	it('activates a transparent plugin as an ordinary component around its intrinsic target', () => {
		const setup = vi.fn();
		let target!: RootLifecycle<HTMLElement>;
		const Motion = markTestComponent(function Motion(
			this: Component<{}>,
			props: { children?: Child }
		) {
			setup();
			target = this.refs.root<HTMLElement>();
			return () => props.children;
		});
		const button = createVNode('button', {
			id: 'save',
			__exactEnhancements: createEnhancementMarker([{ identity, props: { preset: 'fade' } }])
		});
		const container = document.createElement('div');

		render(button, container, { enhancementCatalog: new Map([[identity, Motion]]) });

		expect(container.innerHTML).toBe('<button id="save"></button>');
		expect(setup).toHaveBeenCalledTimes(1);
		expect(target.current).toBe(container.firstElementChild);
		expect(target.presented).toBe(true);
	});

	it('allows an active plugin component to wrap its target', () => {
		const released = vi.fn();
		const Wrapper = markTestComponent(function Wrapper(
			this: Component<{}>,
			props: { children?: Child; className?: string }
		) {
			this.onUnmount(released);
			return () => createVNode('div', { className: props.className }, props.children);
		});
		const container = document.createElement('div');
		const marker = createEnhancementMarker([{ identity, props: { className: 'motion-shell' } }]);

		render(createVNode('button', { __exactEnhancements: marker }, 'Save'), container, {
			enhancementCatalog: new Map([[identity, Wrapper]])
		});

		expect(container.innerHTML).toBe('<div class="motion-shell"><button>Save</button></div>');

		const updated = createEnhancementMarker([
			{ identity, props: { className: 'motion-shell updated' } }
		]);
		render(createVNode('button', { __exactEnhancements: updated }, 'Saved'), container, {
			enhancementCatalog: new Map([[identity, Wrapper]])
		});
		expect(container.innerHTML).toBe(
			'<div class="motion-shell updated"><button>Saved</button></div>'
		);
		const target = container.querySelector('button');

		render(createVNode('button', null, 'Plain'), container, {
			enhancementCatalog: new Map([[identity, Wrapper]])
		});
		expect(container.innerHTML).toBe('<button>Plain</button>');
		expect(container.firstElementChild).toBe(target);
		expect(released).toHaveBeenCalledOnce();
	});

	it('forwards declarations through components and merges nearest props at an explicit target', () => {
		const setup = vi.fn();
		const Motion = markTestComponent(function Motion(
			this: Component<{}>,
			props: { children?: Child; tone?: string }
		) {
			setup(props.tone);
			return () => createVNode('div', { className: props.tone }, props.children);
		});
		const Card = markTestComponent(function Card(this: Component<{}>) {
			return () =>
				createVNode(
					'section',
					null,
					createVNode(
						'button',
						{
							__exactEnhancements: createEnhancementMarker([
								{ identity, props: { tone: 'near' }, root: true }
							])
						},
						'Save'
					)
				);
		});
		const container = document.createElement('div');

		render(
			createVNode(Card, {
				__exactEnhancements: createEnhancementMarker([{ identity, props: { tone: 'far' } }])
			}),
			container,
			{ enhancementCatalog: new Map([[identity, Motion]]) }
		);

		expect(container.innerHTML).toBe(
			'<section><div class="near"><button>Save</button></div></section>'
		);
		expect(setup).toHaveBeenCalledOnce();
		expect(setup).toHaveBeenCalledWith('near');
	});

	it('leaves unavailable enhancements inert and warns once per root identity', () => {
		const events: LogEvent[] = [];
		const logger: Logger = { log: (event) => events.push(event) };
		const marker = createEnhancementMarker([{ identity, props: { preset: 'fade' } }]);
		const container = document.createElement('div');

		render(createVNode('button', { __exactEnhancements: marker }, 'Save'), container, { logger });
		render(createVNode('button', { __exactEnhancements: marker }, 'Save'), container, { logger });

		expect(container.innerHTML).toBe('<button>Save</button>');
		const warnings = events.filter((event) => event.level === 'warn');
		expect(warnings).toHaveLength(1);
		expect(warnings[0]?.message).toContain(identity);
	});
});
