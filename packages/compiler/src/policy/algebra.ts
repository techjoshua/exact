import type { ExpressionDirective, ExpressionType } from '@exactjs/expressions';
import { exactKeepPolicy, type ExactKeepPolicy } from '../annotations.js';
import { stableId } from '../ids.js';
import type {
	ExactArtifactTarget,
	ExactCallableSummaryIR,
	ExactDataPolicyIR,
	ExactEnvironmentEffectSourceIR,
	ExactPolicyFlowIR,
	ExactPolicySubjectIR
} from '../types.js';

/** One policy associated with a stable subject in the compiler graph. */
export type PolicyRecord = Readonly<{
	policy: ExactDataPolicyIR;
	subjectId: string;
	selector?: string;
}>;

/** A policy attached to a component state path. */
export type StatePolicyRecord = PolicyRecord &
	Readonly<{
		component: string;
		path: string;
	}>;

/** Returns whether a declared policy path can govern an accessed state path. */
export function pathsOverlapForPolicy(policyPath: string, accessedPath: string): boolean {
	return (
		accessedPath === '*' ||
		policyPath === accessedPath ||
		accessedPath.startsWith(`${policyPath}.`) ||
		policyPath.startsWith(`${accessedPath}.`)
	);
}

/** Returns whether two concrete or wildcard state paths intersect. */
export function pathsOverlap(left: string, right: string): boolean {
	return (
		left === '*' ||
		right === '*' ||
		left === right ||
		left.startsWith(`${right}.`) ||
		right.startsWith(`${left}.`)
	);
}

/** Returns whether a path is equal to or nested beneath an ancestor path. */
export function isAncestorPath(ancestor: string, descendant: string): boolean {
	return descendant === ancestor || descendant.startsWith(`${ancestor}.`);
}

/** Converts the author-facing keep vocabulary into compiler policy IR. */
export function dataPolicy(keep: ExactKeepPolicy | 'isomorphic'): ExactDataPolicyIR {
	if (keep === 'secret') return Object.freeze({ residency: 'server', secret: true });
	return Object.freeze({ residency: keep, secret: false });
}

/** Converts policy IR back to the closest author-facing keep value. */
export function keepForPolicy(policy: ExactDataPolicyIR): ExactKeepPolicy {
	return policy.secret ? 'secret' : policy.residency === 'isomorphic' ? 'server' : policy.residency;
}

/** Reads a data policy from compiler directives, when one is declared. */
export function policyFromDirectives(
	directives: readonly ExpressionDirective[] | undefined
): ExactDataPolicyIR | undefined {
	const keep = exactKeepPolicy(directives);
	return keep ? dataPolicy(keep) : undefined;
}

/**
 * Derives a policy from a type and its union members.
 *
 * Conflicting union residency is deliberately unresolved so callers fail
 * closed rather than selecting one branch arbitrarily.
 */
export function policyFromType(type: ExpressionType | undefined): ExactDataPolicyIR | undefined {
	if (!type) return undefined;
	const direct = exactKeepPolicy(type.directives);
	if (direct) return dataPolicy(direct);
	const combined = combinePolicies(
		type.unionMembers
			.map((member) => policyFromType(member))
			.filter((policy): policy is ExactDataPolicyIR => !!policy)
	);
	return combined.conflict ? undefined : combined.policy;
}

/** Reads the author-facing keep value implied by a type policy. */
export function keepFromType(type: ExpressionType | undefined): ExactKeepPolicy | undefined {
	const policy = policyFromType(type);
	return policy ? keepForPolicy(policy) : undefined;
}

/** Combines policy records and reports incompatible concrete residencies. */
export function combinePolicyRecords(records: readonly PolicyRecord[]): {
	policy?: ExactDataPolicyIR;
	conflict: boolean;
} {
	if (!records.length) return { conflict: false };
	const secret = records.some((record) => record.policy.secret);
	const residencies = new Set(
		records.map((record) => record.policy.residency).filter((value) => value !== 'isomorphic')
	);
	if (residencies.size > 1) return { conflict: true };
	const residency = secret ? 'server' : ([...residencies][0] ?? 'isomorphic');
	return { policy: Object.freeze({ residency, secret }), conflict: false };
}

/** Combines bare policies using the same lattice as subject-backed records. */
export function combinePolicies(policies: readonly ExactDataPolicyIR[]): {
	policy?: ExactDataPolicyIR;
	conflict: boolean;
} {
	return combinePolicyRecords(
		policies.map((policy, index) => ({ policy, subjectId: `combined:${index}` }))
	);
}

/** Restricts a callable summary to the artifact permitted by its data policy. */
export function restrictCallable(
	summary: ExactCallableSummaryIR,
	policy: ExactDataPolicyIR,
	diagnostics: Set<string>
): ExactCallableSummaryIR {
	const target: ExactArtifactTarget = policy.residency === 'client' ? 'client' : 'server';
	const environment = target === 'client' ? 'browser' : 'server';
	const opposite = target === 'client' ? 'server' : 'browser';
	if (summary.effectSources.some((source) => source.environment === opposite)) {
		diagnostics.add(
			`error: ${describePolicy(policy)} declaration ${summary.name} has ${opposite}-only execution effects`
		);
	}
	const source: ExactEnvironmentEffectSourceIR = {
		environment,
		description: `${describePolicy(policy)} data policy`,
		path: [summary.name, `${describePolicy(policy)} data policy`]
	};
	return Object.freeze({
		...summary,
		directEffect: summary.directEffect === 'neutral' ? environment : summary.directEffect,
		effect: summary.effect === 'neutral' ? environment : summary.effect,
		directEffectSources: uniquePolicyEffectSources([...summary.directEffectSources, source]),
		effectSources: uniquePolicyEffectSources([...summary.effectSources, source]),
		artifactTargets: [target]
	});
}

/** Returns whether policy constrains placement or transfer. */
export function isRestrictivePolicy(policy: ExactDataPolicyIR): boolean {
	return policy.secret || policy.residency !== 'isomorphic';
}

/** Deduplicates effect sources without disturbing their discovery order. */
export function uniquePolicyEffectSources(
	values: readonly ExactCallableSummaryIR['effectSources'][number][]
): ExactCallableSummaryIR['effectSources'] {
	return [
		...new Map(
			values.map((value) => [
				`${value.environment}:${value.description}:${value.path.join(':')}`,
				value
			])
		).values()
	];
}

/** Returns whether two policies require incompatible concrete residencies. */
export function residencyConflict(left: ExactDataPolicyIR, right: ExactDataPolicyIR): boolean {
	return (
		left.residency !== 'isomorphic' &&
		right.residency !== 'isomorphic' &&
		left.residency !== right.residency
	);
}

/** Compares the complete semantic value of two data policies. */
export function samePolicy(left: ExactDataPolicyIR, right: ExactDataPolicyIR): boolean {
	return left.residency === right.residency && left.secret === right.secret;
}

/** Formats a policy for author-facing diagnostics. */
export function describePolicy(policy: ExactDataPolicyIR): string {
	return policy.secret ? 'secret' : `${policy.residency}-kept`;
}

/** Creates a stable policy subject IR record. */
export function policySubject(
	filename: string,
	input: Omit<ExactPolicySubjectIR, 'id'>
): ExactPolicySubjectIR {
	const identity = [
		input.kind,
		input.name,
		input.path ?? '',
		input.componentId ?? '',
		input.callableId ?? '',
		input.parameterIndex ?? ''
	].join(':');
	return {
		id: stableId(filename, `policy:subject:${identity}`),
		...input
	};
}

/** Creates a stable policy-flow IR record. */
export function policyFlow(
	filename: string,
	input: Omit<ExactPolicyFlowIR, 'id'>
): ExactPolicyFlowIR {
	return {
		id: stableId(
			filename,
			`policy:flow:${input.kind}:${input.from.join(',')}:${input.to}:${input.boundary ?? ''}`
		),
		...input
	};
}

/** Deduplicates and deterministically orders policy subjects. */
export function sortSubjects(subjects: readonly ExactPolicySubjectIR[]): ExactPolicySubjectIR[] {
	return [...new Map(subjects.map((subject) => [subject.id, subject])).values()].sort(
		(left, right) => left.id.localeCompare(right.id)
	);
}

/** Orders component state policies by component and path. */
export function compareStatePolicy(left: StatePolicyRecord, right: StatePolicyRecord): number {
	return left.component.localeCompare(right.component) || left.path.localeCompare(right.path);
}

/** Creates the lookup identity for a component state path. */
export function stateKey(component: string, path: string): string {
	return `${component}:${path}`;
}
