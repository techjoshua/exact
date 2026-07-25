import type ts from 'typescript';
import { insertAfterDirectivePrologue } from '../../emission/operations.js';
import { pruneUnusedImports } from '../../prune-imports.js';
import type {
	ExactPlacement,
	ExactSemanticGraphIR,
	HelperNames,
	TransformTarget
} from '../../types.js';
import { appendServerPartExportAliases } from './island-planning.js';
import { taskResourceHelper } from './task-emission.js';
import type { JsxTransformState } from './transform-state.js';

const helperModule = '@exactjs/core';

/**
 * Publishes generated island declarations and runtime imports after JSX traversal.
 *
 * Import pruning occurs before helper insertion so generated bindings are never
 * mistaken for unused source imports.
 */
export function finalizeJsxSource(
	sourceFile: ts.SourceFile,
	transformed: ts.SourceFile,
	factory: ts.NodeFactory,
	helpers: HelperNames,
	state: JsxTransformState,
	target: TransformTarget,
	componentPlacements: Map<string, ExactPlacement>,
	semanticGraph: ExactSemanticGraphIR
): ts.SourceFile {
	const withIslands =
		target === 'client' && state.clientIslandDefinitions.length
			? factory.updateSourceFile(transformed, [
					...transformed.statements,
					...state.clientIslandDefinitions
				])
			: transformed;
	const withServerParts =
		target === 'server'
			? appendServerPartExportAliases(
					sourceFile,
					withIslands,
					factory,
					state.islandCounts,
					componentPlacements,
					semanticGraph
				)
			: withIslands;
	const visited =
		target === 'default' ? withServerParts : pruneUnusedImports(withServerParts, factory);
	if (!requiresRuntimeHelpers(state)) return visited;

	const importDeclaration = factory.createImportDeclaration(
		undefined,
		factory.createImportClause(
			false,
			undefined,
			factory.createNamedImports(createRuntimeHelperImports(factory, helpers, state))
		),
		factory.createStringLiteral(helperModule)
	);

	return factory.updateSourceFile(
		visited,
		insertAfterDirectivePrologue(visited.statements, importDeclaration)
	);
}

function requiresRuntimeHelpers(state: JsxTransformState): boolean {
	return (
		state.sawJsx ||
		state.sawBoundary ||
		state.sawStateWrite ||
		state.sawAbortOptions ||
		state.sawDerived ||
		state.taskResources.size > 0 ||
		state.taskSignalModes.size > 0 ||
		state.sawTaskAwait ||
		state.sawDistributedContinuation
	);
}

function createRuntimeHelperImports(
	factory: ts.NodeFactory,
	helpers: HelperNames,
	state: JsxTransformState
): ts.ImportSpecifier[] {
	const imports = [
		helperImport(factory, 'createCompiledVNode', helpers.element),
		helperImport(factory, 'createCompiledFragment', helpers.fragment),
		helperImport(factory, 'createExpression', helpers.expression),
		helperImport(factory, 'createDynamicChild', helpers.dynamic)
	];
	if (state.sawDerived) imports.push(helperImport(factory, 'createDerived', helpers.derived));
	if (state.sawStateWrite) {
		imports.push(
			helperImport(factory, 'writeReactiveLazy', helpers.write),
			helperImport(factory, 'updateReactiveValue', helpers.update),
			helperImport(factory, 'updateReactiveValueWithResult', helpers.updateResult),
			helperImport(factory, 'deleteReactiveValue', helpers.remove),
			helperImport(factory, 'mutateReactiveArray', helpers.arrayMutation)
		);
	}
	if (state.sawAbortOptions)
		imports.push(helperImport(factory, 'withAbortSignal', helpers.abortOptions));
	for (const kind of state.taskResources) {
		const [imported, local] = taskResourceHelper(kind, helpers);
		imports.push(helperImport(factory, imported, local));
	}
	if (state.taskSignalModes.has('options'))
		imports.push(helperImport(factory, 'withTaskSignal', helpers.taskOptionsSignal));
	if (state.taskSignalModes.has('direct'))
		imports.push(helperImport(factory, 'combineTaskSignal', helpers.taskCombinedSignal));
	if (state.sawTaskAwait) imports.push(helperImport(factory, 'taskAwait', helpers.taskAwait));
	if (state.sawDistributedContinuation)
		imports.push(
			helperImport(
				factory,
				'dispatchComponentContinuation',
				helpers.dispatchContinuation
			)
		);
	if (state.sawBoundary)
		imports.push(helperImport(factory, 'createServerBoundary', helpers.boundary));
	return imports;
}

function helperImport(
	factory: ts.NodeFactory,
	imported: string,
	local: string
): ts.ImportSpecifier {
	return factory.createImportSpecifier(
		false,
		factory.createIdentifier(imported),
		factory.createIdentifier(local)
	);
}
