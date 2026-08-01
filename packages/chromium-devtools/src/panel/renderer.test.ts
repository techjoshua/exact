// @vitest-environment jsdom
import type {
	ExactInspectedRuntimeComponent,
	ExactRuntimeInspectionEvent
} from '@exactjs/devtools-protocol';
import { describe, expect, it, vi } from 'vitest';
import type { ExactDevtoolsPanelModel } from './model.js';
import { renderExactComponentsView, renderExactProfilerView } from './renderer.js';

describe('Chromium panel presentation', () => {
	it('renders every durable component instance as a selectable tree node', () => {
		const first = component('first');
		const second = component('second');
		const model = panelModel([first, second], first);
		const container = document.createElement('main');
		const selectComponent = vi.fn();

		renderExactComponentsView(container, model, { selectComponent });

		expect(container.querySelectorAll('.tree-node')).toHaveLength(2);
		expect(container.querySelectorAll('.tree-node')[1]?.textContent).toContain('Card');
		expect(container.querySelectorAll('.instance-chip')).toHaveLength(0);
		(container.querySelectorAll('.tree-node')[1] as HTMLButtonElement).click();
		expect(selectComponent).toHaveBeenCalledWith(second.id);
	});

	it('preserves component view position and disclosures across live updates', () => {
		const first = component('first');
		const container = document.createElement('main');
		const actions = { selectComponent: vi.fn() };
		renderExactComponentsView(container, panelModel([first], first), actions);

		const tree = container.querySelector<HTMLElement>('[data-panel-scroll-key="component-tree"]')!;
		const details = container.querySelector<HTMLElement>(
			'[data-panel-scroll-key^="component-details:"]'
		)!;
		const state = container.querySelector<HTMLDetailsElement>(
			'[data-panel-disclosure-key="preview:State"]'
		)!;
		const contexts = container.querySelector<HTMLDetailsElement>(
			'[data-panel-disclosure-key="contexts"]'
		)!;
		tree.scrollTop = 73;
		details.scrollTop = 141;
		state.open = false;
		contexts.open = true;

		const updated = {
			...first,
			state: {
				kind: 'object' as const,
				type: 'Object',
				entries: [{ key: 'count', value: { kind: 'scalar' as const, value: 2 } }],
				truncated: false
			}
		};
		renderExactComponentsView(container, panelModel([updated], updated), actions);

		expect(
			container.querySelector<HTMLElement>('[data-panel-scroll-key="component-tree"]')?.scrollTop
		).toBe(73);
		expect(
			container.querySelector<HTMLElement>('[data-panel-scroll-key^="component-details:"]')
				?.scrollTop
		).toBe(141);
		expect(
			container.querySelector<HTMLDetailsElement>('[data-panel-disclosure-key="preview:State"]')
				?.open
		).toBe(false);
		expect(
			container.querySelector<HTMLDetailsElement>('[data-panel-disclosure-key="contexts"]')?.open
		).toBe(true);
		expect(container.textContent).toContain('2');
	});

	it('starts at the top when selecting a different component', () => {
		const first = component('first');
		const second = component('second');
		const container = document.createElement('main');
		const actions = { selectComponent: vi.fn() };
		renderExactComponentsView(container, panelModel([first, second], first), actions);
		container.querySelector<HTMLElement>('[data-panel-scroll-key="component-tree"]')!.scrollTop =
			77;
		container.querySelector<HTMLElement>(
			'[data-panel-scroll-key^="component-details:"]'
		)!.scrollTop = 120;

		renderExactComponentsView(container, panelModel([first, second], second), actions);

		expect(
			container.querySelector<HTMLElement>('[data-panel-scroll-key^="component-details:"]')
				?.scrollTop
		).toBe(0);
		expect(
			container.querySelector<HTMLElement>('[data-panel-scroll-key="component-tree"]')?.scrollTop
		).toBe(77);
	});

	it('renders one profiler lane per component type with every captured event marker', () => {
		const first = component('first');
		const second = component('second');
		const model = panelModel([first, second], first);
		const container = document.createElement('main');
		const events = [
			event(1, 10, 'state.change', first),
			event(2, 12, 'task.renderer.commit', second)
		];

		renderExactProfilerView(container, model, events, false, { selectComponent: vi.fn() });

		expect(container.querySelectorAll('.waterfall-row')).toHaveLength(1);
		expect(container.querySelectorAll('.waterfall-bar')).toHaveLength(2);
		expect(container.querySelector('.waterfall-label')?.textContent).toContain('2 events');
		expect(container.querySelector('.waterfall-label')?.textContent).toContain('1 changes');
	});

	it('distinguishes a completed empty capture from the initial profiler prompt', () => {
		const first = component('first');
		const container = document.createElement('main');

		renderExactProfilerView(
			container,
			panelModel([first], first),
			[],
			false,
			{ selectComponent: vi.fn() },
			true
		);

		expect(container.textContent).toContain('No framework activity captured');
	});
});

function panelModel(
	components: readonly ExactInspectedRuntimeComponent[],
	selected: ExactInspectedRuntimeComponent
): ExactDevtoolsPanelModel {
	return {
		sessionId: 'session',
		components,
		selected,
		state: { state: selected.state, props: selected.props },
		contexts: [],
		tasks: [],
		timeline: [],
		microfrontends: []
	};
}

function component(instanceId: string): ExactInspectedRuntimeComponent {
	return {
		id: {
			sessionId: 'session',
			side: 'client',
			buildKey: 'build',
			executionRoot: 'page',
			componentTypeId: 'component:Card',
			instanceId
		},
		name: 'Card',
		status: 'mounted',
		props: { kind: 'object', type: 'Object', entries: [], truncated: false },
		state: {
			kind: 'object',
			type: 'Object',
			entries: [{ key: 'count', value: { kind: 'scalar', value: 1 } }],
			truncated: false
		},
		contexts: [],
		tasks: [],
		ownedElements: 1
	};
}

function event(
	sequence: number,
	timestamp: number,
	kind: ExactRuntimeInspectionEvent['kind'],
	component: ExactInspectedRuntimeComponent
): ExactRuntimeInspectionEvent {
	return {
		protocol: 1,
		cursor: String(sequence),
		sequence,
		timestamp,
		kind,
		id: component.id,
		interactionId: 'interaction'
	};
}
