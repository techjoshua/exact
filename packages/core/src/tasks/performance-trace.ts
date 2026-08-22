import { componentTraceStarter, markComponentTrace } from '../component/performance-trace.js';
import type { AnyComponentInstance } from '../component/contracts.js';
import { currentInteraction } from '../interaction/execution.js';
import type { TaskOwnerRecord } from './frame-contracts.js';
import type { InternalTaskGeneration } from './runtime-types.js';

/** Trace token retained only while task-level component logging is enabled. */
export type TaskPerformanceTrace = NonNullable<InternalTaskGeneration<unknown>['trace']>;

/** Begins trace-only timing for one scheduled component-owned task generation. */
export function startTaskPerformanceTrace<Result>(
	owner: TaskOwnerRecord,
	record: InternalTaskGeneration<Result>,
	sourceEntityId: string | undefined,
	label: string | undefined
): void {
	const trace = startTaskTrace(owner, record, sourceEntityId, label);
	if (trace) record.trace = trace;
}

/** Begins timing for a compact compiler-selected task generation. */
export function startCompiledTaskPerformanceTrace(
	owner: TaskOwnerRecord,
	details: Readonly<{
		activation: InternalTaskGeneration<unknown>['activation'];
		generation: number;
		priority: InternalTaskGeneration<unknown>['priority'];
	}>,
	sourceEntityId: string | undefined,
	label: string | undefined
): TaskPerformanceTrace | undefined {
	return startTaskTrace(owner, details, sourceEntityId, label);
}

function startTaskTrace(
	owner: TaskOwnerRecord,
	details: Readonly<{
		activation: InternalTaskGeneration<unknown>['activation'];
		generation: number;
		priority: InternalTaskGeneration<unknown>['priority'];
	}>,
	sourceEntityId: string | undefined,
	label: string | undefined
): TaskPerformanceTrace | undefined {
	const traceOwner = componentTraceOwner(owner);
	if (!traceOwner) return undefined;
	const interaction = currentInteraction();
	const span = componentTraceStarter(traceOwner)?.(
		'task',
		`task:${sourceEntityId ?? label ?? 'anonymous'}:${details.generation}`,
		{
			activation: details.activation,
			generation: details.generation,
			priority: details.priority,
			...(interaction ? { interactionId: interaction.id } : {})
		}
	);
	return span ? { owner: traceOwner, span } : undefined;
}

/** Emits one correlated timing phase when tracing began for the task generation. */
export function markTaskPerformanceTrace<Result>(
	record: InternalTaskGeneration<Result>,
	phase: string,
	attributes?: Readonly<Record<string, string | number | boolean | null>>
): void {
	if (!record.trace) return;
	markComponentTrace(record.trace.owner, record.trace.span, phase, attributes);
	if (phase === 'settled') delete record.trace;
}

/** Completes one compact compiler-selected task trace without a generic generation record. */
export function markCompiledTaskPerformanceTrace(
	trace: TaskPerformanceTrace | undefined,
	attributes: Readonly<Record<string, string | number | boolean | null>>
): void {
	if (trace) markComponentTrace(trace.owner, trace.span, 'settled', attributes);
}

function componentTraceOwner(owner: TaskOwnerRecord): AnyComponentInstance | undefined {
	const host = owner.host;
	if (!host || typeof host !== 'object' || !('log' in host) || !('id' in host)) return undefined;
	return host as AnyComponentInstance;
}
