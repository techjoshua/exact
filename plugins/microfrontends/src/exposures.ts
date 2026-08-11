import {
	createExactHydrationRegistrationModule,
	exactExposureRootComponentId,
	selectExactExposureArtifactGraph,
	withExactAuthoredClientModules,
	type ExactArtifactGraph
} from '@exactjs/compiler';
import {
	composeExactExecutorContract,
	defineExactBoundaryContract,
	type ExactRemoteBuildRegistration,
	type ExactExecutorContract,
	type ExactServerContext
} from '@exactjs/server';
import path from 'node:path';
import type { ExactRemoteArtifactPlan } from './build.js';

/** Generates one hydration-registration module for every configured exposure. */
export function createExactExposureRegistrationModules(
	plan: ExactRemoteArtifactPlan,
	graph: ExactArtifactGraph,
	options: { applicationRoot: string }
): Readonly<Record<string, string>> {
	const registrations: Record<string, string> = {};
	for (const exposure of plan.exposures) {
		const selected = selectedExposureGraph(exposure.exposure, exposure.component, graph, options);
		registrations[exposure.exposure] = createExactHydrationRegistrationModule(
			withExactAuthoredClientModules(selected),
			{ preserveAuthoredModuleExtensions: true }
		);
	}
	return Object.freeze(registrations);
}

/** Creates the retained component-host registration for one immutable build. */
export function createExactRemoteBuildRegistration(
	plan: ExactRemoteArtifactPlan,
	graph: ExactArtifactGraph,
	options: {
		applicationRoot: string;
		handlers?: Readonly<
			Record<
				string,
				{
					invocations?: ExactServerContext['invocations'];
					refreshBoundaries?: ExactServerContext['refreshBoundaries'];
				}
			>
		>;
	}
): ExactRemoteBuildRegistration {
	const entries: Array<[string, ExactRemoteBuildRegistration['roots'][string]]> = [];
	for (const exposure of plan.exposures) {
		const selected = selectedExposureGraph(exposure.exposure, exposure.component, graph, options);
		const contract = exposureExecutorContract(selected);
		const handlers = options.handlers?.[exposure.root];
		entries.push([
			exposure.root,
			Object.freeze({
				contract,
				invocations: selectHandlers(handlers?.invocations, Object.keys(contract.invocations)),
				refreshBoundaries: selectHandlers(
					handlers?.refreshBoundaries,
					Object.keys(contract.boundaries)
				)
			})
		]);
	}
	return Object.freeze({
		buildKey: plan.buildKey,
		...(plan.componentAuthorization ? { componentAuthorization: plan.componentAuthorization } : {}),
		roots: Object.freeze(Object.fromEntries(entries))
	});
}

/** Composes private executor authority from the selected build-time graph. */
function exposureExecutorContract(graph: ExactArtifactGraph) {
	const invocations: ExactExecutorContract['invocations'] = {};
	const boundaries: Record<string, ReturnType<typeof defineExactBoundaryContract>> = {};
	for (const operation of graph.operations) invocations[operation.id] = operation;
	for (const boundary of graph.boundaries)
		boundaries[boundary.id] = defineExactBoundaryContract(boundary.id, {
			componentId: boundary.componentId,
			ownerComponentId: boundary.ownerComponentId,
			kind: boundary.kind
		});
	return composeExactExecutorContract([], { invocations, boundaries });
}

function selectedExposureGraph(
	exposure: string,
	component: string,
	graph: ExactArtifactGraph,
	options: { applicationRoot: string }
): ExactArtifactGraph {
	const componentFile = path.resolve(options.applicationRoot, component);
	const artifact = graph.artifacts.find(
		(candidate) => path.resolve(candidate.inputFile) === componentFile
	);
	if (!artifact)
		throw new Error(
			`Remote exposure ${JSON.stringify(exposure)} does not resolve to a compiled eXact component module: ${componentFile}`
		);
	const rootComponentId = exactExposureRootComponentId(graph, artifact.inputFile);
	if (!rootComponentId)
		throw new Error(
			`Remote exposure ${JSON.stringify(exposure)} must identify a default-exported eXact component root`
		);
	return selectExactExposureArtifactGraph(graph, rootComponentId);
}

function selectHandlers<T>(
	handlers: Readonly<Record<string, T>> | undefined,
	ids: readonly string[]
): Record<string, T> | undefined {
	if (!handlers) return undefined;
	const selected = Object.fromEntries(
		ids.flatMap((id) => (handlers[id] ? [[id, handlers[id]] as const] : []))
	);
	return Object.keys(selected).length ? selected : undefined;
}
