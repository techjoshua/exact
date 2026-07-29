import type {
	NativeCompilerAnalysis,
	NativeCompilerComponent
} from '../native/process-contracts.js';
import type { ExactSourceDependency, ExactSourceEntity, ExactSourceRange } from './contracts.js';
import {
	clampRange,
	contains,
	escapePattern,
	findBalancedCallEnd,
	findTextRange,
	overlaps
} from './source-ranges.js';

/** Projects compiler-observed derived bindings owned by one component. */
export function derivedEntities(
	component: NativeCompilerComponent,
	source: string,
	analysis: NativeCompilerAnalysis
): ExactSourceEntity[] {
	return analysis.reactiveBindings
		.filter(
			(binding) =>
				binding.component === component.name &&
				(binding.provenance === 'derived' || binding.dependencies.length > 0)
		)
		.map((binding, index) => {
			const range = clampRange(source, binding.start, binding.length);
			const dependencies = binding.dependencies.map((path) =>
				Object.freeze({
					kind: path.startsWith('props.') ? ('prop' as const) : ('state' as const),
					path,
					range: findTextRange(source, path, range) ?? range,
					confidence: 'exact' as const
				})
			);
			return Object.freeze({
				id: `${component.id}:derived:${index}`,
				kind: 'derived' as const,
				name: binding.name,
				range,
				selectionRange: findTextRange(source, binding.name, range) ?? range,
				children: Object.freeze([]),
				classification: Object.freeze({
					kind: 'derived' as const,
					dependencies: Object.freeze(dependencies)
				}),
				reasons: Object.freeze(
					dependencies.length
						? [
								Object.freeze({
									code: 'reactive-dependency' as const,
									summary: 'The compiler tracks this value from its reactive inputs.',
									range
								})
							]
						: []
				)
			});
		});
}

/** Projects named action registrations and normalized concurrency. */
export function actionEntities(
	component: NativeCompilerComponent,
	source: string,
	analysis: NativeCompilerAnalysis
): ExactSourceEntity[] {
	const range = clampRange(source, component.start, component.length);
	const matches = [
		...source.slice(range.start, range.end).matchAll(/\bthis\.action(?:\.(latest|queue))?\s*\(/g)
	];
	return matches.map((match, index) => {
		const start = range.start + match.index;
		const end = findBalancedCallEnd(source, start) ?? start + match[0].length;
		const actionRange = Object.freeze({ start, end });
		const nativeAction = analysis.actions?.find(
			(candidate) =>
				candidate.component === component.name &&
				clampRange(source, candidate.start, candidate.length).start === start
		);
		const continuation = analysis.continuations.find(
			(candidate) =>
				candidate.kind === 'action' &&
				candidate.componentId === component.id &&
				(!nativeAction || candidate.id === nativeAction.id)
		);
		const concurrency =
			nativeAction?.concurrency ??
			continuation?.invocation?.concurrency ??
			(match[1] === 'latest' || match[1] === 'queue' ? match[1] : 'parallel');
		return Object.freeze({
			id: nativeAction?.id ?? continuation?.id ?? `${component.id}:action:${index}`,
			kind: 'action' as const,
			name: nativeAction?.label ?? continuation?.label ?? 'Action',
			range: actionRange,
			selectionRange: Object.freeze({
				start: start + 'this.'.length,
				end: start + 'this.action'.length
			}),
			children: Object.freeze([]),
			classification: Object.freeze({
				kind: 'action' as const,
				placement: nativeAction?.placement ?? continuation?.placement ?? component.placement,
				concurrency
			}),
			reasons: Object.freeze([])
		});
	});
}

/** Projects native two-way control bindings with their reactive inputs. */
export function bindingEntities(
	component: NativeCompilerComponent,
	source: string,
	analysis: NativeCompilerAnalysis
): ExactSourceEntity[] {
	const componentRange = clampRange(source, component.start, component.length);
	const entities: ExactSourceEntity[] = [];
	let index = 0;
	for (const element of analysis.jsx) {
		for (const attribute of element.attributes) {
			if (attribute.namespace !== 'value' && attribute.namespace !== 'checked') continue;
			const range = clampRange(source, attribute.start, attribute.length);
			if (!contains(componentRange, range)) continue;
			const dependencies = stateDependencies(analysis, component.name, source, range);
			entities.push(
				Object.freeze({
					id: `${component.id}:binding:${index++}`,
					kind: 'binding',
					name: `${attribute.namespace}:${attribute.name ?? 'change'}`,
					range,
					selectionRange: range,
					children: Object.freeze([]),
					classification: Object.freeze({
						kind: 'binding',
						dependencies: Object.freeze(dependencies)
					}),
					reasons: Object.freeze(
						dependencies.length
							? [
									Object.freeze({
										code: 'reactive-dependency' as const,
										summary: 'The compiler binds this control to one writable reactive location.',
										range
									})
								]
							: []
					)
				})
			);
		}
	}
	return entities;
}

/** Projects JSX event attributes as interaction-owned deferred regions. */
export function interactionEntities(
	component: NativeCompilerComponent,
	source: string,
	analysis: NativeCompilerAnalysis
): ExactSourceEntity[] {
	const componentRange = clampRange(source, component.start, component.length);
	const entities: ExactSourceEntity[] = [];
	let index = 0;
	for (const element of analysis.jsx) {
		for (const attribute of element.attributes) {
			if (!attribute.name || !/^on[A-Z]/.test(attribute.name)) continue;
			const range = clampRange(source, attribute.start, attribute.length);
			if (!contains(componentRange, range)) continue;
			entities.push(
				Object.freeze({
					id: `${component.id}:interaction:${index++}`,
					kind: 'interaction',
					name: attribute.name,
					range,
					selectionRange: range,
					children: Object.freeze([]),
					reasons: Object.freeze([])
				})
			);
		}
	}
	return entities;
}

/** Projects mount and unmount registrations with component cleanup ownership. */
export function lifecycleEntities(
	component: NativeCompilerComponent,
	source: string
): ExactSourceEntity[] {
	const componentRange = clampRange(source, component.start, component.length);
	const text = source.slice(componentRange.start, componentRange.end);
	return [...text.matchAll(/\bthis\.(onMount|onUnmount)\s*\(/g)].map((match, index) => {
		const start = componentRange.start + match.index;
		const end = findBalancedCallEnd(source, start) ?? start + match[0].length;
		const range = Object.freeze({ start, end });
		const returnedCleanup = /\breturn\b/.test(source.slice(start, end));
		return Object.freeze({
			id: `${component.id}:lifecycle:${index}`,
			kind: 'lifecycle',
			name: match[1],
			range,
			selectionRange: Object.freeze({
				start,
				end: start + `this.${match[1]}`.length
			}),
			children: Object.freeze([]),
			classification: Object.freeze({
				kind: 'lifecycle',
				ownership: 'component',
				disposal: returnedCleanup ? 'returned-cleanup' : 'automatic'
			}),
			reasons: Object.freeze(
				returnedCleanup
					? [
							Object.freeze({
								code: 'returned-cleanup' as const,
								summary: 'The lifecycle callback returns cleanup owned by this component.',
								range
							})
						]
					: []
			)
		});
	});
}

/** Projects component context reads and publications at their authored calls. */
export function contextEntities(
	component: NativeCompilerComponent,
	source: string
): ExactSourceEntity[] {
	const componentRange = clampRange(source, component.start, component.length);
	const text = source.slice(componentRange.start, componentRange.end);
	return [...text.matchAll(/\bthis\.(getContext|setContext)\s*\(/g)].map((match, index) => {
		const start = componentRange.start + match.index;
		const end = findBalancedCallEnd(source, start) ?? start + match[0].length;
		const range = Object.freeze({ start, end });
		return Object.freeze({
			id: `${component.id}:context:${index}`,
			kind: match[1] === 'getContext' ? ('context-read' as const) : ('context-write' as const),
			name: match[1],
			range,
			selectionRange: Object.freeze({
				start,
				end: start + `this.${match[1]}`.length
			}),
			children: Object.freeze([]),
			reasons: Object.freeze([])
		});
	});
}

/** Projects finite registry lookups while retaining compiler-owned registry identity. */
export function registrySelectionEntities(
	component: NativeCompilerComponent,
	source: string,
	analysis: NativeCompilerAnalysis
): ExactSourceEntity[] {
	const componentRange = clampRange(source, component.start, component.length);
	const text = source.slice(componentRange.start, componentRange.end);
	const entities: ExactSourceEntity[] = [];
	let index = 0;
	for (const registry of analysis.registries ?? []) {
		const pattern = new RegExp(
			`\\b${escapePattern(registry.name)}(?:\\.[A-Za-z_$][\\w$]*|\\s*\\[[^\\]]+\\])`,
			'g'
		);
		for (const match of text.matchAll(pattern)) {
			const start = componentRange.start + match.index;
			const range = Object.freeze({ start, end: start + match[0].length });
			entities.push(
				Object.freeze({
					id: `${component.id}:registry-selection:${index++}`,
					kind: 'registry-selection',
					name: registry.name,
					range,
					selectionRange: range,
					children: Object.freeze([]),
					reasons: Object.freeze([])
				})
			);
		}
	}
	return entities;
}

/** Returns state dependencies whose native read ranges overlap one entity. */
export function stateDependencies(
	analysis: NativeCompilerAnalysis,
	component: string,
	source: string,
	range: ExactSourceRange
): ExactSourceDependency[] {
	const dependencies: ExactSourceDependency[] = [];
	for (const read of analysis.stateReads) {
		if (read.component !== component) continue;
		const readRange = clampRange(source, read.start, read.length);
		if (!overlaps(range, readRange)) continue;
		const path = `state.${read.path.join('.')}${read.confidence === 'broad' ? '.*' : ''}`;
		dependencies.push(
			Object.freeze({
				kind: 'state',
				path,
				range: readRange,
				confidence: read.confidence
			})
		);
	}
	return dependencies;
}
