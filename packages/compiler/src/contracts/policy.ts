import type { ExactArtifactTarget } from './artifacts.js';

export type ExactPlacement = 'server' | 'client' | 'isomorphic' | 'unknown';

export type ExactPolicyResidency = 'server' | 'client' | 'isomorphic';

export type ExactDataPolicyIR = {
	residency: ExactPolicyResidency;
	secret: boolean;
};

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

export type ExactPolicyFlowKind = 'propagation' | 'receipt' | 'projection' | 'transfer';

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

export type ExactSecretConsumptionAuthorization =
	| 'implicit-application-owner'
	| 'library-requirement'
	| 'denied';

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

export type ExactPolicyManifestIR = {
	version: 1;
	subjects: ExactPolicySubjectIR[];
	flows: ExactPolicyFlowIR[];
	secretConsumers: ExactSecretConsumptionIR[];
};
