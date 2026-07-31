import type { ExactRuntimeInspectionEvent } from '@exactjs/devtools-protocol';
import { describe, expect, it } from 'vitest';
import { createExactClientEventStore } from './client-events.js';

describe('attached client event storage', () => {
	it('bounds retained history and isolates subscriber failures', () => {
		const store = createExactClientEventStore(2, 100_000);
		let delivered = 0;
		store.subscribe(undefined, undefined, () => {
			throw new Error('consumer failed');
		});
		store.subscribe(undefined, undefined, () => delivered++);
		store.publish(event(1));
		store.publish(event(2));
		store.publish(event(3));

		expect(delivered).toBe(3);
		expect(store.query().map((entry) => entry.sequence)).toEqual([2, 3]);
	});
});

function event(sequence: number): ExactRuntimeInspectionEvent {
	return {
		protocol: 1,
		cursor: sequence.toString(36),
		sequence,
		timestamp: sequence,
		kind: 'state.change',
		id: {
			sessionId: 'session',
			side: 'client',
			buildKey: 'a'.repeat(40),
			executionRoot: 'page',
			componentTypeId: 'component:Page'
		}
	};
}
