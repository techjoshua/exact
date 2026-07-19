import type { CallableEffectPlan } from '../analysis/callable-effects.js';
import type { ExpressionTaskPlan, ExpressionTaskSite } from '../expression/task-contracts.js';
import type { ExactDataPolicyIR } from '../types.js';
import { combinePolicies, isRestrictivePolicy, restrictCallable, samePolicy } from './algebra.js';

import type {
	ExactPolicyCallableResult,
	ExactPolicyMetadata,
	ExactPolicyTaskResult
} from './contracts.js';
import { statePolicyForEffect } from './inputs.js';
/** Applies declaration/result residency to callable artifact reachability. */
export function applyExactPolicyToCallables(
	metadata: ExactPolicyMetadata,
	plan: CallableEffectPlan
): ExactPolicyCallableResult {
	const diagnostics = new Set<string>();
	const byNodeId = new Map<string, (typeof plan.callables)[number]>();
	const byId = new Map<string, (typeof plan.callables)[number]>();
	const restrictions = new Map<string, ExactDataPolicyIR>();

	for (const [nodeId, summary] of plan.byNodeId) {
		const policy = metadata.callablePolicies.get(nodeId)?.policy;
		const restriction = policy && isRestrictivePolicy(policy) ? policy : undefined;
		const next = restriction ? restrictCallable(summary, restriction, diagnostics) : summary;
		byNodeId.set(nodeId, next);
		byId.set(next.id, next);
		if (restriction) restrictions.set(next.id, restriction);
	}
	for (const summary of plan.callables) {
		if (!byId.has(summary.id)) byId.set(summary.id, summary);
	}

	let changed = true;
	while (changed) {
		changed = false;
		for (const summary of plan.callables) {
			const dependencies = summary.calls
				.map((edge) => (edge.targetId ? restrictions.get(edge.targetId) : undefined))
				.filter((policy): policy is ExactDataPolicyIR => !!policy);
			if (!dependencies.length) continue;
			const combined = combinePolicies(dependencies);
			if (combined.conflict) {
				diagnostics.add(
					`error: callable ${summary.name} combines server-kept and client-kept dependencies`
				);
				continue;
			}
			if (!combined.policy) continue;
			const previous = restrictions.get(summary.id);
			if (previous && samePolicy(previous, combined.policy)) continue;
			const current = byId.get(summary.id) ?? summary;
			const next = restrictCallable(current, combined.policy, diagnostics);
			restrictions.set(summary.id, combined.policy);
			byId.set(summary.id, next);
			for (const [nodeId, candidate] of byNodeId) {
				if (candidate.id === summary.id) byNodeId.set(nodeId, next);
			}
			changed = true;
		}
	}

	const callables = plan.callables.map((summary) => byId.get(summary.id) ?? summary);
	return Object.freeze({
		callables: Object.freeze({
			callables: Object.freeze(callables),
			byNodeId,
			callEffects: plan.callEffects
		}),
		diagnostics: Object.freeze([...diagnostics].sort())
	});
}

/**
 * Applies residency effects to inferred task placement. Explicit placement
 * remains authoritative only when it does not contradict the data policy.
 */
export function applyExactPolicyToTasks(
	metadata: ExactPolicyMetadata,
	tasks: ExpressionTaskPlan
): ExactPolicyTaskResult {
	const sites = new Map<string, ExpressionTaskSite>();
	const planDiagnostics = [...tasks.diagnostics];
	const diagnosticLocations = [...tasks.diagnosticLocations];
	const policyDiagnostics = new Set<string>();

	for (const [id, site] of tasks.sites) {
		const requirements: ExactDataPolicyIR[] = [];
		for (const effect of [...site.reads, ...site.writes]) {
			const policy = statePolicyForEffect(metadata, site.component, effect);
			if (policy) requirements.push(policy.policy);
		}
		for (const effect of site.contexts) {
			const policy = metadata.contextPolicies.get(effect.token);
			if (policy) requirements.push(policy.policy);
		}

		const needsServer = requirements.some((value) => value.secret || value.residency === 'server');
		const needsClient = requirements.some((value) => value.residency === 'client');
		const diagnostics = [...site.diagnostics];
		let placement = site.placement;
		let environmentEffect = site.environmentEffect;
		let serverEffects = site.serverEffects;
		let browserEffects = site.browserEffects;

		if (needsServer && needsClient) {
			diagnostics.push(
				'error: task combines server-kept and client-kept values in one indivisible computation'
			);
		} else if (needsServer) {
			if (
				site.requestedPlacement === 'client' ||
				(site.placement === 'client' && site.browserEffects)
			) {
				diagnostics.push('error: client task reads or writes server-kept data');
			} else {
				placement = 'server';
				environmentEffect = 'server';
				serverEffects = true;
			}
		} else if (needsClient) {
			if (
				site.requestedPlacement === 'server' ||
				(site.placement === 'server' && site.serverEffects)
			) {
				diagnostics.push('error: server task reads or writes client-kept data');
			} else {
				placement = 'client';
				environmentEffect = 'browser';
				browserEffects = true;
			}
		}

		for (const message of diagnostics) {
			if (!message.startsWith('error:') || site.diagnostics.includes(message)) continue;
			policyDiagnostics.add(message);
			planDiagnostics.push(message);
			diagnosticLocations.push({ message, start: site.start });
		}
		sites.set(
			id,
			Object.freeze({
				...site,
				placement,
				environmentEffect,
				serverEffects,
				browserEffects,
				diagnostics: Object.freeze(diagnostics)
			})
		);
	}

	return Object.freeze({
		tasks: Object.freeze({
			...tasks,
			sites,
			diagnostics: Object.freeze(planDiagnostics),
			diagnosticLocations: Object.freeze(diagnosticLocations)
		}),
		diagnostics: Object.freeze([...policyDiagnostics].sort())
	});
}
