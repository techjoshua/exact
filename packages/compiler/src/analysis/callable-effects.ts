import type { BoundModule, NodeRef, Variable } from '@exactjs/expressions';
import { hasExactDirective } from '../annotations.js';
import type { ExactModuleImportPlan } from '../assets.js';
import { expressionComponentIndex } from '../expression/component-index.js';
import { applyCallableReevaluationSafety } from '../expression/callable-reevaluation.js';
import { type ExpressionWritePlan } from '../expression/writes.js';
import { stableId } from '../ids.js';
import type {
	ExactCallableSummaryIR,
	ExactCompilerManifest,
	ExactEnvironmentEffect,
	ExactEnvironmentEffectSourceIR,
	ExactSemanticGraphIR
} from '../types.js';

/** Describes the planned callable effect operation. */
export interface CallableEffectPlan {
	readonly callables: readonly ExactCallableSummaryIR[];
	readonly byNodeId: ReadonlyMap<string, ExactCallableSummaryIR>;
	readonly callEffects: ReadonlyMap<
		string,
		Readonly<{
			effect: ExactEnvironmentEffect;
			sources: readonly ExactEnvironmentEffectSourceIR[];
			reevaluationSafe: boolean;
		}>
	>;
}

import {
	callableName,
	clientBoundaryFunction,
	declarationVariable,
	exportedNamesByVariable,
	nearestFunction,
	taskOwner
} from './call-resolution.js';
import { resolveCallableEffects } from './callable-propagation.js';
import { isFunctionNode } from './callable-state-effects.js';
import type { CallableAnalysisState, MutableCallable } from './callable-state.js';
import { collectDirectCallableEffects } from './direct-callable-effects.js';
import { externalCallableIndex, externalKey, prepend, source } from './effect-sources.js';

/** Builds deterministic declaration summaries and resolves their transitive environment effects. */
export function analyzeCallableEffects(
	module: BoundModule,
	graph: ExactSemanticGraphIR,
	importedManifests: readonly ExactCompilerManifest[] = [],
	writePlan?: ExpressionWritePlan,
	moduleImports?: ExactModuleImportPlan,
	knownCallEffects: ReadonlyMap<string, 'server' | 'client' | 'isomorphic'> = new Map()
): CallableEffectPlan {
	const state = createCallableAnalysisState(
		module,
		graph,
		importedManifests,
		writePlan,
		moduleImports,
		knownCallEffects
	);
	collectDirectCallableEffects(state);
	applyCallableReevaluationSafety(state);
	return resolveCallableEffects(state);
}

function createCallableAnalysisState(
	module: BoundModule,
	graph: ExactSemanticGraphIR,
	importedManifests: readonly ExactCompilerManifest[],
	writePlan: ExpressionWritePlan | undefined,
	moduleImports: ExactModuleImportPlan | undefined,
	knownCallEffects: ReadonlyMap<string, 'server' | 'client' | 'isomorphic'>
): CallableAnalysisState {
	const componentIndex = expressionComponentIndex(module);
	const stateAliases = writePlan?.aliases ?? new Map<string, readonly string[]>();
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
	const importedNames = new Map(
		graph.declarations
			.filter((declaration) => declaration.kind === 'import')
			.map((declaration) => [declaration.id, declaration.importedName ?? declaration.name])
	);
	const exportedNames = exportedNamesByVariable(module, graph);
	const functions = module
		.walk()
		.functions()
		.where((reference) => !!reference.node.span)
		.toArray();
	const callableByVariable = new Map<string, MutableCallable>();
	const initializerByVariable = new Map<string, MutableCallable>();
	const callableByNode = new Map<string, MutableCallable>();
	const callNodeIds = new Map<string, string>();
	const mutable: MutableCallable[] = [];

	for (const fn of functions) {
		const task = taskOwner(fn);
		const component = componentIndex.isComponent(fn);
		const variable = declarationVariable(fn);
		const name = task
			? `${componentIndex.owner(fn)?.node.name ?? 'component'}.task@${fn.node.span!.start}`
			: callableName(fn, variable);
		const declaredEnvironment = hasExactDirective(fn.node.directives, 'client')
			? ('browser' as const)
			: hasExactDirective(fn.node.directives, 'server')
				? ('server' as const)
				: undefined;
		const summary: MutableCallable = {
			id: stableId(module.filename, 'callable', fn.node.id),
			nodeId: fn.node.id,
			name,
			kind: task
				? 'task'
				: component
					? 'component'
					: fn.node.kind === 'MethodDeclaration'
						? 'method'
						: 'function',
			exportNames: variable ? [...(exportedNames.get(variable.id) ?? [])] : [],
			directSources: declaredEnvironment
				? [
						source(
							declaredEnvironment,
							`exact ${declaredEnvironment === 'browser' ? 'client' : 'server'} callable`,
							name
						)
					]
				: [],
			sources: declaredEnvironment
				? [
						source(
							declaredEnvironment,
							`exact ${declaredEnvironment === 'browser' ? 'client' : 'server'} callable`,
							name
						)
					]
				: [],
			calls: [],
			directWrites: [],
			writes: [],
			directReads: [],
			reads: [],
			directContexts: [],
			contexts: [],
			seedTargets: clientBoundaryFunction(fn) ? ['client'] : [],
			executable: false,
			parameters: ((fn.node as { parameters?: readonly Variable[] }).parameters ?? []).filter(
				(parameter) => parameter.name !== 'this'
			),
			reevaluationSafe: false
		};
		mutable.push(summary);
		callableByNode.set(fn.node.id, summary);
		if (variable) callableByVariable.set(variable.id, summary);
	}

	const initializers = new Map<string, NodeRef>();
	for (const declaration of module.walk().ofKind('VariableDeclaration')) {
		const variable = declaration.children().first()?.variable;
		const initializer = declaration.children().toArray().at(-1);
		if (
			!variable ||
			variable.scope.kind !== 'module' ||
			!initializer ||
			initializer.node === declaration.children().first()?.node ||
			isFunctionNode(initializer)
		)
			continue;
		const summary: MutableCallable = {
			id: stableId(module.filename, 'initializer', declaration.node.id),
			nodeId: initializer.node.id,
			name: `${variable.name}.initializer`,
			kind: 'initializer',
			exportNames: [...(exportedNames.get(variable.id) ?? [])],
			directSources: [],
			sources: [],
			calls: [],
			directWrites: [],
			writes: [],
			directReads: [],
			reads: [],
			directContexts: [],
			contexts: [],
			seedTargets: [],
			executable: false,
			parameters: [],
			reevaluationSafe: false
		};
		mutable.push(summary);
		callableByNode.set(initializer.node.id, summary);
		initializerByVariable.set(variable.id, summary);
		initializers.set(summary.id, initializer);
	}

	for (const statement of module
		.walk()
		.where(
			(reference) =>
				(reference.node.kind === 'ExpressionStatement' ||
					(reference.node.kind === 'ImportDeclaration' &&
						/^\s*import\s*["']/.test(reference.node.text ?? ''))) &&
				reference.parent?.node.kind === 'SourceFile'
		)) {
		const summary: MutableCallable = {
			id: stableId(module.filename, 'module-initializer', statement.node.id),
			nodeId: statement.node.id,
			name: `<module initializer@${statement.node.span?.start ?? 0}>`,
			kind: 'module-initializer',
			exportNames: [],
			directSources: [],
			sources: [],
			calls: [],
			directWrites: [],
			writes: [],
			directReads: [],
			reads: [],
			directContexts: [],
			contexts: [],
			seedTargets: [],
			executable: true,
			parameters: [],
			reevaluationSafe: false
		};
		mutable.push(summary);
		callableByNode.set(statement.node.id, summary);
		initializers.set(summary.id, statement);
	}

	const external = externalCallableIndex(module.filename, importedManifests);
	for (const exported of graph.exports) {
		if (!exported.moduleSpecifier || !exported.importedName || exported.typeOnly) continue;
		const target = external.get(externalKey(exported.moduleSpecifier, exported.importedName));
		if (!target) continue;
		const summary: MutableCallable = {
			id: stableId(
				module.filename,
				're-export',
				exported.exportedName,
				exported.moduleSpecifier,
				exported.importedName
			),
			nodeId: stableId(module.filename, 're-export-node', exported.exportedName),
			name: exported.exportedName,
			kind: target.kind,
			exportNames: [exported.exportedName],
			directSources: target.effectSources.map((effectSource) =>
				prepend(effectSource, exported.exportedName)
			),
			sources: target.effectSources.map((effectSource) =>
				prepend(effectSource, exported.exportedName)
			),
			calls: [
				{
					id: stableId(
						module.filename,
						're-export-edge',
						exported.exportedName,
						exported.moduleSpecifier
					),
					name: exported.importedName,
					moduleSpecifier: exported.moduleSpecifier,
					exportName: exported.importedName,
					resolved: true
				}
			],
			directWrites: [...target.stateWrites],
			writes: [...target.stateWrites],
			directReads: [...target.stateReads],
			reads: [...target.stateReads],
			directContexts: [...target.contexts],
			contexts: [...target.contexts],
			seedTargets: [],
			executable: false,
			parameters: [],
			reevaluationSafe: target.reevaluationSafe === true
		};
		mutable.push(summary);
	}
	for (const fn of functions) {
		const owner = nearestFunction(fn);
		if (!owner || fn.parent?.node.kind !== 'ReturnStatement') continue;
		const ownerSummary = callableByNode.get(owner.node.id);
		const returnedSummary = callableByNode.get(fn.node.id);
		if (!ownerSummary || !returnedSummary) continue;
		ownerSummary.calls.push({
			id: stableId(module.filename, ownerSummary.id, 'returned', fn.node.id),
			name: `${returnedSummary.name}:returned`,
			targetId: returnedSummary.id,
			resolved: true
		});
	}
	const referencesById = new Map(
		module
			.walk()
			.toArray()
			.map((reference) => [reference.node.id, reference])
	);
	for (const site of writePlan?.sites.values() ?? []) {
		const reference = referencesById.get(site.nodeId);
		const owner = reference ? nearestFunction(reference) : undefined;
		const summary = owner ? callableByNode.get(owner.node.id) : undefined;
		if (!summary) continue;
		summary.directWrites.push({
			path: site.path.join('.'),
			kind: 'write',
			confidence: site.operation === 'array-mutation' ? 'broad' : 'exact'
		});
	}

	return {
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
	};
}
