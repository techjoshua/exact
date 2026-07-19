import type { BoundModule, NodeRef } from '@exact/expressions';
import { stableId } from '../ids.js';
import type { ExactPolicyFlowIR, ExactPolicySubjectIR } from '../types.js';
import { combinePolicyRecords, dataPolicy, describePolicy, policyFlow } from './algebra.js';

import type { ExactPolicyMetadata } from './contracts.js';
import { materializePolicyInputSubjects, policyInputs } from './inputs.js';
/** Collects secret output sinks in deterministic order. */
export function collectSecretOutputSinks(
	filename: string,
	module: BoundModule,
	metadata: ExactPolicyMetadata,
	subjects: ExactPolicySubjectIR[]
): {
	flows: ExactPolicyFlowIR[];
	diagnostics: string[];
} {
	const flows: ExactPolicyFlowIR[] = [];
	const diagnostics = new Set<string>();
	const seen = new Set<string>();
	const inspect = (
		expression: NodeRef,
		boundary: NonNullable<ExactPolicyFlowIR['boundary']>,
		description: string,
		site: NodeRef = expression
	): void => {
		const inputs = policyInputs(
			expression,
			metadata.declarationPolicies,
			metadata.namedDeclarationPolicies,
			metadata.secretConsumeCallIds
		).filter((input) => input.record.policy.secret);
		if (!inputs.length) return;
		materializePolicyInputSubjects(inputs, subjects);
		const key = `${boundary}:${site.node.id}`;
		if (seen.has(key)) return;
		seen.add(key);
		const location = site.node.span ?? expression.node.span ?? { line: 0, column: 0 };
		const target = stableId(filename, 'policy:sink', boundary, site.node.id);
		const reason = `secret-qualified value cannot influence ${description}`;
		flows.push(
			policyFlow(filename, {
				kind: 'transfer',
				from: inputs.map((input) => input.record.subjectId).sort(),
				to: target,
				policy: dataPolicy('secret'),
				boundary,
				authorized: false,
				reason
			})
		);
		diagnostics.add(`error: ${reason} at ${filename}:${location.line}:${location.column}`);
	};

	for (const expression of module.walk().ofKind('JsxExpression')) {
		inspect(
			expression,
			'vnode',
			expression.parent?.node.kind === 'JsxAttribute' ? 'a VNode attribute' : 'VNode output'
		);
	}
	for (const attribute of module.walk().ofKind('JsxSpreadAttribute')) {
		inspect(attribute, 'vnode', 'a VNode spread attribute');
	}
	for (const statement of module.walk().ofKind('ThrowStatement')) {
		const value = statement.children().toArray().at(-1);
		if (value) inspect(value, 'error', 'a thrown error', statement);
	}

	for (const branch of module
		.walk()
		.where(
			(reference) =>
				reference.node.kind === 'IfStatement' || reference.node.kind === 'SwitchStatement'
		)) {
		const condition = branch.children().first((child) => child.node.category === 'expression');
		if (!condition) continue;
		const controlled = branch.children().where((child) => child.node !== condition.node);
		if (
			controlled
				.toArray()
				.some((child) => child.descendants({ nestedFunctions: false }).jsxSyntax().any())
		) {
			inspect(condition, 'vnode', 'secret-controlled VNode output', branch);
		}
		if (
			controlled
				.toArray()
				.some((child) =>
					child.descendants({ nestedFunctions: false }).ofKind('ThrowStatement').any()
				)
		) {
			inspect(condition, 'error', 'secret-controlled error behavior', branch);
		}
		if (
			controlled
				.toArray()
				.some((child) =>
					child.descendants({ nestedFunctions: false }).calls().any(isConsoleOutputCall)
				)
		) {
			inspect(condition, 'log', 'secret-controlled console output', branch);
		}
	}

	return {
		flows: flows.sort((left, right) => left.id.localeCompare(right.id)),
		diagnostics: [...diagnostics].sort()
	};
}

/** Collects route hydration sinks in deterministic order. */
export function collectRouteHydrationSinks(
	filename: string,
	module: BoundModule,
	metadata: ExactPolicyMetadata,
	subjects: ExactPolicySubjectIR[]
): {
	flows: ExactPolicyFlowIR[];
	diagnostics: string[];
} {
	const handlerNames = new Set(['loader', 'action']);
	const referencedHandlers = new Map<string, string>();
	for (const property of module
		.walk()
		.where(
			(reference) =>
				(reference.node.kind === 'PropertyAssignment' ||
					reference.node.kind === 'ShorthandPropertyAssignment') &&
				handlerNames.has(reference.node.name ?? '')
		)) {
		const value = property.children().toArray().at(-1);
		if (value?.variable) referencedHandlers.set(value.variable.id, property.node.name!);
	}

	const flows: ExactPolicyFlowIR[] = [];
	const diagnostics = new Set<string>();
	const seen = new Set<string>();
	for (const fn of module.walk().functions()) {
		let handler =
			fn.node.kind === 'MethodDeclaration' && handlerNames.has(fn.node.name ?? '')
				? fn.node.name
				: fn.parent?.node.kind === 'PropertyAssignment' &&
					  handlerNames.has(fn.parent.node.name ?? '')
					? fn.parent.node.name
					: undefined;
		if (!handler) {
			const declaration = fn.parent?.node.kind === 'VariableDeclaration' ? fn.parent : undefined;
			const variable = declaration?.children().first((child) => !!child.variable)?.variable;
			if (variable) handler = referencedHandlers.get(variable.id);
		}
		if (!handler) continue;

		const returnValues = fn
			.descendants({ nestedFunctions: false })
			.ofKind('ReturnStatement')
			.toArray()
			.map((statement) => statement.children().toArray().at(-1))
			.filter((value): value is NodeRef => !!value);
		if (!returnValues.length && fn.node.kind === 'ArrowFunction') {
			const expressionBody = fn.children().toArray().at(-1);
			if (expressionBody?.node.category === 'expression') returnValues.push(expressionBody);
		}

		for (const value of returnValues) {
			const inputs = policyInputs(
				value,
				metadata.declarationPolicies,
				metadata.namedDeclarationPolicies,
				metadata.secretConsumeCallIds
			).filter((input) => input.record.policy.secret || input.record.policy.residency === 'server');
			if (!inputs.length) continue;
			materializePolicyInputSubjects(inputs, subjects);
			const combined = combinePolicyRecords(inputs.map((input) => input.record));
			const policy = combined.policy ?? dataPolicy('server');
			const key = `${handler}:${value.node.id}`;
			if (seen.has(key)) continue;
			seen.add(key);
			const location = value.node.span ?? fn.node.span ?? { line: 0, column: 0 };
			const reason = `${describePolicy(policy)} value cannot enter route ${handler} hydration data`;
			flows.push(
				policyFlow(filename, {
					kind: 'transfer',
					from: inputs.map((input) => input.record.subjectId).sort(),
					to: stableId(filename, 'policy:route-hydration', handler, value.node.id),
					policy,
					boundary: 'hydration',
					authorized: false,
					reason
				})
			);
			diagnostics.add(`error: ${reason} at ${filename}:${location.line}:${location.column}`);
		}
	}
	return {
		flows: flows.sort((left, right) => left.id.localeCompare(right.id)),
		diagnostics: [...diagnostics].sort()
	};
}

/** Reports whether console output call. */
export function isConsoleOutputCall(call: NodeRef): boolean {
	if (
		!call.target?.isMember() ||
		!['log', 'info', 'warn', 'error', 'debug', 'trace'].includes(call.target.name ?? '')
	) {
		return false;
	}
	return call.target.target?.rootVariable?.name === 'console';
}
