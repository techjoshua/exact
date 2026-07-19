import type { BoundModule } from '@exact/expressions';
import type { ExpressionComponentPlan } from '../expression/contracts.js';
import type { ExpressionTaskPlan } from '../expression/task-contracts.js';
import type {
	ExactComponentIR,
	ExactPolicyFlowIR,
	ExactPolicySubjectIR,
	TransformOptions
} from '../types.js';
import {
	dataPolicy,
	describePolicy,
	pathsOverlap,
	policyFlow,
	policySubject,
	sortSubjects,
	stateKey
} from './algebra.js';

import type { ExactPolicyManifestResult, ExactPolicyMetadata } from './contracts.js';
import { statePolicyForPath } from './inputs.js';
import { collectSecretConsumptions } from './secret-consumption.js';
import { collectRouteHydrationSinks, collectSecretOutputSinks } from './sinks.js';
/** Builds manifest-visible inferred transfers after components and islands exist. */
export function createExactPolicyManifest(
	filename: string,
	metadata: ExactPolicyMetadata,
	components: readonly ExactComponentIR[],
	componentPlan: ExpressionComponentPlan,
	tasks: ExpressionTaskPlan,
	module: BoundModule,
	options: Pick<TransformOptions, 'target' | 'packageType' | 'packageName' | 'capabilityPolicy'>
): ExactPolicyManifestResult {
	const componentIds = new Map(components.map((component) => [component.name, component.id]));
	const stateComponentBySubject = new Map(
		metadata.statePolicies.map((record) => [record.subjectId, record.component])
	);
	const subjects = metadata.subjects.map((subject) => {
		const component = stateComponentBySubject.get(subject.id);
		const componentId = component ? componentIds.get(component) : undefined;
		return componentId ? { ...subject, componentId } : { ...subject };
	});
	const flows: ExactPolicyFlowIR[] = [...metadata.flows];
	const diagnostics = new Set<string>(metadata.diagnostics);
	const componentsByName = new Map(components.map((component) => [component.name, component]));
	const subjectByState = new Map<string, ExactPolicySubjectIR>();
	const secretCalls = collectSecretConsumptions(module, metadata, subjects, options);
	flows.push(...secretCalls.flows);
	for (const diagnostic of secretCalls.diagnostics) diagnostics.add(diagnostic);
	const outputSinks = collectSecretOutputSinks(filename, module, metadata, subjects);
	flows.push(...outputSinks.flows);
	for (const diagnostic of outputSinks.diagnostics) diagnostics.add(diagnostic);
	const routeTransfers = collectRouteHydrationSinks(filename, module, metadata, subjects);
	flows.push(...routeTransfers.flows);
	for (const diagnostic of routeTransfers.diagnostics) diagnostics.add(diagnostic);

	for (const record of metadata.statePolicies) {
		const component = componentsByName.get(record.component);
		const subject = subjects.find((candidate) => candidate.id === record.subjectId);
		if (component && subject) subjectByState.set(stateKey(record.component, record.path), subject);
	}

	for (const site of componentPlan.sites.values()) {
		const component = componentsByName.get(site.name);
		if (!component) continue;
		for (const island of site.clientIslands) {
			for (const path of island.stateReads) {
				const explicit = statePolicyForPath(metadata, site.name, path);
				const policy = explicit?.policy ?? dataPolicy('isomorphic');
				let subject = explicit
					? subjects.find((candidate) => candidate.id === explicit.subjectId)
					: undefined;
				if (!subject) {
					subject = policySubject(filename, {
						kind: 'state',
						name: `${site.name}.state.${path}`,
						path,
						componentId: component.id,
						policy,
						source: 'inference'
					});
					subjects.push(subject);
					subjectByState.set(stateKey(site.name, path), subject);
				}
				const authorized = policy.residency === 'isomorphic' && !policy.secret;
				flows.push(
					policyFlow(filename, {
						kind: 'transfer',
						from: [subject.id],
						to: `${component.id}:client-island:${island.index}:${path}`,
						policy,
						boundary: 'client-island',
						authorized,
						...(!authorized
							? { reason: `${describePolicy(policy)} state cannot enter a client island` }
							: {})
					})
				);
				if (!authorized)
					diagnostics.add(
						`error: ${site.name} client island captures ${describePolicy(policy)} state path ${path}`
					);
			}
		}
	}

	for (const component of components) {
		const site = componentPlan.sites.get(component.name);
		if (!site) continue;
		const clientReads = new Set(site.clientIslands.flatMap((island) => island.stateReads));
		for (const task of component.tasks) {
			if (task.placement !== 'server') continue;
			for (const write of task.writes) {
				for (const clientPath of clientReads) {
					if (!pathsOverlap(write.path, clientPath)) continue;
					const record = statePolicyForPath(metadata, component.name, clientPath);
					const policy = record?.policy ?? dataPolicy('isomorphic');
					const subject = record
						? subjects.find((candidate) => candidate.id === record.subjectId)
						: subjectByState.get(stateKey(component.name, clientPath));
					if (!subject) continue;
					const authorized = policy.residency === 'isomorphic' && !policy.secret;
					flows.push(
						policyFlow(filename, {
							kind: 'projection',
							from: [task.id],
							to: subject.id,
							policy,
							boundary: 'state',
							authorized,
							...(!authorized
								? {
										reason: `${describePolicy(policy)} task output cannot be projected to client state`
									}
								: {})
						})
					);
					if (!authorized)
						diagnostics.add(
							`error: server task ${task.id} writes ${describePolicy(policy)} state path ${clientPath} required by client behavior`
						);
				}
			}
		}
	}

	for (const component of components) {
		for (const effect of component.contexts) {
			const context = metadata.contextPolicies.get(effect.token);
			if (!context || effect.kind !== 'read') continue;
			const isClient = component.placement === 'client';
			const authorized =
				!isClient || (context.policy.residency !== 'server' && !context.policy.secret);
			flows.push(
				policyFlow(filename, {
					kind: 'transfer',
					from: [context.subjectId],
					to: component.id,
					policy: context.policy,
					boundary: 'context',
					authorized,
					...(!authorized
						? {
								reason: `${describePolicy(context.policy)} context cannot be read by a client component`
							}
						: {})
				})
			);
			if (!authorized)
				diagnostics.add(
					`error: client component ${component.name} reads ${describePolicy(context.policy)} context ${effect.token}`
				);
		}
	}

	return Object.freeze({
		policy: Object.freeze({
			version: 1,
			subjects: sortSubjects(subjects),
			flows: flows.sort((left, right) => left.id.localeCompare(right.id)),
			secretConsumers: secretCalls.consumers
		}),
		diagnostics: Object.freeze([...diagnostics].sort())
	});
}
