import type { BoundModule, NodeRef, Variable } from '@exact/expressions';
import { stableId } from '../ids.js';
import type {
	ExactPolicyFlowIR,
	ExactPolicySubjectIR,
	ExactSecretConsumptionIR,
	TransformOptions
} from '../types.js';
import {
	combinePolicyRecords,
	dataPolicy,
	policyFlow,
	policyFromDirectives,
	policyFromType,
	policySubject,
	type PolicyRecord
} from './algebra.js';

import type { ExactPolicyMetadata } from './contracts.js';
import { materializePolicyInputSubjects, policyInputs } from './inputs.js';
/** Collects secret consumptions in deterministic order. */
export function collectSecretConsumptions(
	module: BoundModule,
	metadata: ExactPolicyMetadata,
	subjects: ExactPolicySubjectIR[],
	options: Pick<TransformOptions, 'target' | 'packageType' | 'packageName' | 'capabilityPolicy'>
): {
	consumers: ExactSecretConsumptionIR[];
	flows: ExactPolicyFlowIR[];
	diagnostics: string[];
} {
	const consumers: ExactSecretConsumptionIR[] = [];
	const flows: ExactPolicyFlowIR[] = [];
	const diagnostics = new Set<string>();
	const target = options.target === 'client' ? 'client' : 'server';

	// A still-qualified value may cross a call boundary only through an
	// explicitly Secret<T>-typed parameter. This preserves qualification; it
	// does not authorize or audit a consumption.
	for (const call of module.walk().calls()) {
		if (metadata.secretConsumeCallIds.has(call.node.id)) continue;
		call.arguments.forEach((argument, parameter) => {
			const inputs = policyInputs(
				argument,
				metadata.declarationPolicies,
				metadata.namedDeclarationPolicies,
				metadata.secretConsumeCallIds
			).filter((input) => input.record.policy.secret);
			if (!inputs.length) return;
			materializePolicyInputSubjects(inputs, subjects);
			const acceptsSecret =
				policyFromType(call.node.resolvedSignature?.parameters[parameter]?.type)?.secret === true;
			const location = argument.node.span ?? call.node.span ?? { line: 0, column: 0 };
			const reason = acceptsSecret
				? undefined
				: 'secret argument requires an explicit Secret<T> parameter or consume()';
			const id = stableId(module.filename, 'policy:secret-call', call.node.id, String(parameter));
			flows.push(
				policyFlow(module.filename, {
					kind: 'receipt',
					from: inputs.map((input) => input.record.subjectId).sort(),
					to: id,
					policy: dataPolicy('secret'),
					boundary: 'call',
					authorized: acceptsSecret,
					...(reason ? { reason } : {})
				})
			);
			if (reason)
				diagnostics.add(
					`error: ${reason} at ${module.filename}:${location.line}:${location.column}`
				);
		});
	}

	// The trust decision belongs to the package containing consume(), not to any
	// function that subsequently receives the returned ordinary value.
	for (const call of module.walk().calls()) {
		if (!metadata.secretConsumeCallIds.has(call.node.id)) continue;
		const argument = call.arguments[0];
		if (!argument) continue;
		const inputs = policyInputs(
			argument,
			metadata.declarationPolicies,
			metadata.namedDeclarationPolicies
		).filter((input) => input.record.policy.secret);
		if (!inputs.length) continue;
		materializePolicyInputSubjects(inputs, subjects);
		const selectors = new Set(
			inputs.map((input) => input.record.selector).filter((value): value is string => !!value)
		);
		const selector = selectors.size === 1 ? [...selectors][0] : undefined;
		const location = call.node.span ?? argument.node.span ?? { line: 0, column: 0 };
		const authorization: ExactSecretConsumptionIR['authorization'] =
			target === 'client'
				? 'denied'
				: options.packageType === 'library'
					? 'library-requirement'
					: 'implicit-application-owner';
		const reason =
			target === 'client'
				? 'secret consumption cannot be retained in a client artifact'
				: undefined;
		const id = stableId(module.filename, 'secret-consumer', call.node.id, 'consume');
		consumers.push({
			id,
			...(selector ? { selector } : {}),
			dynamic: !selector,
			source: module.filename,
			line: location.line,
			column: location.column,
			caller: nearestCallableName(call),
			consumer: {
				package:
					options.packageName ??
					(options.packageType === 'library' ? '<library>' : '<application>'),
				symbol: 'consume',
				parameter: 0
			},
			target,
			authorization,
			...(reason ? { reason } : {})
		});
		flows.push(
			policyFlow(module.filename, {
				kind: 'receipt',
				from: inputs.map((input) => input.record.subjectId).sort(),
				to: id,
				policy: dataPolicy('secret'),
				boundary: 'call',
				authorized: authorization !== 'denied',
				...(reason ? { reason } : {})
			})
		);
		if (reason)
			diagnostics.add(`error: ${reason} at ${module.filename}:${location.line}:${location.column}`);
	}

	return {
		consumers: consumers.sort((left, right) => left.id.localeCompare(right.id)),
		flows: flows.sort((left, right) => left.id.localeCompare(right.id)),
		diagnostics: [...diagnostics].sort()
	};
}

/** Performs the imported call symbol domain operation. */
export function importedCallSymbol(module: BoundModule, call: NodeRef, variable: Variable): string {
	if (call.target?.isMember())
		return call.target.node.name ?? call.target.node.text ?? variable.name;
	const importReference = module
		.walk()
		.where(
			(reference) =>
				reference.node.kind === 'Identifier' &&
				reference.variable?.id === variable.id &&
				reference.ancestors().any((ancestor) => ancestor.node.kind === 'ImportDeclaration')
		)
		.first();
	if (importReference?.parent?.node.kind === 'ImportClause') return 'default';
	if (importReference?.parent?.node.kind === 'ImportSpecifier') {
		const identifiers = importReference.parent
			.children()
			.where((child) => child.node.kind === 'Identifier')
			.toArray();
		return identifiers.length > 1 ? identifiers[0]!.name! : variable.name;
	}
	return variable.name;
}

/** Reports whether secret consume call. */
export function isSecretConsumeCall(module: BoundModule, call: NodeRef): boolean {
	if (call.node.kind !== 'CallExpression') return false;
	const variable = call.target?.rootVariable;
	if (!variable || packageNameFromSpecifier(variable.importedFrom ?? '') !== '@exact/secrets') {
		return false;
	}
	return importedCallSymbol(module, call, variable) === 'consume';
}

/** Resolves the package selector that authorizes a declaration to consume secret-qualified data. */
export function secretSelectorForDeclaration(
	module: BoundModule,
	variable: Variable
): string | undefined {
	const declaration = module
		.walk()
		.ofKind('VariableDeclaration')
		.first((reference) => reference.children().first()?.variable?.id === variable.id);
	const initializer = declaration?.children().toArray().at(-1);
	if (!initializer) return undefined;
	const match = /\.(?:require|optional)\(\s*(["'])([^"']+)\1/.exec(initializer.node.text ?? '');
	return match?.[2];
}

/** Performs the package name from specifier domain operation. */
export function packageNameFromSpecifier(specifier: string): string {
	if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/');
	return specifier.split('/')[0]!;
}

/** Finds the nearest callable owner used to attribute a secret-consumption audit record. */
export function nearestCallableName(reference: NodeRef): string {
	const owner = reference.ancestors().functions().first();
	return owner?.node.name ?? '<module>';
}

/** Collects callable return policies in deterministic order. */
export function collectCallableReturnPolicies(
	module: BoundModule,
	declarationPolicies: ReadonlyMap<string, PolicyRecord>,
	namedPolicies: Map<string, PolicyRecord>,
	callablePolicies: Map<string, PolicyRecord>,
	subjects: ExactPolicySubjectIR[],
	flows: ExactPolicyFlowIR[],
	diagnostics: Set<string>,
	infer: boolean,
	secretConsumeCallIds: ReadonlySet<string>
): void {
	for (const fn of module.walk().functions()) {
		if (!fn.node.name || callablePolicies.has(fn.node.id)) continue;
		const direct =
			policyFromDirectives(fn.node.directives) ??
			policyFromDirectives(fn.type?.callSignatures[0]?.returnDirectives);
		let policy = direct;
		if (!policy && infer) {
			const inputs = fn
				.descendants({ nestedFunctions: false })
				.ofKind('ReturnStatement')
				.toArray()
				.flatMap((statement) => {
					const value = statement.children().toArray().at(-1);
					return value
						? policyInputs(value, declarationPolicies, namedPolicies, secretConsumeCallIds).map(
								(input) => input.record
							)
						: [];
				});
			const combined = combinePolicyRecords(inputs);
			if (combined.conflict) {
				diagnostics.add(
					`error: return value of ${fn.node.name} combines server-kept and client-kept values`
				);
				continue;
			}
			policy = combined.policy;
		}
		if (!policy) continue;
		const subject = policySubject(module.filename, {
			kind: 'return',
			name: fn.node.name,
			callableId: stableId(module.filename, 'callable', fn.node.id),
			policy,
			source: direct ? 'annotation' : 'inference'
		});
		subjects.push(subject);
		const record = { policy, subjectId: subject.id };
		callablePolicies.set(fn.node.id, record);
		namedPolicies.set(fn.node.name, record);
		if (!direct) {
			const inputs = fn
				.descendants({ nestedFunctions: false })
				.ofKind('ReturnStatement')
				.toArray()
				.flatMap((statement) => {
					const value = statement.children().toArray().at(-1);
					return value
						? policyInputs(value, declarationPolicies, namedPolicies, secretConsumeCallIds)
						: [];
				});
			materializePolicyInputSubjects(inputs, subjects);
			flows.push(
				policyFlow(module.filename, {
					kind: 'propagation',
					from: inputs.map((input) => input.record.subjectId).sort(),
					to: subject.id,
					policy: subject.policy,
					authorized: true
				})
			);
		}
	}
}
