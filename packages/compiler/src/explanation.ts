import { captureActivationDecision } from './compilation/analysis-projections.js';
import type {
	ExactCompilerExplanation,
	ExactContinuationIR,
	ExactResumptionFieldExplanation,
	TransformTarget
} from './types.js';
import type { ExactModuleAnalysis } from './contracts/module-analysis.js';

/** Creates a stable explanation without exposing the compiler's planning analysis. */
export function createExactCompilerExplanation(
	analysis: ExactModuleAnalysis,
	target: TransformTarget
): ExactCompilerExplanation {
	const continuations = groupContinuations(analysis.continuations);
	const resumptions = new Map(
		analysis.resumptions.map((resumption) => [resumption.componentId, resumption])
	);
	return {
		filename: analysis.filename,
		target,
		islands: analysis.boundaries.flatMap((boundary) =>
			boundary.kind === 'client-island' && boundary.activation
				? [
						{
							id: boundary.id,
							name: boundary.name,
							...(boundary.componentId ? { componentId: boundary.componentId } : {}),
							activation: captureActivationDecision(boundary.activation)
						}
					]
				: []
		),
		registries: (analysis.registries ?? []).map((registry) => ({
			id: registry.id,
			name: registry.name,
			entries: registry.entries.map((entry) => ({
				...entry,
				artifactTargets: [...entry.artifactTargets]
			}))
		})),
		components: analysis.components.map((component) => {
			const componentContinuations = continuations.get(component.id) ?? [];
			const resumption = resumptions.get(component.id);
			const returnedState = new Set(
				componentContinuations.flatMap((continuation) =>
					continuation.effects.stateWrites
						.filter((write) => write.confidence === 'exact')
						.map((write) => write.path)
				)
			);
			return {
				id: component.id,
				name: component.name,
				placement: component.placement,
				artifactTargets: [...(component.artifactTargets ?? [])],
				continuations: componentContinuations.map(explainContinuation),
				ssr: {
					stateInputs: [...(resumption?.serverRender.stateReads ?? [])],
					serverOnlyContexts: (resumption?.serverRender.serverContexts ?? []).map(
						(context) => context.token
					),
					resumption: explainResumption(resumption?.client, returnedState)
				}
			};
		})
	};
}

function explainContinuation(
	continuation: ExactContinuationIR
): import('./types.js').ExactContinuationExplanation {
	return {
		id: continuation.id,
		kind: continuation.kind,
		...(continuation.label ? { label: continuation.label } : {}),
		placement: continuation.placement,
		clientToServer: {
			state: continuation.activation.stateReads.map((effect) => effect.path),
			dependencies: continuation.activation.dependencies.map((dependency) => dependency.index),
			publicContexts: continuation.activation.publicContexts.map((context) => context.token)
		},
		serverOnlyContexts: continuation.activation.serverContexts.map((context) => context.token),
		serverToClient: {
			state: continuation.effects.stateWrites.map((effect) => effect.path),
			contexts: continuation.effects.contextWrites.map((context) => context.token),
			boundaries: [...continuation.effects.boundaries]
		},
		...(continuation.invocation
			? {
					invocation: {
						concurrency: continuation.invocation.concurrency,
						arguments: continuation.invocation.arguments.map((argument) => argument.index)
					}
				}
			: {})
	};
}

function explainResumption(
	resumption: ExactModuleAnalysis['resumptions'][number]['client'] | undefined,
	returnedState: ReadonlySet<string>
): ExactResumptionFieldExplanation[] {
	if (!resumption) return [];
	return [
		...resumption.statePaths.map(
			(name): ExactResumptionFieldExplanation => ({
				kind: 'state',
				name,
				reason: returnedState.has(name) ? 'server-continuation-result' : 'client-render-dependency'
			})
		),
		...resumption.valueCaptures.map(
			(name): ExactResumptionFieldExplanation => ({
				kind: 'capture',
				name,
				reason: 'client-closure-capture'
			})
		),
		...resumption.contexts.map(
			(name): ExactResumptionFieldExplanation => ({
				kind: 'context',
				name,
				reason: 'shared-context-result'
			})
		),
		...resumption.boundaries.map(
			(name): ExactResumptionFieldExplanation => ({
				kind: 'boundary',
				name,
				reason: 'dom-adoption'
			})
		)
	];
}

function groupContinuations(
	continuations: readonly ExactContinuationIR[]
): Map<string, ExactContinuationIR[]> {
	const grouped = new Map<string, ExactContinuationIR[]>();
	for (const continuation of continuations) {
		const values = grouped.get(continuation.componentId) ?? [];
		values.push(continuation);
		grouped.set(continuation.componentId, values);
	}
	return grouped;
}
