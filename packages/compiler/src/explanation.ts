import type {
	ExactCompilerExplanation,
	ExactCompilerManifest,
	ExactContinuationIR,
	ExactResumptionFieldExplanation,
	TransformTarget
} from './types.js';

/** Creates a stable explanation without exposing the compiler's planning manifest. */
export function createExactCompilerExplanation(
	manifest: ExactCompilerManifest,
	target: TransformTarget
): ExactCompilerExplanation {
	const continuations = groupContinuations(manifest.continuations);
	const resumptions = new Map(
		manifest.resumptions.map((resumption) => [resumption.componentId, resumption])
	);
	return Object.freeze({
		filename: manifest.filename,
		target,
		components: Object.freeze(
			manifest.components.map((component) => {
				const componentContinuations = continuations.get(component.id) ?? [];
				const resumption = resumptions.get(component.id);
				const returnedState = new Set(
					componentContinuations.flatMap((continuation) =>
						continuation.effects.stateWrites
							.filter((write) => write.confidence === 'exact')
							.map((write) => write.path)
					)
				);
				return Object.freeze({
					id: component.id,
					name: component.name,
					placement: component.placement,
					artifactTargets: Object.freeze([...(component.artifactTargets ?? [])]),
					continuations: Object.freeze(componentContinuations.map(explainContinuation)),
					ssr: Object.freeze({
						stateInputs: Object.freeze([...(resumption?.serverRender.stateReads ?? [])]),
						serverOnlyContexts: Object.freeze(
							(resumption?.serverRender.serverContexts ?? []).map((context) => context.token)
						),
						resumption: Object.freeze(explainResumption(resumption?.client, returnedState))
					})
				});
			})
		)
	});
}

function explainContinuation(
	continuation: ExactContinuationIR
): import('./types.js').ExactContinuationExplanation {
	return Object.freeze({
		id: continuation.id,
		placement: continuation.placement,
		clientToServer: Object.freeze({
			state: Object.freeze(continuation.activation.stateReads.map((effect) => effect.path)),
			dependencies: Object.freeze(
				continuation.activation.dependencies.map((dependency) => dependency.index)
			),
			publicContexts: Object.freeze(
				continuation.activation.publicContexts.map((context) => context.token)
			)
		}),
		serverOnlyContexts: Object.freeze(
			continuation.activation.serverContexts.map((context) => context.token)
		),
		serverToClient: Object.freeze({
			state: Object.freeze(continuation.effects.stateWrites.map((effect) => effect.path)),
			contexts: Object.freeze(continuation.effects.contextWrites.map((context) => context.token)),
			boundaries: Object.freeze([...continuation.effects.boundaries])
		})
	});
}

function explainResumption(
	resumption: ExactCompilerManifest['resumptions'][number]['client'] | undefined,
	returnedState: ReadonlySet<string>
): ExactResumptionFieldExplanation[] {
	if (!resumption) return [];
	return [
		...resumption.statePaths.map(
			(name): ExactResumptionFieldExplanation =>
				Object.freeze({
					kind: 'state',
					name,
					reason: returnedState.has(name)
						? 'server-continuation-result'
						: 'client-render-dependency'
				})
		),
		...resumption.valueCaptures.map(
			(name): ExactResumptionFieldExplanation =>
				Object.freeze({ kind: 'capture', name, reason: 'client-closure-capture' })
		),
		...resumption.contexts.map(
			(name): ExactResumptionFieldExplanation =>
				Object.freeze({ kind: 'context', name, reason: 'shared-context-result' })
		),
		...resumption.boundaries.map(
			(name): ExactResumptionFieldExplanation =>
				Object.freeze({ kind: 'boundary', name, reason: 'dom-adoption' })
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
