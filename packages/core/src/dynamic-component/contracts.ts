import type { AuthoredComponentFunction } from '../component/contracts.js';

/** Component implementation accepted by an open client-only boundary. */
export type DynamicComponentCandidate<Props = Record<string, unknown>> = AuthoredComponentFunction<
	Record<string, unknown>,
	Props
>;

/** Existential dynamic candidate whose authored props are carried by its owning boundary. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Candidate props vary per boundary and are preserved by the surrounding generic contract.
export type AnyDynamicComponentCandidate = DynamicComponentCandidate<any>;

/** Value published by a dynamic component resolver. */
export type DynamicComponentResolution<Props = Record<string, unknown>> =
	| DynamicComponentCandidate<Props>
	| null
	| undefined;

/** Owner-scoped provider invoked whenever its compiler-observed dependencies change. */
export type DynamicComponentResolver<Props = Record<string, unknown>> = (
	signal: AbortSignal
) => DynamicComponentResolution<Props> | Promise<DynamicComponentResolution<Props>>;

/** Existential resolver stored by facade identity until a typed boundary retrieves it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Resolver props remain correlated with the facade even though the private weak map is heterogeneous.
export type AnyDynamicComponentResolver = DynamicComponentResolver<any>;

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

/** Build-authorized immutable client artifact eligible for an SSR module-preload hint. */
export type DynamicComponentArtifact = Readonly<{
	url: string;
	authorized: true;
	immutable: true;
	integrity?: string;
	crossOrigin?: 'anonymous' | 'use-credentials';
	referrerPolicy?:
		| 'no-referrer'
		| 'no-referrer-when-downgrade'
		| 'origin'
		| 'origin-when-cross-origin'
		| 'same-origin'
		| 'strict-origin'
		| 'strict-origin-when-cross-origin';
}>;
