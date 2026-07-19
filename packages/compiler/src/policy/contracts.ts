import type { Variable } from '@exact/expressions';
import type { CallableEffectPlan } from '../analysis/callable-effects.js';
import type { ExpressionTaskPlan } from '../expression/task-contracts.js';
import type { ExactPolicyFlowIR, ExactPolicyManifestIR, ExactPolicySubjectIR } from '../types.js';
import { type PolicyRecord, type StatePolicyRecord } from './algebra.js';

/** Defines the policy input type contract. */
export type PolicyInput = {
	variable: Variable;
	record: PolicyRecord;
	syntheticSource?: true;
};

/** Defines the exact policy metadata interface contract. */
export interface ExactPolicyMetadata {
	readonly subjects: readonly ExactPolicySubjectIR[];
	readonly declarationPolicies: ReadonlyMap<string, PolicyRecord>;
	readonly namedDeclarationPolicies: ReadonlyMap<string, PolicyRecord>;
	readonly callablePolicies: ReadonlyMap<string, PolicyRecord>;
	readonly contextCallEffects: ReadonlyMap<string, 'server' | 'client' | 'isomorphic'>;
	readonly contextPolicies: ReadonlyMap<string, PolicyRecord>;
	readonly statePolicies: readonly StatePolicyRecord[];
	readonly secretConsumeCallIds: ReadonlySet<string>;
	readonly flows: readonly ExactPolicyFlowIR[];
	readonly diagnostics: readonly string[];
}

/** Describes the result produced by exact policy task. */
export interface ExactPolicyTaskResult {
	readonly tasks: ExpressionTaskPlan;
	readonly diagnostics: readonly string[];
}

/** Describes the result produced by exact policy callable. */
export interface ExactPolicyCallableResult {
	readonly callables: CallableEffectPlan;
	readonly diagnostics: readonly string[];
}

/** Describes the result produced by exact policy manifest. */
export interface ExactPolicyManifestResult {
	readonly policy: ExactPolicyManifestIR;
	readonly diagnostics: readonly string[];
}

/** Defines the exact secret qualification site interface contract. */
export interface ExactSecretQualificationSite {
	readonly start: number;
	readonly end: number;
	readonly underlyingType: string;
}

/** Describes the planned exact secret qualification operation. */
export interface ExactSecretQualificationPlan {
	readonly sites: readonly ExactSecretQualificationSite[];
}
