import ts from 'typescript';
import { analyzeCallableEffects } from '../analysis/callable-effects.js';
import { analyzeExactAnnotations } from '../annotations.js';
import { analyzeModuleImports } from '../assets.js';
import { collectRawHtmlCapabilities } from '../capabilities.js';
import { preprocessComponentComputations } from '../component-computation/preprocess.js';
import { createExactComponentResumptions, createExactContinuations } from '../continuations.js';
import { collectExpressionExportBindings } from '../exports.js';
import { analyzeExpressionComponents } from '../expression/analysis.js';
import {
	createExpressionComponentBoundaries,
	createExpressionGeneratedServerSlotBoundaries,
	createExpressionRenderEdges
} from '../expression/boundaries.js';
import { analyzeExpressionJsx } from '../expression/jsx.js';
import { createExpressionComponents } from '../expression/manifest.js';
import { analyzeExpressionSafety } from '../expression/safety.js';
import { analyzeExpressionTasks } from '../expression/task-analysis.js';
import { analyzeExpressionWrites } from '../expression/writes.js';
import { collectExpressionImportedComponents } from '../imports.js';
import { combinePlacements } from '../placement.js';
import { applyCompilerPlugins } from '../plugins.js';
import {
	analyzeExactPolicyMetadata,
	applyExactPolicyToCallables,
	applyExactPolicyToTasks,
	createExactPolicyManifest
} from '../policy/analysis.js';
import { preprocessPropPunning } from '../preprocess.js';
import { buildExactProvenance } from '../provenance.js';
import { buildExpressionSemanticGraph } from '../semantic.js';
import {
	createClientIslandBoundaries,
	createClientIslandSymbols,
	createRootSymbols,
	createServerPartSymbols,
	createValueRootSymbols
} from '../symbols.js';
import type {
	ExactBoundaryIR,
	ExactCompilerManifest,
	ExactComponentIR,
	ExactExportIR,
	ExactImportedComponentIR,
	ExactSymbolIR,
	TransformOptions
} from '../types.js';
import { exactCompilerManifestVersion } from '../versions.js';

import {
	assertUniqueIds,
	effectDiagnosticPath,
	importedSecretRequirementDiagnostics,
	portableSemanticGraph,
	rawHtmlCapabilityDiagnostics,
	sessionExpressionModule,
	validatedImportedManifests
} from './analysis-results.js';
import { capabilityCompilationOptions } from './capability-options.js';

export { analyzeSemanticGraph } from './analysis-results.js';

/** Analyzes source into the compiler manifest without emitting transformed code. */
export function analyzeSource(
	source: string,
	options: TransformOptions = {}
): ExactCompilerManifest {
	const filename = options.filename ?? 'input.tsx';
	const normalized = preprocessComponentComputations(preprocessPropPunning(source), filename);
	return analyzeNormalizedSource(normalized, { ...options, filename });
}

/**
 * Analyzes source that has already passed through eXact's syntax normalization.
 *
 * This internal compilation entry prevents transform workflows from parsing and normalizing the
 * same source twice. Callers outside the compilation pipeline should use {@link analyzeSource}.
 */
export function analyzeNormalizedSource(
	normalized: string,
	options: TransformOptions
): ExactCompilerManifest {
	const policyOptions = { ...options, ...capabilityCompilationOptions(options) };
	const filename = options.filename ?? 'input.tsx';
	const sourceFile = ts.createSourceFile(
		filename,
		normalized,
		ts.ScriptTarget.ES2022,
		true,
		ts.ScriptKind.TSX
	);
	const importedManifests = validatedImportedManifests(
		options.importedManifests,
		options.pluginRegistry
	);
	const expressionModule = sessionExpressionModule(options.session, filename, normalized, {
		root: options.root,
		diagnostics: options.generatedValidation === 'semantic' ? 'full' : 'syntax'
	});
	const exports: ExactExportIR[] = [];
	const symbols: ExactSymbolIR[] = [];
	const boundaries: ExactBoundaryIR[] = [];
	const manifestDiagnostics: string[] = [];
	const serverActions: ExactCompilerManifest['serverActions'] = {};
	const semanticGraph = buildExpressionSemanticGraph(expressionModule);
	const expressionWrites = analyzeExpressionWrites(expressionModule);
	const moduleImports = analyzeModuleImports(normalized, filename, options.assetRules);
	const policyMetadata = analyzeExactPolicyMetadata(expressionModule, importedManifests);
	const rawCallableEffects = analyzeCallableEffects(
		expressionModule,
		semanticGraph,
		importedManifests,
		expressionWrites,
		moduleImports,
		policyMetadata.contextCallEffects
	);
	const provenance = buildExactProvenance(expressionModule, rawCallableEffects.callEffects);
	const expressionSafety = analyzeExpressionSafety(expressionModule, provenance);
	const rawHtmlRequirements = collectRawHtmlCapabilities(
		sourceFile,
		filename,
		options.target ?? 'default'
	);
	manifestDiagnostics.push(...moduleImports.diagnostics);
	manifestDiagnostics.push(
		...rawHtmlCapabilityDiagnostics(rawHtmlRequirements, importedManifests, policyOptions)
	);
	for (const initializer of rawCallableEffects.callables.filter(
		(callable) => callable.kind === 'module-initializer'
	)) {
		if (initializer.effect === 'mixed')
			manifestDiagnostics.push(
				`error: executable module initializer has indivisible browser and server effects (${effectDiagnosticPath(initializer, 'mixed')})`
			);
		if (initializer.effect === 'unknown')
			manifestDiagnostics.push(
				`error: executable module initializer depends on an opaque call or side-effect import (${effectDiagnosticPath(initializer, 'unknown')})`
			);
	}
	const callablePolicyResult = applyExactPolicyToCallables(policyMetadata, rawCallableEffects);
	const callableEffects = callablePolicyResult.callables;
	manifestDiagnostics.push(...callablePolicyResult.diagnostics);
	const expressionTasks = applyExactPolicyToTasks(
		policyMetadata,
		analyzeExpressionTasks(expressionModule, callableEffects, provenance)
	).tasks;
	manifestDiagnostics.push(...expressionTasks.diagnostics);
	manifestDiagnostics.push(
		...analyzeExactAnnotations(expressionModule).diagnostics.map((diagnostic) => diagnostic.message)
	);
	const expressionJsx = analyzeExpressionJsx(expressionModule, provenance, filename);
	manifestDiagnostics.push(...expressionJsx.diagnostics.map((diagnostic) => diagnostic.message));
	const expressionComponents = analyzeExpressionComponents(
		expressionModule,
		expressionJsx,
		expressionTasks,
		provenance,
		expressionWrites,
		callableEffects
	);
	const components: ExactComponentIR[] = createExpressionComponents(
		filename,
		expressionComponents,
		expressionTasks,
		expressionSafety
	);

	const componentByName = new Map(components.map((component) => [component.name, component]));
	const importedComponents = collectExpressionImportedComponents(
		filename,
		importedManifests,
		semanticGraph
	);
	const componentInfo = new Map<string, ExactImportedComponentIR>();
	for (const component of importedComponents) componentInfo.set(component.name, component);
	for (const component of components) {
		componentInfo.set(component.name, {
			name: component.name,
			boundaryName: component.name,
			placement: component.placement,
			componentId: component.id
		});
	}
	for (const component of components) {
		const expressionComponent = expressionComponents.sites.get(component.name);
		component.renderEdges = createExpressionRenderEdges(
			filename,
			component.name,
			expressionComponent?.renders ?? [],
			componentInfo
		);
		component.subgraphPlacement = combinePlacements([
			component.placement,
			...component.renderEdges.map((edge) => edge.placement)
		]);
	}
	const exportBindings = collectExpressionExportBindings(semanticGraph);
	const exportedLocals = new Set([...exportBindings.values()].map((binding) => binding.localName));
	for (const component of components) {
		component.exported = exportedLocals.has(component.name);
	}
	for (const binding of [...exportBindings.values()].sort((left, right) =>
		left.exportedName.localeCompare(right.exportedName)
	)) {
		const component = componentByName.get(binding.localName);
		const callable = callableEffects.callables.find((candidate) =>
			candidate.exportNames.includes(binding.exportedName)
		);
		const dataPolicy = policyMetadata.namedDeclarationPolicies.get(binding.localName)?.policy;
		exports.push({
			name: binding.exportedName,
			kind: component ? 'component' : 'value',
			placement:
				component?.placement ??
				(dataPolicy?.residency === 'client'
					? 'client'
					: dataPolicy?.residency === 'server'
						? 'server'
						: callable?.effect === 'browser' ||
							  (callable?.artifactTargets.length === 1 && callable.artifactTargets[0] === 'client')
							? 'client'
							: callable?.effect === 'server' ||
								  (callable?.artifactTargets.length === 1 &&
										callable.artifactTargets[0] === 'server')
								? 'server'
								: callable?.effect === 'neutral'
									? 'isomorphic'
									: 'unknown')
		});
	}
	symbols.push(...createRootSymbols(filename, components, [...exportBindings.values()]));
	const componentExportNames = new Set(
		exports.filter((exported) => exported.kind === 'component').map((exported) => exported.name)
	);
	symbols.push(
		...createValueRootSymbols(
			filename,
			callableEffects.callables.map((callable) => ({
				...callable,
				exportNames: callable.exportNames.filter((name) => !componentExportNames.has(name))
			}))
		)
	);
	symbols.push(...createServerPartSymbols(filename, components));
	symbols.push(...createClientIslandSymbols(filename, components));
	boundaries.push(...createClientIslandBoundaries(filename, components));
	boundaries.push(
		...createExpressionGeneratedServerSlotBoundaries(
			filename,
			components,
			expressionComponents,
			componentInfo
		)
	);
	boundaries.push(
		...createExpressionComponentBoundaries(
			filename,
			components,
			expressionComponents,
			componentInfo
		)
	);
	const continuations = createExactContinuations(
		components,
		boundaries,
		(token) => policyMetadata.contextPolicies.get(token)?.policy.residency ?? 'server'
	);
	const resumptions = createExactComponentResumptions(
		components,
		boundaries,
		expressionComponents,
		(token) => policyMetadata.contextPolicies.get(token)?.policy.residency ?? 'server'
	);

	for (const continuation of continuations) {
		if (serverActions[continuation.id]) {
			throw new Error(`Duplicate eXact server action id generated: ${continuation.id}`);
		}
		serverActions[continuation.id] = {
			id: continuation.id,
			componentId: continuation.componentId,
			taskId: continuation.taskId,
			placement: continuation.placement,
			stateContract: {
				reads: continuation.activation.stateReads,
				writes: continuation.effects.stateWrites
			},
			serverContextContract: [...continuation.activation.serverContexts],
			publicContextContract: continuation.activation.publicContexts
		};
	}
	for (const component of components) {
		manifestDiagnostics.push(...component.diagnostics);
	}
	const policyResult = createExactPolicyManifest(
		filename,
		policyMetadata,
		components,
		expressionComponents,
		expressionTasks,
		expressionModule,
		policyOptions
	);
	manifestDiagnostics.push(...policyResult.diagnostics);
	manifestDiagnostics.push(
		...importedSecretRequirementDiagnostics(importedManifests, policyOptions)
	);

	assertUniqueIds(
		'component',
		components.map((component) => component.id)
	);
	assertUniqueIds(
		'symbol',
		symbols.map((symbol) => symbol.id)
	);
	assertUniqueIds(
		'boundary',
		boundaries.map((boundary) => boundary.id)
	);
	assertUniqueIds(
		'callable',
		callableEffects.callables.map((callable) => callable.id)
	);
	const pluginContributions = applyCompilerPlugins(
		normalized,
		filename,
		options.target ?? 'default',
		options.pluginRegistry
	);

	return {
		version: exactCompilerManifestVersion,
		filename,
		dependencies: [],
		assets: [...moduleImports.assets],
		semanticGraph: portableSemanticGraph(semanticGraph, expressionModule.filename, filename),
		components,
		exports,
		symbols,
		boundaries,
		callables: [...callableEffects.callables],
		continuations,
		resumptions,
		policy: policyResult.policy,
		...(options.packageName ? { packageName: options.packageName } : {}),
		...(rawHtmlRequirements.length
			? { requiredCapabilities: { rawHtml: rawHtmlRequirements } }
			: {}),
		serverActions,
		...(pluginContributions.pluginRegistry
			? { pluginRegistry: pluginContributions.pluginRegistry }
			: {}),
		...(pluginContributions.pluginData && Object.keys(pluginContributions.pluginData).length
			? { pluginData: pluginContributions.pluginData }
			: {}),
		diagnostics: [...manifestDiagnostics, ...pluginContributions.diagnostics]
	};
}
