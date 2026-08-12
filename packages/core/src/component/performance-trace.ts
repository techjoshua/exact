import type { ComponentInstance } from './contracts.js';
import { componentLogMethod } from './log.js';

/** Scalar attributes retained by a component performance trace. */
export type ComponentTraceAttributes = Readonly<Record<string, string | number | boolean | null>>;

/** Correlates allocation-on-demand timing marks for one component-owned operation. */
export type ComponentTraceSpan = Readonly<{
	operation: string;
	operationId: string;
	startedAt: number;
}>;

/**
 * Begins a component performance span only when trace logging is currently enabled.
 * Disabled tracing performs no timestamp read and allocates no span or log arguments.
 */
export function startComponentTrace(
	instance: ComponentInstance<any>,
	operation: string,
	operationId: string,
	attributes?: ComponentTraceAttributes
): ComponentTraceSpan | undefined {
	const trace = componentLogMethod(instance, 'trace');
	if (!trace) return undefined;
	const span = Object.freeze({ operation, operationId, startedAt: traceTimestamp() });
	trace(() => [
		`performance ${operation} started`,
		{
			operation,
			operationId,
			phase: 'started',
			elapsedMs: 0,
			...(attributes ? { attributes } : {})
		}
	]);
	return span;
}

/** Emits one runtime-rechecked timing mark for an enabled component trace span. */
export function markComponentTrace(
	instance: ComponentInstance<any>,
	span: ComponentTraceSpan | undefined,
	phase: string,
	attributes?: ComponentTraceAttributes
): void {
	if (!span) return;
	componentLogMethod(
		instance,
		'trace'
	)?.(() => [
		`performance ${span.operation} ${phase}`,
		{
			operation: span.operation,
			operationId: span.operationId,
			phase,
			elapsedMs: traceTimestamp() - span.startedAt,
			...(attributes ? { attributes } : {})
		}
	]);
}

function traceTimestamp(): number {
	return globalThis.performance?.now() ?? Date.now();
}
