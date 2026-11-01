import type { ExactActivationDecision, ExactPartitionPlanIR } from '../contracts/analysis.js';
import type { NativeCompilerPartitionPlan } from '../native/process-partition-contracts.js';

/** Captures activation records and lists independently of the compiler facts that own them. */
export function captureActivationDecision(
	decision: ExactActivationDecision
): ExactActivationDecision {
	return {
		...decision,
		reasons: decision.reasons.map((reason) => ({ ...reason })),
		targets: decision.targets.map((target) => ({
			...target,
			events: target.events.map((event) => ({ ...event }))
		}))
	};
}

/** Projects native partition records into the version-one artifact/editor plan with owned containers. */
export function capturePartitionPlan(plan: NativeCompilerPartitionPlan): ExactPartitionPlanIR {
	return {
		...plan,
		version: 1,
		roots: [...plan.roots],
		nodes: plan.nodes.map((node) => ({
			...node,
			...(node.activationDecision
				? { activationDecision: captureActivationDecision(node.activationDecision) }
				: {}),
			artifactTargets: [...node.artifactTargets],
			renderPath: [...node.renderPath],
			childEdges: [...node.childEdges]
		})),
		edges: plan.edges.map((edge) => ({
			...edge,
			data: edge.data.map((slot) => ({ ...slot })),
			renderPath: [...edge.renderPath]
		}))
	};
}
