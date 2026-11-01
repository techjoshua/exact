import { expect, it } from 'vitest';
import { deleteReactiveValue, writeReactiveLazy } from '../runtime/reactivity.js';
import { runTaskFrame } from '../framework/task-frames.js';
import { frameForTaskContext, taskMutation } from './frame-runtime.js';
import { defineTask, invokeTask, taskStatus } from './runtime.js';
import {
	captureTaskPropertyMutations,
	takeTaskPropertyMutations,
	associateTaskPropertyMutationCapture,
	releaseTaskPropertyMutationCaptureAlias
} from './property-mutations.js';
import {
	discardTaskMutations,
	stageTaskMutation,
	mutateTaskCollection,
	takeTaskCollectionMutations
} from './task-publication.js';

it.each([false, true])(
	'captures an explicitly invoked child and its cleanup (detached=%s)',
	async (detached) => {
		const state = { n: 0, cleanup: false };
		await runTaskFrame(
			{ kind: 'request' },
			{
				work: async (parent) => {
					captureTaskPropertyMutations(parent.signal, { requestInvocations: true });
					try {
						const child = defineTask<[], unknown>({ detached }, (task) => {
							task.cleanup(() => {
								taskMutation(task.signal, () => writeReactiveLazy(state, ['cleanup'], () => true));
							});
							return taskMutation(task.signal, () => writeReactiveLazy(state, ['n'], () => 1));
						});
						await invokeTask(parent, child);
						const performed = takeTaskPropertyMutations(parent.signal);
						expect(state).toEqual({ n: 1, cleanup: true });
						expect(performed?.(state, 'n')).toBe('set');
						expect(performed?.(state, 'cleanup')).toBe('set');
					} finally {
						discardTaskMutations(parent.signal);
					}
				}
			}
		);
	}
);

it('includes actual unobserved detached writes during the request window without waiting for the child', async () => {
	const state = { n: 0 };
	let entered!: () => void,
		continueParent!: () => void,
		continueChild!: () => void,
		childFinished!: () => void;
	const written = new Promise<void>((resolve) => {
		entered = resolve;
	});
	const parentGate = new Promise<void>((resolve) => {
		continueParent = resolve;
	});
	const childGate = new Promise<void>((resolve) => {
		continueChild = resolve;
	});
	const finished = new Promise<void>((resolve) => {
		childFinished = resolve;
	});
	const request = runTaskFrame(
		{ kind: 'request' },
		{
			work: async (parent) => {
				captureTaskPropertyMutations(parent.signal, { requestInvocations: true });
				try {
					void invokeTask(
						parent,
						defineTask({ detached: true }, async (task) => {
							task.cleanup(childFinished);
							taskMutation(task.signal, () => writeReactiveLazy(state, ['n'], () => 1));
							entered();
							await childGate;
							taskMutation(task.signal, () => writeReactiveLazy(state, ['n'], () => 2));
						})
					);
					await parentGate;
					return takeTaskPropertyMutations(parent.signal);
				} finally {
					discardTaskMutations(parent.signal);
				}
			}
		}
	);
	try {
		await written;
		continueParent();
		const performed = await request;
		expect(state.n).toBe(1);
		expect(performed?.(state, 'n')).toBe('set');
		continueChild();
		await finished;
		expect(state.n).toBe(2);
		expect(performed?.(state, 'n')).toBe('set');
	} finally {
		continueParent();
		continueChild();
		await request;
		await finished;
	}
});

it.each(['take', 'discard', 'abort'] as const)(
	'fences the exact retired request after %s while allowing child mutation',
	(retirement) => {
		const parent = new AbortController(),
			child = new AbortController();
		const state = { n: 0 };
		captureTaskPropertyMutations(parent.signal, { requestInvocations: true });
		associateTaskPropertyMutationCapture(child.signal, parent.signal);
		try {
			if (retirement === 'take') takeTaskPropertyMutations(parent.signal);
			else if (retirement === 'discard') discardTaskMutations(parent.signal);
			else parent.abort(null);
			if (retirement !== 'abort')
				captureTaskPropertyMutations(parent.signal, { requestInvocations: true });
			taskMutation(child.signal, () => writeReactiveLazy(state, ['n'], () => 1));
			expect(child.signal.aborted).toBe(false);
			expect(state.n).toBe(1);
			expect(takeTaskPropertyMutations(parent.signal)).toBeUndefined();
		} finally {
			releaseTaskPropertyMutationCaptureAlias(child.signal);
			discardTaskMutations(parent.signal);
		}
	}
);

it('keeps private captures, concurrent requests and following generic capture independent', () => {
	const first = new AbortController().signal,
		second = new AbortController().signal,
		child = new AbortController().signal;
	const state = { n: 0 };
	captureTaskPropertyMutations(first, { requestInvocations: true });
	captureTaskPropertyMutations(second, { requestInvocations: true });
	associateTaskPropertyMutationCapture(child, first);
	captureTaskPropertyMutations(child);
	try {
		taskMutation(child, () => writeReactiveLazy(state, ['n'], () => 1));
		expect(takeTaskPropertyMutations(child)?.(state, 'n')).toBe('set');
		taskMutation(child, () => writeReactiveLazy(state, ['n'], () => 2));
		expect(takeTaskPropertyMutations(first)).toBeUndefined();
		expect(takeTaskPropertyMutations(second)).toBeUndefined();
		captureTaskPropertyMutations(first);
		taskMutation(first, () => deleteReactiveValue(state, ['missing']));
		expect(takeTaskPropertyMutations(first)?.(state, 'missing')).toBe('delete');
	} finally {
		discardTaskMutations(child);
		discardTaskMutations(first);
		discardTaskMutations(second);
	}
});

it('records equal sets and no-op deletes, excluding unsuccessful native writes', () => {
	const parent = new AbortController().signal,
		child = new AbortController().signal;
	const state = { n: 1 },
		locked = Object.defineProperty({}, 'n', { value: 1 });
	captureTaskPropertyMutations(parent, { requestInvocations: true });
	associateTaskPropertyMutationCapture(child, parent);
	try {
		taskMutation(child, () => writeReactiveLazy(state, ['n'], () => 1));
		taskMutation(child, () => deleteReactiveValue(state, ['missing']));
		expect(() => taskMutation(child, () => writeReactiveLazy(locked, ['n'], () => 2))).toThrow(
			TypeError
		);
		const performed = takeTaskPropertyMutations(parent);
		expect(performed?.(state, 'n')).toBe('set');
		expect(performed?.(state, 'missing')).toBe('delete');
		expect(performed?.(locked, 'n')).toBeUndefined();
	} finally {
		releaseTaskPropertyMutationCaptureAlias(child);
		discardTaskMutations(parent);
	}
});

it.each([false, true])(
	'routes actual Map/Set deltas only within opted-in request lifetime (optIn=%s)',
	(optIn) => {
		const parent = new AbortController(),
			child = new AbortController();
		const state = { map: new Map<string, number>(), set: new Set<string>() };
		captureTaskPropertyMutations(parent.signal, optIn ? { requestInvocations: true } : undefined);
		associateTaskPropertyMutationCapture(child.signal, parent.signal);
		try {
			mutateTaskCollection(child.signal, state, ['map'], 'map', 'set', ['key', 1]);
			mutateTaskCollection(child.signal, state, ['set'], 'set', 'add', ['one']);
			expect(state.map.get('key')).toBe(1);
			expect(state.set.has('one')).toBe(true);
			expect(takeTaskCollectionMutations(parent.signal)?.length).toBe(optIn ? 2 : undefined);
			parent.abort(null);
			discardTaskMutations(parent.signal);
			mutateTaskCollection(child.signal, state, ['map'], 'map', 'set', ['key', 2]);
			expect(state.map.get('key')).toBe(2);
			expect(child.signal.aborted).toBe(false);
			expect(takeTaskCollectionMutations(parent.signal)).toBeUndefined();
			expect(takeTaskCollectionMutations(child.signal)?.length).toBe(optIn ? 1 : 3);
		} finally {
			discardTaskMutations(parent.signal);
			discardTaskMutations(child.signal);
		}
	}
);

it.each([false, true])(
	'preserves only ordinary structural fallback after a private child capture (detached=%s)',
	async (detached) => {
		const state = { private: 0, after: 0 };
		await runTaskFrame(
			{ kind: 'request' },
			{
				work: async (parent) => {
					captureTaskPropertyMutations(parent.signal, { requestInvocations: true });
					try {
						await invokeTask(
							parent,
							defineTask({ detached }, (task) => {
								captureTaskPropertyMutations(task.signal);
								try {
									taskMutation(task.signal, () => writeReactiveLazy(state, ['private'], () => 1));
									expect(takeTaskPropertyMutations(task.signal)?.(state, 'private')).toBe('set');
									taskMutation(task.signal, () => writeReactiveLazy(state, ['after'], () => 1));
								} finally {
									discardTaskMutations(task.signal);
								}
							})
						);
						const performed = takeTaskPropertyMutations(parent.signal);
						expect(performed?.(state, 'private')).toBeUndefined();
						expect(performed?.(state, 'after')).toBe(detached ? undefined : 'set');
					} finally {
						discardTaskMutations(parent.signal);
					}
				}
			}
		);
	}
);

it('pins queued invocation admission to the original capture instead of a recaptured request', async () => {
	const state = { n: 0 };
	let entered!: () => void, release!: () => void;
	const ready = new Promise<void>((resolve) => {
		entered = resolve;
	});
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	await runTaskFrame(
		{ kind: 'request' },
		{
			work: async (parent) => {
				const child = defineTask<[number], void>(
					{ detached: true, concurrency: 'queue' },
					async (n, task) => {
						if (n === 1) {
							entered();
							await gate;
						}
						taskMutation(task.signal, () => writeReactiveLazy(state, ['n'], () => n));
					}
				);
				captureTaskPropertyMutations(parent.signal, { requestInvocations: true });
				const first = invokeTask(parent, child, 1);
				await ready;
				const queued = invokeTask(parent, child, 2);
				try {
					takeTaskPropertyMutations(parent.signal);
					captureTaskPropertyMutations(parent.signal, { requestInvocations: true });
					release();
					await first;
					await queued;
					expect(state.n).toBe(2);
					expect(takeTaskPropertyMutations(parent.signal)).toBeUndefined();
					captureTaskPropertyMutations(parent.signal, { requestInvocations: true });
					await invokeTask(parent, child, 3);
					expect(takeTaskPropertyMutations(parent.signal)?.(state, 'n')).toBe('set');
				} finally {
					release();
					await first;
					await queued;
					discardTaskMutations(parent.signal);
				}
			}
		}
	);
});

it('releases rejected and superseded generations without consuming a live request capture', async () => {
	const state = { n: 0 };
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	await runTaskFrame(
		{ kind: 'request' },
		{
			work: async (parent) => {
				captureTaskPropertyMutations(parent.signal, { requestInvocations: true });
				const child = defineTask<[number], void>(
					{ detached: true, concurrency: 'latest' },
					async (n, task) => {
						if (n === 0) {
							await gate;
							task.signal.throwIfAborted();
						}
						if (n === -1) throw undefined;
						taskMutation(task.signal, () => writeReactiveLazy(state, ['n'], () => n));
					}
				);
				try {
					await expect(Promise.resolve(invokeTask(parent, child, -1))).rejects.toBeUndefined();
					const old = Promise.resolve(invokeTask(parent, child, 0)).then(
						() => false,
						() => true
					);
					await invokeTask(parent, child, 2);
					release();
					expect(await old).toBe(true);
					expect(state.n).toBe(2);
					expect(takeTaskPropertyMutations(parent.signal)?.(state, 'n')).toBe('set');
				} finally {
					release();
					discardTaskMutations(parent.signal);
				}
			}
		}
	);
});

it.each([0, undefined])(
	'releases the request association when staged publication throws %s',
	async (failure) => {
		const state = { staged: 0, late: 0 };
		await runTaskFrame(
			{ kind: 'request' },
			{
				work: async (parent) => {
					const owner = frameForTaskContext(parent)!.owner;
					let commit!: () => void;
					let childSignal!: AbortSignal;
					owner.registerReadiness = (_generation, _settlement, publish) => {
						commit = publish;
						return { cancel() {} };
					};
					captureTaskPropertyMutations(parent.signal, { requestInvocations: true });
					try {
						await invokeTask(
							parent,
							defineTask({ detached: true, readiness: 'blocking' }, (child) => {
								childSignal = child.signal;
								stageTaskMutation(child.signal, () => {
									writeReactiveLazy(state, ['staged'], () => 1);
									throw failure;
								});
							})
						);
						let caught = false;
						try {
							commit();
						} catch (error) {
							caught = true;
							expect(error).toBe(failure);
						}
						expect(caught).toBe(true);
						taskMutation(childSignal, () => writeReactiveLazy(state, ['late'], () => 2));
						const performed = takeTaskPropertyMutations(parent.signal);
						expect(state).toEqual({ staged: 1, late: 2 });
						expect(performed?.(state, 'staged')).toBe('set');
						expect(performed?.(state, 'late')).toBeUndefined();
					} finally {
						owner.registerReadiness = undefined;
						discardTaskMutations(childSignal);
						discardTaskMutations(parent.signal);
					}
				}
			}
		);
	}
);

it.each([
	{ readiness: 'blocking', failure: 0 },
	{ readiness: 'blocking', failure: undefined },
	{ readiness: 'nonblocking', failure: 0 },
	{ readiness: 'nonblocking', failure: undefined }
] as const)(
	'settles direct $readiness publication failure $failure and advances its queue',
	async ({ readiness, failure }) => {
		const state = { staged: 0, late: 0 };
		let firstSignal!: AbortSignal;
		let releaseFirst!: () => void,
			releaseSecond!: () => void,
			enteredFirst!: () => void,
			published!: () => void;
		const firstGate = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		const secondGate = new Promise<void>((resolve) => {
			releaseSecond = resolve;
		});
		const started = new Promise<void>((resolve) => {
			enteredFirst = resolve;
		});
		const publication = new Promise<void>((resolve) => {
			published = resolve;
		});
		let cleanups = 0;
		await runTaskFrame(
			{ kind: 'request' },
			{
				work: async (parent) => {
					const owner = frameForTaskContext(parent)!.owner;
					expect(owner.registerReadiness).toBeUndefined();
					const child = defineTask<[number], number>(
						{ detached: true, concurrency: 'queue', readiness },
						async (value, task) => {
							task.cleanup(() => {
								cleanups++;
							});
							if (value === 1) {
								firstSignal = task.signal;
								enteredFirst();
								await firstGate;
							}
							if (value === 2) await secondGate;
							stageTaskMutation(task.signal, () => {
								writeReactiveLazy(state, ['staged'], () => value);
								if (value === 1) {
									published();
									throw failure;
								}
							});
							return value;
						}
					);
					const status = taskStatus(child, { owner });
					captureTaskPropertyMutations(parent.signal, { requestInvocations: true });
					try {
						let caught = false,
							settled = false;
						let rejected: unknown;
						const first = Promise.resolve(invokeTask(parent, child, 1)).then(
							() => {
								settled = true;
							},
							(error: unknown) => {
								caught = true;
								settled = true;
								rejected = error;
							}
						);
						await started;
						const second = Promise.resolve(invokeTask(parent, child, 2));
						void second.catch(() => undefined);
						expect(status.pendingCount).toBe(2);
						releaseFirst();
						await publication;
						await new Promise<void>((resolve) => setImmediate(resolve));
						// Observe settlement before awaiting it so the BEFORE regression fails without a timeout.
						expect(settled).toBe(true);
						await first;
						expect(caught).toBe(true);
						expect(rejected).toBe(failure);
						expect(status.pendingCount).toBe(1);
						expect(cleanups).toBe(1);
						taskMutation(firstSignal, () => writeReactiveLazy(state, ['late'], () => 9));
						releaseSecond();
						expect(await second).toBe(2);
						expect(await invokeTask(parent, child, 3)).toBe(3);
						expect(status.pendingCount).toBe(0);
						expect(status.pending).toBe(false);
						expect(cleanups).toBe(3);
						expect(state).toEqual({ staged: 3, late: 9 });
						const performed = takeTaskPropertyMutations(parent.signal);
						expect(performed?.(state, 'staged')).toBe('set');
						expect(performed?.(state, 'late')).toBeUndefined();
					} finally {
						releaseFirst();
						releaseSecond();
						discardTaskMutations(firstSignal);
						discardTaskMutations(parent.signal);
					}
				}
			}
		);
	}
);
