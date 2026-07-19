import { describe, expect, it, vi } from 'vitest';
import {
	computed,
	createEffectScope,
	createProfiledEffectScope,
	flushSync,
	peek,
	reactive,
	ref,
	subscribe,
	watch,
	withEffectScope
} from './index.js';

describe('@exact/reactive scopes', () => {
	it('profiles scheduler work owned by an explicit effect scope', () => {
		const events: Array<{ subsystem: string; phase: string }> = [];
		const scope = createProfiledEffectScope((event) => events.push(event), undefined);
		const state = reactive({ count: 0 });
		try {
			withEffectScope(scope, () => watch(() => void state.count));
			state.count++;
			flushSync();

			expect(events).toContainEqual(
				expect.objectContaining({
					subsystem: 'reactive',
					phase: 'flush'
				})
			);
		} finally {
			scope.stop();
		}
	});

	it('routes scheduler failures and leaves the watcher retryable', () => {
		const state = reactive({ count: 0 });
		const errors: unknown[] = [];
		const scheduler = vi.fn(() => {
			throw new Error('schedule failed');
		});
		watch(() => void state.count, scheduler, { onError: (error) => errors.push(error) });

		expect(() => {
			state.count++;
		}).not.toThrow();
		expect(() => {
			state.count++;
		}).not.toThrow();
		expect(scheduler).toHaveBeenCalledTimes(2);
		expect(errors).toHaveLength(2);
	});

	it('routes onSchedule failures and leaves the watcher retryable', () => {
		const state = reactive({ count: 0 });
		const errors: unknown[] = [];
		const onSchedule = vi.fn(() => {
			throw new Error('onSchedule failed');
		});
		watch(() => void state.count, undefined, {
			onSchedule,
			onError: (error) => errors.push(error)
		});

		state.count++;
		state.count++;
		expect(onSchedule).toHaveBeenCalledTimes(2);
		expect(errors).toHaveLength(2);
	});

	it('fails a self-invalidating reaction instead of looping forever', () => {
		const state = reactive({ count: 0 });
		let looping = true;
		const runs = vi.fn();
		watch(() => {
			runs();
			if (looping && state.count < 2_000) state.count++;
		});
		expect(() => flushSync()).toThrow('exceeded its flush limit');
		const before = runs.mock.calls.length;
		looping = false;
		state.count++;
		expect(() => flushSync()).not.toThrow();
		expect(runs.mock.calls.length).toBeGreaterThan(before);
	});

	it('does not run a stopped watcher that was already queued', () => {
		const state = reactive({ count: 0 });
		const seen: number[] = [];

		const stop = watch(() => {
			seen.push(Number(state.count));
		});

		state.count = 1;
		stop();
		flushSync();

		expect(seen).toEqual([0]);
	});

	it('keeps peek untracked across nested reaction collection', () => {
		const state = reactive({ visible: 0, ignored: 0 });
		const nested = vi.fn(() => state.ignored);
		let stopNested: (() => void) | undefined;
		const outer = vi.fn(() => {
			void state.visible;
			peek(() => {
				stopNested ??= watch(nested);
				// This read occurs after the nested reaction has returned and must not
				// leak back into the still-active outer reaction.
				void state.ignored;
			});
		});

		watch(outer);
		state.ignored++;
		flushSync();

		expect(outer).toHaveBeenCalledTimes(1);
		expect(nested).toHaveBeenCalledTimes(2);
		stopNested?.();
	});

	it('limits self-invalidating computed work and leaves the scheduler reusable', () => {
		const state = reactive({ count: 0, stable: 0 });
		const looping = computed(() => {
			if (state.count < 2_000) state.count++;
			return state.count;
		});
		looping.get();
		expect(() => flushSync()).toThrow('computation is repeatedly invalidating itself');

		const seen: number[] = [];
		watch(() => seen.push(state.stable));
		state.stable = 1;
		expect(() => flushSync()).not.toThrow();
		expect(seen).toEqual([0, 1]);
	});

	it('routes scheduler overflow through the owning effect scope', () => {
		const errors: unknown[] = [];
		const scope = createEffectScope(undefined, (error) => errors.push(error));
		const state = reactive({ count: 0 });
		withEffectScope(scope, () =>
			watch(() => {
				state.count++;
			})
		);
		expect(() => flushSync()).not.toThrow();
		expect(errors).toHaveLength(1);
		expect(String(errors[0])).toContain('scheduler exceeded its flush limit');
		scope.stop();
	});

	it('preserves an undefined scheduler failure and resets scheduled state', () => {
		const state = reactive({ failing: false, stable: 0 });
		watch(
			() => {
				if (state.failing) throw undefined;
			},
			undefined,
			{
				onError(error) {
					throw error;
				}
			}
		);
		state.failing = true;
		let caught = false;
		try {
			flushSync();
		} catch {
			caught = true;
		}
		expect(caught).toBe(true);
		state.failing = false;
		expect(() => flushSync()).not.toThrow();
	});

	it('owns direct subscriptions in their scope and routes callback errors', () => {
		const state = reactive({ value: 0 });
		const source = ref(computed(() => state.value))!;
		const errors: unknown[] = [];
		const scope = createEffectScope(undefined, (error) => errors.push(error));
		withEffectScope(scope, () =>
			subscribe(source, () => {
				throw new Error('subscription');
			})
		);
		state.value = 1;
		expect(() => flushSync()).not.toThrow();
		expect(errors).toHaveLength(1);
		scope.stop();
		state.value = 2;
		flushSync();
		expect(errors).toHaveLength(1);
	});

	it('rejects new work in a stopped effect scope', () => {
		const scope = createEffectScope();
		scope.stop();
		expect(() => withEffectScope(scope, () => watch(() => undefined))).toThrow(
			'inactive effect scope'
		);
		expect(() => createEffectScope(scope)).toThrow('inactive parent scope');
	});

	it('stops deeply nested effect scopes without using the JavaScript call stack', () => {
		const root = createEffectScope();
		let cursor = root;
		for (let depth = 0; depth < 20_000; depth++) cursor = createEffectScope(cursor);

		expect(() => root.stop()).not.toThrow();
		expect(root.active).toBe(false);
		expect(cursor.active).toBe(false);
	});

	it('finishes scope teardown before rethrowing the first reaction stop failure', () => {
		const root = createEffectScope() as any;
		const child = createEffectScope(root) as any;
		const stopped: string[] = [];
		child.reactions.add({
			stop() {
				stopped.push('child-failure');
				throw new Error('stop failed');
			}
		});
		child.reactions.add({
			stop() {
				stopped.push('child-later');
			}
		});
		root.reactions.add({
			stop() {
				stopped.push('parent');
			}
		});

		expect(() => root.stop()).toThrow('stop failed');
		expect(stopped).toEqual(['child-failure', 'child-later', 'parent']);
		expect(root.active).toBe(false);
		expect(child.active).toBe(false);
		expect(root.children.size).toBe(0);
		expect(child.parent).toBeUndefined();
	});

	it('disposes a watcher whose first run throws before returning a stop handle', () => {
		const state = reactive({ value: 0 });
		const scope = createEffectScope();
		expect(() =>
			withEffectScope(scope, () =>
				watch(() => {
					void state.value;
					throw new Error('initial');
				})
			)
		).toThrow('initial');
		expect(() => {
			state.value = 1;
			flushSync();
		}).not.toThrow();
		scope.stop();
	});
});
