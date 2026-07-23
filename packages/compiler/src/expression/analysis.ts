import type { BoundModule, Variable } from '@exactjs/expressions';

import type { CallableEffectPlan } from '../analysis/callable-effects.js';

import { browserPlatformGlobals } from '../platform-effects.js';

import { isServerOnlyModule } from '../imports.js';

import type { ExactContextEffect, ExactEnvironmentEffect } from '../types.js';

import type { ExactProvenanceGraph } from '../provenance.js';

import { expressionComponentIndex } from './component-index.js';

import type { ExpressionJsxPlan } from './jsx.js';

import type { ExpressionTaskPlan } from './task-contracts.js';

import type { ExpressionWritePlan } from './writes.js';

import type {
	ExpressionClientIslandSite,
	ExpressionComponentPlan,
	ExpressionComponentSite,
	ExpressionRenderSite
} from './contracts.js';

import {
	componentSiteMap,
	declarationDescription,
	expressionIslandCaptures,
	expressionIslandStateReads,
	insideClientIsland,
	insideClientIslandOpening,
	insideTask,
	isClientIslandAttribute,
	nearestComponent,
	nodePath,
	spanStart,
	uniqueContexts
} from './analysis-support.js';

/** Classifies component placement effects from canonical bindings and typed JSX. */
export function analyzeExpressionComponents(
	module: BoundModule,
	jsx: ExpressionJsxPlan,
	tasks: ExpressionTaskPlan,
	provenance?: ExactProvenanceGraph,
	writes?: ExpressionWritePlan,
	callableEffects?: CallableEffectPlan
): ExpressionComponentPlan {
	const componentIndex = expressionComponentIndex(module);
	const components = componentIndex.functions;
	const componentNodes = new Set(components.map((component) => component.node));
	const jsxReferences = new Map(
		module
			.walk()
			.jsxElements()
			.toArray()
			.map((reference) => [reference.node.id, reference])
	);
	const localVariables = new Set(
		module
			.walk()
			.references()
			.toArray()
			.map((reference) => reference.variable)
			.filter(
				(variable): variable is Variable =>
					!!variable && variable.id.startsWith(`${module.filename}:`)
			)
	);
	const siteEntries: Array<readonly [string, ExpressionComponentSite]> = [];

	for (const component of components) {
		const splitBoundaries = new Set<string>();
		const outsideGlobals = new Set<string>();
		const contexts: ExactContextEffect[] = [];
		const contextSites: Array<Readonly<{ start: number; effect: ExactContextEffect }>> = [];
		const renders: ExpressionRenderSite[] = [];
		const clientIslands: ExpressionClientIslandSite[] = [];
		const diagnostics = new Set<string>();
		let clientIslandCount = 0;
		let clientEffects = false;
		let serverEffects = false;
		let indivisibleEffect: ExactEnvironmentEffect | undefined;
		const setupEffect = callableEffects?.byNodeId.get(component.node.id);
		if (setupEffect?.effect === 'browser') clientEffects = true;
		else if (setupEffect?.effect === 'server') serverEffects = true;
		else if (setupEffect?.effect === 'mixed') {
			indivisibleEffect = 'mixed';
			diagnostics.add(
				`error: component setup has indivisible browser and server effects (${setupEffect.effectSources[0]?.path.join(' → ') ?? 'mixed setup'})`
			);
		} else if (setupEffect?.effect === 'unknown') {
			const knownBrowser = setupEffect.effectSources.some(
				(source) => source.environment === 'browser'
			);
			const knownServer = setupEffect.effectSources.some(
				(source) => source.environment === 'server'
			);
			if (knownBrowser && knownServer) {
				indivisibleEffect = 'mixed';
				diagnostics.add(
					`error: component setup has indivisible browser and server effects (${setupEffect.effectSources[0]?.path.join(' → ') ?? 'mixed setup'})`
				);
			} else if (knownBrowser) clientEffects = true;
			else if (knownServer) serverEffects = true;
			else {
				indivisibleEffect = 'unknown';
				diagnostics.add(
					`error: component placement depends on an opaque call (${setupEffect.effectSources[0]?.path.join(' → ') ?? 'unknown setup'}); move it into an explicitly placed task or a split boundary`
				);
			}
		}

		for (const element of jsx.elements.values()) {
			const reference = jsxReferences.get(element.nodeId);
			if (!reference || nearestComponent(reference, componentNodes)?.node !== component.node)
				continue;
			for (const attribute of element.attributes) {
				if (!isClientIslandAttribute(attribute)) continue;
				clientEffects = true;
				splitBoundaries.add(attribute === 'ref' ? 'ref' : 'event-handler');
			}
			const isClientIsland = element.attributes.some(isClientIslandAttribute);
			if (isClientIsland) {
				const nestedInIsland = reference
					?.ancestors()
					.jsxElements()
					.any((ancestor) =>
						ancestor.node.attributes.some((attribute) =>
							isClientIslandAttribute(attribute.name ?? '')
						)
					);
				if (!nestedInIsland) {
					clientIslandCount++;
					const children = reference?.node.jsxChildren ?? [];
					const childRefs = children.map((child) => module.ref(child));
					const serverOnlyChildren = childRefs.some((child) =>
						child
							.walk()
							.references()
							.any(
								(candidate) =>
									!!candidate.variable?.importedFrom &&
									isServerOnlyModule(candidate.variable.importedFrom)
							)
					);
					const childTags = new Set<string>();
					for (const child of childRefs)
						for (const descendant of child.walk().jsxElements()) {
							if (descendant.node.tagName && !/^[a-z]/.test(descendant.node.tagName))
								childTags.add(descendant.node.tagName);
						}
					const captures = expressionIslandCaptures(module, component, reference);
					const stateReads = expressionIslandStateReads(
						module,
						reference,
						provenance,
						writes?.aliases ?? new Map()
					);
					clientIslands.push(
						Object.freeze({
							nodeId: reference?.node.id ?? element.nodeId,
							index: clientIslandCount,
							start: element.start,
							end: element.end,
							serverOnlyChildren,
							childTags: Object.freeze([...childTags]),
							valueCaptures: Object.freeze(captures.values),
							functionCaptures: Object.freeze(captures.functions),
							stateReads: Object.freeze(stateReads)
						})
					);
				}
			}
			if (!element.intrinsic && element.tagName) {
				const tagBinding = reference
					?.descendants()
					.references()
					.first(
						(candidate) =>
							candidate.name === element.tagName?.split('.')[0] &&
							candidate
								.ancestors()
								.any(
									(ancestor) =>
										ancestor.node.kind === 'JsxOpeningElement' ||
										ancestor.node.kind === 'JsxSelfClosingElement'
								)
					);
				const rootTag = element.tagName.split('.')[0]!;
				if (tagBinding?.variable?.typeOnly) {
					diagnostics.add(
						`error: JSX tag ${rootTag} resolves to a type-only import and cannot be rendered at runtime`
					);
				} else if (!tagBinding?.variable) {
					diagnostics.add(`error: JSX tag ${rootTag} is not defined as a runtime component`);
				} else if (
					!['ImportSpecifier', 'ImportClause', 'NamespaceImport', 'FunctionDeclaration'].includes(
						tagBinding.variable.declarationKind
					)
				) {
					diagnostics.add(
						`error: JSX tag ${rootTag} resolves to ${declarationDescription(tagBinding.variable.declarationKind)}, not a runtime component`
					);
				}
				const canReferenceComponent =
					!!tagBinding?.variable &&
					['ImportSpecifier', 'ImportClause', 'NamespaceImport', 'FunctionDeclaration'].includes(
						tagBinding.variable.declarationKind
					);
				if (
					reference &&
					canReferenceComponent &&
					!reference
						.ancestors()
						.functions()
						.any((fn) => fn.node !== component.node && fn.node.kind !== 'ArrowFunction')
				) {
					renders.push(
						Object.freeze({
							nodeId: reference.node.id,
							tag: element.tagName,
							start: element.start,
							end: element.end,
							path: nodePath(reference, component),
							serverSlotChildren: element.serverSlotChildren
						})
					);
				}
			}
		}

		for (const reference of component
			.descendants({ types: false })
			.where(
				(candidate) => candidate.node.kind === 'Identifier' || candidate.node.kind === 'ThisKeyword'
			)) {
			if (nearestComponent(reference, componentNodes)?.node !== component.node) continue;
			const variable = reference.variable;
			const name = variable?.name ?? reference.name;
			if (
				name &&
				browserPlatformGlobals.has(name) &&
				(!variable || !localVariables.has(variable))
			) {
				clientEffects = true;
				splitBoundaries.add(`browser:${name}`);
				if (!insideTask(reference) && !insideClientIsland(reference)) outsideGlobals.add(name);
			}
			if (variable?.importedFrom && isServerOnlyModule(variable.importedFrom)) {
				serverEffects = true;
				splitBoundaries.add(`server-import:${variable.name}`);
				if (insideClientIslandOpening(reference))
					diagnostics.add('error: client island cannot reference server-only imports');
			}
		}

		for (const task of tasks.sites.values()) {
			if (task.componentId !== component.node.id) continue;
			if (task.placement === 'client' || task.placement === 'isomorphic') clientEffects = true;
			if (task.placement === 'server' || task.placement === 'isomorphic') serverEffects = true;
		}

		for (const call of component.descendants({ types: false }).calls()) {
			if (nearestComponent(call, componentNodes)?.node !== component.node || insideTask(call))
				continue;
			if (!insideClientIsland(call)) {
				const transitive = callableEffects?.callEffects.get(call.node.id);
				if (transitive?.effect === 'browser') {
					clientEffects = true;
					splitBoundaries.add(`browser-call:${call.target?.node.text ?? 'call'}`);
				} else if (transitive?.effect === 'server') {
					serverEffects = true;
					splitBoundaries.add(`server-call:${call.target?.node.text ?? 'call'}`);
				} else if (transitive?.effect === 'mixed') {
					indivisibleEffect = 'mixed';
					diagnostics.add(
						`error: component call has indivisible browser and server effects (${transitive.sources[0]?.path.join(' → ') ?? 'mixed call'})`
					);
				} else if (transitive?.effect === 'unknown') {
					const knownBrowser = transitive.sources.some(
						(source) => source.environment === 'browser'
					);
					const knownServer = transitive.sources.some((source) => source.environment === 'server');
					if (knownBrowser && knownServer) {
						indivisibleEffect = 'mixed';
						diagnostics.add(
							`error: component call has indivisible browser and server effects (${transitive.sources[0]?.path.join(' → ') ?? 'mixed call'})`
						);
					} else if (knownBrowser) clientEffects = true;
					else if (knownServer) serverEffects = true;
					else {
						indivisibleEffect = indivisibleEffect === 'mixed' ? 'mixed' : 'unknown';
						diagnostics.add(
							`error: component placement depends on an opaque call (${transitive.sources[0]?.path.join(' → ') ?? 'unknown call'}); move it into an explicitly placed task or a split boundary`
						);
					}
				}
			}
			if (
				!call.target?.isMember() ||
				!/^this\.(?:getContext|setContext)$/.test(call.target.node.text ?? '')
			)
				continue;
			const token = call.arguments[0];
			const exact =
				token && /^(?:[A-Za-z_$][\w$]*)(?:\.[A-Za-z_$][\w$]*)*$/.test(token.node.text ?? '');
			const effect = Object.freeze({
				token: exact ? token!.node.text! : 'unknown',
				kind: call.target.name === 'getContext' ? 'read' : 'write',
				confidence: exact ? 'exact' : 'unknown'
			} satisfies ExactContextEffect);
			contexts.push(effect);
			contextSites.push(
				Object.freeze({ start: call.node.span?.start ?? spanStart(component), effect })
			);
		}

		const span = component.node.span!;
		siteEntries.push([
			component.node.id,
			Object.freeze({
				id: component.node.id,
				name: component.node.name!,
				start: span.start,
				end: span.end,
				clientEffects,
				serverEffects,
				environmentEffect:
					indivisibleEffect ?? (serverEffects ? 'server' : clientEffects ? 'browser' : 'neutral'),
				clientIslandCount,
				splitBoundaries: Object.freeze([...splitBoundaries].sort()),
				diagnostics: Object.freeze([...diagnostics].sort()),
				browserGlobalsOutsideClientBoundary: Object.freeze([...outsideGlobals].sort()),
				contexts: Object.freeze(uniqueContexts(contexts)),
				contextSites: Object.freeze(contextSites),
				renders: Object.freeze(renders),
				clientIslands: Object.freeze(clientIslands)
			})
		]);
	}
	const declarations = module
		.walk()
		.functions()
		.where((reference) => reference.node.kind === 'FunctionDeclaration' && !!reference.node.span)
		.toArray()
		.sort((left, right) => spanStart(left) - spanStart(right))
		.map((reference) =>
			Object.freeze({
				id: reference.node.id,
				...(reference.node.name === undefined ? {} : { name: reference.node.name }),
				...(componentIndex.isComponent(reference) ? { componentId: reference.node.id } : {})
			})
		);
	return Object.freeze({
		sites: componentSiteMap(siteEntries),
		declarations: Object.freeze(declarations)
	});
}
