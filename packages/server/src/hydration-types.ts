import type {
	ComponentResumptionActivation,
	ExactComponentContinuationContract
} from '@exactjs/core';
import type { ExactEndpointRoutes } from './types.js';

/** Browser-visible configuration derived from an executor contract and SSR state. */
export type ExactHydrationConfig = {
	endpoint?: string;
	endpoints?: ExactEndpointRoutes;
	state?: unknown;
	continuations?: Record<string, ExactComponentContinuationContract>;
	resumptions?: readonly ComponentResumptionActivation[];
	publicContexts?: Record<string, unknown>;
};

/** Selects browser-visible state and continuation metadata for SSR hydration. */
export type CreateExactHydrationConfigOptions = {
	state?: unknown;
	publicContexts?: Record<string, unknown>;
	/** Omit contracts when the generated client registration supplies the authoritative copy. */
	includeContinuations?: boolean;
};
