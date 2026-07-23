import type { BoundModule, Variable } from '@exactjs/expressions';
import type { ExactPolicyFlowIR, ExactPolicySubjectIR } from '../types.js';
import {
	combinePolicyRecords,
	dataPolicy,
	policyFlow,
	policySubject,
	type PolicyRecord
} from './algebra.js';

import { materializePolicyInputSubjects, parameterIndex, policyInputs } from './inputs.js';
/** Performs the propagate declaration policies domain operation. */
export function propagateDeclarationPolicies(
	module: BoundModule,
	policies: Map<string, PolicyRecord>,
	namedPolicies: Map<string, PolicyRecord>,
	subjects: ExactPolicySubjectIR[],
	flows: ExactPolicyFlowIR[],
	diagnostics: Set<string>,
	secretConsumeCallIds: ReadonlySet<string>
): void {
	const declarations = module.walk().ofKind('VariableDeclaration').toArray();
	let changed = true;
	for (let pass = 0; changed && pass <= declarations.length; pass++) {
		changed = false;
		for (const declaration of declarations) {
			const binding = declaration.children().first();
			const initializer = declaration.children().toArray().at(-1);
			const declaredVariables =
				binding
					?.walk()
					.references()
					.toArray()
					.map((reference) => reference.variable)
					.filter(
						(variable): variable is Variable =>
							!!variable &&
							['VariableDeclaration', 'BindingElement'].includes(variable.declarationKind)
					) ?? [];
			const pending = [...new Set(declaredVariables)].filter(
				(variable) => !policies.has(variable.id)
			);
			if (!pending.length || !initializer) continue;
			const inputs = policyInputs(initializer, policies, namedPolicies, secretConsumeCallIds);
			materializePolicyInputSubjects(inputs, subjects);
			const combined = combinePolicyRecords(inputs.map((input) => input.record));
			if (combined.conflict) {
				diagnostics.add(
					`error: declaration ${pending.map((variable) => variable.name).join(', ')} combines server-kept and client-kept values`
				);
				continue;
			}
			if (!combined.policy) continue;
			const selectors = new Set(
				inputs.map((input) => input.record.selector).filter((value): value is string => !!value)
			);
			const selector = selectors.size === 1 ? [...selectors][0] : undefined;
			for (const variable of pending) {
				const subject = policySubject(module.filename, {
					kind: 'declaration',
					name: variable.name,
					policy: combined.policy,
					source: 'inference'
				});
				subjects.push(subject);
				const record = {
					policy: subject.policy,
					subjectId: subject.id,
					...(selector ? { selector } : {})
				};
				if (selector) subject.selector = selector;
				policies.set(variable.id, record);
				namedPolicies.set(variable.name, record);
				flows.push(
					policyFlow(module.filename, {
						kind: 'propagation',
						from: inputs.map((input) => input.record.subjectId).sort(),
						to: subject.id,
						policy: subject.policy,
						authorized: true
					})
				);
				changed = true;
			}
		}
	}
}

/**
 * Applies bounded implicit-flow tracking. A branch controlled by a secret
 * qualifies bindings written by that branch, allowing ordinary downstream
 * sink analysis to reject their use in framework output.
 */
export function propagateSecretControlWrites(
	module: BoundModule,
	policies: Map<string, PolicyRecord>,
	namedPolicies: Map<string, PolicyRecord>,
	subjects: ExactPolicySubjectIR[],
	flows: ExactPolicyFlowIR[],
	diagnostics: Set<string>,
	secretConsumeCallIds: ReadonlySet<string>
): void {
	const branches = module
		.walk()
		.where(
			(reference) =>
				reference.node.kind === 'IfStatement' || reference.node.kind === 'SwitchStatement'
		)
		.toArray();
	let changed = true;
	for (let pass = 0; changed && pass <= branches.length; pass++) {
		changed = false;
		for (const branch of branches) {
			const condition = branch.children().first((child) => child.node.category === 'expression');
			if (!condition) continue;
			const inputs = policyInputs(condition, policies, namedPolicies, secretConsumeCallIds).filter(
				(input) => input.record.policy.secret
			);
			if (!inputs.length) continue;
			materializePolicyInputSubjects(inputs, subjects);
			const selectors = new Set(
				inputs.map((input) => input.record.selector).filter((value): value is string => !!value)
			);
			const selector = selectors.size === 1 ? [...selectors][0] : undefined;
			const controlled = branch
				.children()
				.where((child) => child.node !== condition.node)
				.toArray();
			const writes = new Set(controlled.flatMap((child) => module.writesOf(child)));
			for (const variable of writes) {
				const existing = policies.get(variable.id);
				if (existing?.policy.secret) continue;
				if (existing?.policy.residency === 'client') {
					diagnostics.add(
						`error: secret-controlled branch writes client-kept variable ${variable.name}`
					);
					continue;
				}
				const subject = policySubject(module.filename, {
					kind: variable.declarationKind === 'Parameter' ? 'parameter' : 'declaration',
					name: variable.name,
					policy: dataPolicy('secret'),
					source: 'inference',
					...(selector ? { selector } : {}),
					...(variable.declarationKind === 'Parameter'
						? {
								parameterIndex: parameterIndex(module, variable)
							}
						: {})
				});
				subjects.push(subject);
				const record = {
					policy: subject.policy,
					subjectId: subject.id,
					...(selector ? { selector } : {})
				};
				policies.set(variable.id, record);
				namedPolicies.set(variable.name, record);
				flows.push(
					policyFlow(module.filename, {
						kind: 'propagation',
						from: inputs.map((input) => input.record.subjectId).sort(),
						to: subject.id,
						policy: subject.policy,
						authorized: true
					})
				);
				changed = true;
			}
		}
	}
}
