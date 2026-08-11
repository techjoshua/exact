import type { AuthoredComponentFunction } from '../component/contracts.js';

/** Component implementation accepted by an open client-only boundary. */
export type DynamicComponentCandidate<Props = Record<string, unknown>> = AuthoredComponentFunction<
	Record<string, unknown>,
	Props
>;

/** Value published by a dynamic component resolver. */
export type DynamicComponentResolution<Props = Record<string, unknown>> =
	| DynamicComponentCandidate<Props>
	| null
	| undefined;

/** Owner-scoped provider invoked whenever its compiler-observed dependencies change. */
export type DynamicComponentResolver<Props = Record<string, unknown>> = (
	signal: AbortSignal
) => DynamicComponentResolution<Props> | Promise<DynamicComponentResolution<Props>>;

/** Public availability states exposed to inspection without exposing candidate values. */
export type DynamicComponentStatus = 'unassigned' | 'pending' | 'absent' | 'available' | 'failed';

/** Read-only inspection state carried by a compiler-authored dynamic boundary. */
export type DynamicComponentInspection = Readonly<{
	id: string;
	readonly status: DynamicComponentStatus;
	readonly generation: number;
	readonly componentId?: string;
	readonly error?: unknown;
}>;
