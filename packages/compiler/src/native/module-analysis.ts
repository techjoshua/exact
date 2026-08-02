import type { ExactComponentIR, ExactContinuationIR, ExactTaskIR } from '../types.js';
import type { ExactModuleAnalysis } from '../contracts/module-analysis.js';
import type {
	NativeCompilerComponent,
	NativeCompilerContinuation,
	NativeCompilerResponse,
	NativeCompilerTask
} from './process-contracts.js';

/**
 * Projects the process-safe native analysis into the public compiler analysis.
 *
 * This is a structural copy rather than a compatibility AST projection: no
 * TypeScript nodes, checker handles, or JavaScript expression wrappers are
 * reconstructed after the Go host has completed analysis.
 */
export function nativeModuleAnalysis(
	filename: string,
	response: NativeCompilerResponse
): ExactModuleAnalysis {
	const components = response.analysis.components.map((component) =>
		nativeComponent(component, response.analysis.tasks)
	);
	const continuations = response.analysis.continuations.map(nativeContinuation);
	const symbols = response.analysis.symbols.map((symbol) => ({ ...symbol }));
	const exports = response.analysis.exports.map((record) => ({ ...record }));
	return {
		version: 1,
		filename,
		dependencies: [],
		assets: response.analysis.assets.map((asset) => ({ ...asset })),
		components,
		exports,
		symbols,
		boundaries: response.analysis.boundaries.map((boundary) => ({ ...boundary })),
		callables: response.analysis.callables.map((callable) => ({
			...callable,
			exportNames: [...callable.exportNames],
			directEffectSources: callable.directEffectSources.map((source) => ({
				...source,
				path: [...source.path]
			})),
			effectSources: callable.effectSources.map((source) => ({
				...source,
				path: [...source.path]
			})),
			calls: callable.calls.map((call) => ({
				id: call.id,
				name: call.name,
				...(call.targetId ? { targetId: call.targetId } : {}),
				...(call.moduleSpecifier ? { moduleSpecifier: call.moduleSpecifier } : {}),
				...(call.exportName ? { exportName: call.exportName } : {}),
				resolved: call.resolved,
				...(call.receiverBindings
					? {
							receiverBindings: call.receiverBindings.map((binding) => ({ ...binding }))
						}
					: {})
			})),
			artifactTargets: [...callable.artifactTargets],
			stateReads: callable.stateReads.map((effect) => ({ ...effect })),
			stateWrites: callable.stateWrites.map((effect) => ({ ...effect })),
			contexts: callable.contexts.map((effect) => ({ ...effect }))
		})),
		continuations,
		registries: (response.analysis.registries ?? []).map((registry) => ({
			id: registry.id,
			name: registry.name,
			entries: registry.entries.map((entry) => ({
				...entry,
				artifactTargets: [...entry.artifactTargets]
			}))
		})),
		rendererEnhancements: response.analysis.rendererEnhancements.map((entry) => ({ ...entry })),
		resumptions: response.analysis.resumptions.map((resumption) => ({
			componentId: resumption.componentId,
			serverRender: {
				stateReads: [...resumption.serverRender.stateReads],
				serverContexts: resumption.serverRender.serverContexts.map((effect) => ({
					...effect
				}))
			},
			client: {
				statePaths: [...resumption.client.statePaths],
				valueCaptures: [...resumption.client.valueCaptures],
				contexts: [...resumption.client.contexts],
				boundaries: [...resumption.client.boundaries]
			}
		})),
		semanticGraph: {
			scopes: response.analysis.semanticGraph.scopes.map((scope) => ({ ...scope })),
			declarations: response.analysis.semanticGraph.declarations.map((declaration) => ({
				...declaration
			})),
			references: response.analysis.semanticGraph.references.map((reference) => ({
				...reference
			})),
			exports: response.analysis.semanticGraph.exports.map((exported) => ({ ...exported }))
		},
		policy: {
			version: 1,
			subjects: response.analysis.policy.subjects.map((subject) => ({ ...subject })),
			flows: response.analysis.policy.flows.map((flow) => ({
				...flow,
				from: [...flow.from]
			})),
			secretConsumers: response.analysis.policy.secretConsumers.map((consumer) => ({
				...consumer,
				consumer: { ...consumer.consumer }
			}))
		},
		...(response.analysis.requiredCapabilities.rawHtml.length
			? {
					requiredCapabilities: {
						rawHtml: response.analysis.requiredCapabilities.rawHtml.map((requirement) => ({
							...requirement,
							targets: [...requirement.targets]
						}))
					}
				}
			: {}),
		diagnostics: [
			...response.diagnostics.map((diagnostic) =>
				diagnostic.message.startsWith(`${diagnostic.severity}:`)
					? diagnostic.message
					: `${diagnostic.severity}: ${diagnostic.message}`
			),
			...components.flatMap((component) => component.diagnostics)
		]
	};
}

function nativeComponent(
	component: NativeCompilerComponent,
	tasks: readonly NativeCompilerTask[]
): ExactComponentIR {
	return {
		id: component.id,
		name: component.name,
		exported: component.exported,
		placement: component.placement,
		subgraphPlacement: component.subgraphPlacement,
		renderEdges: component.renderEdges.map(({ nodeId: _nodeId, ...edge }) => ({ ...edge })),
		clientIslandCount: component.clientIslandCount,
		tasks: tasks
			.filter(
				(task) =>
					task.component === component.name &&
					task.start >= component.start &&
					task.start + task.length <= component.start + component.length
			)
			.map(nativeTask),
		contexts: component.contexts.map((effect) => ({ ...effect })),
		splitBoundaries: [...component.splitBoundaries],
		diagnostics: [...component.diagnostics],
		environmentEffect: component.environmentEffect,
		artifactTargets: [...component.artifactTargets]
	};
}

function nativeTask(task: NativeCompilerTask): ExactTaskIR {
	return {
		id: task.id,
		placement: task.placement,
		...(task.requestedPlacement ? { requestedPlacement: task.requestedPlacement } : {}),
		priority: task.priority,
		readiness: task.readiness,
		...(task.concurrency ? { concurrency: task.concurrency } : {}),
		...(task.detached ? { detached: true } : {}),
		...(task.functionDefined ? { functionDefined: true } : {}),
		...(task.invoked ? { invoked: true } : {}),
		...(task.argumentCount === undefined ? {} : { argumentCount: task.argumentCount }),
		...(task.activationArgumentCount === undefined
			? {}
			: { activationArgumentCount: task.activationArgumentCount }),
		capturedParameters: [...task.capturedParameters],
		async: task.async,
		browserEffects: task.browserEffects,
		dependencies: task.dependencies.map((dependency) => ({ ...dependency })),
		capturedInputs: task.capturedInputs.map((input) => ({ ...input })),
		reads: task.reads.map((effect) => ({ ...effect })),
		writes: task.writes.map((effect) => ({ ...effect })),
		contexts: task.contexts.map((effect) => ({ ...effect })),
		diagnostics: [...task.diagnostics],
		environmentEffect: task.environmentEffect,
		effectSources: task.effectSources.map((source) => ({
			...source,
			path: [...source.path]
		}))
	};
}

function nativeContinuation(continuation: NativeCompilerContinuation): ExactContinuationIR {
	const { invocation, ...base } = continuation;
	return {
		...base,
		activation: {
			stateReads: continuation.activation.stateReads.map((effect) => ({ ...effect })),
			dependencies: continuation.activation.dependencies.map((dependency) => ({
				...dependency
			})),
			serverContexts: continuation.activation.serverContexts.map((effect) => ({
				...effect
			})),
			publicContexts: continuation.activation.publicContexts.map((effect) => ({
				...effect
			}))
		},
		effects: {
			stateWrites: continuation.effects.stateWrites.map((effect) => ({ ...effect })),
			contextWrites: continuation.effects.contextWrites.map((effect) => ({ ...effect })),
			serverContextWrites: continuation.effects.serverContextWrites.map((effect) => ({
				...effect
			})),
			boundaries: [...continuation.effects.boundaries]
		},
		ownership: { ...continuation.ownership },
		...(invocation
			? {
					invocation: {
						arguments: invocation.arguments.map((argument) => ({
							...argument
						})),
						concurrency: invocation.concurrency
					}
				}
			: {})
	};
}
