import type { AnyComponentInstance } from './contracts.js';
import { componentLogMethod } from './log.js';

/** Scalar attributes retained by a component performance trace. */
export type ComponentTraceAttributes = Readonly<Record<string, string | number | boolean | null>>;

/** Defers diagnostic attribute construction until a trace mark is emitted. */
export type LazyComponentTraceAttributes =
	| ComponentTraceAttributes
	| (() => ComponentTraceAttributes);

/** Correlates allocation-on-demand timing marks for one component-owned operation. */
export type ComponentTraceSpan = Readonly<{
	operation: string;
	operationId: string;
	startedAt: number;
}>;

/** Enabled-only constructor for one component performance span. */
export type ComponentTraceStarter = (
	operation: string,
	operationId: string,
	attributes?: ComponentTraceAttributes
) => ComponentTraceSpan;

/**
 * Begins a component performance span only when trace logging is currently enabled.
 * Disabled tracing performs no timestamp read and allocates no span or log arguments.
 */
export function componentTraceStarter(
	instance: AnyComponentInstance
): ComponentTraceStarter | undefined {
	const trace = componentLogMethod(instance, 'trace');
	if (!trace) return undefined;
	return (operation, operationId, attributes) => {
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
	};
}

/** Emits one runtime-rechecked timing mark for an enabled component trace span. */
export function markComponentTrace(
	instance: AnyComponentInstance,
	span: ComponentTraceSpan | undefined,
	phase: string,
	attributes?: LazyComponentTraceAttributes
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
			...(attributes
				? { attributes: typeof attributes === 'function' ? attributes() : attributes }
				: {})
		}
	]);
}

function traceTimestamp(): number {
	return globalThis.performance?.now() ?? Date.now();
}
