import {
	createExactHydrationRegistrationModule,
	selectExactExposureArtifactGraph,
	type ExactArtifactGraph
} from '@exactjs/compiler';
import {
	createExactServerManifest,
	type ExactRemoteBuildRegistration,
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
			withAuthoredClientModules(selected)
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
					actions?: ExactServerContext['actions'];
					refreshBoundaries?: ExactServerContext['refreshBoundaries'];
				}
			>
		>;
	}
): ExactRemoteBuildRegistration {
	const entries: Array<[string, ExactRemoteBuildRegistration['roots'][string]]> = [];
	for (const exposure of plan.exposures) {
		const selected = selectedExposureGraph(exposure.exposure, exposure.component, graph, options);
		const manifest = createExactServerManifest(
			selected.artifacts.map((artifact) => artifact.manifest)
		);
		const handlers = options.handlers?.[exposure.root];
		entries.push([
			exposure.root,
			Object.freeze({
				manifest,
				actions: selectHandlers(handlers?.actions, Object.keys(manifest.actions ?? {})),
				refreshBoundaries: selectHandlers(
					handlers?.refreshBoundaries,
					Object.keys(manifest.boundaries ?? {})
				)
			})
		]);
	}
	return Object.freeze({
		buildKey: plan.buildKey,
		roots: Object.freeze(Object.fromEntries(entries))
	});
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
	const root = artifact.manifest.symbols.find(
		(symbol) =>
			symbol.role === 'root' &&
			symbol.kind === 'component' &&
			symbol.exportName === 'default' &&
			Boolean(symbol.componentId)
	);
	if (!root?.componentId)
		throw new Error(
			`Remote exposure ${JSON.stringify(exposure)} must identify a default-exported eXact component root`
		);
	return selectExactExposureArtifactGraph(graph, root.componentId);
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

/**
 * Registrations are bundled with the authored client modules. Artifact graphs
 * still carry generated client paths for server packaging, so remap only the
 * browser registration view without changing graph selection or identifiers.
 */
function withAuthoredClientModules(graph: ExactArtifactGraph): ExactArtifactGraph {
	const moduleByComponent = new Map<string, string>();
	for (const artifact of graph.artifacts) {
		const authoredModule = slashPath(path.resolve(artifact.inputFile));
		for (const symbol of artifact.manifest.symbols)
			if (symbol.componentId) moduleByComponent.set(symbol.componentId, authoredModule);
	}
	return {
		...graph,
		clientIslands: graph.clientIslands.map((entry) => ({
			...entry,
			module: entry.componentId
				? (moduleByComponent.get(entry.componentId) ?? entry.module)
				: entry.module
		})),
		artifacts: graph.artifacts.map((artifact) => ({
			...artifact,
			clientFile: slashPath(path.resolve(artifact.inputFile))
		}))
	};
}

function slashPath(value: string): string {
	return value.replaceAll(path.sep, '/');
}
