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
					dependencies: Object.freeze(dependencies),
					definition: binding.definition
						? clampRange(source, binding.definition.start, binding.definition.length)
						: range,
					references: Object.freeze(
						(binding.references ?? []).map((reference) =>
							clampRange(source, reference.start, reference.length)
						)
					)
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

/** Projects compiler-classified setup assignments at their authored state targets. */
export function stateAssignmentEntities(
	component: NativeCompilerComponent,
	source: string,
	analysis: NativeCompilerAnalysis
): ExactSourceEntity[] {
	return analysis.stateWrites
		.filter((write) => write.component === component.name && write.setupExecution !== undefined)
		.map((write, index) => {
			const range = clampRange(source, write.start, write.length);
			const path = `state.${write.path.join('.')}`;
			const authoredPath = `this.${path}`;
			const selectionRange = findTextRange(source, authoredPath, range) ?? range;
			const dependencies = stateDependencies(analysis, component.name, source, range);
			const reactive = write.setupExecution === 'deferred-reactive';
			return Object.freeze({
				id: `${component.id}:state-assignment:${index}`,
				kind: 'state-assignment' as const,
				name: path,
				range,
				selectionRange,
				children: Object.freeze([]),
				classification: Object.freeze({
					kind: 'state-assignment' as const,
					execution: reactive ? ('deferred-reactive' as const) : ('once-per-instance' as const),
					dependencies: Object.freeze(dependencies),
					effect: Object.freeze({
						kind: 'state-write' as const,
						path,
						range: selectionRange,
						confidence: write.path.includes('*') ? ('broad' as const) : ('exact' as const)
					})
				}),
				reasons: Object.freeze(
					reactive
						? [
								Object.freeze({
									code: 'reactive-dependency' as const,
									summary:
										'The compiler defers and reevaluates this assignment when its reactive inputs change.',
									range
								})
							]
						: []
				)
			});
		});
}

/** Projects authored component and intrinsic value/callback binding edges. */
export function bindingEntities(
	component: NativeCompilerComponent,
	source: string,
	analysis: NativeCompilerAnalysis
): ExactSourceEntity[] {
	const componentRange = clampRange(source, component.start, component.length);
	const entities: ExactSourceEntity[] = [];
	let index = 0;
	for (const binding of analysis.valueBindings) {
		const range = clampRange(source, binding.start, binding.length);
		if (binding.component !== component.name || !contains(componentRange, range)) continue;
		const dependencies = stateDependencies(analysis, component.name, source, range);
		entities.push(
			Object.freeze({
				id: `${component.id}:binding:${index++}`,
				kind: 'binding',
				name: `${binding.valueProp}:${binding.callbackProp}`,
				range,
				selectionRange: range,
				children: Object.freeze([]),
				classification: Object.freeze({
					kind: 'binding',
					dependencies: Object.freeze(dependencies),
					statePath: `state.${binding.statePath.join('.')}`,
					valueProp: binding.valueProp,
					callbackProp: binding.callbackProp,
					callbackValueType: binding.callbackValueType,
					additionalParameters: binding.additionalParameters,
					additionalParameterTypes: Object.freeze([...binding.additionalParameterTypes]),
					placement: binding.placement,
					artifactTargets: Object.freeze([...binding.artifactTargets]),
					...(binding.intrinsicAdapter ? { intrinsicAdapter: binding.intrinsicAdapter } : {})
				}),
				reasons: Object.freeze(
					dependencies.length
						? [
								Object.freeze({
									code: 'reactive-dependency' as const,
									summary: binding.intrinsicAdapter
										? 'The compiler binds this intrinsic to one writable reactive location.'
										: `The compiler supplies ${binding.valueProp} and an unconditional ${binding.callbackProp} assignment callback.`,
									range
								})
							]
						: []
				)
			})
		);
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
