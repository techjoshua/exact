import { rewriteModuleReferences } from '@exactjs/expressions';
import path from 'node:path';
import ts from 'typescript';
import { analyzeCallableEffects } from '../analysis/callable-effects.js';
import { analyzeExactAnnotations } from '../annotations.js';
import { analyzeModuleImports } from '../assets.js';
import { exactComponentDescriptorTransformer } from '../descriptor-transform.js';
import { analyzeExpressionComponents } from '../expression/analysis.js';
import { analyzeExpressionDerived } from '../expression/derived.js';
import { analyzeExpressionJsx } from '../expression/jsx.js';
import { analyzeExpressionTasks } from '../expression/task-analysis.js';
import { analyzeExpressionWrites } from '../expression/writes.js';
import { collectExpressionImportedComponents } from '../imports.js';
import {
	analyzeExactPolicyMetadata,
	applyExactPolicyToCallables,
	applyExactPolicyToTasks,
	createExactSecretQualificationPlan
} from '../policy/analysis.js';
import { preprocessPropPunning } from '../preprocess.js';
import { buildExactProvenance } from '../provenance.js';
import { exactSecretQualificationTransformer } from '../secret-transform.js';
import { buildExpressionSemanticGraph } from '../semantic.js';
import { createLineSourceMap } from '../source-maps.js';
import { exactJsxTransformer } from '../transform/jsx/transformer.js';
import type { ExactImportedComponentIR, TransformOptions, TransformResult } from '../types.js';

import { analyzeSource } from './source-analysis.js';

/** Analyzes generic dependencies and overlays eXact reactive provenance. */
export function analyzeReactiveProvenance(source: string, options: TransformOptions = {}) {
	const filename = options.filename ?? 'input.tsx';
	return buildExactProvenance(
		sessionExpressionModule(options.session, filename, preprocessPropPunning(source), {
			root: options.root
		})
	);
}

/** Transforms eXact TSX/JSX source and returns only the generated code. */
export function transform(source: string, options: TransformOptions = {}): string {
	return transformSource(source, options).code;
}

/** Transforms eXact TSX/JSX source into code, source map metadata, and compiler manifest. */
export function transformSource(source: string, options: TransformOptions = {}): TransformResult {
	const normalized = preprocessPropPunning(source);
	const filename = options.filename ?? 'input.tsx';
	const virtual = !path.isAbsolute(filename);
	const importedManifests = validatedImportedManifests(
		options.importedManifests,
		options.pluginRegistry
	);
	const target = options.target ?? 'default';
	const expressionModule = sessionExpressionModule(options.session, filename, normalized, {
		root: options.root,
		virtual,
		diagnostics: options.generatedValidation === 'semantic' ? 'full' : 'syntax'
	});
	const syntaxDiagnostics = expressionModule.diagnostics.filter(
		(diagnostic) => diagnostic.phase === 'syntax' && diagnostic.severity === 'error'
	);
	if (syntaxDiagnostics.length) {
		throw new Error(
			syntaxDiagnostics
				.map((diagnostic) => {
					const location = diagnostic.span
						? `:${diagnostic.span.line}:${diagnostic.span.column}`
						: '';
					return `${diagnostic.filename ?? filename}${location} - ${diagnostic.message}`;
				})
				.join('\n')
		);
	}
	const sourceFile = ts.createSourceFile(
		filename,
		normalized,
		ts.ScriptTarget.ES2022,
		true,
		ts.ScriptKind.TSX
	);
	const annotations = analyzeExactAnnotations(expressionModule);
	throwLocatedCompilerDiagnostics(filename, sourceFile, annotations.diagnostics);
	const manifest = analyzeSource(normalized, {
		filename,
		root: options.root,
		session: options.session,
		importedManifests,
		target,
		assetRules: options.assetRules,
		pluginRegistry: options.pluginRegistry,
		generatedValidation: options.generatedValidation,
		packageType: options.packageType,
		packageName: options.packageName,
		capabilityPolicy: options.capabilityPolicy
	});
	const pluginErrors = manifest.diagnostics.filter((diagnostic) => /^error: \[@/.test(diagnostic));
	if (pluginErrors.length) throw new Error(pluginErrors.join('\n'));
	const semanticGraph = buildExpressionSemanticGraph(expressionModule);
	const expressionWrites = analyzeExpressionWrites(expressionModule);
	const moduleImports = analyzeModuleImports(normalized, filename, options.assetRules);
	const policyMetadata = analyzeExactPolicyMetadata(expressionModule, importedManifests);
	const secretQualifications = createExactSecretQualificationPlan(expressionModule, policyMetadata);
	const callableEffects = applyExactPolicyToCallables(
		policyMetadata,
		analyzeCallableEffects(
			expressionModule,
			semanticGraph,
			importedManifests,
			expressionWrites,
			moduleImports,
			policyMetadata.contextCallEffects
		)
	).callables;
	const provenance = buildExactProvenance(expressionModule, callableEffects.callEffects);
	const expressionDerived = analyzeExpressionDerived(expressionModule, provenance);
	const expressionTasks = applyExactPolicyToTasks(
		policyMetadata,
		analyzeExpressionTasks(expressionModule, callableEffects, provenance)
	).tasks;
	const taskErrors = expressionTasks.diagnostics.filter((diagnostic) =>
		diagnostic.startsWith('error:')
	);
	if (taskErrors.length) {
		throw new Error(
			taskErrors
				.map((message) => {
					const start = expressionTasks.diagnosticLocations.find(
						(candidate) => candidate.message === message
					)?.start;
					if (start === undefined) return `${filename} - ${message}`;
					const location = sourceFile.getLineAndCharacterOfPosition(start);
					return `${filename}:${location.line + 1}:${location.character + 1} - ${message}`;
				})
				.join('\n')
		);
	}
	const semanticErrors = manifest.diagnostics.filter((diagnostic) =>
		diagnostic.startsWith('error:')
	);
	if (semanticErrors.length) {
		throw new Error(semanticErrors.map((message) => `${filename} - ${message}`).join('\n'));
	}
	const expressionJsx = analyzeExpressionJsx(expressionModule, provenance, filename);
	throwLocatedCompilerDiagnostics(filename, sourceFile, expressionJsx.diagnostics);
	const expressionComponents = analyzeExpressionComponents(
		expressionModule,
		expressionJsx,
		expressionTasks,
		provenance,
		expressionWrites,
		callableEffects
	);
	const emissionComponentInfo = new Map<string, ExactImportedComponentIR>();
	for (const component of collectExpressionImportedComponents(
		filename,
		importedManifests,
		semanticGraph
	))
		emissionComponentInfo.set(component.name, component);
	for (const component of manifest.components)
		emissionComponentInfo.set(component.name, {
			name: component.name,
			boundaryName: component.name,
			placement: component.placement,
			componentId: component.id
		});
	const result = ts.transform(sourceFile, [
		exactJsxTransformer(
			expressionModule,
			filename,
			target,
			options.serverComponents ?? false,
			semanticGraph,
			expressionDerived,
			expressionWrites,
			expressionTasks,
			expressionJsx,
			expressionComponents,
			emissionComponentInfo,
			callableEffects,
			moduleImports,
			options.preserveClientAssetImports ?? false
		),
		exactComponentDescriptorTransformer(
			manifest,
			target,
			options.preserveComponentHoisting ?? false
		),
		exactSecretQualificationTransformer(secretQualifications)
	]);
	const transformed = result.transformed[0]!;
	const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
	const printed = emitExpressionRewrite(
		expressionModule,
		printer.printFile(transformed as ts.SourceFile),
		options.root,
		virtual,
		options.session,
		options.generatedValidation ?? 'syntax'
	);
	result.dispose();
	validateTargetAnalysis(callableEffects, target, filename);
	const output = options.moduleTransform
		? options.moduleTransform({ id: filename, source: printed, target }).code
		: options.moduleRewrite
			? rewriteModuleReferences(printed, { ...options.moduleRewrite, filename, sourceMap: false })
					.code
			: printed;
	return {
		code: output,
		map: options.sourceMap ? createLineSourceMap(filename, normalized, output) : null,
		filename,
		manifest
	};
}

import { sessionExpressionModule, validatedImportedManifests } from './analysis-results.js';
import {
	emitExpressionRewrite,
	throwLocatedCompilerDiagnostics,
	validateTargetAnalysis
} from './generated-diagnostics.js';
export { analyzeSemanticGraph } from './analysis-results.js';
