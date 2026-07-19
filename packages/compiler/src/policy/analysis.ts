import type { BoundModule } from '@exact/expressions';
import { exactKeepPolicy } from '../annotations.js';
import { expressionComponentIndex } from '../expression/component-index.js';
import { stableId } from '../ids.js';
import type { ExactCompilerManifest, ExactPolicyFlowIR, ExactPolicySubjectIR } from '../types.js';
import {
	compareStatePolicy,
	dataPolicy,
	keepFromType,
	policySubject,
	samePolicy,
	sortSubjects,
	type PolicyRecord,
	type StatePolicyRecord
} from './algebra.js';
import { parseContextPolicyOptions } from './context-options.js';

import type { ExactPolicyMetadata } from './contracts.js';
import {
	collectStateTypePolicies,
	isCreateContextCall,
	parameterIndex,
	policyInputs,
	uniqueVariables
} from './inputs.js';
import { propagateDeclarationPolicies, propagateSecretControlWrites } from './propagation.js';
import { propagateSecretCallParameters } from './qualification.js';
import {
	collectCallableReturnPolicies,
	isSecretConsumeCall,
	secretSelectorForDeclaration
} from './secret-consumption.js';

export { applyExactPolicyToCallables, applyExactPolicyToTasks } from './application.js';
export type {
	ExactPolicyCallableResult,
	ExactPolicyManifestResult,
	ExactPolicyMetadata,
	ExactPolicyTaskResult,
	ExactSecretQualificationPlan,
	ExactSecretQualificationSite
} from './contracts.js';
export { createExactPolicyManifest } from './manifest.js';
export { createExactSecretQualificationPlan } from './qualification.js';

/** Collects explicit residency metadata before placement and transfer analysis. */
export function analyzeExactPolicyMetadata(
	module: BoundModule,
	importedManifests: readonly ExactCompilerManifest[]
): ExactPolicyMetadata {
	const subjects: ExactPolicySubjectIR[] = [];
	const declarationPolicies = new Map<string, PolicyRecord>();
	const namedDeclarationPolicies = new Map<string, PolicyRecord>();
	const callablePolicies = new Map<string, PolicyRecord>();
	const contextCallEffects = new Map<string, 'server' | 'client' | 'isomorphic'>();
	const contextAliases = new Map<string, string>();
	const contextPolicies = new Map<string, PolicyRecord>();
	const statePolicies: StatePolicyRecord[] = [];
	const secretConsumeCallIds = new Set(
		module
			.walk()
			.calls()
			.toArray()
			.filter((call) => isSecretConsumeCall(module, call))
			.map((call) => call.node.id)
	);
	const flows: ExactPolicyFlowIR[] = [];
	const diagnostics = new Set<string>();

	const localVariables = uniqueVariables(module);
	for (const variable of localVariables) {
		if (!['VariableDeclaration', 'BindingElement', 'Parameter'].includes(variable.declarationKind))
			continue;
		const keep = exactKeepPolicy(variable.directives) ?? keepFromType(variable.type);
		if (!keep) continue;
		const selector = keep === 'secret' ? secretSelectorForDeclaration(module, variable) : undefined;
		const subject = policySubject(module.filename, {
			kind: variable.declarationKind === 'Parameter' ? 'parameter' : 'declaration',
			name: variable.name,
			policy: dataPolicy(keep),
			source: 'annotation',
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
		declarationPolicies.set(variable.id, record);
		namedDeclarationPolicies.set(variable.name, record);
		const declaration = module
			.walk()
			.ofKind('VariableDeclaration')
			.first((reference) => reference.children().first()?.variable?.id === variable.id);
		const initializer = declaration?.children().toArray().at(-1);
		if (initializer) callablePolicies.set(initializer.node.id, record);
	}

	for (const field of module
		.walk()
		.where(
			(reference) =>
				reference.node.kind === 'PropertySignature' || reference.node.kind === 'PropertyDeclaration'
		)) {
		const keep = exactKeepPolicy(field.node.directives);
		if (!keep || !field.node.name) continue;
		subjects.push(
			policySubject(module.filename, {
				kind: 'field',
				name: field.node.name,
				policy: dataPolicy(keep),
				source: 'annotation'
			})
		);
	}

	const components = expressionComponentIndex(module);
	for (const component of components.functions) {
		const componentName = component.node.name!;
		const thisParameter = component.node.parameters.find((parameter) => parameter.name === 'this');
		const componentType = thisParameter?.type;
		const state = componentType?.propertyTypes.find((property) => property.name === 'state');
		if (!state) continue;
		const stateType = state.type.propertyTypes.length
			? state.type
			: (componentType?.typeArguments[0] ?? state.type);
		collectStateTypePolicies(
			module.filename,
			componentName,
			stateType,
			[],
			statePolicies,
			subjects,
			diagnostics,
			new Set()
		);
	}

	for (const call of module.walk().calls()) {
		if (!isCreateContextCall(call)) continue;
		const declaration = call.ancestors().ofKind('VariableDeclaration').first();
		const token = declaration?.children().first()?.name;
		if (!token) continue;
		const options = call.arguments[1];
		const parsed = parseContextPolicyOptions(options?.node.text);
		if (parsed.error) {
			diagnostics.add(`error: context ${token} ${parsed.error}`);
			continue;
		}
		const policy = parsed.keep ? dataPolicy(parsed.keep) : dataPolicy('isomorphic');
		const subject = policySubject(module.filename, {
			kind: 'context',
			name: token,
			policy,
			source: parsed.keep ? 'context-option' : 'inference'
		});
		subjects.push(subject);
		const record = { policy: subject.policy, subjectId: subject.id };
		contextPolicies.set(token, record);
		const tokenVariable = declaration?.children().first()?.variable;
		if (tokenVariable) declarationPolicies.set(tokenVariable.id, record);
		namedDeclarationPolicies.set(token, record);
		const initializer = declaration?.children().toArray().at(-1);
		if (initializer && parsed.keep) callablePolicies.set(initializer.node.id, record);
	}

	for (const manifest of importedManifests) {
		for (const subject of manifest.policy.subjects) {
			if (subject.kind !== 'context') continue;
			const imported = {
				...subject,
				id: stableId(
					module.filename,
					`policy:import:${manifest.packageName ?? manifest.filename}:${subject.id}`
				),
				source: 'import' as const
			};
			subjects.push(imported);
			const existing = contextPolicies.get(imported.name);
			if (existing && !samePolicy(existing.policy, imported.policy)) {
				diagnostics.add(
					`error: imported manifests declare conflicting policies for context ${imported.name}`
				);
			} else {
				contextPolicies.set(imported.name, { policy: imported.policy, subjectId: imported.id });
			}
		}
	}

	for (const declaration of module.walk().ofKind('VariableDeclaration')) {
		const variable = declaration.children().first()?.variable;
		const initializer = declaration.children().toArray().at(-1);
		if (
			!variable ||
			initializer?.node.kind !== 'CallExpression' ||
			!initializer.target?.isMember('getContext')
		)
			continue;
		const token = initializer.arguments[0]?.node.text;
		if (token && contextPolicies.has(token)) contextAliases.set(variable.id, token);
	}
	for (const call of module.walk().calls()) {
		const receiver = call.target?.isMember() ? call.target.target?.rootVariable : undefined;
		const token = receiver ? contextAliases.get(receiver.id) : undefined;
		const policy = token ? contextPolicies.get(token)?.policy : undefined;
		if (!policy) continue;
		contextCallEffects.set(call.node.id, policy.secret ? 'server' : policy.residency);
	}

	collectCallableReturnPolicies(
		module,
		declarationPolicies,
		namedDeclarationPolicies,
		callablePolicies,
		subjects,
		flows,
		diagnostics,
		false,
		secretConsumeCallIds
	);
	propagateDeclarationPolicies(
		module,
		declarationPolicies,
		namedDeclarationPolicies,
		subjects,
		flows,
		diagnostics,
		secretConsumeCallIds
	);
	collectCallableReturnPolicies(
		module,
		declarationPolicies,
		namedDeclarationPolicies,
		callablePolicies,
		subjects,
		flows,
		diagnostics,
		true,
		secretConsumeCallIds
	);
	propagateDeclarationPolicies(
		module,
		declarationPolicies,
		namedDeclarationPolicies,
		subjects,
		flows,
		diagnostics,
		secretConsumeCallIds
	);
	propagateSecretCallParameters(
		module,
		declarationPolicies,
		namedDeclarationPolicies,
		subjects,
		flows,
		diagnostics,
		secretConsumeCallIds
	);
	propagateDeclarationPolicies(
		module,
		declarationPolicies,
		namedDeclarationPolicies,
		subjects,
		flows,
		diagnostics,
		secretConsumeCallIds
	);
	propagateSecretControlWrites(
		module,
		declarationPolicies,
		namedDeclarationPolicies,
		subjects,
		flows,
		diagnostics,
		secretConsumeCallIds
	);
	propagateDeclarationPolicies(
		module,
		declarationPolicies,
		namedDeclarationPolicies,
		subjects,
		flows,
		diagnostics,
		secretConsumeCallIds
	);
	for (const [id, record] of declarationPolicies) {
		const variable = localVariables.find((candidate) => candidate.id === id);
		if (variable) namedDeclarationPolicies.set(variable.name, record);
	}
	for (const call of module.walk().calls()) {
		if (!secretConsumeCallIds.has(call.node.id)) continue;
		const argument = call.arguments[0];
		const secret =
			argument &&
			policyInputs(
				argument,
				declarationPolicies,
				namedDeclarationPolicies,
				secretConsumeCallIds
			).some((input) => input.record.policy.secret);
		if (!secret) diagnostics.add('error: consume() argument is not secret-qualified');
	}
	return Object.freeze({
		subjects: Object.freeze(sortSubjects(subjects)),
		declarationPolicies,
		namedDeclarationPolicies,
		callablePolicies,
		contextCallEffects,
		contextPolicies,
		statePolicies: Object.freeze([...statePolicies].sort(compareStatePolicy)),
		secretConsumeCallIds,
		flows: Object.freeze([...flows].sort((left, right) => left.id.localeCompare(right.id))),
		diagnostics: Object.freeze([...diagnostics].sort())
	});
}
