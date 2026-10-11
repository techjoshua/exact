import { expect, it } from 'vitest';
import { batch, flushSync, reactive, watch } from './index.js';
import { reactiveObjects } from './framework/objects.js';

class Fields extends Array<number> {
	declare note?: number;
	get label(): number | undefined {
		throw new Error('setter comparison must not read');
	}
	set label(value: number | undefined) {
		this.note = value;
	}
	mutate(value: number | undefined) {
		this.note = value;
		return this;
	}
	remove() {
		delete this.note;
	}
}
class MapFields extends Map<string, number> {
	declare note?: number;
	get label(): number | undefined {
		throw new Error('setter comparison must not read');
	}
	set label(value: number | undefined) {
		this.note = value;
	}
	mutate(value: number | undefined) {
		this.note = value;
		return this;
	}
	remove() {
		delete this.note;
	}
}
class SetFields extends Set<number> {
	declare note?: number;
	get label(): number | undefined {
		throw new Error('setter comparison must not read');
	}
	set label(value: number | undefined) {
		this.note = value;
	}
	mutate(value: number | undefined) {
		this.note = value;
		return this;
	}
	remove() {
		delete this.note;
	}
}

for (const [name, create, wrap] of [
	['array', () => new Fields(), reactive],
	['compiled array', () => new Fields(), reactiveObjects],
	['Map', () => new MapFields(), reactive],
	['Set', () => new SetFields(), reactive]
] as const)
	for (const mode of ['accessor', 'method'] as const)
		it(`publishes custom property keys after ${name} ${mode} calls`, () => {
			const state = wrap(create());
			const snapshots: PropertyKey[][] = [];
			const stop = watch(() => snapshots.push(Reflect.ownKeys(state)));
			const write = (value: number | undefined) => {
				if (mode === 'accessor') state.label = value;
				else expect(state.mutate(value)).toBe(state);
			};
			try {
				write(undefined);
				flushSync();
				expect(snapshots.at(-1)).toContain('note');
				write(2);
				flushSync();
				expect(state.note).toBe(2);
				const count = snapshots.length;
				write(2);
				flushSync();
				expect(snapshots).toHaveLength(count);
				expect(() =>
					batch(() => {
						state.remove();
						throw new Error('rollback');
					})
				).toThrow('rollback');
				flushSync();
				expect(state.note).toBe(2);
				expect(snapshots).toHaveLength(count);
				state.remove();
				flushSync();
				expect(snapshots.at(-1)).not.toContain('note');
				const readonly = wrap(create(), { readonly: true });
				expect(() => {
					if (mode === 'accessor') readonly.label = 1;
					else readonly.mutate(1);
				}).toThrow();
				expect(Object.hasOwn(readonly, 'note')).toBe(false);
			} finally {
				stop();
			}
		});
