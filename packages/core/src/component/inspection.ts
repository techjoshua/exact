import {
	EXACT_DEVTOOLS_PROTOCOL_VERSION,
	previewExactValue,
	type ExactActionRuntimeSnapshot,
	type ExactContextPreview,
	type ExactInspectedRuntimeComponent,
	type ExactInspectionRuntimeId,
	type ExactRuntimeInspectionEvent,
	type ExactRuntimeInspectionEventKind,
	type ExactRuntimeInspectionSink,
	type ExactTaskRuntimeSnapshot,
	type ExactValueRedactor
} from '@exactjs/devtools-protocol';
import { readExactComponentContract } from '../component-contracts.js';
import type { ComponentInstance, TaskRegistration } from './contracts.js';
import { inspectComponentActions } from './action-api.js';

/** Runtime fields fixed for one build and component-domain owner. */
export type ExactRuntimeInspectionOwnerOptions = Readonly<{
	buildKey: string;
	executionRoot: string;
	binding?: string;
	side?: 'client' | 'server';
	redact?: ExactValueRedactor;
}>;

/** Input published by runtime packages before the owner adds sequence/session identity. */
export type ExactRuntimeInspectionEventInput = Readonly<{
	kind: ExactRuntimeInspectionEventKind;
	component: ComponentInstance<any>;
	sourceEntityId?: string;
	operationId?: string;
	generation?: number;
	requestId?: string;
	interactionId?: string;
	path?: string;
	reason?: string;
	attributes?: Readonly<Record<string, string | number | boolean | null>>;
}>;

/**
 * Explicit, attachable owner for one instrumented component domain.
 *
 * It retains no history before attachment. Detaching drops the sink immediately and does not
 * affect component scheduling, ownership, lifecycle, or error propagation.
 */
export interface ExactRuntimeInspectionOwner {
	readonly buildKey: string;
	readonly executionRoot: string;
	readonly binding?: string;
	readonly side: 'client' | 'server';
	readonly attached: boolean;
	attach(sessionId: string, sink: ExactRuntimeInspectionSink): void;
	detach(sessionId?: string): void;
	publish(input: ExactRuntimeInspectionEventInput): void;
	identity(
		component: ComponentInstance<any>,
		details?: Readonly<{
			sourceEntityId?: string;
			operationId?: string;
			generation?: number;
		}>
	): ExactInspectionRuntimeId | undefined;
	preview(value: unknown, path?: readonly string[]): ReturnType<typeof previewExactValue>;
}

/** Creates a domain-scoped observation owner without installing process-global state. */
export function createExactRuntimeInspectionOwner(
	options: ExactRuntimeInspectionOwnerOptions
): ExactRuntimeInspectionOwner {
	let sessionId: string | undefined;
	let sink: ExactRuntimeInspectionSink | undefined;
	let sequence = 0;
	const owner: ExactRuntimeInspectionOwner = {
		buildKey: options.buildKey,
		executionRoot: options.executionRoot,
		binding: options.binding,
		side: options.side ?? 'client',
		get attached() {
			return !!sink;
		},
		attach(nextSessionId, nextSink) {
			if (!nextSessionId) throw new TypeError('Inspection session ID must not be empty');
			sessionId = nextSessionId;
			sink = nextSink;
			sequence = 0;
		},
		detach(expectedSessionId) {
			if (expectedSessionId && expectedSessionId !== sessionId) return;
			sessionId = undefined;
			sink = undefined;
			sequence = 0;
		},
		publish(input) {
			if (!sessionId || !sink) return;
			const id = owner.identity(input.component, input);
			if (!id) return;
			const current = ++sequence;
			sink.publish(
				Object.freeze({
					protocol: EXACT_DEVTOOLS_PROTOCOL_VERSION,
					cursor: current.toString(36),
					sequence: current,
					timestamp: monotonicTimestamp(),
					wallTime: Date.now(),
					kind: input.kind,
					id,
					...(input.requestId ? { requestId: input.requestId } : {}),
					...(input.interactionId ? { interactionId: input.interactionId } : {}),
					...(input.path ? { path: input.path } : {}),
					...(input.reason ? { reason: input.reason } : {}),
					...(input.attributes ? { attributes: Object.freeze({ ...input.attributes }) } : {})
				} satisfies ExactRuntimeInspectionEvent)
			);
		},
		identity(component, details = {}) {
			if (!sessionId) return undefined;
			const contract = readExactComponentContract(component.type);
			return Object.freeze({
				sessionId,
				side: owner.side,
				...(owner.binding ? { binding: owner.binding } : {}),
				buildKey: owner.buildKey,
				executionRoot: owner.executionRoot,
				componentTypeId: contract?.id ?? component.type.name ?? 'anonymous-component',
				instanceId: component.id,
				...(details.sourceEntityId ? { sourceEntityId: details.sourceEntityId } : {}),
				...(details.operationId ? { operationId: details.operationId } : {}),
				...(details.generation === undefined ? {} : { generation: details.generation })
			});
		},
		preview(value, path = []) {
			return previewExactValue(value, { redact: options.redact, path });
		}
	};
	return Object.freeze(owner);
}

/** Projects one component without exposing callbacks, controllers, scopes, or raw instances. */
export function inspectExactRuntimeComponent(
	component: ComponentInstance<any>,
	options: Readonly<{
		status?: ExactInspectedRuntimeComponent['status'];
		parent?: ExactInspectionRuntimeId;
		contexts?: readonly ExactContextPreview[];
		ownedElements?: number;
		activity?: ExactInspectedRuntimeComponent['activity'];
		suspense?: ExactInspectedRuntimeComponent['suspense'];
	}> = {}
): ExactInspectedRuntimeComponent | undefined {
	const owner = component.domain.inspection;
	const id = owner?.identity(component);
	if (!owner || !id) return undefined;
	return Object.freeze({
		id,
		...(options.parent ? { parent: options.parent } : {}),
		name: component.type.name || 'Anonymous',
		status: options.status ?? (component.mounted ? 'mounted' : 'constructing'),
		props: owner.preview(component.props, ['props']),
		state: owner.preview(component.state, ['state']),
		contexts: Object.freeze([...(options.contexts ?? [])]),
		tasks: Object.freeze(component.tasks.map((task) => inspectTask(owner, component, task))),
		actions: Object.freeze(
			inspectComponentActions(component).map((action) => {
				const actionId = owner.identity(component, { generation: action.generation })!;
				return Object.freeze({
					id: actionId,
					name: action.name,
					placement: action.placement === 'inferred' ? 'isomorphic' : action.placement,
					priority: action.priority,
					concurrency: action.concurrency,
					status: action.disposed
						? 'cancelled'
						: action.pending
							? 'running'
							: action.error
								? 'failed'
								: action.generation
									? 'settled'
									: 'idle',
					generation: action.generation,
					pending: action.pendingCount,
					optimistic: false
				} satisfies ExactActionRuntimeSnapshot);
			})
		),
		...(options.activity ? { activity: options.activity } : {}),
		...(options.suspense ? { suspense: options.suspense } : {}),
		ownedElements: options.ownedElements ?? 0
	});
}

function inspectTask(
	owner: ExactRuntimeInspectionOwner,
	component: ComponentInstance<any>,
	task: TaskRegistration
): ExactTaskRuntimeSnapshot {
	const id = owner.identity(component, { generation: task.generation })!;
	return Object.freeze({
		id,
		placement: task.policy.placement === 'inferred' ? 'unknown' : task.policy.placement,
		readiness: task.policy.readiness,
		priority: task.policy.priority,
		status: task.stopped
			? 'cancelled'
			: task.queuedGeneration !== undefined
				? 'queued'
				: task.settlement
					? 'running'
					: task.failedGeneration === task.generation
						? 'failed'
						: task.completedGeneration === task.generation
							? 'settled'
							: 'idle',
		generation: task.generation,
		...(task.completedGeneration === undefined
			? {}
			: { completedGeneration: task.completedGeneration }),
		...(task.failedGeneration === undefined ? {} : { failedGeneration: task.failedGeneration })
	});
}

function monotonicTimestamp(): number {
	return globalThis.performance?.now() ?? Date.now();
}
