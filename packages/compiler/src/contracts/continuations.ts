import type { ExactContextEffect, ExactStateEffect } from './analysis.js';
import type { ExactPlacement } from './policy.js';

/** Describes the client activation record required to resume one server continuation. */
export type ExactContinuationActivationIR = {
	/** Scheduled state snapshots transported from the owning client instance. */
	stateReads: ExactStateEffect[];
	/** Source paths whose values are substituted into inferred task parameters. */
	dependencies: Array<{
		index: number;
		source: 'state' | 'props' | 'derived';
	}>;
	/** Server-owned tokens resolved for each invocation rather than transported by the client. */
	serverContexts: ExactContextEffect[];
	/** Explicitly shared context projections transported with the activation record. */
	publicContexts: ExactContextEffect[];
};

/** Describes the only client-visible effects a continuation may return. */
export type ExactContinuationEffectsIR = {
	/** Component state paths the response is permitted to update. */
	stateWrites: ExactStateEffect[];
	/** Component context tokens the continuation may provide to descendants. */
	contextWrites: ExactContextEffect[];
	/** DOM boundaries the response is permitted to patch or replace. */
	boundaries: string[];
};

/** Compiler-owned description of one cross-runtime component state-machine transition. */
export type ExactContinuationIR = {
	id: string;
	kind: 'task';
	componentId: string;
	taskId: string;
	placement: Extract<ExactPlacement, 'server' | 'isomorphic'>;
	async: boolean;
	activation: ExactContinuationActivationIR;
	effects: ExactContinuationEffectsIR;
	ownership: {
		componentId: string;
		lifetime: 'component';
	};
	cancellation: 'abort-signal';
};

/** Values required only while the server performs the initial component transition. */
export type ExactServerRenderRecordIR = {
	stateReads: string[];
	serverContexts: ExactContextEffect[];
};

/** Minimum public record required to resume a durable component in the browser. */
export type ExactClientResumptionRecordIR = {
	statePaths: string[];
	valueCaptures: string[];
	boundaries: string[];
};

/** Separates ephemeral SSR authority from data deliberately emitted for client resumption. */
export type ExactComponentResumptionIR = {
	componentId: string;
	serverRender: ExactServerRenderRecordIR;
	client: ExactClientResumptionRecordIR;
};
