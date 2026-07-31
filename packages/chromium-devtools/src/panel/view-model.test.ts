import type {
	ExactInspectedRuntimeComponent,
	ExactRuntimeInspectionEvent
} from '@exactjs/devtools-protocol';
import { describe, expect, it } from 'vitest';
import {
	buildExactComponentForest,
	buildExactProfilerFrames,
	formatExactProfilerDuration
} from './view-model.js';

describe('Chromium panel view model', () => {
	it('builds component hierarchy even when children arrive before parents', () => {
		const parent = component('parent', 'App');
		const child = { ...component('child', 'Card'), parent: parent.id };

		const forest = buildExactComponentForest([child, parent]);

		expect(forest).toHaveLength(1);
		expect(forest[0]?.component.name).toBe('App');
		expect(forest[0]?.children[0]?.component.name).toBe('Card');
	});

	it('keeps every durable instance visible in the component hierarchy', () => {
		const first = component('first', 'Card');
		const second = {
			...component('second', 'Card'),
			id: { ...component('second', 'Card').id, componentTypeId: first.id.componentTypeId }
		};

		const forest = buildExactComponentForest([first, second]);

		expect(forest).toHaveLength(2);
		expect(forest.map((node) => node.component.id.instanceId)).toEqual(['first', 'second']);
	});

	it('captures explicit frames with the reactive events that occur inside them', () => {
		const frames = buildExactProfilerFrames([
			event(1, 'task.frame.enter', 10),
			event(2, 'state.change', 12),
			event(3, 'task.renderer.commit', 16),
			event(4, 'task.frame.exit', 18)
		]);

		expect(frames).toHaveLength(1);
		expect(frames[0]?.events.map((item) => item.kind)).toEqual([
			'task.frame.enter',
			'state.change',
			'task.renderer.commit',
			'task.frame.exit'
		]);
		expect(formatExactProfilerDuration(frames[0]!.end - frames[0]!.start)).toBe('8.00 ms');
	});

	it('groups correlated work when no explicit frame markers are available', () => {
		const first = { ...event(1, 'interaction', 5), interactionId: 'click-1' };
		const second = { ...event(2, 'state.change', 7), interactionId: 'click-1' };

		expect(buildExactProfilerFrames([first, second])).toMatchObject([
			{ label: 'Interaction', events: [{ sequence: 1 }, { sequence: 2 }] }
		]);
	});
});

function component(instanceId: string, name: string): ExactInspectedRuntimeComponent {
	return {
		id: identity(instanceId),
		name,
		status: 'mounted',
		props: { kind: 'object', type: 'Object', entries: [], truncated: false },
		state: { kind: 'object', type: 'Object', entries: [], truncated: false },
		contexts: [],
		tasks: [],
		ownedElements: 1
	};
}

function event(
	sequence: number,
	kind: ExactRuntimeInspectionEvent['kind'],
	timestamp: number
): ExactRuntimeInspectionEvent {
	return {
		protocol: 1,
		cursor: String(sequence),
		sequence,
		timestamp,
		kind,
		id: identity('child')
	};
}

function identity(instanceId: string) {
	return {
		sessionId: 'session',
		side: 'client' as const,
		buildKey: 'build',
		executionRoot: 'page',
		componentTypeId: `component:${instanceId}`,
		instanceId
	};
}
