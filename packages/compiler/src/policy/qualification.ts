import type { BoundModule, NodeRef, Variable } from '@exact/expressions';
import { stableId } from '../ids.js';
import type { ExactPolicyFlowIR, ExactPolicySubjectIR } from '../types.js';
import {
	dataPolicy,
	policyFlow,
	policyFromType,
	policySubject,
	type PolicyRecord
} from './algebra.js';

import type {
	ExactPolicyMetadata,
	ExactSecretQualificationPlan,
	ExactSecretQualificationSite
} from './contracts.js';
import { materializePolicyInputSubjects, policyInputs } from './inputs.js';
import { propagateDeclarationPolicies } from './propagation.js';
/**
 * Identifies expressions whose compiler-inferred secret qualification would
 * otherwise be erased by TypeScript's ordinary primitive/object result type.
 * The emitted assertions are type-only; policy analysis remains authoritative.
 */
export function createExactSecretQualificationPlan(
	module: BoundModule,
	metadata: ExactPolicyMetadata
): ExactSecretQualificationPlan {
	const sites = new Map<string, ExactSecretQualificationSite>();
	const qualify = (expression: NodeRef | undefined): void => {
		const span = expression?.node.span;
		if (!expression || !span || policyFromType(expression.type)?.secret) return;
		const inputs = policyInputs(
			expression,
			metadata.declarationPolicies,
			metadata.namedDeclarationPolicies,
			metadata.secretConsumeCallIds
		).filter((input) => input.record.policy.secret);
		if (!inputs.length) return;
		sites.set(`${span.start}:${span.end}`, {
			start: span.start,
			end: span.end,
			underlyingType: expression.type?.display ?? 'unknown'
		});
	};

	const qualifiedBindings = new Set<string>();
	for (const declaration of module.walk().ofKind('VariableDeclaration')) {
		const binding = declaration.children().first();
		const variable = binding?.variable;
		const initializer = declaration.children().toArray().at(-1);
		if (!variable || !initializer || binding?.node === initializer.node) continue;
		if (!metadata.declarationPolicies.get(variable.id)?.policy.secret) continue;
		if (binding.node.kind !== 'Identifier') continue;
		qualify(initializer);
		if (
			initializer.node.span &&
			sites.has(`${initializer.node.span.start}:${initializer.node.span.end}`)
		) {
			qualifiedBindings.add(variable.id);
		}
	}

	for (const fn of module.walk().functions()) {
		if (!metadata.callablePolicies.get(fn.node.id)?.policy.secret) continue;
		for (const statement of fn.descendants({ nestedFunctions: false }).ofKind('ReturnStatement')) {
			const value = statement.children().toArray().at(-1);
			if (value?.variable && qualifiedBindings.has(value.variable.id)) continue;
			qualify(value);
		}
	}

	for (const call of module.walk().calls()) {
		if (metadata.secretConsumeCallIds.has(call.node.id)) continue;
		call.arguments.forEach((argument, index) => {
			if (!policyFromType(call.node.resolvedSignature?.parameters[index]?.type)?.secret) return;
			if (argument.variable && qualifiedBindings.has(argument.variable.id)) return;
			qualify(argument);
		});
	}

	return {
		sites: Object.freeze(
			[...sites.values()].sort((left, right) => left.start - right.start || left.end - right.end)
		)
	};
}

/** Propagates secret qualification through call parameters until the policy analysis reaches a fixed point. */
export function propagateSecretCallParameters(
	module: BoundModule,
	policies: Map<string, PolicyRecord>,
	namedPolicies: Map<string, PolicyRecord>,
	subjects: ExactPolicySubjectIR[],
	flows: ExactPolicyFlowIR[],
	diagnostics: Set<string>,
	secretConsumeCallIds: ReadonlySet<string>
): void {
	const functions = new Map(
		module
			.walk()
			.functions()
			.toArray()
			.flatMap((fn) => {
				const binding = functionBinding(fn);
				return binding ? [[binding.id, fn] as const] : [];
			})
	);
	const subjectByVariable = new Map<string, ExactPolicySubjectIR>();
	const selectorsByVariable = new Map<string, Set<string>>();
	let changed = true;
	const maxPasses = Math.max(2, functions.size + 1);
	for (let pass = 0; changed && pass < maxPasses; pass++) {
		changed = false;
		for (const call of module.walk().calls()) {
			if (secretConsumeCallIds.has(call.node.id)) continue;
			const variable = call.target?.rootVariable;
			if (!variable || variable.importedFrom) continue;
			const fn = functions.get(variable.id);
			if (!fn) continue;
			call.arguments.forEach((argument, index) => {
				const parameter = fn.node.parameters[index];
				if (!parameter) return;
				const inputs = policyInputs(argument, policies, namedPolicies, secretConsumeCallIds).filter(
					(input) => input.record.policy.secret
				);
				if (!inputs.length) return;
				materializePolicyInputSubjects(inputs, subjects);
				if (policyFromType(parameter.type)?.secret) return;
				let selectors = selectorsByVariable.get(parameter.id);
				if (!selectors) selectorsByVariable.set(parameter.id, (selectors = new Set()));
				for (const input of inputs) selectors.add(input.record.selector ?? '<dynamic>');
				const selector =
					selectors.size === 1 && !selectors.has('<dynamic>') ? [...selectors][0] : undefined;
				const existing = policies.get(parameter.id);
				if (existing?.policy.secret && existing.selector === selector) return;
				let subject = subjectByVariable.get(parameter.id);
				if (!subject) {
					subject = policySubject(module.filename, {
						kind: 'parameter',
						name: parameter.name,
						callableId: stableId(module.filename, 'callable', fn.node.id),
						parameterIndex: index,
						policy: dataPolicy('secret'),
						source: 'inference',
						...(selector ? { selector } : {})
					});
					subjects.push(subject);
					subjectByVariable.set(parameter.id, subject);
				} else if (selector) {
					subject.selector = selector;
				} else {
					delete subject.selector;
				}
				const record = {
					policy: subject.policy,
					subjectId: subject.id,
					...(selector ? { selector } : {})
				};
				policies.set(parameter.id, record);
				flows.push(
					policyFlow(module.filename, {
						kind: 'receipt',
						from: inputs.map((input) => input.record.subjectId).sort(),
						to: subject.id,
						policy: subject.policy,
						boundary: 'call',
						authorized: false,
						reason: 'secret argument requires an explicit Secret<T> parameter or consume()'
					})
				);
				changed = true;
			});
		}
		if (changed)
			propagateDeclarationPolicies(
				module,
				policies,
				namedPolicies,
				subjects,
				flows,
				diagnostics,
				secretConsumeCallIds
			);
	}
}

/** Performs the function binding domain operation. */
export function functionBinding(fn: NodeRef): Variable | undefined {
	const declared = fn
		.children()
		.where(
			(child) =>
				child.node.kind === 'Identifier' &&
				child.variable?.declarationKind === 'FunctionDeclaration'
		)
		.first()?.variable;
	if (declared) return declared;
	const declaration = fn.ancestors().ofKind('VariableDeclaration').first();
	return declaration?.children().first()?.variable;
}
