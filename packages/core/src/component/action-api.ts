import {
	captureReactiveMutations,
	reactive,
	rollbackReactiveMutationJournals,
	type ReactiveMutationJournal
} from '@exactjs/reactive';

import {
	InteractionCancellation,
	isInteractionCancellation,
	runComponentInteraction
} from '../interaction/execution.js';
import type {
	ActionConcurrency,
	ActionContext,
	ActionPlacementRequest,
	ComponentAction,
	ComponentActionFactory,
	ComponentActionInspection,
	ComponentActionRegistration
} from './action-contracts.js';
import type { Component, ComponentInstance } from './contracts.js';
import { isPromiseLike } from './async-value.js';
import { trackComponentAsync } from './async.js';

type ActionPolicy = {
	readonly placement: ActionPlacementRequest;
	readonly priority: 'normal' | 'deferred';
};

type ActionGeneration<Result> = {
	readonly generation: number;
	readonly args: readonly unknown[];
	readonly controller: AbortController;
	readonly resolve: (value: Result) => void;
	readonly reject: (error: unknown) => void;
	readonly promise: Promise<Result>;
	readonly journals: ReactiveMutationJournal[];
	started: boolean;
};

type ActionStatus<Result> = {
	pendingCount: number;
	generation: number;
	result: Result | undefined;
	error: unknown;
};

type ActionInspectionSource = {
	snapshot(): ComponentActionInspection;
};

const actionInspections = new WeakMap<object, Set<ActionInspectionSource>>();

/** Component-owned action API plus its deterministic disposal operation. */
export type ComponentActionApi = {
	readonly action: ComponentActionFactory;
	dispose(reason?: unknown): void;
};

/** Creates the action registrar and all invocation ownership for one component instance. */
export function createComponentActionApi(
	owner: () => ComponentInstance<any>,
	canRegister: () => boolean
): ComponentActionApi {
	const disposals = new Set<(reason?: unknown) => void>();
	const registrations = new Map<string, ComponentActionRegistration>();

	const registration = (
		placement: ActionPlacementRequest,
		priority: ActionPolicy['priority']
	): ComponentActionRegistration => {
		const key = `${placement}:${priority}`;
		const existing = registrations.get(key);
		if (existing) return existing;
		const callable = ((
			name: string,
			work: (...args: unknown[]) => unknown,
			concurrency: ActionConcurrency = 'parallel'
		) => {
			if (!canRegister())
				throw new Error('this.action() must be registered during component setup');
			if (!name.trim()) throw new TypeError('this.action() requires a non-empty diagnostic name');
			if (typeof work !== 'function') throw new TypeError('this.action() requires a work callback');
			if (concurrency !== 'parallel' && concurrency !== 'latest' && concurrency !== 'queue')
				throw new TypeError(`Unsupported action concurrency "${String(concurrency)}"`);
			const action = createAction(owner(), name, work, concurrency, { placement, priority });
			disposals.add(action.dispose);
			return action.callable;
		}) as ComponentActionRegistration;
		registrations.set(key, callable);
		Object.defineProperty(callable, 'deferred', {
			enumerable: true,
			get: () => registration(placement, 'deferred')
		});
		return callable;
	};

	const root = registration('inferred', 'normal') as ComponentActionFactory;
	Object.defineProperties(root, {
		client: {
			enumerable: true,
			get: () => registration('client', 'normal')
		},
		server: {
			enumerable: true,
			get: () => registration('server', 'normal')
		}
	});

	return {
		action: root,
		dispose(reason = 'component-disposed') {
			for (const dispose of disposals) dispose(reason);
			disposals.clear();
		}
	};
}

function createAction<Result>(
	owner: ComponentInstance<any>,
	name: string,
	work: (...args: unknown[]) => Result | PromiseLike<Result>,
	concurrency: ActionConcurrency,
	policy: ActionPolicy
): {
	callable: ComponentAction<readonly unknown[], Awaited<Result>>;
	dispose(reason?: unknown): void;
} {
	const status = reactive<ActionStatus<Awaited<Result>>>({
		pendingCount: 0,
		generation: 0,
		result: undefined,
		error: undefined
	});
	const active = new Map<number, ActionGeneration<Awaited<Result>>>();
	const queued: ActionGeneration<Awaited<Result>>[] = [];
	let disposed = false;
	let cancellationReason: unknown;
	let ownerInspections = actionInspections.get(owner);
	if (!ownerInspections) actionInspections.set(owner, (ownerInspections = new Set()));
	ownerInspections.add({
		snapshot: () =>
			Object.freeze({
				name,
				concurrency,
				placement: policy.placement,
				priority: policy.priority,
				pending: status.pendingCount > 0,
				pendingCount: status.pendingCount,
				generation: status.generation,
				result: status.result,
				error: status.error,
				...(cancellationReason === undefined ? {} : { cancellationReason }),
				disposed
			})
	});

	const invoke = (...args: readonly unknown[]): Promise<Awaited<Result>> => {
		if (disposed)
			return Promise.reject(new Error(`Action "${name}" belongs to a disposed component`));
		if (concurrency === 'latest') cancelAll('superseded');
		cancellationReason = undefined;
		const generation = ++status.generation;
		status.error = undefined;
		status.pendingCount++;
		let resolve!: (value: Awaited<Result>) => void;
		let reject!: (error: unknown) => void;
		const promise = new Promise<Awaited<Result>>((accept, fail) => {
			resolve = accept;
			reject = fail;
		});
		const record: ActionGeneration<Awaited<Result>> = {
			generation,
			args,
			controller: new AbortController(),
			resolve,
			reject,
			promise,
			journals: [],
			started: false
		};
		active.set(generation, record);
		if (concurrency === 'queue') {
			queued.push(record);
			pumpQueue();
		} else {
			start(record);
		}
		return promise;
	};

	const callable = invoke as ComponentAction<readonly unknown[], Awaited<Result>>;
	Object.defineProperties(callable, {
		pending: { enumerable: true, get: () => status.pendingCount > 0 },
		pendingCount: { enumerable: true, get: () => status.pendingCount },
		generation: { enumerable: true, get: () => status.generation },
		result: { enumerable: true, get: () => status.result },
		error: { enumerable: true, get: () => status.error }
	});
	callable.cancel = (reason?: unknown) => cancelAll(reason ?? 'cancelled');

	function pumpQueue(): void {
		if ([...active.values()].some((record) => record.started)) return;
		const next = queued.shift();
		if (next) start(next);
	}

	function start(record: ActionGeneration<Awaited<Result>>): void {
		if (record.controller.signal.aborted) {
			settleCancellation(record);
			return;
		}
		record.started = true;
		const context: ActionContext = {
			signal: record.controller.signal,
			generation: record.generation,
			optimistic(optimisticWork) {
				if (concurrency === 'parallel')
					throw new Error('Optimistic state requires a latest or queue action');
				if (record.controller.signal.aborted || !record.started || !active.has(record.generation))
					throw new Error('Cannot publish optimistic state from an inactive action generation');
				let returned: unknown;
				const journal = captureReactiveMutations(() => {
					returned = optimisticWork();
				});
				if (isPromiseLike(returned)) {
					journal.rollback();
					throw new TypeError('ActionContext.optimistic() requires a synchronous callback');
				}
				record.journals.push(journal);
			}
		};
		let execution: Promise<Awaited<Result>>;
		try {
			execution = runComponentInteraction(
				owner,
				'action',
				record.generation,
				policy.priority,
				record.controller,
				() => work(...record.args, context)
			) as Promise<Awaited<Result>>;
		} catch (error) {
			fail(record, error);
			return;
		}
		trackComponentAsync(owner, execution);
		execution.then(
			(value) => {
				for (const journal of record.journals) journal.discard();
				status.result = value;
				finish(record);
				record.resolve(value);
			},
			(error) => fail(record, error)
		);
	}

	function fail(record: ActionGeneration<Awaited<Result>>, error: unknown): void {
		rollbackReactiveMutationJournals(record.journals);
		record.journals.length = 0;
		if (!isInteractionCancellation(error)) status.error = error;
		finish(record);
		record.reject(error);
	}

	function finish(record: ActionGeneration<Awaited<Result>>): void {
		if (!active.delete(record.generation)) return;
		status.pendingCount = Math.max(0, status.pendingCount - 1);
		if (concurrency === 'queue') pumpQueue();
	}

	function settleCancellation(record: ActionGeneration<Awaited<Result>>): void {
		finish(record);
		record.reject(new InteractionCancellation(record.controller.signal.reason));
	}

	function cancelAll(reason: unknown): void {
		cancellationReason = reason;
		for (const record of active.values()) {
			// Rollback precedes a superseding generation so the new optimistic
			// callback observes authoritative state rather than the old overlay.
			rollbackReactiveMutationJournals(record.journals);
			record.journals.length = 0;
			record.controller.abort(reason);
		}
		for (const record of [...queued]) {
			const index = queued.indexOf(record);
			if (index >= 0) queued.splice(index, 1);
			if (!record.started) settleCancellation(record);
		}
	}

	return {
		callable,
		dispose(reason = 'component-disposed') {
			if (disposed) return;
			disposed = true;
			cancelAll(reason);
		}
	};
}

/** Returns immutable action snapshots without exposing callbacks or protocol identities. */
export function inspectComponentActions(
	component: Component<any>
): readonly ComponentActionInspection[] {
	return Object.freeze(
		[...(actionInspections.get(component as object) ?? [])].map((inspection) =>
			inspection.snapshot()
		)
	);
}
