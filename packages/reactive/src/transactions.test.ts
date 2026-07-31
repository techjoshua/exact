import { describe, expect, it, vi } from 'vitest';
import {
	batch,
	flushSync,
	reactive,
	registerReactiveListKey,
	unwrap,
	watch,
	writeReactive
} from './index.js';

describe('@exactjs/reactive transactions', () => {
	it('deduplicates scheduling across a compiler-owned transaction', () => {
		const state = reactive({ first: 0, second: 0 });
		const scheduled = vi.fn();
		const render = vi.fn(() => void `${state.first}:${state.second}`);
		watch(render, undefined, { onSchedule: scheduled });

		batch(() => {
			state.first = 1;
			state.second = 2;
		});
		flushSync();

		expect(scheduled).toHaveBeenCalledTimes(1);
		expect(render).toHaveBeenCalledTimes(2);
	});

	it('does not rediscover a synchronously replaced watcher during the same transaction', () => {
		const state = reactive({ first: 0, second: 0 });
		const render = vi.fn(() => void `${state.first}:${state.second}`);
		let stop = () => undefined;
		const bind = () => {
			stop();
			stop = watch(render, bind);
		};
		bind();

		batch(() => {
			state.first = 1;
			state.second = 2;
		});

		expect(render).toHaveBeenCalledTimes(2);
		stop();
	});

	it('tracks reads and batches write notifications', () => {
		const state = reactive({ count: 0 });
		const render = vi.fn(() => void unwrap(state.count));

		watch(render);
		state.count = 1;
		state.count = 2;

		expect(render).toHaveBeenCalledTimes(1);
		flushSync();
		expect(render).toHaveBeenCalledTimes(2);
	});

	it('rolls back object writes and emits no notifications when a batch throws', () => {
		const state = reactive({ record: { title: 'Before', nested: { count: 1 } } });
		const record = state.record;
		const nested = state.record.nested;
		const observer = vi.fn(
			() => `${state.record.title}:${state.record.nested.count}:${'added' in state.record}`
		);
		watch(observer);

		expect(() =>
			batch(() => {
				state.record.title = 'After';
				state.record.nested.count = 2;
				(state.record as typeof state.record & { added?: boolean }).added = true;
				throw new Error('abort');
			})
		).toThrow('abort');
		flushSync();

		expect(state.record).toBe(record);
		expect(state.record.nested).toBe(nested);
		expect(state.record).toEqual({ title: 'Before', nested: { count: 1 } });
		expect(observer).toHaveBeenCalledTimes(1);
	});

	it('preserves identity for structurally equal writes and remains rollback-safe', () => {
		const state = reactive({ record: { title: 'Same' } });
		const record = state.record;

		expect(() =>
			batch(() => {
				state.record = { title: 'Same' };
				expect(state.record).toBe(record);
				throw new Error('abort');
			})
		).toThrow('abort');

		expect(state.record).toBe(record);
	});

	it('rolls back array mutators, length writes, and sparse holes', () => {
		const initial = new Array<string>(4);
		initial[1] = 'one';
		initial[3] = 'three';
		const state = reactive({ items: initial });
		const items = state.items;
		const observer = vi.fn(() => `${state.items.length}:${Reflect.ownKeys(state.items).join(',')}`);
		watch(observer);

		expect(() =>
			batch(() => {
				state.items.splice(0, 2, 'zero');
				state.items.length = 1;
				state.items.push('new');
				throw new Error('abort');
			})
		).toThrow('abort');
		flushSync();

		expect(state.items).toBe(items);
		expect(state.items.length).toBe(4);
		expect(0 in state.items).toBe(false);
		expect(state.items[1]).toBe('one');
		expect(2 in state.items).toBe(false);
		expect(state.items[3]).toBe('three');
		expect(observer).toHaveBeenCalledTimes(1);
	});

	it("rolls back a failed inner batch without discarding its parent's writes", () => {
		const state = reactive({ first: 0, second: 0, third: 0 });
		const seen: string[] = [];
		watch(() => seen.push(`${state.first}:${state.second}:${state.third}`));

		batch(() => {
			state.first = 1;
			try {
				batch(() => {
					state.second = 2;
					throw new Error('inner');
				});
			} catch {}
			state.third = 3;
		});
		flushSync();

		expect(state).toMatchObject({ first: 1, second: 0, third: 3 });
		expect(seen).toEqual(['0:0:0', '1:0:3']);
	});

	it('rolls back successful nested batches when the outer batch fails', () => {
		const state = reactive({ first: 0, second: 0 });
		const observer = vi.fn(() => `${state.first}:${state.second}`);
		watch(observer);

		expect(() =>
			batch(() => {
				state.first = 1;
				batch(() => {
					state.second = 2;
				});
				throw new Error('outer');
			})
		).toThrow('outer');
		flushSync();

		expect(state).toMatchObject({ first: 0, second: 0 });
		expect(observer).toHaveBeenCalledTimes(1);
	});

	it('rolls back compiler reconciliations while retaining nested proxy identity', () => {
		const state = reactive({
			project: { title: 'Before', owner: { name: 'Ada' } },
			records: [
				{ id: 'a', title: 'A' },
				{ id: 'b', title: 'B' }
			]
		});
		registerReactiveListKey(
			state.records,
			(item) => (item as { id: string }).id,
			'Records',
			'member:id'
		);
		const project = state.project;
		const owner = state.project.owner;
		const records = state.records;
		const first = state.records[0];

		expect(() =>
			batch(() => {
				writeReactive(state, ['project'], { title: 'After', owner: { name: 'Grace' } });
				writeReactive(
					state,
					['records'],
					[
						{ id: 'b', title: 'Changed' },
						{ id: 'a', title: 'A' }
					]
				);
				throw new Error('abort');
			})
		).toThrow('abort');

		expect(state.project).toBe(project);
		expect(state.project.owner).toBe(owner);
		expect(state.project).toEqual({ title: 'Before', owner: { name: 'Ada' } });
		expect(state.records).toBe(records);
		expect(state.records[0]).toBe(first);
		expect(state.records.map((record) => record.id)).toEqual(['a', 'b']);
		expect(state.records.map((record) => record.title)).toEqual(['A', 'B']);
	});
});
