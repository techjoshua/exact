import type { ExactRuntimeInspectionEvent } from '@exactjs/devtools-protocol';
import { describe, expect, it } from 'vitest';
import { createExactInspectionEventBuffer } from './event-buffer.js';

describe('server inspection event buffer', () => {
	it('enforces count limits and isolates stream listeners', () => {
		const buffer = createExactInspectionEventBuffer({ maxEvents: 2, maxBytes: 100_000 });
		let delivered = 0;
		buffer.subscribe(undefined, undefined, () => {
			throw new Error('transport closed');
		});
		buffer.subscribe(undefined, undefined, () => delivered++);
		buffer.publish(event(1));
		buffer.publish(event(2));
		buffer.publish(event(3));

		expect(delivered).toBe(3);
		expect(buffer.query().events.map((entry) => entry.sequence)).toEqual([2, 3]);
	});
});

function event(sequence: number): ExactRuntimeInspectionEvent {
	return {
		protocol: 1,
		cursor: sequence.toString(36),
		sequence,
		timestamp: sequence,
		kind: 'continuation.execute',
		id: {
			sessionId: 'session',
			side: 'server',
			buildKey: 'a'.repeat(40),
			executionRoot: 'page',
			componentTypeId: 'component:Page'
		}
	};
}
