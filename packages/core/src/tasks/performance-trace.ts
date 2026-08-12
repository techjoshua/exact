import { markComponentTrace, startComponentTrace } from '../component/performance-trace.js';
import type { ComponentInstance } from '../component/contracts.js';
import { currentInteraction } from '../interaction/execution.js';
import type { TaskOwnerRecord } from './frame-contracts.js';
import type { InternalTaskGeneration } from './runtime-types.js';

/** Begins trace-only timing for one scheduled component-owned task generation. */
export function startTaskPerformanceTrace<Result>(
	owner: TaskOwnerRecord,
	record: InternalTaskGeneration<Result>,
	sourceEntityId: string | undefined,
	label: string | undefined
): void {
	const traceOwner = componentTraceOwner(owner);
	if (!traceOwner) return;
	const interaction = currentInteraction();
	const span = startComponentTrace(
		traceOwner,
		'task',
		`task:${sourceEntityId ?? label ?? 'anonymous'}:${record.generation}`,
		{
			activation: record.activation,
			generation: record.generation,
			priority: record.priority,
			...(interaction ? { interactionId: interaction.id } : {})
		}
	);
	if (span) record.trace = { owner: traceOwner, span };
}

/** Emits one correlated timing phase when tracing began for the task generation. */
export function markTaskPerformanceTrace<Result>(
	record: InternalTaskGeneration<Result>,
	phase: string,
	attributes?: Readonly<Record<string, string | number | boolean | null>>
): void {
	if (record.trace) markComponentTrace(record.trace.owner, record.trace.span, phase, attributes);
}

function componentTraceOwner(owner: TaskOwnerRecord): ComponentInstance<any> | undefined {
	const host = owner.host;
	if (!host || typeof host !== 'object' || !('log' in host) || !('id' in host)) return undefined;
	return host as ComponentInstance<any>;
}
