import {
	EXACT_DEVTOOLS_PROTOCOL_VERSION,
	previewExactValue,
	type ExactContextPreview,
	type ExactInspectedRuntimeComponent,
	type ExactInspectionRuntimeId,
	type ExactRuntimeInspectionEvent,
	type ExactRuntimeInspectionEventKind,
	type ExactRuntimeInspectionSink,
	type ExactTaskRuntimeSnapshot,
	type ExactValueRedactor
} from '@exactjs/devtools-protocol';
import { exactComponentIdentity, isExactComponent } from '../component-contracts.js';
import { inspectTaskFramesForHost, type TaskFrameInspection } from '../tasks/frame-inspection.js';
import type { ComponentInstance } from './contracts.js';
import { componentDomainInspection } from './domain.js';

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
			try {
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
			} catch {
				// Inspection is observational and cannot participate in application errors.
			}
		},
		identity(component, details = {}) {
			if (!sessionId) return undefined;
			const authoredTypeName = component.type.name || 'anonymous-component';
			return Object.freeze({
				sessionId,
				side: owner.side,
				...(owner.binding ? { binding: owner.binding } : {}),
				buildKey: owner.buildKey,
				executionRoot: owner.executionRoot,
				componentTypeId: isExactComponent(component.type)
					? exactComponentIdentity(component.type)
					: authoredTypeName,
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
		targetContributions?: ExactInspectedRuntimeComponent['targetContributions'];
	}> = {}
): ExactInspectedRuntimeComponent | undefined {
	const owner = componentDomainInspection(component.domain);
	const id = owner?.identity(component);
	if (!owner || !id) return undefined;
	return Object.freeze({
		id,
		...(options.parent ? { parent: options.parent } : {}),
		name: component.type.name || 'Anonymous',
		status: options.status ?? (component.mounted ? 'mounted' : 'constructing'),
		props: owner.preview(component.props, ['props']),
		state: owner.preview(component.state, ['state']),
		contexts: Object.freeze([...(options.contexts ?? inspectContexts(component, owner))]),
		tasks: Object.freeze([
			...inspectTaskFramesForHost(component).map((frame) =>
				inspectTaskFrame(owner, component, frame)
			)
		]),
		...(options.activity ? { activity: options.activity } : {}),
		...(options.suspense ? { suspense: options.suspense } : {}),
		...(options.targetContributions?.length
			? { targetContributions: Object.freeze([...options.targetContributions]) }
			: {}),
		ownedElements: options.ownedElements ?? 0
	});
}

function inspectTaskFrame(
	owner: ExactRuntimeInspectionOwner,
	component: ComponentInstance<any>,
	frame: TaskFrameInspection
): ExactTaskRuntimeSnapshot {
	const sourceEntityId = taskFrameSourceEntityId(frame);
	return Object.freeze({
		id: owner.identity(component, { sourceEntityId, generation: frame.generation })!,
		...(frame.parentId === undefined
			? {}
			: {
					parent: owner.identity(component, {
						sourceEntityId: `runtime-task-frame:${frame.parentId}`,
						generation: frame.generation
					})!
				}),
		...(frame.label === undefined ? {} : { name: frame.label }),
		kind: frame.kind,
		activation: frame.activation,
		placement: frame.placement === 'current' ? 'isomorphic' : frame.placement,
		readiness: frame.readiness,
		priority: frame.priority,
		concurrency: frame.concurrency,
		status: 'running',
		generation: frame.generation,
		pending: frame.foreground ? 1 : 0,
		foreground: frame.foreground,
		structuralPending: frame.structuralPending,
		optimistic: false,
		startedAt: frame.startedAt
	});
}

function taskFrameSourceEntityId(frame: TaskFrameInspection): string {
	return frame.sourceEntityId ?? `runtime-task-frame:${frame.id}`;
}

function inspectContexts(
	component: ComponentInstance<any>,
	owner: ExactRuntimeInspectionOwner
): ExactContextPreview[] {
	const contexts: ExactContextPreview[] = [];
	for (const token of component.contextTokens.values()) {
		if (token.keep === 'secret') {
			contexts.push(
				Object.freeze({
					name: token.description,
					scope: token.scope,
					availability: 'secret',
					secretName: token.description
				})
			);
			continue;
		}
		if (token.keep === 'server') {
			contexts.push(
				Object.freeze({
					name: token.description,
					scope: token.scope,
					availability: 'resource',
					type: 'server-resource'
				})
			);
			continue;
		}
		const value = resolveInspectedContext(component, token.id);
		contexts.push(
			Object.freeze({
				name: token.description,
				scope: token.scope,
				availability: value.found ? 'value' : 'unavailable',
				...(value.found
					? { value: owner.preview(value.value, ['context', token.description]) }
					: {})
			})
		);
	}
	return contexts;
}

function resolveInspectedContext(
	component: ComponentInstance<any>,
	token: symbol
): Readonly<{ found: boolean; value?: unknown }> {
	if (component.contexts.has(token))
		return Object.freeze({ found: true, value: component.contexts.get(token) });
	for (let cursor = component.parent; cursor; cursor = cursor.parent)
		if (cursor.contexts.has(token))
			return Object.freeze({ found: true, value: cursor.contexts.get(token) });
	if (component.ambientContexts?.has(token))
		return Object.freeze({ found: true, value: component.ambientContexts.get(token) });
	return Object.freeze({ found: false });
}

function monotonicTimestamp(): number {
	return globalThis.performance?.now() ?? Date.now();
}
