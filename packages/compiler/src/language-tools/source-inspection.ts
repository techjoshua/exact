import { capturePartitionPlan } from '../compilation/analysis-projections.js';
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
	return {
		generation,
		filename,
		compiler: {
			typescriptVersion: response.typescriptVersion,
			backendVersion: response.backendVersion
		},
		partitionPlan: capturePartitionPlan(response.analysis.partitionPlan),
		languageProjection: createExactLanguageProjection(filename, source, generation, response),
		components: components,
		diagnostics: response.diagnostics
			.filter(isExactCompilerDiagnostic)
			.map((diagnostic) => sourceDiagnostic(filename, source, diagnostic, response.analysis))
	};
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
				includeReasons,
				analysis.reactiveBindings.filter((binding) => binding.component === component.name)
			)
		);
	const returned = findReturnedRender(source, range);
	const initializerStart = findBodyStart(source, range);
	const initializerRange = {
		start: initializerStart,
		end: Math.max(initializerStart, returned?.range.start ?? range.end)
	};
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
	const initializer = {
		id: `${component.id}:initializer`,
		kind: 'initializer' as const,
		name: 'Initialization',
		range: initializerRange,
		selectionRange: initializerRange,
		children: setupEntities,
		classification: {
			kind: 'initializer' as const,
			execution: 'once-per-instance' as const,
			placement: component.placement
		},
		reasons: []
	};
	const children: ExactSourceEntity[] = [initializer];
	if (returned) {
		const renderOwned = [
			...bindingEntities(component, source, analysis),
			...interactionEntities(component, source, analysis),
			...registrySelections.filter((entity) => contains(returned.range, entity.range))
		];
		children.push(renderEntity(component, source, analysis, returned, renderOwned));
	}
	return {
		id: component.id,
		kind: 'component',
		name: component.name,
		range,
		selectionRange: nameRange,
		children: children.sort((left, right) => left.range.start - right.range.start),
		reasons: componentReasons(component, range, includeReasons)
	};
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
	return {
		id: `${component.id}:render`,
		kind: 'render',
		name: 'Render',
		range: returned.range,
		selectionRange: returned.selectionRange,
		children: [
			...analysis.jsx
				.filter((element) =>
					contains(returned.range, clampRange(source, element.start, element.length))
				)
				.map((element, index) => {
					const elementRange = clampRange(source, element.start, element.length);
					const edge = component.renderEdges.find(
						(candidate) => candidate.path === String(element.start) && candidate.tag === element.tag
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
		].sort((left, right) => left.range.start - right.range.start),
		classification: {
			kind: 'render',
			execution: 'reactive',
			dependencies: dependencies,
			effects: []
		},
		reasons: dependencies.length
			? [
					{
						code: 'reactive-dependency' as const,
						summary: 'The returned view reads compiler-observed component data.',
						range: returned.range
					}
				]
			: []
	};
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
	return {
		id: `${componentId}:render:${index}`,
		kind: 'render-expression',
		name: tag,
		range,
		selectionRange,
		children: [],
		classification: {
			kind: 'render',
			execution: 'reactive',
			dependencies: dependencies.filter((dependency) => contains(range, dependency.range)),
			effects: [],
			...(edge
				? {
						referencedComponent: {
							...(edge.componentId ? { id: edge.componentId } : {}),
							placement: edge.placement,
							boundary: edge.boundary
						}
					}
				: {})
		},
		reasons: []
	};
}
