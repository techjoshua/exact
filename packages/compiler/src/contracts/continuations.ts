import type { ExactContextEffect, ExactStateEffect } from './analysis.js';
import type { ExactPlacement } from './policy.js';

/** Describes the client activation record required to resume one server continuation. */
export type ExactContinuationActivationIR = {
	/** Scheduled state snapshots transported from the owning client instance. */
	stateReads: ExactStateEffect[];
	/** Source paths whose values are substituted into inferred task parameters. */
	dependencies: Array<{
		index: number;
		source: 'state' | 'props' | 'derived' | 'argument';
		/** Stable compiler path used to connect local producer and consumer ports. */
		path?: string;
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
	/** Component context writes retained exclusively within server execution. */
	serverContextWrites: ExactContextEffect[];
	/** DOM boundaries the response is permitted to patch or replace. */
	boundaries: string[];
};

/** Compiler-owned description of one cross-runtime component state-machine transition. */
export type ExactContinuationIR = {
	id: string;
	kind: 'task';
	/** Authored diagnostic label; never used as a protocol operation identity. */
	label?: string;
	componentId: string;
	taskId: string;
	placement: Extract<ExactPlacement, 'server' | 'isomorphic'>;
	readiness: 'blocking' | 'nonblocking';
	concurrency: 'parallel' | 'latest' | 'queue';
	async: boolean;
	activation: ExactContinuationActivationIR;
	effects: ExactContinuationEffectsIR;
	ownership: {
		componentId: string;
		lifetime: 'component' | 'invocation';
	};
	cancellation: 'abort-signal';
	invocation?: {
		arguments: Array<{ index: number; source: 'argument'; path?: string }>;
		concurrency: 'parallel' | 'latest' | 'queue';
	};
};

/** Values required only while the server performs the initial component transition. */
export type ExactServerRenderRecordIR = {
	stateReads: string[];
	serverContexts: ExactContextEffect[];
};

/** Minimum public record required to resume a durable component in the browser. */
export type ExactClientResumptionRecordIR = {
	statePaths: string[];
	stateInputs: Array<[statePath: string, propPath: string]>;
	valueCaptures: string[];
	contexts: string[];
	boundaries: string[];
};

/** Separates ephemeral SSR authority from data deliberately emitted for client resumption. */
export type ExactComponentResumptionIR = {
	componentId: string;
	serverRender: ExactServerRenderRecordIR;
	client: ExactClientResumptionRecordIR;
};
