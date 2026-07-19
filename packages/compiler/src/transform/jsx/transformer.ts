import type { BoundModule } from '@exact/expressions';
import ts from 'typescript';
import type { CallableEffectPlan } from '../../analysis/callable-effects.js';
import { stripExactImportAttribute, type ExactModuleImportPlan } from '../../assets.js';
import { isThisTaskCall } from '../../calls.js';
import { allocateHelperNames } from '../../emission/operations.js';
import {
	componentStateRoot,
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
	ExactImportedComponentIR,
	ExactSemanticGraphIR,
	TransformTarget
} from '../../types.js';

import { collectComponentLocalInfo, collectExpressionDerivedLocals } from './element-emission.js';
import { visitJsxExpression } from './expression-visitor.js';
import { finalizeJsxSource } from './finalize.js';
import {
	bindExpressionEmissionNodes,
	emissionNodeIds,
	expressionEmissionId,
	sourceIdentityFilenames
} from './identity.js';
import { createClientComponentServerStub } from './island-emission.js';
import {
	expressionWritePath,
	incompatibleSummary,
	parseTypeNode,
	shouldOmitPlacement
} from './lifecycle-emission.js';
import { createJsxTransformState } from './transform-state.js';
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
	expressionJsx: ExpressionJsxPlan,
	expressionComponents: ExpressionComponentPlan,
	componentInfo: Map<string, ExactImportedComponentIR>,
	callableEffects: CallableEffectPlan,
	moduleImports: ExactModuleImportPlan,
	preserveClientAssetImports: boolean
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
				derivedReactiveLocals
			},
			expressionTasks,
			expressionEmissionId
		);

		const visitor: ts.Visitor = (node) => {
			if (ts.isExpressionStatement(node) || (ts.isImportDeclaration(node) && !node.importClause)) {
				const summary = callableEffects.byNodeId.get(expressionEmissionId(node) ?? '');
				const preserveAsset =
					ts.isImportDeclaration(node) &&
					preserveClientAssetImports &&
					target === 'server' &&
					moduleImports.clientAssetSideEffectStarts.has(node.getStart(sourceFile));
				if (!preserveAsset && summary && incompatibleSummary(summary, target))
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
						parseTypeNode(contextualType),
						node.initializer
					);
				}
			}
			const componentId = ts.isFunctionDeclaration(node) ? expressionEmissionId(node) : undefined;
			const componentSite = componentId ? expressionComponents.sites.get(componentId) : undefined;
			if (ts.isFunctionDeclaration(node) && node.name && componentSite) {
				if (target === 'server' && componentPlacements.get(node.name.text) === 'client') {
					state.sawBoundary = true;
					return createClientComponentServerStub(sourceFile, context, helpers, node);
				}
				if (target === 'client' && serverComponents && componentSite.serverEffects) {
					// In server-component mode, non-client components are removed from the
					// client artifact after their nested client islands have been collected.
					state.componentStack.push(node.name.text);
					state.componentSiteStack.push(componentSite.id);
					state.componentLocalStack.push(collectComponentLocalInfo(node));
					ts.visitEachChild(node, visitor, context);
					state.componentLocalStack.pop();
					state.componentStack.pop();
					state.componentSiteStack.pop();
					return factory.createEmptyStatement();
				}
				state.componentStack.push(node.name.text);
				state.componentSiteStack.push(componentSite.id);
				state.componentLocalStack.push(collectComponentLocalInfo(node));
				const visited = ts.visitEachChild(node, visitor, context);
				state.componentLocalStack.pop();
				state.componentStack.pop();
				state.componentSiteStack.pop();
				return visited;
			}
			if (ts.isVariableDeclaration(node) && node.initializer) {
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
				const path = expressionWritePath(node, sourceFile, expressionWrites);
				if (path) {
					state.sawStateWrite = true;
					return context.factory.createCallExpression(
						context.factory.createIdentifier(helpers.remove),
						undefined,
						[componentStateRoot(context), statePathLiteral(context, path)]
					);
				}
			}
			if (
				state.componentStack.length &&
				ts.isBinaryExpression(node) &&
				isAssignmentOperator(node.operatorToken.kind)
			) {
				const path = expressionWritePath(node, sourceFile, expressionWrites);
				if (path) {
					state.sawStateWrite = true;
					return transformStateAssignment(context, node, path, visitor, helpers);
				}
			}
			if (
				state.componentStack.length &&
				(ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
			) {
				const path = expressionWritePath(node, sourceFile, expressionWrites);
				if (
					path &&
					(node.operator === ts.SyntaxKind.PlusPlusToken ||
						node.operator === ts.SyntaxKind.MinusMinusToken)
				) {
					state.sawStateWrite = true;
					return transformStateUpdate(context, node, path, helpers);
				}
			}
			if (
				state.componentStack.length &&
				ts.isCallExpression(node) &&
				ts.isPropertyAccessExpression(node.expression)
			) {
				const method = node.expression.name.text;
				const path = expressionWritePath(node, sourceFile, expressionWrites);
				if (path && isArrayMutator(method)) {
					state.sawStateWrite = true;
					return context.factory.createCallExpression(
						context.factory.createIdentifier(helpers.arrayMutation),
						undefined,
						[
							componentStateRoot(context),
							statePathLiteral(context, path),
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
				if (shouldOmitPlacement(visitorEnvironment.taskPlacementFor(node.expression), target)) {
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
			semanticGraph
		);
	};
}
