import type { BoundModule } from '@exactjs/expressions';
import * as ts from '../../native-typescript.js';
import type { CallableEffectPlan } from '../../analysis/callable-effects.js';
import { stripExactImportAttribute, type ExactModuleImportPlan } from '../../assets.js';
import { isThisTaskCall } from '../../calls.js';
import { allocateHelperNames } from '../../emission/operations.js';
import {
	isArrayMutator,
	statePathLiteral,
	transformStateAssignment,
	transformStateUpdate
} from '../../emission/state-writes.js';
import type { ExpressionComponentPlan } from '../../expression/contracts.js';
import type { ExpressionDerivedPlan } from '../../expression/derived.js';
import type { ExpressionJsxPlan } from '../../expression/jsx.js';
import type { ExpressionTaskPlan } from '../../expression/task-contracts.js';
import type { ExpressionWritePlan } from '../../expression/writes.js';
import { isServerOnlyImportDeclaration } from '../../imports.js';
import { componentPlacementsFromInfo } from '../../placement.js';
import type {
	ExactContinuationIR,
	ExactImportedComponentIR,
	ExactJsxInterop,
	ExactSemanticGraphIR,
	TransformTarget
} from '../../types.js';

import { collectExpressionDerivedLocals } from './element-emission.js';
import {
	continuationContextWriteContracts,
	createDistributedTaskSites,
	isDistributedTaskStatement
} from './distributed-task-emission.js';
import { visitJsxExpression } from './expression-visitor.js';
import { finalizeJsxSource } from './finalize.js';
import {
	bindExpressionEmissionNodes,
	emissionNodeIds,
	expressionEmissionId,
	sourceIdentityFilenames
} from './identity.js';
import {
	retainVariableComponentInClientArtifact,
	transformFunctionComponentDeclaration,
	transformVariableComponentDeclaration
} from './component-value-emission.js';
import {
	expressionWriteSite,
	incompatibleSummary,
	parseTypeNode,
	shouldOmitPlacement
} from './lifecycle-emission.js';
import { createJsxTransformState } from './transform-state.js';
import { stateWriteTarget } from './state-write-target.js';
import { createJsxVisitorEnvironment } from './visitor-environment.js';

const isAssignmentOperator = (kind: ts.SyntaxKind): boolean =>
	kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;

/** Creates the TypeScript transformer that lowers eXact JSX into runtime helper calls. */
export function exactJsxTransformer(
	expressionModule: BoundModule,
	identityFilename: string,
	target: TransformTarget,
	serverComponents = false,
	providedSemanticGraph: ExactSemanticGraphIR,
	expressionDerived: ExpressionDerivedPlan,
	expressionWrites: ExpressionWritePlan,
	expressionTasks: ExpressionTaskPlan,
	continuations: readonly ExactContinuationIR[],
	expressionJsx: ExpressionJsxPlan,
	expressionComponents: ExpressionComponentPlan,
	componentInfo: Map<string, ExactImportedComponentIR>,
	callableEffects: CallableEffectPlan,
	moduleImports: ExactModuleImportPlan,
	preserveClientAssetImports: boolean,
	jsxInterop?: ExactJsxInterop
): ts.TransformerFactory<ts.SourceFile> {
	return (context) => (sourceFile) => {
		sourceIdentityFilenames.set(sourceFile, identityFilename);
		bindExpressionEmissionNodes(
			sourceFile,
			expressionModule,
			emissionNodeIds(
				expressionModule,
				expressionDerived,
				expressionWrites,
				expressionTasks,
				expressionJsx,
				expressionComponents,
				callableEffects
			)
		);
		const factory = context.factory;
		const helpers = allocateHelperNames(sourceFile);
		const semanticGraph = providedSemanticGraph;
		const componentPlacements = componentPlacementsFromInfo(componentInfo);
		const derivedReactiveLocals = collectExpressionDerivedLocals(sourceFile, expressionDerived);
		const state = createJsxTransformState();
		const taskSites = createDistributedTaskSites(
			expressionTasks,
			expressionComponents,
			identityFilename
		);
		const continuationContextWrites = continuationContextWriteContracts(continuations);
		const visitorEnvironment = createJsxVisitorEnvironment(
			{
				context,
				sourceFile,
				factory,
				helpers,
				state,
				target,
				serverComponents,
				preserveClientAssetImports,
				callableEffects,
				moduleImports,
				expressionComponents,
				expressionJsx,
				expressionWrites,
				componentInfo,
				componentPlacements,
				continuationContextWrites,
				derivedReactiveLocals
			},
			{ ...expressionTasks, sites: taskSites },
			expressionEmissionId
		);

		const visitor: ts.Visitor = (node) => {
			if (ts.isExpressionStatement(node) || (ts.isImportDeclaration(node) && !node.importClause)) {
				const summary = callableEffects.byNodeId.get(expressionEmissionId(node) ?? '');
				const distributedTask = isDistributedTaskStatement(node, target, taskSites);
				const preserveAsset =
					ts.isImportDeclaration(node) &&
					preserveClientAssetImports &&
					target === 'server' &&
					moduleImports.clientAssetSideEffectStarts.has(node.getStart(sourceFile));
				if (!distributedTask && !preserveAsset && summary && incompatibleSummary(summary, target))
					return factory.createEmptyStatement();
			}
			if (ts.isImportDeclaration(node)) {
				const specifier = ts.isStringLiteral(node.moduleSpecifier)
					? node.moduleSpecifier.text
					: undefined;
				const placement = specifier ? moduleImports.placementBySpecifier.get(specifier) : undefined;
				const preserveAsset =
					preserveClientAssetImports &&
					target === 'server' &&
					moduleImports.clientAssetSideEffectStarts.has(node.getStart(sourceFile));
				if (!preserveAsset && target !== 'default' && placement && placement !== target)
					return factory.createEmptyStatement();
				node = stripExactImportAttribute(node, factory);
			}
			if (
				ts.isExportDeclaration(node) &&
				node.exportClause &&
				ts.isNamedExports(node.exportClause)
			) {
				const elements = node.exportClause.elements.filter((element) => {
					const summary = callableEffects.callables.find((candidate) =>
						candidate.exportNames.includes(element.name.text)
					);
					return !summary || !incompatibleSummary(summary, target);
				});
				if (!elements.length) return factory.createEmptyStatement();
				if (elements.length !== node.exportClause.elements.length) {
					return factory.updateExportDeclaration(
						node,
						node.modifiers,
						node.isTypeOnly,
						factory.updateNamedExports(node.exportClause, elements),
						node.moduleSpecifier,
						node.attributes
					);
				}
			}
			if (ts.isFunctionDeclaration(node) && node.name) {
				const nodeId = expressionEmissionId(node) ?? '';
				const summary = callableEffects.byNodeId.get(nodeId);
				if (
					!expressionComponents.sites.get(nodeId) &&
					summary &&
					incompatibleSummary(summary, target)
				)
					return factory.createEmptyStatement();
			}
			if (ts.isVariableStatement(node)) {
				const declarations = node.declarationList.declarations.filter((declaration) => {
					const initializer = declaration.initializer;
					if (!initializer) return true;
					const retainComponent = retainVariableComponentInClientArtifact(
						initializer,
						expressionComponents,
						state,
						visitor,
						context,
						target,
						serverComponents
					);
					if (retainComponent !== undefined) return retainComponent;
					const summary = callableEffects.byNodeId.get(expressionEmissionId(initializer) ?? '');
					return !summary || !incompatibleSummary(summary, target);
				});
				if (!declarations.length) return factory.createEmptyStatement();
				if (declarations.length !== node.declarationList.declarations.length) {
					return ts.visitEachChild(
						factory.updateVariableStatement(
							node,
							node.modifiers,
							factory.updateVariableDeclarationList(node.declarationList, declarations)
						),
						visitor,
						context
					);
				}
			}
			if (ts.isParameter(node) && !node.type) {
				const contextualType = expressionJsx.contextualParameters.get(
					expressionEmissionId(node) ?? ''
				);
				if (contextualType) {
					return factory.updateParameterDeclaration(
						node,
						node.modifiers,
						node.dotDotDotToken,
						node.name,
						node.questionToken,
						parseTypeNode(portableContextualType(contextualType)),
						node.initializer
					);
				}
			}
			if (ts.isFunctionDeclaration(node)) {
				const componentDeclaration = transformFunctionComponentDeclaration(
					sourceFile,
					node,
					expressionComponents,
					componentPlacements,
					state,
					visitor,
					context,
					helpers,
					target,
					serverComponents
				);
				if (componentDeclaration) return componentDeclaration;
			}
			if (ts.isVariableDeclaration(node) && node.initializer) {
				const componentDeclaration = transformVariableComponentDeclaration(
					sourceFile,
					node,
					expressionComponents,
					componentPlacements,
					state,
					visitor,
					context,
					helpers,
					target
				);
				if (componentDeclaration) return componentDeclaration;
				const derived = derivedReactiveLocals.declarations.get(expressionEmissionId(node) ?? '');
				if (derived?.cached) {
					state.sawDerived = true;
					return factory.updateVariableDeclaration(
						node,
						node.name,
						node.exclamationToken,
						node.type,
						factory.createCallExpression(factory.createIdentifier(helpers.derived), undefined, [
							factory.createArrowFunction(
								undefined,
								undefined,
								[],
								undefined,
								factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
								ts.visitNode(node.initializer, visitor) as ts.Expression
							)
						])
					);
				}
			}
			if (state.componentStack.length && ts.isDeleteExpression(node)) {
				const site = expressionWriteSite(node, sourceFile, expressionWrites);
				if (site) {
					const target = stateWriteTarget(context, node, site, derivedReactiveLocals);
					state.sawStateWrite = true;
					return context.factory.createCallExpression(
						context.factory.createIdentifier(helpers.remove),
						undefined,
						[target.root, statePathLiteral(context, target.path)]
					);
				}
			}
			if (
				state.componentStack.length &&
				ts.isBinaryExpression(node) &&
				isAssignmentOperator(node.operatorToken.kind)
			) {
				const site = expressionWriteSite(node, sourceFile, expressionWrites);
				if (site) {
					const target = stateWriteTarget(context, node, site, derivedReactiveLocals);
					state.sawStateWrite = true;
					return transformStateAssignment(
						context,
						node,
						target.root,
						target.path,
						visitor,
						helpers
					);
				}
			}
			if (
				state.componentStack.length &&
				(ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
			) {
				const site = expressionWriteSite(node, sourceFile, expressionWrites);
				if (
					site &&
					(node.operator === ts.SyntaxKind.PlusPlusToken ||
						node.operator === ts.SyntaxKind.MinusMinusToken)
				) {
					const target = stateWriteTarget(context, node, site, derivedReactiveLocals);
					state.sawStateWrite = true;
					return transformStateUpdate(context, node, target.root, target.path, helpers);
				}
			}
			if (
				state.componentStack.length &&
				ts.isCallExpression(node) &&
				ts.isPropertyAccessExpression(node.expression)
			) {
				const method = node.expression.name.text;
				const site = expressionWriteSite(node, sourceFile, expressionWrites);
				if (site && isArrayMutator(method)) {
					const target = stateWriteTarget(context, node, site, derivedReactiveLocals);
					state.sawStateWrite = true;
					return context.factory.createCallExpression(
						context.factory.createIdentifier(helpers.arrayMutation),
						undefined,
						[
							target.root,
							statePathLiteral(context, target.path),
							context.factory.createStringLiteral(method),
							context.factory.createArrowFunction(
								undefined,
								undefined,
								[],
								undefined,
								context.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
								context.factory.createArrayLiteralExpression(
									node.arguments.map((argument) => ts.visitNode(argument, visitor) as ts.Expression)
								)
							)
						]
					);
				}
			}
			if (
				ts.isExpressionStatement(node) &&
				ts.isCallExpression(node.expression) &&
				isThisTaskCall(node.expression)
			) {
				const placement = visitorEnvironment.taskPlacementFor(node.expression);
				if (
					shouldOmitPlacement(placement, target) &&
					!(target === 'client' && placement === 'server')
				) {
					return factory.createEmptyStatement();
				}
			}
			return visitJsxExpression(node, visitor, visitorEnvironment);
		};

		const transformInput =
			target === 'client'
				? factory.updateSourceFile(
						sourceFile,
						sourceFile.statements.filter((statement) => !isServerOnlyImportDeclaration(statement))
					)
				: sourceFile;
		const transformed = ts.visitEachChild(transformInput, visitor, context);
		return finalizeJsxSource(
			sourceFile,
			transformed,
			factory,
			helpers,
			state,
			target,
			componentPlacements,
			semanticGraph,
			jsxInterop
		);
	};
}

function portableContextualType(type: string): string {
	const portable = type.replace(
		/import\((['"])(?:[A-Za-z]:)?[\\/][^'"]*[\\/]dist[\\/]jsx-runtime\1\)/g,
		'import("@exactjs/jsx/jsx-runtime")'
	);
	// TypeScript's ordinary (truncated) display form may shorten an import type
	// to the ambient JSX namespace. Generated files cannot assume that namespace
	// is in scope, so retain the same portable package-owned qualification used
	// by the fully expanded display form.
	return portable.replace(/(^|[^\w.])JSX\./g, '$1import("@exactjs/jsx/jsx-runtime").JSX.');
}
