import type { BoundModule, ExpressionType, NodeRef, Variable } from '@exactjs/expressions';
import { exactKeepPolicy } from '../annotations.js';
import { stableId } from '../ids.js';
import type { ExactPolicySubjectIR, ExactStateEffect } from '../types.js';
import {
	dataPolicy,
	isAncestorPath,
	keepFromType,
	pathsOverlapForPolicy,
	policyFromDirectives,
	policyFromType,
	policySubject,
	residencyConflict,
	type PolicyRecord,
	type StatePolicyRecord
} from './algebra.js';

import type { ExactPolicyMetadata, PolicyInput } from './contracts.js';
/** Performs the policy inputs domain operation. */
export function policyInputs(
	expression: NodeRef,
	policies: ReadonlyMap<string, PolicyRecord>,
	namedPolicies: ReadonlyMap<string, PolicyRecord> = new Map(),
	secretConsumeCallIds: ReadonlySet<string> = new Set()
): PolicyInput[] {
	if (secretConsumeCallIds.has(expression.node.id)) return [];
	const nestedConsumeCallIds = new Set(
		expression
			.walk()
			.calls()
			.toArray()
			.map((call) => call.node.id)
			.filter((id) => secretConsumeCallIds.has(id))
	);
	const values = new Map<string, PolicyInput>();
	for (const reference of expression.walk({ types: false }).references()) {
		if (reference.ancestors().any((ancestor) => nestedConsumeCallIds.has(ancestor.node.id)))
			continue;
		const variable = reference.variable;
		const record = variable ? policies.get(variable.id) : undefined;
		if (variable && record) values.set(variable.id, { variable, record });
	}
	const expressionPolicy = policyFromType(expression.type);
	if (expressionPolicy) {
		const synthetic = {
			id: `${expression.node.id}:type-policy`,
			name: expression.node.text ?? 'typed value'
		} as Variable;
		values.set(synthetic.id, {
			variable: synthetic,
			record: {
				policy: expressionPolicy,
				subjectId: stableId(expression.node.id, 'policy:type'),
				source: 'annotation'
			},
			syntheticSource: true
		});
	}
	const returnPolicy =
		expression.node.kind === 'CallExpression' || expression.node.kind === 'NewExpression'
			? (policyFromDirectives(expression.node.resolvedSignature?.returnDirectives) ??
				policyFromDirectives(expression.node.resolvedSignature?.directives))
			: undefined;
	if (returnPolicy) {
		const synthetic = {
			id: `${expression.node.id}:return`,
			name: expression.target?.node.text ?? 'return'
		} as Variable;
		values.set(synthetic.id, {
			variable: synthetic,
			record: {
				policy: returnPolicy,
				subjectId: stableId(expression.node.id, 'policy:return'),
				source: 'annotation'
			},
			syntheticSource: true
		});
	}
	if (
		(expression.node.kind === 'CallExpression' || expression.node.kind === 'NewExpression') &&
		expression.target?.name
	) {
		const record = namedPolicies.get(expression.target.name);
		if (record) {
			const synthetic = {
				id: `${expression.node.id}:local-return`,
				name: expression.target.name
			} as Variable;
			values.set(synthetic.id, { variable: synthetic, record });
		}
	}
	const inputs = [...values.values()];
	if (returnPolicy?.residency !== 'shared') return inputs;
	// A shared return contract releases only the produced value's residency.
	// Server-local receivers and ordinary arguments still determine execution
	// placement elsewhere, while secret qualification must continue to win.
	return inputs.filter((input) => input.syntheticSource || input.record.policy.secret);
}

/** Performs the materialize policy input subjects domain operation. */
export function materializePolicyInputSubjects(
	inputs: readonly PolicyInput[],
	subjects: ExactPolicySubjectIR[]
): void {
	const existing = new Set(subjects.map((subject) => subject.id));
	for (const input of inputs) {
		if (!input.syntheticSource || existing.has(input.record.subjectId)) continue;
		subjects.push({
			id: input.record.subjectId,
			kind: 'return',
			name: input.variable.name,
			policy: input.record.policy,
			source: input.record.source ?? 'inference'
		});
		existing.add(input.record.subjectId);
	}
}

/** Collects state type policies in deterministic order. */
export function collectStateTypePolicies(
	filename: string,
	component: string,
	type: ExpressionType,
	path: readonly string[],
	records: StatePolicyRecord[],
	subjects: ExactPolicySubjectIR[],
	diagnostics: Set<string>,
	seen: Set<string>
): void {
	const identity = `${type.id}:${path.join('.')}`;
	if (seen.has(identity) || path.length > 32) return;
	seen.add(identity);
	for (const property of type.propertyTypes) {
		const nextPath = [...path, property.name];
		const keep = exactKeepPolicy(property.directives) ?? keepFromType(property.type);
		if (keep) {
			const policy = dataPolicy(keep);
			const ancestor = records
				.filter(
					(record) =>
						record.component === component && isAncestorPath(record.path, nextPath.join('.'))
				)
				.sort((left, right) => right.path.length - left.path.length)[0];
			if (ancestor && residencyConflict(ancestor.policy, policy)) {
				diagnostics.add(
					`error: state path ${component}.${nextPath.join('.')} contradicts ancestor policy on ${ancestor.path}`
				);
			}
			const subject = policySubject(filename, {
				kind: 'state',
				name: `${component}.state.${nextPath.join('.')}`,
				path: nextPath.join('.'),
				policy,
				source: 'annotation'
			});
			subjects.push(subject);
			records.push({
				component,
				path: nextPath.join('.'),
				policy,
				subjectId: subject.id
			});
		}
		collectStateTypePolicies(
			filename,
			component,
			property.type,
			nextPath,
			records,
			subjects,
			diagnostics,
			seen
		);
	}
}

/** Reports whether create context call. */
export function isCreateContextCall(call: NodeRef): boolean {
	if (call.target?.name !== 'createContext' && call.target?.node.text !== 'createContext')
		return false;
	const variable = call.target?.rootVariable ?? call.target?.variable;
	return !variable?.importedFrom || variable.importedFrom === '@exactjs/core';
}

/** Performs the unique variables domain operation. */
export function uniqueVariables(module: BoundModule): Variable[] {
	const values = new Map<string, Variable>();
	for (const reference of module.walk().references()) {
		if (reference.variable?.id.startsWith(`${module.filename}:`))
			values.set(reference.variable.id, reference.variable);
	}
	return [...values.values()];
}

/** Performs the parameter index domain operation. */
export function parameterIndex(module: BoundModule, variable: Variable): number | undefined {
	const declaration = module
		.walk()
		.ofKind('Parameter')
		.first((reference) => reference.children().first()?.variable?.id === variable.id);
	const owner = declaration?.ancestors().functions().first();
	return owner?.node.parameters.findIndex((parameter) => parameter.id === variable.id);
}

/** Performs the state policy for effect domain operation. */
export function statePolicyForEffect(
	metadata: ExactPolicyMetadata,
	component: string | undefined,
	effect: ExactStateEffect
): StatePolicyRecord | undefined {
	return component ? statePolicyForPath(metadata, component, effect.path) : undefined;
}

/** Performs the state policy for path domain operation. */
export function statePolicyForPath(
	metadata: ExactPolicyMetadata,
	component: string,
	path: string
): StatePolicyRecord | undefined {
	return metadata.statePolicies
		.filter((record) => record.component === component && pathsOverlapForPolicy(record.path, path))
		.sort((left, right) => right.path.length - left.path.length)[0];
}
