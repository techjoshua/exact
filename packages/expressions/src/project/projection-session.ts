import type { ExactProfileSink } from '@exact/instrumentation';
import { performance } from 'node:perf_hooks';
import type ts from 'typescript';
import type { ExpressionNode, ExpressionSymbol, ExpressionType } from '../model.js';
import { createModule, type BoundModule } from '../module.js';
import { createExpressionBindingProjection } from './binding-projection.js';
import type { ExpressionProjectProfileEvent, TypeProjectionBucket } from './contracts.js';
import { ExpressionDirectiveIndex } from './directives.js';
import { ExpressionProjectError } from './errors.js';
import { projectExpressionNodes } from './node-projection.js';
import { createExpressionTypeProjection } from './type-projection.js';
import { diagnosticFromTs, normalizeFile } from './syntax.js';

export type ExpressionProjectionSessionOptions = {
	program: ts.Program;
	filename: string;
	diagnosticMode: 'syntax' | 'full';
	profileEnabled: boolean;
	profileDetail: 'summary' | 'detailed';
	recordProfile: ExactProfileSink<ExpressionProjectProfileEvent>;
	recordSemanticDiagnostics(): void;
	nodeIdentityRoots: Map<string, ExpressionNode>;
	overlayVersions: Map<string, number>;
	typeHandles: WeakMap<ExpressionType, ts.Type>;
	symbolIdentities: Map<string, ExpressionSymbol>;
	identityKeysByFile: Map<string, Set<string>>;
	fileVersion(filename: string): string;
};

/** Runs diagnostics, projection, identity retention, and profiling for one module. */
export function projectExpressionModule(options: ExpressionProjectionSessionOptions): BoundModule {
	const { filename } = options;

	const program = options.program;
	const sourceFile =
		program.getSourceFile(filename) ??
		program.getSourceFiles().find((file) => normalizeFile(file.fileName) === filename);
	if (!sourceFile)
		throw new ExpressionProjectError([
			{
				code: 'EXPR_FILE_MISSING',
				message: `Module is not part of the expression project: ${filename}`,
				severity: 'error',
				filename
			}
		]);
	const checker = program.getTypeChecker();
	const syntaxStarted = options.profileEnabled ? performance.now() : undefined;
	const syntacticDiagnostics = program
		.getSyntacticDiagnostics(sourceFile)
		.map((diagnostic) => ({ ...diagnosticFromTs(diagnostic), phase: 'syntax' as const }));
	if (syntaxStarted !== undefined) {
		options.recordProfile({
			subsystem: 'expressions',
			phase: 'syntax-diagnostics',
			elapsedMs: performance.now() - syntaxStarted,
			filename
		});
	}
	const semanticStarted = options.profileEnabled ? performance.now() : undefined;
	// TypeScript diagnostics must be captured before expression conversion:
	// asking the checker afterwards can reinterpret lazily populated JSX
	// children as ordinary identifiers. Projection into the public diagnostic
	// model remains lazy and no Program is retained by the module.
	const semanticDiagnostics =
		options.diagnosticMode === 'full'
			? (options.recordSemanticDiagnostics(), program.getSemanticDiagnostics(sourceFile))
			: [];
	if (semanticStarted !== undefined) {
		options.recordProfile({
			subsystem: 'expressions',
			phase: 'semantic-diagnostics',
			elapsedMs: performance.now() - semanticStarted,
			filename
		});
	}
	const projectionStarted = options.profileEnabled ? performance.now() : undefined;
	const detailedProfile =
		options.profileDetail === 'detailed' && options.profileEnabled !== undefined;
	const projectionBuckets = {
		metadata: 0,
		types: 0,
		bindings: 0,
		common: 0,
		specialization: 0
	};
	const projectionCounters = {
		typeCacheHits: 0,
		typeCacheMisses: 0,
		shallowTypeCacheHits: 0,
		shallowTypeCacheMisses: 0,
		checkerTypeQueries: 0,
		checkerSymbolQueries: 0,
		resolvedSignatureQueries: 0,
		directiveScans: 0,
		directiveCharacters: 0
	};
	const measureProjection = <T>(bucket: keyof typeof projectionBuckets, operation: () => T): T => {
		if (!detailedProfile) return operation();
		const started = performance.now();
		try {
			return operation();
		} finally {
			projectionBuckets[bucket] += performance.now() - started;
		}
	};
	const directives = new ExpressionDirectiveIndex(detailedProfile, projectionCounters);
	const {
		typeFor,
		displayType,
		displaySignature,
		typeCache,
		shallowTypeCache,
		typeProjectionTimer
	} = createExpressionTypeProjection({
		filename,
		checker,
		detailedProfile,
		counters: projectionCounters,
		directives,
		typeHandles: options.typeHandles
	});
	const { scopeFor, variableFor, variableForThis, usedIdentityKeys, scopes, symbolVariables } =
		createExpressionBindingProjection({
			filename,
			sourceFile,
			checker,
			detailedProfile,
			counters: projectionCounters,
			directives,
			typeFor,
			symbolIdentities: options.symbolIdentities,
			fileVersion: (candidate) => options.fileVersion(candidate)
		});

	const { root, convertedNodeCount, identityElapsed, nodeConversionElapsed } =
		projectExpressionNodes({
			filename,
			sourceFile,
			checker,
			detailedProfile,
			counters: projectionCounters,
			directives,
			priorRoot: options.nodeIdentityRoots.get(filename),
			overlayVersion: options.overlayVersions.get(filename) ?? 0,
			measure: measureProjection,
			typeFor,
			displayType,
			displaySignature,
			scopeFor,
			variableFor,
			variableForThis
		});
	const finalizationStarted = detailedProfile ? performance.now() : undefined;
	options.nodeIdentityRoots.set(filename, root);
	for (const scope of scopes.values()) scope.seal();
	const module = createModule({
		filename,
		source: sourceFile.text,
		root,
		state: 'bound',
		diagnostics: () => [
			...syntacticDiagnostics,
			...semanticDiagnostics.map((diagnostic) => ({
				...diagnosticFromTs(diagnostic),
				phase: 'semantic' as const
			}))
		]
	});
	const ownUsedIdentityKeys = new Set(
		[...usedIdentityKeys].filter((key) => key.startsWith(`${filename}:`))
	);
	const priorKeys = options.identityKeysByFile.get(filename);
	for (const key of priorKeys ?? [])
		if (!ownUsedIdentityKeys.has(key)) {
			options.symbolIdentities.delete(key);
		}
	options.identityKeysByFile.set(filename, ownUsedIdentityKeys);
	const finalizationElapsed =
		finalizationStarted === undefined ? undefined : performance.now() - finalizationStarted;
	if (
		detailedProfile &&
		identityElapsed !== undefined &&
		nodeConversionElapsed !== undefined &&
		finalizationElapsed !== undefined
	) {
		const detail = { subsystem: 'expressions' as const, filename };
		options.recordProfile({ ...detail, phase: 'projection-identity', elapsedMs: identityElapsed });
		options.recordProfile({
			...detail,
			phase: 'projection-node-conversion',
			elapsedMs: nodeConversionElapsed,
			nodeCount: convertedNodeCount
		});
		options.recordProfile({
			...detail,
			phase: 'projection-node-metadata',
			elapsedMs: projectionBuckets.metadata
		});
		options.recordProfile({
			...detail,
			phase: 'projection-node-types',
			elapsedMs: projectionBuckets.types,
			typeCacheHits: projectionCounters.typeCacheHits,
			typeCacheMisses: projectionCounters.typeCacheMisses,
			shallowTypeCacheHits: projectionCounters.shallowTypeCacheHits,
			shallowTypeCacheMisses: projectionCounters.shallowTypeCacheMisses,
			checkerTypeQueries: projectionCounters.checkerTypeQueries
		});
		options.recordProfile({
			...detail,
			phase: 'projection-node-bindings',
			elapsedMs: projectionBuckets.bindings,
			checkerSymbolQueries: projectionCounters.checkerSymbolQueries,
			symbolCount: symbolVariables.size
		});
		options.recordProfile({
			...detail,
			phase: 'projection-node-common',
			elapsedMs: projectionBuckets.common,
			directiveScans: projectionCounters.directiveScans,
			directiveCharacters: projectionCounters.directiveCharacters,
			scopeCount: scopes.size
		});
		options.recordProfile({
			...detail,
			phase: 'projection-node-specialization',
			elapsedMs: projectionBuckets.specialization,
			resolvedSignatureQueries: projectionCounters.resolvedSignatureQueries
		});
		const measuredNodeWork = Object.values(projectionBuckets).reduce(
			(total, elapsed) => total + elapsed,
			0
		);
		options.recordProfile({
			...detail,
			phase: 'projection-node-overhead',
			elapsedMs: Math.max(0, nodeConversionElapsed - measuredNodeWork)
		});
		options.recordProfile({
			...detail,
			phase: 'projection-finalization',
			elapsedMs: finalizationElapsed
		});
		const typePhases = {
			'projection-type-display': 'display',
			'projection-type-members': 'members',
			'projection-type-signatures': 'signatures',
			'projection-type-properties': 'properties',
			'projection-type-arguments': 'arguments',
			'projection-type-directives': 'directives',
			'projection-type-construction': 'construction'
		} as const;
		for (const [phase, bucket] of Object.entries(typePhases) as Array<
			[keyof typeof typePhases, TypeProjectionBucket]
		>) {
			options.recordProfile({
				...detail,
				phase,
				elapsedMs: typeProjectionTimer.elapsed(bucket)
			});
		}
	}
	if (projectionStarted !== undefined) {
		options.recordProfile({
			subsystem: 'expressions',
			phase: 'module-projection',
			elapsedMs: performance.now() - projectionStarted,
			filename,
			nodeCount: convertedNodeCount,
			typeCount: typeCache.size,
			shallowTypeCount: [...shallowTypeCache.values()].reduce(
				(count, variants) => count + variants.size,
				0
			),
			symbolCount: symbolVariables.size,
			scopeCount: scopes.size
		});
	}
	return module;
}
