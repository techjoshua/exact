import { peek, reactive, rollbackReactiveMutationJournals, scheduleWork } from '@exactjs/reactive';

import { TaskCancellation } from './cancellation.js';
import { inheritComponentContinuationIdentity } from './component-continuation.js';
import { taskDefinitionBrand, type TaskDefinition } from './definition-record.js';
import { discardTaskMutations, publishTaskMutations } from './resources.js';
import { readExactInspectionSource } from '../component/inspection-source.js';
import type {
	BoundTaskFunction,
	RuntimeTaskOptions,
	TaskActivation,
	TaskContext,
	TaskFunction,
	TaskInvocation,
	TaskOwner,
	TaskStatus
} from './contracts.js';
import {
	attachTaskFrameSettlement,
	createTaskOwnerRecord,
	currentTaskFrameRecord,
	currentTaskOwnerRecord,
	frameForTaskContext,
	taskOwnerRecord,
	type TaskOwnerRecord
} from './frame-runtime.js';
import { taskOwnerForHost } from './owner-hosts.js';
import { TaskInvocationValue } from './invocation.js';
import { validateTaskOptions } from './options.js';
import { donateTaskPriority, taskWorkPriority } from './priority.js';
import { executeScheduledTaskGeneration } from './generation-execution.js';
import { markTaskPerformanceTrace, startTaskPerformanceTrace } from './performance-trace.js';
import { createTaskStatus, defineTaskStatusProperties } from './status.js';
import type {
	InternalTaskGeneration,
	InternalTaskLane,
	InternalTaskOwnerState
} from './runtime-types.js';

const defaultLaneKey = Symbol('exact.default-task-lane');

/**
 * Defines one stable compilerless task using the same owner, lane, generation,
 * frame, cancellation, cleanup, and status runtime used by compiled tasks.
 */
export function defineTask<Args extends unknown[], Result>(
	options: RuntimeTaskOptions<Args>,
	implementation: (...args: [...Args, TaskContext]) => Result | Promise<Result>
): TaskFunction<Args, Awaited<Result>> {
	validateTaskOptions(options);
	if (typeof implementation !== 'function')
		throw new TypeError('defineTask() requires an implementation function');
	const sourceEntityId = readExactInspectionSource(implementation);
	const definition: TaskDefinition<Args, Awaited<Result>> = {
		[taskDefinitionBrand]: true,
		options,
		implementation: implementation as TaskDefinition<Args, Awaited<Result>>['implementation'],
		...(sourceEntityId ? { sourceEntityId } : {}),
		owners: new WeakMap()
	};
	const callable = ((...args: Args) =>
		invokeDefinition(
			definition,
			options.owner ? taskOwnerRecord(options.owner) : undefined,
			undefined,
			args,
			'invoked'
		)) as TaskFunction<Args, Awaited<Result>>;
	Object.defineProperty(callable, taskDefinitionBrand, { value: definition });
	inheritComponentContinuationIdentity(implementation, callable);
	return callable;
}

/** Invokes a child task with an explicit retained parent after any await boundary. */
export function invokeTask<Args extends unknown[], Result>(
	parent: TaskContext,
	child: TaskFunction<Args, Result>,
	...args: Args
): TaskInvocation<Result> {
	const frame = frameForTaskContext(parent);
	return invokeDefinition(readDefinition(child), frame.owner, frame, args);
}

/** Creates an owner-bound callable facade with aggregate reactive status. */
export function bindTask<Args extends unknown[], Result>(
	task: TaskFunction<Args, Result>,
	options?: { readonly owner?: TaskOwner }
): BoundTaskFunction<Args, Result> {
	const definition = readDefinition(task);
	const owner = resolveBoundOwner(options?.owner);
	const status = createTaskStatus(ownerState(definition, owner), undefined, cancelLane);
	const bound = ((...args: Args) =>
		invokeDefinition(definition, owner, undefined, args, 'invoked')) as BoundTaskFunction<
		Args,
		Result
	>;
	Object.defineProperty(bound, taskDefinitionBrand, { value: definition });
	inheritComponentContinuationIdentity(task, bound);
	defineTaskStatusProperties(bound, status);
	return bound;
}

/**
 * Binds compiler-generated task functions to an explicit durable host.
 *
 * Explicit host lookup preserves ownership across development module graphs
 * that contain more than one physical copy of the core runtime.
 */
export function bindTaskForHost<Args extends unknown[], Result>(
	host: object,
	task: TaskFunction<Args, Result>
): BoundTaskFunction<Args, Result> {
	const owner = taskOwnerForHost(host);
	if (!owner) throw new Error('bindTaskForHost() requires a registered durable task host');
	return bindTask(task, { owner });
}

/** Returns a non-callable owner-bound status view, optionally filtered to one key. */
export function taskStatus<Args extends unknown[], Result>(
	task: TaskFunction<Args, Result> | ((...args: Args) => Result),
	options?: { readonly owner?: TaskOwner; readonly key?: unknown }
): TaskStatus<Awaited<Result>> {
	const definition = readDefinition(task as TaskFunction<Args, Awaited<Result>>);
	return createTaskStatus(
		ownerState(definition, resolveBoundOwner(options?.owner)),
		options?.key,
		cancelLane
	);
}

/** Internal setup activation entry used by the compiler-facing activation ABI. */
export function invokeTaskForActivation<Args extends unknown[], Result>(
	task: TaskFunction<Args, Result>,
	owner: TaskOwnerRecord,
	activationSite: object,
	activation: 'initialization' | 'reactive',
	args: Args
): TaskInvocation<Result> {
	return invokeDefinition(readDefinition(task), owner, undefined, args, activation, activationSite);
}

function invokeDefinition<Args extends unknown[], Result>(
	definition: TaskDefinition<Args, Result>,
	explicitOwner: TaskOwnerRecord | undefined,
	explicitParent: ReturnType<typeof currentTaskFrameRecord>,
	args: Args,
	activation: TaskActivation = 'invoked',
	activationSite?: object
): TaskInvocation<Result> {
	const capturedArgs = definition.options.captureArguments
		? peek(() => definition.options.captureArguments!(args))
		: args;
	if (!Array.isArray(capturedArgs))
		throw new TypeError('Task argument capture must return an argument array');
	const resolvedArgs = capturedArgs as Args;
	const ambient = explicitParent ?? currentTaskFrameRecord();
	const owner =
		explicitOwner ??
		ambient?.owner ??
		currentTaskOwnerRecord() ??
		(definition.options.owner
			? taskOwnerRecord(definition.options.owner)
			: createTaskOwnerRecord(definition.options.label));
	const state = ownerState(definition, owner);
	const dependencyDriven = activation !== 'invoked';
	const key = dependencyDriven
		? (activationSite ?? defaultLaneKey)
		: (definition.options.concurrencyKey?.(...resolvedArgs) ?? defaultLaneKey);
	const lane = taskLane(state, key);
	const concurrency = dependencyDriven ? 'latest' : (definition.options.concurrency ?? 'parallel');
	if (concurrency === 'latest') cancelLane(lane, 'superseded');
	const generation = ++state.nextGeneration;
	const controller = new AbortController();
	const priority = definition.options.priority ?? ambient?.priority ?? 'normal';
	const readiness =
		definition.options.readiness ??
		(priority === 'deferred' ? 'nonblocking' : (ambient?.readiness ?? 'blocking'));
	const foreground = readiness === 'blocking' && priority !== 'deferred';
	let releaseReservation: (() => void) | undefined;
	if (ambient && !definition.options.detached) {
		const reservation = new Promise<void>((resolve) => {
			releaseReservation = resolve;
		});
		attachTaskFrameSettlement(ambient, reservation);
	}
	let resolve!: (value: Result) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<Result>((accept, fail) => {
		resolve = accept;
		reject = fail;
	});
	// Structural propagation owns unobserved failures, so the backing native
	// promise must never also surface them as process-level unhandled rejections.
	void promise.catch(() => undefined);
	const record: InternalTaskGeneration<Result> = {
		generation,
		controller,
		args: resolvedArgs,
		journals: [],
		promise,
		resolve,
		reject,
		parent: ambient,
		releaseReservation,
		foreground,
		activation,
		concurrency,
		readiness,
		priority,
		observed: false,
		started: false,
		executing: false
	};
	owner.settlements.add(promise);
	owner.observeSettlement?.(promise);
	if (foreground && owner.registerReadiness) {
		record.readinessRegistration = owner.registerReadiness(
			generation,
			promise,
			() => publishTaskMutations(controller.signal),
			() => discardTaskMutations(controller.signal)
		);
		controller.signal.addEventListener('abort', () => record.readinessRegistration?.cancel(), {
			once: true
		});
	}
	void promise.finally(() => owner.settlements.delete(promise)).catch(() => undefined);
	lane.active.add(record);
	if (foreground) {
		state.pendingCount++;
		lane.pendingCount++;
	}
	if (concurrency === 'queue') {
		lane.queue.push(record);
		pumpLane(definition, owner, state, lane);
	} else {
		startGeneration(definition, owner, state, lane, record);
	}
	return new TaskInvocationValue(promise, () => {
		record.observed = true;
		if (record.parent) donateTaskPriority(record, record.parent.priority);
	});
}

function startGeneration<Args extends unknown[], Result>(
	definition: TaskDefinition<Args, Result>,
	owner: TaskOwnerRecord,
	state: InternalTaskOwnerState<Result>,
	lane: InternalTaskLane<Result>,
	record: InternalTaskGeneration<Result>
): void {
	record.started = true;
	state.error = undefined;
	lane.error = undefined;
	const execution = new Promise<Result>((resolveExecution, rejectExecution) => {
		const scheduledWork = () => {
			record.executing = true;
			startTaskPerformanceTrace(owner, record, definition.sourceEntityId, definition.options.label);
			const frameExecution = executeScheduledTaskGeneration(
				owner,
				record,
				definition.options,
				definition.sourceEntityId,
				definition.implementation
			);
			record.releaseReservation?.();
			void frameExecution.then(resolveExecution, rejectExecution);
		};
		record.scheduledWork = scheduledWork;
		scheduleWork(scheduledWork, taskWorkPriority(record.priority), rejectExecution);
	});
	void execution.then(
		(value) => {
			for (const journal of record.journals) journal.discard();
			if (!record.readinessRegistration) publishTaskMutations(record.controller.signal);
			if (record.generation >= state.generation) {
				state.generation = record.generation;
				state.result = value;
				state.error = undefined;
			}
			if (record.generation >= lane.generation) {
				lane.result = value;
				lane.error = undefined;
				lane.generation = record.generation;
			}
			markTaskPerformanceTrace(record, 'settled', { outcome: 'success' });
			finishGeneration(definition, owner, state, lane, record);
			record.resolve(value);
		},
		(error) => {
			rollbackReactiveMutationJournals(record.journals);
			discardTaskMutations(record.controller.signal);
			record.readinessRegistration?.cancel();
			if (record.generation >= state.generation) {
				state.generation = record.generation;
				if (!(error instanceof TaskCancellation)) state.error = error;
			}
			if (record.generation >= lane.generation) {
				lane.generation = record.generation;
				if (!(error instanceof TaskCancellation)) lane.error = error;
			}
			markTaskPerformanceTrace(record, 'settled', {
				outcome: error instanceof TaskCancellation ? 'cancelled' : 'error'
			});
			finishGeneration(definition, owner, state, lane, record);
			record.reject(error);
		}
	);
}

function finishGeneration<Args extends unknown[], Result>(
	definition: TaskDefinition<Args, Result>,
	owner: TaskOwnerRecord,
	state: InternalTaskOwnerState<Result>,
	lane: InternalTaskLane<Result>,
	record: InternalTaskGeneration<Result>
): void {
	lane.active.delete(record);
	if (record.foreground) state.pendingCount = Math.max(0, state.pendingCount - 1);
	if (record.foreground) lane.pendingCount = Math.max(0, lane.pendingCount - 1);
	if (record.concurrency === 'queue') {
		const next = lane.queue.shift();
		if (next) {
			startGeneration(definition, owner, state, lane, next);
		}
	}
}

function pumpLane<Args extends unknown[], Result>(
	definition: TaskDefinition<Args, Result>,
	owner: TaskOwnerRecord,
	state: InternalTaskOwnerState<Result>,
	lane: InternalTaskLane<Result>
): void {
	if ([...lane.active].some((record) => record.started)) return;
	const next = lane.queue.shift();
	if (next) startGeneration(definition, owner, state, lane, next);
}

function ownerState<Args extends unknown[], Result>(
	definition: TaskDefinition<Args, Result>,
	owner: TaskOwnerRecord
): InternalTaskOwnerState<Result> {
	let state = definition.owners.get(owner);
	if (!state) {
		state = reactive<InternalTaskOwnerState<Result>>({
			nextGeneration: 0,
			generation: 0,
			pendingCount: 0,
			result: undefined,
			error: undefined,
			lanes: new Map()
		});
		definition.owners.set(owner, state);
	}
	return state;
}

function taskLane<Result>(
	state: InternalTaskOwnerState<Result>,
	key: unknown
): InternalTaskLane<Result> {
	let lane = state.lanes.get(key);
	if (!lane) {
		lane = {
			key,
			active: new Set(),
			queue: [],
			pendingCount: 0,
			generation: 0,
			result: undefined,
			error: undefined
		};
		state.lanes.set(key, lane);
	}
	return lane;
}

function cancelLane<Result>(lane: InternalTaskLane<Result>, reason: unknown): void {
	for (const record of lane.active) {
		record.readinessRegistration?.cancel();
		rollbackReactiveMutationJournals(record.journals);
		record.journals.length = 0;
		record.controller.abort(reason);
	}
}

function readDefinition<Args extends unknown[], Result>(
	task: TaskFunction<Args, Result>
): TaskDefinition<Args, Result> {
	const definition = (
		task as TaskFunction<Args, Result> & {
			[taskDefinitionBrand]?: TaskDefinition<Args, Result>;
		}
	)[taskDefinitionBrand];
	if (!definition)
		throw new TypeError('taskStatus() and task invocation require a compiled or defineTask() task');
	return definition;
}

function resolveBoundOwner(owner?: TaskOwner): TaskOwnerRecord {
	if (owner) return taskOwnerRecord(owner);
	const ownerRecord = currentTaskOwnerRecord();
	if (!ownerRecord)
		throw new Error('Binding task status requires an explicit owner outside a durable task host');
	return ownerRecord;
}
import '../component/task-capability-integration.js';
