import { verifyClientEventOwnership } from '../../component-composition-corpus/test-support/inspection-event-journey.mjs';
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

it('captures event inputs and returns independent ordinary query and listener observations', () => {
	const store = createExactClientEventStore(10, 100_000);
	const input = { ...event(1), attributes: { count: 1 } };
	store.subscribe(undefined, undefined, (value) => {
		(value.attributes as Record<string, number>).count = 2;
		const writable: { sequence: number } = value;
		writable.sequence = 99;
	});
	const seen: number[] = [];
	store.subscribe(undefined, undefined, (value) => seen.push(value.sequence));
	store.publish(input);
	input.attributes.count = 3;
	const values = store.query();
	expect(values[0]?.attributes).toEqual({ count: 1 });
	(values[0]!.attributes as Record<string, number>).count = 4;
	(values as unknown[]).length = 0;
	expect(store.query()[0]?.attributes).toEqual({ count: 1 });
	expect(seen).toEqual([1]);
	store.clear();
});

it('delivers reentrant live publication and replay in sequence order without gaps', () => {
	const store = createExactClientEventStore(10, 100_000);
	const first: number[] = [],
		second: number[] = [];
	store.subscribe(undefined, undefined, (value) => {
		first.push(value.sequence);
		if (value.sequence === 1) store.publish(event(2));
	});
	store.subscribe(undefined, undefined, (value) => second.push(value.sequence));
	store.publish(event(1));
	expect(first).toEqual([1, 2]);
	expect(second).toEqual([1, 2]);
	const replay: number[] = [];
	store.subscribe(undefined, undefined, (value) => {
		replay.push(value.sequence);
		if (value.sequence === 1) store.publish(event(3));
	});
	expect(replay).toEqual([1, 2, 3]);
	store.clear();
});

it('validates retention budgets while preserving zero-history live delivery', () => {
	for (const invalid of [NaN, Infinity, -1, 1.5]) {
		expect(() => createExactClientEventStore(invalid, 100_000)).toThrow(RangeError);
		expect(() => createExactClientEventStore(10, invalid)).toThrow(RangeError);
	}
	const store = createExactClientEventStore(0, 100_000);
	let received = 0;
	store.subscribe(undefined, undefined, () => received++);
	store.publish(event(1));
	expect(store.query()).toEqual([]);
	expect(received).toBe(1);
	store.clear();
	const disabled = createExactClientEventStore(10, 0);
	disabled.publish(event(1));
	expect(disabled.query()).toEqual([]);
	disabled.clear();
});

it('fences queued targets across unsubscribe, clear and replacement subscriptions', () => {
	const store = createExactClientEventStore(10, 100_000);
	const seen: number[] = [];
	let remove = () => {};
	store.subscribe(undefined, undefined, (value) => {
		if (value.sequence === 1) remove();
	});
	remove = store.subscribe(undefined, undefined, (value) => seen.push(value.sequence));
	store.publish(event(1));
	expect(seen).toEqual([]);
	store.clear();
	store.publish(event(1));
	store.publish(event(2));
	const replay: number[] = [];
	store.subscribe(undefined, undefined, (value) => {
		replay.push(value.sequence);
		store.clear();
		store.subscribe(undefined, undefined, (next) => seen.push(next.sequence));
		store.publish(event(3));
	});
	expect(replay).toEqual([1]);
	expect(seen).toEqual([1]);
	store.clear();
});

it('queues new subscribers once and handles deep reentrant publication iteratively', () => {
	const store = createExactClientEventStore(10, 100_000);
	const late: number[] = [];
	store.subscribe(undefined, undefined, (value) => {
		if (value.sequence === 1)
			store.subscribe(undefined, undefined, (next) => late.push(next.sequence));
		if (value.sequence < 2000) store.publish(event(value.sequence + 1));
	});
	store.publish(event(1));
	expect(late).toHaveLength(2000);
	expect(late[0]).toBe(1);
	expect(late[1999]).toBe(2000);
	store.clear();
});

it('allocates sequence after capture and retires capture interrupted by clear', () => {
	const store = createExactClientEventStore(10, 100_000);
	const nested = {
		...event(1),
		toJSON() {
			store.publish(event(1));
			return event(2);
		}
	};
	store.publish(nested);
	expect(store.query().map((entry) => entry.sequence)).toEqual([1, 2]);
	const cleared = {
		...event(1),
		toJSON() {
			store.clear();
			return event(3);
		}
	};
	store.publish(cleared);
	expect(store.query()).toEqual([]);
	const cyclic = { ...event(1), attributes: {} };
	Object.assign(cyclic.attributes, { cyclic });
	expect(() => store.publish(cyclic)).toThrow();
	store.publish(event(1));
	expect(store.query().map((entry) => entry.sequence)).toEqual([1]);
	store.clear();
});

it('runs the shared client event ownership journey', () => {
	expect(verifyClientEventOwnership({ createExactClientEventStore })).toBe(true);
});
