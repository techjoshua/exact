import type { NativeCompilerComponent, NativeCompilerTask } from '../native/process-contracts.js';
import type {
	ExactInferenceReason,
	ExactInferenceReasonCode,
	ExactSourceDependency,
	ExactSourceEffect,
	ExactSourceEntity,
	ExactSourceRange,
	ExactTaskClassification
} from './contracts.js';
import type { AuthoredTaskRegion } from './source-ranges.js';
import { clampRange, findTextRange, inferredDependencyPath } from './source-ranges.js';

/** Projects one native task and its authored region into a stable source entity. */
export function taskEntity(
	task: NativeCompilerTask | undefined,
	region: AuthoredTaskRegion,
	source: string,
	id: string,
	includeReasons: boolean
): ExactSourceEntity {
	const classification = taskClassification(task, region, source);
	const reasons = includeReasons ? taskReasons(task, region.range) : [];
	return Object.freeze({
		id: task?.id ?? id,
		kind: region.origin === 'explicit' ? 'explicit-task' : 'inferred-task',
		name: region.origin === 'explicit' ? 'Explicit task' : 'Inferred task',
		range: region.range,
		selectionRange: region.selectionRange,
		children: Object.freeze([]),
		classification,
		reasons: Object.freeze(reasons)
	});
}

/** Returns component-level placement reasons retained by native analysis. */
export function componentReasons(
	component: NativeCompilerComponent,
	range: ExactSourceRange,
	includeReasons: boolean
): ExactInferenceReason[] {
	if (!includeReasons || component.environmentEffect === 'neutral') return [];
	const code: ExactInferenceReasonCode =
		component.environmentEffect === 'browser'
			? 'browser-api'
			: component.environmentEffect === 'server'
				? 'server-module'
				: 'unknown-call-effect';
	return [
		Object.freeze({
			code,
			summary: `The component has ${component.environmentEffect} environment effects.`,
			range
		})
	];
}

function taskClassification(
	task: NativeCompilerTask | undefined,
	region: AuthoredTaskRegion,
	source: string
): ExactTaskClassification {
	const dependencies =
		region.origin === 'explicit'
			? sourceDependencies(region.dependencyPaths, region.range, source)
			: task?.dependencies.length
				? uniqueDependencies(
						task.dependencies.map((dependency) => {
							const fallback = region.range;
							const kind =
								dependency.source === 'props'
									? 'prop'
									: dependency.source === 'derived'
										? 'derived'
										: dependency.source;
							const path =
								dependency.path && !(dependency.source === 'props' && dependency.path === 'props')
									? dependency.path
									: dependency.source === 'context'
										? (dependency.contextToken ?? 'context')
										: inferredDependencyPath(source, region.range, dependency.source);
							return Object.freeze({
								kind,
								path,
								range: findTextRange(source, path, region.range) ?? fallback,
								confidence: path.endsWith('.*') ? 'broad' : 'exact'
							}) as ExactSourceDependency;
						})
					)
				: [];
	const effects = task
		? [
				...task.writes.map(
					(effect) =>
						Object.freeze({
							kind: 'state-write' as const,
							path: effect.path,
							range: findTextRange(source, effect.path, region.range) ?? region.range,
							confidence: effect.confidence
						}) as ExactSourceEffect
				),
				...task.contexts
					.filter((effect) => effect.kind === 'write')
					.map(
						(effect) =>
							Object.freeze({
								kind: 'context-write' as const,
								path: effect.token,
								range: findTextRange(source, effect.token, region.range) ?? region.range,
								confidence: effect.confidence
							}) as ExactSourceEffect
					)
			]
		: [];
	return Object.freeze({
		kind: 'task',
		origin: region.origin,
		placement: task?.placement ?? 'unknown',
		...(task?.requestedPlacement ? { placementRequest: task.requestedPlacement } : {}),
		priority: task?.priority ?? 'normal',
		readiness: task?.readiness ?? (region.awaited ? 'blocking' : 'nonblocking'),
		dependencies: Object.freeze(dependencies),
		effects: Object.freeze(effects),
		publication: region.origin === 'inferred' || effects.length ? 'staged' : 'immediate',
		cancellation: 'generation-abort-signal',
		signalCalls: Object.freeze(
			(task?.signalCalls ?? []).map((call) =>
				Object.freeze({
					range: clampRange(source, call.start, call.length),
					parameter: call.parameter,
					mode: call.mode
				})
			)
		),
		resources: Object.freeze(
			(task?.resources ?? []).map((resource) =>
				Object.freeze({
					kind: resource.kind,
					range: clampRange(source, resource.start, resource.length),
					...(resource.disposal ? { disposal: resource.disposal } : {}),
					...(resource.description ? { description: resource.description } : {})
				})
			)
		),
		cleanup: task?.resources.length ? 'generation' : 'none'
	});
}

/** Projects authored explicit task arguments into their scheduling dependencies. */
function sourceDependencies(
	paths: readonly string[],
	range: ExactSourceRange,
	source: string
): ExactSourceDependency[] {
	return paths.map((path) => {
		const kind = path.startsWith('props.')
			? ('prop' as const)
			: path.includes('state.')
				? ('state' as const)
				: ('capture' as const);
		return Object.freeze({
			kind,
			path,
			range: findTextRange(source, path, range) ?? range,
			confidence: 'exact' as const
		});
	});
}

/**
 * Collapses native scheduling records that resolve to the same authored input.
 *
 * Native analysis may retain more than one capture occurrence for conservative
 * invalidation, while source inspection describes dependency slots rather than
 * internal occurrences.
 */
function uniqueDependencies(
	dependencies: readonly ExactSourceDependency[]
): ExactSourceDependency[] {
	const seen = new Set<string>();
	return dependencies.filter((dependency) => {
		const key = `${dependency.kind}:${dependency.path}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function taskReasons(
	task: NativeCompilerTask | undefined,
	range: ExactSourceRange
): ExactInferenceReason[] {
	const reasons: ExactInferenceReason[] = [];
	if (!task || task.readiness === 'blocking') {
		reasons.push(
			Object.freeze({
				code: 'initial-render-dependency',
				summary: 'Initial rendering waits for this task to publish its result.',
				range
			})
		);
	}
	for (const source of task?.effectSources ?? []) {
		const code: ExactInferenceReasonCode =
			source.environment === 'browser'
				? 'browser-api'
				: source.environment === 'server'
					? source.description.toLowerCase().includes('context')
						? 'server-context'
						: 'server-module'
					: 'unknown-call-effect';
		reasons.push(
			Object.freeze({
				code,
				summary: source.description,
				range,
				related: Object.freeze(source.path.map((summary) => Object.freeze({ summary, range })))
			})
		);
	}
	if (task?.requestedPlacement)
		reasons.push(
			Object.freeze({
				code: 'requested-placement',
				summary: `Source requests ${task.requestedPlacement} placement.`,
				range
			})
		);
	if (task?.signalCalls.length)
		reasons.push(
			Object.freeze({
				code: 'recognized-signal-call',
				summary: 'The compiler supplies the owning generation AbortSignal.',
				range
			})
		);
	if (task?.resources.length)
		reasons.push(
			Object.freeze({
				code: 'owned-resource',
				summary: 'The active task generation owns a disposable resource.',
				range
			})
		);
	return reasons;
}
