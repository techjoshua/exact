import type {
	NativeCompilerAnalysis,
	NativeCompilerComponent,
	NativeCompilerResponse
} from '../native/process-contracts.js';
import type {
	ExactInspectedComponent,
	ExactSourceEntity,
	ExactSourceInspection
} from './contracts.js';
import {
	bindingEntities,
	contextEntities,
	derivedEntities,
	interactionEntities,
	lifecycleEntities,
	registrySelectionEntities,
	stateAssignmentEntities,
	stateDependencies
} from './semantic-entities.js';
import { isExactCompilerDiagnostic, sourceDiagnostic } from './source-diagnostics.js';
import {
	clampRange,
	contains,
	findBodyStart,
	findReturnedRender,
	findTaskRegions,
	findTextRange,
	type AuthoredTaskRegion
} from './source-ranges.js';
import { componentReasons, taskEntity } from './task-inspection.js';
import { createExactLanguageProjection } from './language-projection.js';

/** Projects native compiler facts into the stable editor-facing source model. */
export function createExactSourceInspection(
	filename: string,
	source: string,
	generation: number,
	response: NativeCompilerResponse,
	includeReasons = true
): ExactSourceInspection {
	const taskRegions = findTaskRegions(source, response.analysis.tasks);
	const components = response.analysis.components.map((component) =>
		inspectComponent(component, source, response.analysis, taskRegions, includeReasons)
	);
	return Object.freeze({
		generation,
		filename,
		compiler: Object.freeze({
			typescriptVersion: response.typescriptVersion,
			backendVersion: response.backendVersion
		}),
		partitionPlan: freezePartitionPlan(response.analysis.partitionPlan),
		languageProjection: createExactLanguageProjection(filename, source, generation, response),
		components: Object.freeze(components),
		diagnostics: Object.freeze(
			// TypeScript diagnostics remain available from the native response for builds,
			// but editor inspection has a separate owner for them.
			response.diagnostics
				.filter(isExactCompilerDiagnostic)
				.map((diagnostic) => sourceDiagnostic(filename, source, diagnostic, response.analysis))
		)
	});
}

function freezePartitionPlan(
	plan: NativeCompilerAnalysis['partitionPlan']
): ExactSourceInspection['partitionPlan'] {
	return Object.freeze({
		...plan,
		version: 1,
		roots: Object.freeze([...plan.roots]),
		nodes: Object.freeze(
			plan.nodes.map((node) =>
				Object.freeze({
					...node,
					...(node.activationDecision
						? { activationDecision: freezeActivationDecision(node.activationDecision) }
						: {}),
					artifactTargets: Object.freeze([...node.artifactTargets]),
					renderPath: Object.freeze([...node.renderPath]),
					childEdges: Object.freeze([...node.childEdges])
				})
			)
		),
		edges: Object.freeze(
			plan.edges.map((edge) =>
				Object.freeze({
					...edge,
					data: Object.freeze(edge.data.map((slot) => Object.freeze({ ...slot }))),
					renderPath: Object.freeze([...edge.renderPath])
				})
			)
		)
	});
}

function freezeActivationDecision<
	T extends {
		mode: string;
		reasons: readonly Record<string, unknown>[];
		targets: readonly (Record<string, unknown> & { events: readonly Record<string, unknown>[] })[];
	}
>(decision: T): T {
	return Object.freeze({
		...decision,
		reasons: Object.freeze(decision.reasons.map((reason) => Object.freeze({ ...reason }))),
		targets: Object.freeze(
			decision.targets.map((target) =>
				Object.freeze({
					...target,
					events: Object.freeze(target.events.map((event) => Object.freeze({ ...event })))
				})
			)
		)
	}) as T;
}

function inspectComponent(
	component: NativeCompilerComponent,
	source: string,
	analysis: NativeCompilerAnalysis,
	taskRegions: readonly AuthoredTaskRegion[],
	includeReasons: boolean
): ExactInspectedComponent {
	const range = clampRange(source, component.start, component.length);
	const nameRange = findTextRange(source, component.name, range) ?? range;
	const componentTasks = analysis.tasks.filter((task) => task.component === component.name);
	const regions = taskRegions
		.filter((candidate) => contains(range, candidate.range))
		.map((candidate, index) =>
			taskEntity(
				componentTasks.find((task) => taskRegionMatches(source, task, candidate)) ??
					componentTasks[index],
				candidate,
				source,
				`${component.id}:task:${index}`,
				includeReasons
			)
		);
	const returned = findReturnedRender(source, range);
	const initializerStart = findBodyStart(source, range);
	const initializerRange = Object.freeze({
		start: initializerStart,
		end: Math.max(initializerStart, returned?.range.start ?? range.end)
	});
	const registrySelections = registrySelectionEntities(component, source, analysis);
	const setupEntities = [
		...regions,
		...derivedEntities(component, source, analysis),
		...stateAssignmentEntities(component, source, analysis),
		...lifecycleEntities(component, source),
		...contextEntities(component, source),
		...registrySelections
	]
		.filter((entity) => contains(initializerRange, entity.range))
		.sort((left, right) => left.range.start - right.range.start);
	const initializer = Object.freeze({
		id: `${component.id}:initializer`,
		kind: 'initializer' as const,
		name: 'Initialization',
		range: initializerRange,
		selectionRange: initializerRange,
		children: Object.freeze(setupEntities),
		classification: Object.freeze({
			kind: 'initializer' as const,
			execution: 'once-per-instance' as const,
			placement: component.placement
		}),
		reasons: Object.freeze([])
	});
	const children: ExactSourceEntity[] = [initializer];
	if (returned) {
		const renderOwned = [
			...bindingEntities(component, source, analysis),
			...interactionEntities(component, source, analysis),
			...registrySelections.filter((entity) => contains(returned.range, entity.range))
		];
		children.push(renderEntity(component, source, analysis, returned, renderOwned));
	}
	return Object.freeze({
		id: component.id,
		kind: 'component',
		name: component.name,
		range,
		selectionRange: nameRange,
		children: Object.freeze(children.sort((left, right) => left.range.start - right.range.start)),
		reasons: Object.freeze(componentReasons(component, range, includeReasons))
	});
}

function taskRegionMatches(
	source: string,
	task: NativeCompilerAnalysis['tasks'][number],
	region: AuthoredTaskRegion
): boolean {
	const taskRange =
		task.functionDefined && task.workStart !== undefined && task.workLength !== undefined
			? clampRange(source, task.workStart, task.workLength)
			: clampRange(source, task.start, task.length);
	return (
		taskRange.end === region.range.end &&
		(taskRange.start === region.range.start ||
			(task.functionDefined === true &&
				region.range.start === Math.min(taskRange.start, region.selectionRange.start)))
	);
}

function renderEntity(
	component: NativeCompilerComponent,
	source: string,
	analysis: NativeCompilerAnalysis,
	returned: Readonly<{
		range: Readonly<{ start: number; end: number }>;
		selectionRange: Readonly<{ start: number; end: number }>;
	}>,
	ownedChildren: readonly ExactSourceEntity[]
): ExactSourceEntity {
	const dependencies = stateDependencies(analysis, component.name, source, returned.range);
	return Object.freeze({
		id: `${component.id}:render`,
		kind: 'render',
		name: 'Render',
		range: returned.range,
		selectionRange: returned.selectionRange,
		children: Object.freeze(
			[
				...analysis.jsx
					.filter((element) =>
						contains(returned.range, clampRange(source, element.start, element.length))
					)
					.map((element, index) => {
						const elementRange = clampRange(source, element.start, element.length);
						const edge = component.renderEdges.find(
							(candidate) =>
								candidate.path === String(element.start) && candidate.tag === element.tag
						);
						return renderExpression(
							component.id,
							index,
							element.tag,
							elementRange,
							findTextRange(source, element.tag, elementRange) ?? elementRange,
							dependencies,
							edge
						);
					}),
				...ownedChildren
			].sort((left, right) => left.range.start - right.range.start)
		),
		classification: Object.freeze({
			kind: 'render',
			execution: 'reactive',
			dependencies: Object.freeze(dependencies),
			effects: Object.freeze([])
		}),
		reasons: Object.freeze(
			dependencies.length
				? [
						Object.freeze({
							code: 'reactive-dependency' as const,
							summary: 'The returned view reads compiler-observed component data.',
							range: returned.range
						})
					]
				: []
		)
	});
}

function renderExpression(
	componentId: string,
	index: number,
	tag: string,
	range: Readonly<{ start: number; end: number }>,
	selectionRange: Readonly<{ start: number; end: number }>,
	dependencies: ReturnType<typeof stateDependencies>,
	edge: NativeCompilerComponent['renderEdges'][number] | undefined
): ExactSourceEntity {
	return Object.freeze({
		id: `${componentId}:render:${index}`,
		kind: 'render-expression',
		name: tag,
		range,
		selectionRange,
		children: Object.freeze([]),
		classification: Object.freeze({
			kind: 'render',
			execution: 'reactive',
			dependencies: Object.freeze(
				dependencies.filter((dependency) => contains(range, dependency.range))
			),
			effects: Object.freeze([]),
			...(edge
				? {
						referencedComponent: Object.freeze({
							...(edge.componentId ? { id: edge.componentId } : {}),
							placement: edge.placement,
							boundary: edge.boundary
						})
					}
				: {})
		}),
		reasons: Object.freeze([])
	});
}
