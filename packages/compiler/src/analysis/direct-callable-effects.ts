import type { NodeRef } from '@exact/expressions';
import { trackedCallbackArguments } from '../annotations.js';
import { expressionStatePath } from '../expression/writes.js';
import { stableId } from '../ids.js';
import { isServerOnlyModule } from '../imports.js';
import { isUnshadowedPlatformGlobal } from '../platform-effects.js';
import type { ExactCallEdgeIR } from '../types.js';

import {
	callVariable,
	localCallTarget,
	nearestFunction,
	unresolvedCallEffect
} from './call-resolution.js';
import {
	isCompilerOwnedCollectionCall,
	isFunctionNode,
	isStateWrite,
	knownHigherOrderCall,
	mapStateEffects,
	parameterStateEffect,
	receiverBindingField,
	uniqueContextEffects,
	uniqueStateEffects
} from './callable-state-effects.js';
import type { CallableAnalysisState } from './callable-state.js';
import {
	externalKey,
	externalModuleInitializers,
	prepend,
	source,
	uniqueSources
} from './effect-sources.js';

export function collectDirectCallableEffects(state: CallableAnalysisState): void {
	const {
		module,
		stateAliases,
		localVariables,
		importedNames,
		functions,
		callableByVariable,
		initializerByVariable,
		callableByNode,
		callNodeIds,
		mutable,
		initializers,
		external,
		importedManifests,
		moduleImports,
		knownCallEffects,
		writePlan
	} = state;
	for (const summary of mutable) summary.writes = uniqueStateEffects(summary.directWrites);
	for (const fn of functions) {
		const summary = callableByNode.get(fn.node.id)!;
		for (const reference of fn
			.descendants({ types: false })
			.where(
				(candidate) => candidate.node.kind === 'Identifier' || candidate.node.kind === 'ThisKeyword'
			)) {
			if (nearestFunction(reference)?.node !== fn.node) continue;
			const variable = reference.variable;
			const name = variable?.name ?? reference.name;
			const platform = isUnshadowedPlatformGlobal(name, variable, localVariables);
			if (platform) summary.directSources.push(source(platform, name!, summary.name));
			const explicitImportPlacement = variable?.importedFrom
				? moduleImports?.placementBySpecifier.get(variable.importedFrom)
				: undefined;
			if (explicitImportPlacement)
				summary.directSources.push(
					source(
						explicitImportPlacement === 'client' ? 'browser' : 'server',
						`exact ${explicitImportPlacement} import ${variable!.importedFrom}`,
						summary.name
					)
				);
			if (variable?.importedFrom && isServerOnlyModule(variable.importedFrom)) {
				summary.directSources.push(
					source('server', `${variable.importedFrom}:${variable.name}`, summary.name)
				);
			}
			const initializer = variable ? initializerByVariable.get(variable.id) : undefined;
			if (initializer)
				summary.calls.push({
					id: stableId(module.filename, summary.id, 'dependency', reference.node.id),
					name: variable!.name,
					targetId: initializer.id,
					resolved: true
				});
		}
		for (const call of fn.descendants({ types: false }).calls()) {
			if (nearestFunction(call)?.node !== fn.node) continue;
			const variable = callVariable(call);
			const local = localCallTarget(
				call,
				callableByVariable,
				initializerByVariable,
				callableByNode
			);
			const knownCallEffect = knownCallEffects.get(call.node.id);
			const boundImportedName = variable
				? (importedNames.get(variable.id) ?? variable.name)
				: undefined;
			const importedName =
				boundImportedName === '*' && call.target?.isMember() ? call.target.name : boundImportedName;
			const resolvedExternal = variable?.importedFrom
				? external.get(externalKey(variable.importedFrom, importedName ?? variable.name))
				: undefined;
			const edge: ExactCallEdgeIR = {
				id: stableId(module.filename, summary.id, 'call', call.node.id),
				name: call.target?.node.text?.trim() ?? call.node.text?.trim() ?? 'call',
				...(local ? { targetId: local.id } : {}),
				...(variable?.importedFrom
					? { moduleSpecifier: variable.importedFrom, exportName: importedName }
					: {}),
				resolved: !!local || !!resolvedExternal || !!knownCallEffect,
				...receiverBindingField(call, summary, local, resolvedExternal)
			};
			summary.calls.push(edge);
			callNodeIds.set(edge.id, call.node.id);
			if (resolvedExternal) {
				for (const effectSource of resolvedExternal.effectSources)
					summary.directSources.push(prepend(effectSource, summary.name));
				summary.directReads.push(...mapStateEffects(resolvedExternal.stateReads, edge));
				summary.directWrites.push(...mapStateEffects(resolvedExternal.stateWrites, edge));
				summary.directContexts.push(...resolvedExternal.contexts);
			} else if (!local && knownCallEffect) {
				if (knownCallEffect !== 'isomorphic') {
					summary.directSources.push(
						source(
							knownCallEffect === 'client' ? 'browser' : 'server',
							`${knownCallEffect} context call`,
							summary.name
						)
					);
				}
			} else if (!local) {
				const placed = variable?.importedFrom
					? moduleImports?.placementBySpecifier.get(variable.importedFrom)
					: undefined;
				const unresolved = placed
					? placed === 'client'
						? 'browser'
						: 'server'
					: isCompilerOwnedCollectionCall(module, call, stateAliases)
						? undefined
						: unresolvedCallEffect(call, localVariables);
				if (unresolved)
					summary.directSources.push(
						source(unresolved, call.target?.node.text?.trim() ?? 'dynamic call', summary.name)
					);
			}
			const callbacks = new Set<NodeRef>(trackedCallbackArguments(call));
			if (knownHigherOrderCall(call))
				for (const argument of call.arguments)
					if (isFunctionNode(argument)) callbacks.add(argument);
			for (const callback of callbacks) {
				const target = callableByNode.get(callback.node.id);
				if (!target) continue;
				const callbackEdge: ExactCallEdgeIR = {
					id: stableId(module.filename, summary.id, 'callback', call.node.id, callback.node.id),
					name: `${edge.name}:callback`,
					targetId: target.id,
					resolved: true
				};
				summary.calls.push(callbackEdge);
				callNodeIds.set(callbackEdge.id, call.node.id);
			}
			if (
				call.target?.isMember() &&
				/^this\.(?:getContext|setContext)$/.test(call.target.node.text ?? '')
			) {
				const token = call.arguments[0];
				const exact =
					token && /^(?:[A-Za-z_$][\w$]*)(?:\.[A-Za-z_$][\w$]*)*$/.test(token.node.text ?? '');
				summary.directContexts.push({
					token: exact ? token!.node.text! : 'unknown',
					kind: call.target.name === 'getContext' ? 'read' : 'write',
					confidence: exact ? 'exact' : 'unknown'
				});
			}
		}
		for (const member of fn.descendants({ types: false }).memberAccesses()) {
			if (nearestFunction(member)?.node !== fn.node) continue;
			const statePath = expressionStatePath(module, member.node, writePlan?.aliases ?? new Map());
			const memberSpan = member.node.span;
			const assignmentTarget =
				statePath?.length &&
				memberSpan &&
				[...(writePlan?.sites.values() ?? [])].some(
					(site) =>
						site.operation === 'assignment' &&
						site.path.join('.') === statePath.join('.') &&
						site.start <= memberSpan.start &&
						site.end >= memberSpan.end
				);
			if (statePath?.length && !assignmentTarget)
				summary.directReads.push({ path: statePath.join('.'), kind: 'read', confidence: 'exact' });
			const parameterState = parameterStateEffect(member, summary.parameters);
			if (parameterState) {
				if (isStateWrite(member)) summary.directWrites.push({ ...parameterState, kind: 'write' });
				else summary.directReads.push({ ...parameterState, kind: 'read' });
			}
		}
		summary.directSources = uniqueSources(summary.directSources);
		summary.sources = [...summary.directSources];
		summary.reads = uniqueStateEffects(summary.directReads);
		summary.contexts = uniqueContextEffects(summary.directContexts);
	}

	for (const [summaryId, initializer] of initializers) {
		const summary = mutable.find((candidate) => candidate.id === summaryId)!;
		if (summary.kind === 'module-initializer' && initializer.node.kind === 'ImportDeclaration') {
			const moduleSpecifier = initializer.node.text?.match(/^\s*import\s*["']([^"']+)["']/)?.[1];
			const explicitPlacement = moduleSpecifier
				? moduleImports?.placementBySpecifier.get(moduleSpecifier)
				: undefined;
			if (explicitPlacement) {
				summary.directSources.push(
					source(
						explicitPlacement === 'client' ? 'browser' : 'server',
						`exact ${explicitPlacement} import ${moduleSpecifier}`,
						summary.name
					)
				);
			} else {
				const importedInitializers = moduleSpecifier
					? externalModuleInitializers(module.filename, moduleSpecifier, importedManifests)
					: [];
				if (!importedInitializers.length)
					summary.directSources.push(
						source('unknown', `side-effect import ${moduleSpecifier ?? '<unknown>'}`, summary.name)
					);
				for (const imported of importedInitializers) {
					summary.directSources.push(
						...imported.effectSources.map((effectSource) => prepend(effectSource, summary.name))
					);
					summary.directReads.push(...imported.stateReads);
					summary.directWrites.push(...imported.stateWrites);
					summary.directContexts.push(...imported.contexts);
					summary.calls.push({
						id: stableId(
							module.filename,
							summary.id,
							'side-effect-import',
							moduleSpecifier!,
							imported.id
						),
						name: moduleSpecifier!,
						moduleSpecifier,
						resolved: true
					});
				}
			}
		}
		for (const reference of initializer
			.walk({ types: false })
			.where(
				(candidate) => candidate.node.kind === 'Identifier' || candidate.node.kind === 'ThisKeyword'
			)) {
			if (nearestFunction(reference)) continue;
			const variable = reference.variable;
			const name = variable?.name ?? reference.name;
			const platform = isUnshadowedPlatformGlobal(name, variable, localVariables);
			if (platform) summary.directSources.push(source(platform, name!, summary.name));
			const explicitImportPlacement = variable?.importedFrom
				? moduleImports?.placementBySpecifier.get(variable.importedFrom)
				: undefined;
			if (explicitImportPlacement)
				summary.directSources.push(
					source(
						explicitImportPlacement === 'client' ? 'browser' : 'server',
						`exact ${explicitImportPlacement} import ${variable!.importedFrom}`,
						summary.name
					)
				);
			if (variable?.importedFrom && isServerOnlyModule(variable.importedFrom))
				summary.directSources.push(
					source('server', `${variable.importedFrom}:${variable.name}`, summary.name)
				);
			const dependency = variable ? initializerByVariable.get(variable.id) : undefined;
			if (dependency && dependency !== summary)
				summary.calls.push({
					id: stableId(module.filename, summary.id, 'dependency', reference.node.id),
					name: variable!.name,
					targetId: dependency.id,
					resolved: true
				});
			const callableDependency = variable ? callableByVariable.get(variable.id) : undefined;
			if (callableDependency && callableDependency !== summary)
				summary.calls.push({
					id: stableId(module.filename, summary.id, 'callable-dependency', reference.node.id),
					name: variable!.name,
					targetId: callableDependency.id,
					resolved: true
				});
		}
		for (const call of initializer.walk({ types: false }).calls()) {
			if (nearestFunction(call)) continue;
			const variable = callVariable(call);
			const local = localCallTarget(
				call,
				callableByVariable,
				initializerByVariable,
				callableByNode
			);
			const knownCallEffect = knownCallEffects.get(call.node.id);
			const boundImportedName = variable
				? (importedNames.get(variable.id) ?? variable.name)
				: undefined;
			const importedName =
				boundImportedName === '*' && call.target?.isMember() ? call.target.name : boundImportedName;
			const resolvedExternal = variable?.importedFrom
				? external.get(externalKey(variable.importedFrom, importedName ?? variable.name))
				: undefined;
			const edge: ExactCallEdgeIR = {
				id: stableId(module.filename, summary.id, 'call', call.node.id),
				name: call.target?.node.text?.trim() ?? call.node.text?.trim() ?? 'call',
				...(local ? { targetId: local.id } : {}),
				...(variable?.importedFrom
					? { moduleSpecifier: variable.importedFrom, exportName: importedName }
					: {}),
				resolved: !!local || !!resolvedExternal || !!knownCallEffect,
				...receiverBindingField(call, summary, local, resolvedExternal)
			};
			summary.calls.push(edge);
			callNodeIds.set(edge.id, call.node.id);
			if (resolvedExternal) {
				for (const effectSource of resolvedExternal.effectSources)
					summary.directSources.push(prepend(effectSource, summary.name));
				summary.directReads.push(...mapStateEffects(resolvedExternal.stateReads, edge));
				summary.directWrites.push(...mapStateEffects(resolvedExternal.stateWrites, edge));
				summary.directContexts.push(...resolvedExternal.contexts);
			} else if (!local && knownCallEffect) {
				if (knownCallEffect !== 'isomorphic') {
					summary.directSources.push(
						source(
							knownCallEffect === 'client' ? 'browser' : 'server',
							`${knownCallEffect} context call`,
							summary.name
						)
					);
				}
			} else if (!local) {
				const placed = variable?.importedFrom
					? moduleImports?.placementBySpecifier.get(variable.importedFrom)
					: undefined;
				const unresolved = placed
					? placed === 'client'
						? 'browser'
						: 'server'
					: isCompilerOwnedCollectionCall(module, call, stateAliases)
						? undefined
						: unresolvedCallEffect(call, localVariables);
				if (unresolved)
					summary.directSources.push(
						source(unresolved, call.target?.node.text?.trim() ?? 'dynamic call', summary.name)
					);
			}
		}
		summary.directSources = uniqueSources(summary.directSources);
		summary.sources = [...summary.directSources];
		summary.reads = uniqueStateEffects(summary.directReads);
		summary.writes = uniqueStateEffects(summary.directWrites);
		summary.contexts = uniqueContextEffects(summary.directContexts);
	}
}
