import type { ExactArtifactTarget } from './artifacts.js';

/** Defines the exact placement type contract. */
export type ExactPlacement = 'server' | 'client' | 'isomorphic' | 'unknown';

/** Defines the exact policy residency type contract. */
export type ExactPolicyResidency = 'server' | 'client' | 'shared';

/** Defines the exact data policy ir type contract. */
export type ExactDataPolicyIR = {
	residency: ExactPolicyResidency;
	secret: boolean;
};

/** Defines the exact policy subject ir type contract. */
export type ExactPolicySubjectIR = {
	id: string;
	kind: 'declaration' | 'field' | 'parameter' | 'return' | 'state' | 'context';
	name: string;
	path?: string;
	componentId?: string;
	callableId?: string;
	parameterIndex?: number;
	/** Provider selector when statically known. Never contains a secret value. */
	selector?: string;
	policy: ExactDataPolicyIR;
	source: 'annotation' | 'context-option' | 'inference' | 'import';
};

/** Defines the exact policy flow kind type contract. */
export type ExactPolicyFlowKind = 'propagation' | 'receipt' | 'projection' | 'transfer';

/** Defines the exact policy flow ir type contract. */
export type ExactPolicyFlowIR = {
	id: string;
	kind: ExactPolicyFlowKind;
	from: string[];
	to: string;
	policy: ExactDataPolicyIR;
	boundary?:
		| 'client-island'
		| 'hydration'
		| 'context'
		| 'call'
		| 'state'
		| 'vnode'
		| 'error'
		| 'log';
	authorized: boolean;
	reason?: string;
};

/** Defines the exact secret consumption authorization type contract. */
export type ExactSecretConsumptionAuthorization =
	| 'implicit-application-owner'
	| 'library-requirement'
	| 'denied';

/** Defines the exact secret consumption ir type contract. */
export type ExactSecretConsumptionIR = {
	id: string;
	selector?: string;
	dynamic: boolean;
	source: string;
	line: number;
	column: number;
	caller: string;
	consumer: {
		package: string;
		symbol: string;
		parameter: number;
	};
	target: ExactArtifactTarget;
	authorization: ExactSecretConsumptionAuthorization;
	reason?: string;
};

/** Defines the exact policy audit report type contract. */
export type ExactPolicyAuditReport = {
	version: 1;
	generatedAt: string;
	secretUsage: Array<{
		selector: string;
		consumer: string;
		symbol: string;
		parameter: number;
		status: 'implicit' | 'granted' | 'denied' | 'required';
		source: string;
	}>;
	warnings: string[];
	errors: string[];
};

/** Defines the exact policy analysis ir type contract. */
export type ExactPolicyAnalysisIR = {
	version: 1;
	subjects: ExactPolicySubjectIR[];
	flows: ExactPolicyFlowIR[];
	secretConsumers: ExactSecretConsumptionIR[];
};
