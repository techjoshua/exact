import type { ExactCollectionMutation } from '../component-contracts.js';

/** Identifies the operation represented by a framework protocol request. */
export type ExactInvocationKind = 'invoke' | 'refresh';

/** Selects one concrete compiler-planned partition instance. */
export type ExactPartitionDiscriminator =
	| Readonly<{ kind: 'single' }>
	| Readonly<{ kind: 'branch'; branch: string }>
	| Readonly<{ kind: 'keyed'; list: string; keyToken: string }>;

/** Carries generation-fenced authority for a compiler-planned partition. */
export type ExactPartitionAuthority = Readonly<{
	version: 1;
	buildKey: string;
	executionRoot: string;
	planEdgeId: string;
	ownerComponentId: string;
	discriminator: ExactPartitionDiscriminator;
	generation: number;
}>;

/** Maps compiler-owned operation identities to configured endpoint routes. */
export type ExactEndpointRoutes = {
	invocations?: Record<string, string>;
	boundaries?: Record<string, string>;
};

/** Describes one invocation or refresh request on the framework wire protocol. */
export type ExactInvocationRequest = {
	type: ExactInvocationKind;
	root?: string;
	id: string;
	partition?: ExactPartitionAuthority;
	opId?: string;
	dependsOn?: string[];
	payload?: unknown;
	state?: unknown;
	publicContext?: Record<string, unknown>;
	boundaryHtml?: string;
	boundaryHtmls?: Record<string, string>;
};

/** Groups invocation requests for bounded concurrent execution. */
export type ExactBatchRequest = {
	type: 'batch';
	version?: 1;
	operations: ExactInvocationRequest[];
};

/** Describes the transport-safe result of one invocation. */
export type ExactInvocationResult = {
	patches?: ExactPatch[];
	state?: unknown;
	mutations?: ExactCollectionMutation[];
	contexts?: Record<string, unknown>;
	value?: unknown;
	html?: string;
};

/** Describes a successful operation response. */
export type ExactOperationSuccess = {
	ok: true;
	type: ExactInvocationKind;
	id: string;
	opId?: string;
} & ExactInvocationResult;

/** Describes a rejected or failed operation response. */
export type ExactOperationError = {
	ok: false;
	type: ExactInvocationKind;
	id: string;
	opId?: string;
	status: number;
	error: 'bad_request' | 'not_found' | 'forbidden' | 'internal_error' | 'dependency_failed';
};

/** Describes the result of one operation. */
export type ExactOperationResult = ExactOperationSuccess | ExactOperationError;

/** Describes a completed batch response. */
export type ExactBatchResult = {
	ok: true;
	version: 1;
	results: ExactOperationResult[];
};

/** Reports one event in an incremental operation response. */
export type ExactStreamEvent =
	| { event: 'start'; version: 1; operations: number }
	| {
			event: 'patch';
			version: 1;
			index: number;
			type: ExactInvocationKind;
			id: string;
			opId?: string;
			patch: ExactPatch;
	  }
	| {
			event: 'state';
			version: 1;
			index: number;
			type: ExactInvocationKind;
			id: string;
			opId?: string;
			value: unknown;
	  }
	| {
			event: 'mutations';
			version: 1;
			index: number;
			type: ExactInvocationKind;
			id: string;
			opId?: string;
			mutations: ExactCollectionMutation[];
	  }
	| {
			event: 'html';
			version: 1;
			index: number;
			type: ExactInvocationKind;
			id: string;
			opId?: string;
			html: string;
	  }
	| { event: 'result'; version: 1; index: number; result: ExactOperationResult }
	| { event: 'complete'; version: 1 };

/** Describes one client-applied operation patch. */
export type ExactPatch =
	| { type: 'text'; id: string; value: string }
	| { type: 'prop'; id: string; name: string; value: unknown }
	| { type: 'style'; id: string; name: string; value: string | null }
	| {
			type: 'list';
			id: string;
			op: 'insert' | 'move' | 'remove';
			key: string;
			before?: string;
			html?: string;
	  }
	| { type: 'state'; id: string; value: unknown }
	| { type: 'replace'; id: string; html: string };

export type { ExactCollectionMutation } from '../component-contracts.js';
