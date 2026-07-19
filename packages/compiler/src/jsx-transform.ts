import ts from 'typescript';
import { isIdentifierDeclarationName, isPropertyAccessName, nodeNameText } from './ast.js';
import {
	isFunctionLikeExpression,
	isThisMethodAccess,
	isThisMethodCall,
	isThisTaskCall
} from './calls.js';
import { componentPlacementsFromInfo } from './placement.js';
import { collectExports } from './exports.js';
import { stableId } from './ids.js';
import { isServerOnlyImportDeclaration, isServerOnlyModule } from './imports.js';
import { stripExactImportAttribute, type ExactModuleImportPlan } from './assets.js';
import {
	clientComponentChildrenProp,
	componentBoundaryName,
	jsxElementHasNoMeaningfulChildren,
	jsxElementIsClientIsland,
	jsxTagIsIntrinsicElement
} from './jsx-inspect.js';
import { clientComponentBoundaryId, generatedComponentName } from './names.js';
import { pruneUnusedImports } from './prune-imports.js';
import { allocateHelperNames, insertAfterDirectivePrologue } from './emission/helpers.js';
import {
	componentStateRoot,
	isArrayMutator,
	statePathLiteral,
	transformStateAssignment,
	transformStateUpdate
} from './emission/state-writes.js';
import type { CallableEffectPlan } from './callable-effects.js';
import type { BoundModule } from '@exact/expressions';
import type { ExpressionDerivedPlan } from './expression/derived.js';
import type { ExpressionWritePlan } from './expression/writes.js';
import type {
	ExpressionTaskPlan,
	ExpressionTaskResource,
	ExpressionTaskResourceKind,
	ExpressionTaskSignalCall
} from './expression/task-contracts.js';
import type { ExpressionJsxListSite, ExpressionJsxPlan } from './expression/jsx.js';
import type {
	ExpressionClientIslandSite,
	ExpressionComponentPlan
} from './expression/contracts.js';
import type {
	ClientIslandCaptures,
	ClientIslandElementNode,
	ExactImportedComponentIR,
	ExactPlacement,
	ExactSemanticGraphIR,
	HelperNames,
	StateSnapshotTree,
	TransformTarget
} from './types.js';

type ComponentLocalInfo = { functions: Map<string, ts.Statement> };
type DerivedReactiveEntry = { variableId: string; initializer: ts.Expression; cached: boolean };
type DerivedReactiveIndex = {
	references: Map<string, DerivedReactiveEntry>;
	declarations: Map<string, DerivedReactiveEntry>;
};

const helperModule = '@exact/core';
const sourceIdentityFilenames = new WeakMap<ts.SourceFile, string>();
const identityFilenameFor = (sourceFile: ts.SourceFile): string =>
	sourceIdentityFilenames.get(sourceFile) ?? sourceFile.fileName;
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
		let sawJsx = false;
		let sawBoundary = false;
		let sawStateWrite = false;
		let sawAbortOptions = false;
		let sawDerived = false;
		const taskResources = new Set<ExpressionTaskResourceKind>();
		const taskSignalModes = new Set<ExpressionTaskSignalCall['mode']>();
		let sawTaskAwait = false;
		let setupTaskDepth = 0;
		const componentStack: string[] = [];
		const componentSiteStack: string[] = [];
		const componentLocalStack: ComponentLocalInfo[] = [];
		const islandCounts = new Map<string, number>();
		const clientIslandDefinitions: ts.FunctionDeclaration[] = [];
		let clientIslandDepth = 0;
		const expressionTaskFor = (node: ts.Node) =>
			expressionTasks?.sites.get(expressionEmissionId(node) ?? '');
		const expressionResourceFor = (node: ts.Node) =>
			node.pos < 0 || node.end < 0
				? undefined
				: expressionTasks?.resources.get(expressionEmissionId(node) ?? '');
		const expressionListenerFor = (node: ts.Node) =>
			node.pos < 0 || node.end < 0
				? undefined
				: expressionTasks?.lifecycleListeners.get(expressionEmissionId(node) ?? '');
		const expressionSetupFor = (node: ts.Node) =>
			node.pos < 0 || node.end < 0
				? undefined
				: expressionTasks?.setupTasks.get(expressionEmissionId(node) ?? '');
		const expressionSignalFor = (node: ts.Node) =>
			node.pos < 0 || node.end < 0
				? undefined
				: expressionTasks?.signalCalls.get(expressionEmissionId(node) ?? '');
		const taskPlacementFor = (node: ts.Node): ExactPlacement =>
			expressionTaskFor(node)?.placement ?? 'unknown';
		const isClientComponentTag = (tag: ts.JsxTagNameExpression): boolean =>
			componentPlacements.get(tag.getText(sourceFile)) === 'client';
		const islandHasServerChildren = (node: ts.JsxElement): boolean => {
			const owner = componentSiteStack[componentSiteStack.length - 1];
			const site = owner
				? expressionComponents.sites
						.get(owner)
						?.clientIslands.find((island) => island.nodeId === expressionEmissionId(node))
				: undefined;
			return (
				!!site &&
				(site.serverOnlyChildren ||
					site.childTags.some((tag) => componentPlacements.get(tag) === 'server'))
			);
		};
		const clientIslandSiteFor = (
			node: ClientIslandElementNode
		): ExpressionClientIslandSite | undefined => {
			const owner = componentSiteStack[componentSiteStack.length - 1];
			return owner
				? expressionComponents.sites
						.get(owner)
						?.clientIslands.find((island) => island.nodeId === expressionEmissionId(node))
				: undefined;
		};

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
				const componentPlacement = componentPlacements.get(node.name.text);
				if (target === 'server' && componentPlacements.get(node.name.text) === 'client') {
					sawBoundary = true;
					return createClientComponentServerStub(sourceFile, context, helpers, node);
				}
				if (target === 'client' && serverComponents && componentSite.serverEffects) {
					// In server-component mode, non-client components are removed from the
					// client artifact after their nested client islands have been collected.
					componentStack.push(node.name.text);
					componentSiteStack.push(componentSite.id);
					componentLocalStack.push(collectComponentLocalInfo(node));
					ts.visitEachChild(node, visitor, context);
					componentLocalStack.pop();
					componentStack.pop();
					componentSiteStack.pop();
					return factory.createEmptyStatement();
				}
				componentStack.push(node.name.text);
				componentSiteStack.push(componentSite.id);
				componentLocalStack.push(collectComponentLocalInfo(node));
				const visited = ts.visitEachChild(node, visitor, context);
				componentLocalStack.pop();
				componentStack.pop();
				componentSiteStack.pop();
				return visited;
			}
			if (ts.isVariableDeclaration(node) && node.initializer) {
				const derived = derivedReactiveLocals.declarations.get(expressionEmissionId(node) ?? '');
				if (derived?.cached) {
					sawDerived = true;
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
			if (componentStack.length && ts.isDeleteExpression(node)) {
				const path = expressionWritePath(node, sourceFile, expressionWrites);
				if (path) {
					sawStateWrite = true;
					return context.factory.createCallExpression(
						context.factory.createIdentifier(helpers.remove),
						undefined,
						[componentStateRoot(context), statePathLiteral(context, path)]
					);
				}
			}
			if (
				componentStack.length &&
				ts.isBinaryExpression(node) &&
				isAssignmentOperator(node.operatorToken.kind)
			) {
				const path = expressionWritePath(node, sourceFile, expressionWrites);
				if (path) {
					sawStateWrite = true;
					return transformStateAssignment(context, node, path, visitor, helpers);
				}
			}
			if (
				componentStack.length &&
				(ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
			) {
				const path = expressionWritePath(node, sourceFile, expressionWrites);
				if (
					path &&
					(node.operator === ts.SyntaxKind.PlusPlusToken ||
						node.operator === ts.SyntaxKind.MinusMinusToken)
				) {
					sawStateWrite = true;
					return transformStateUpdate(context, node, path, helpers);
				}
			}
			if (
				componentStack.length &&
				ts.isCallExpression(node) &&
				ts.isPropertyAccessExpression(node.expression)
			) {
				const method = node.expression.name.text;
				const path = expressionWritePath(node, sourceFile, expressionWrites);
				if (path && isArrayMutator(method)) {
					sawStateWrite = true;
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
				if (shouldOmitPlacement(taskPlacementFor(node.expression), target)) {
					return factory.createEmptyStatement();
				}
			}
			if (ts.isJsxElement(node)) {
				sawJsx = true;
				if (target === 'server' && isClientComponentTag(node.openingElement.tagName)) {
					const childrenProp = clientComponentChildrenProp(context, node);
					const serverChildren =
						!jsxElementHasNoMeaningfulChildren(node) && childrenProp === undefined
							? node.children
							: undefined;
					sawBoundary = true;
					return createComponentIslandBoundaryCall(
						sourceFile,
						context,
						visitor,
						helpers,
						componentInfo,
						node,
						node.openingElement.tagName,
						node.openingElement.attributes,
						childrenProp,
						serverChildren
					);
				}
				if (target === 'server' && jsxElementIsClientIsland(node.openingElement.attributes)) {
					const serverChildren = islandHasServerChildren(node) ? node.children : undefined;
					sawBoundary = true;
					const islandCaptures = clientIslandCaptures(
						clientIslandSiteFor(node),
						componentLocalStack[componentLocalStack.length - 1]
					);
					return createClientIslandBoundaryCall(
						sourceFile,
						context,
						visitor,
						helpers,
						componentStack[componentStack.length - 1],
						islandCounts,
						node.openingElement.attributes,
						serverChildren ? undefined : node.children,
						{
							...islandCaptures,
							serverSlotChildren: !!serverChildren
						},
						derivedReactiveLocals,
						serverChildren
					);
				}
				if (target === 'client' && jsxElementIsClientIsland(node.openingElement.attributes)) {
					const ownerSite = componentSiteStack[componentSiteStack.length - 1];
					const owner = componentStack[componentStack.length - 1];
					if (
						clientIslandDepth === 0 &&
						(!ownerSite ||
							componentPlacements.get(expressionComponents.sites.get(ownerSite)?.name ?? '') !==
								'client')
					) {
						const serverSlotChildren = islandHasServerChildren(node);
						clientIslandDepth++;
						const islandCaptures = clientIslandCaptures(
							clientIslandSiteFor(node),
							componentLocalStack[componentLocalStack.length - 1]
						);
						recordClientIslandDefinition(
							sourceFile,
							context,
							visitor,
							helpers,
							owner,
							islandCounts,
							node,
							clientIslandDefinitions,
							{
								...islandCaptures,
								serverSlotChildren
							}
						);
						clientIslandDepth--;
					}
					clientIslandDepth++;
					const transformed = transformJsxElement(
						sourceFile,
						node,
						context,
						visitor,
						helpers,
						derivedReactiveLocals,
						expressionJsx
					);
					clientIslandDepth--;
					return transformed;
				}
				return transformJsxElement(
					sourceFile,
					node,
					context,
					visitor,
					helpers,
					derivedReactiveLocals,
					expressionJsx
				);
			}
			if (ts.isJsxSelfClosingElement(node)) {
				sawJsx = true;
				if (target === 'client' && jsxElementIsClientIsland(node.attributes)) {
					const ownerSite = componentSiteStack[componentSiteStack.length - 1];
					const owner = componentStack[componentStack.length - 1];
					if (
						clientIslandDepth === 0 &&
						(!ownerSite ||
							componentPlacements.get(expressionComponents.sites.get(ownerSite)?.name ?? '') !==
								'client')
					) {
						recordClientIslandDefinition(
							sourceFile,
							context,
							visitor,
							helpers,
							owner,
							islandCounts,
							node,
							clientIslandDefinitions,
							clientIslandCaptures(
								clientIslandSiteFor(node),
								componentLocalStack[componentLocalStack.length - 1]
							)
						);
					}
				}
				if (target === 'server' && isClientComponentTag(node.tagName)) {
					sawBoundary = true;
					return createComponentIslandBoundaryCall(
						sourceFile,
						context,
						visitor,
						helpers,
						componentInfo,
						node,
						node.tagName,
						node.attributes
					);
				}
				if (target === 'server' && jsxElementIsClientIsland(node.attributes)) {
					sawBoundary = true;
					return createClientIslandBoundaryCall(
						sourceFile,
						context,
						visitor,
						helpers,
						componentStack[componentStack.length - 1],
						islandCounts,
						node.attributes,
						undefined,
						clientIslandCaptures(
							clientIslandSiteFor(node),
							componentLocalStack[componentLocalStack.length - 1]
						),
						derivedReactiveLocals
					);
				}
				return transformJsxSelfClosingElement(
					sourceFile,
					node,
					context,
					visitor,
					helpers,
					derivedReactiveLocals,
					expressionJsx
				);
			}
			if (ts.isJsxFragment(node)) {
				sawJsx = true;
				return transformJsxFragment(
					node,
					context,
					visitor,
					helpers,
					sourceFile,
					derivedReactiveLocals,
					expressionJsx
				);
			}
			if (
				(ts.isCallExpression(node) || ts.isNewExpression(node)) &&
				setupTaskDepth === 0 &&
				expressionSetupFor(node)
			) {
				if (target === 'server')
					return factory.createVoidExpression(factory.createNumericLiteral(0));
				return transformImplicitSetupTask(
					node,
					context,
					visitor,
					helpers,
					() => {
						sawAbortOptions = true;
					},
					expressionResourceFor,
					(kind) => {
						taskResources.add(kind);
					},
					() => {
						sawTaskAwait = true;
					},
					expressionSignalFor,
					(mode) => {
						taskSignalModes.add(mode);
					},
					(enter) => {
						setupTaskDepth += enter ? 1 : -1;
					}
				);
			}
			if (ts.isCallExpression(node)) {
				// Compatibility for expression plans created before setupTasks existed.
				if (expressionListenerFor(node) && setupTaskDepth === 0) {
					if (target === 'server')
						return factory.createVoidExpression(factory.createNumericLiteral(0));
					sawAbortOptions = true;
					return transformImplicitLifecycleListener(node, context, visitor, helpers);
				}
				if (isThisTaskCall(node)) {
					if (shouldOmitPlacement(taskPlacementFor(node), target)) {
						return factory.createVoidExpression(factory.createNumericLiteral(0));
					}
				}
				const annotatedList = expressionJsx.lists.get(expressionEmissionId(node) ?? '');
				if (annotatedList && ts.isPropertyAccessExpression(node.expression)) {
					return transformAnnotatedMapCall(
						sourceFile,
						node,
						annotatedList,
						context,
						visitor,
						derivedReactiveLocals
					);
				}
				return transformCapturedCall(
					sourceFile,
					node,
					context,
					visitor,
					derivedReactiveLocals,
					helpers,
					() => {
						sawAbortOptions = true;
					},
					expressionResourceFor,
					(kind) => {
						taskResources.add(kind);
					},
					() => {
						sawTaskAwait = true;
					},
					expressionSignalFor,
					(mode) => {
						taskSignalModes.add(mode);
					}
				);
			}
			if (node.pos >= 0 && ts.isShorthandPropertyAssignment(node)) {
				const derived = derivedReactiveLocals.references.get(expressionEmissionId(node.name) ?? '');
				if (derived?.cached) {
					return factory.createPropertyAssignment(
						factory.createIdentifier(node.name.text),
						factory.createCallExpression(
							factory.createPropertyAccessExpression(
								factory.createIdentifier(node.name.text),
								'get'
							),
							undefined,
							[]
						)
					);
				}
			}
			if (
				node.pos >= 0 &&
				ts.isIdentifier(node) &&
				!isIdentifierDeclarationName(node) &&
				!isPropertyAccessName(node)
			) {
				const derived = derivedReactiveLocals.references.get(expressionEmissionId(node) ?? '');
				if (derived?.cached) {
					return factory.createCallExpression(
						factory.createPropertyAccessExpression(node, 'get'),
						undefined,
						[]
					);
				}
			}
			if (ts.isTaggedTemplateExpression(node)) {
				return transformReactiveTaggedTemplate(node, context, visitor);
			}
			return ts.visitEachChild(node, visitor, context);
		};

		const transformInput =
			target === 'client'
				? factory.updateSourceFile(
						sourceFile,
						sourceFile.statements.filter((statement) => !isServerOnlyImportDeclaration(statement))
					)
				: sourceFile;
		const transformed = ts.visitEachChild(transformInput, visitor, context);
		const withIslands =
			target === 'client' && clientIslandDefinitions.length
				? factory.updateSourceFile(transformed, [
						...transformed.statements,
						...clientIslandDefinitions
					])
				: transformed;
		const withServerParts =
			target === 'server'
				? appendServerPartExportAliases(
						sourceFile,
						withIslands,
						factory,
						islandCounts,
						componentPlacements,
						semanticGraph
					)
				: withIslands;
		const visited =
			target === 'default' ? withServerParts : pruneUnusedImports(withServerParts, factory);
		if (
			!sawJsx &&
			!sawBoundary &&
			!sawStateWrite &&
			!sawAbortOptions &&
			!sawDerived &&
			!taskResources.size &&
			!taskSignalModes.size &&
			!sawTaskAwait
		)
			return visited;

		const importDeclaration = factory.createImportDeclaration(
			undefined,
			factory.createImportClause(
				false,
				undefined,
				factory.createNamedImports([
					factory.createImportSpecifier(
						false,
						factory.createIdentifier('createCompiledVNode'),
						factory.createIdentifier(helpers.element)
					),
					factory.createImportSpecifier(
						false,
						factory.createIdentifier('createCompiledFragment'),
						factory.createIdentifier(helpers.fragment)
					),
					factory.createImportSpecifier(
						false,
						factory.createIdentifier('createExpression'),
						factory.createIdentifier(helpers.expression)
					),
					factory.createImportSpecifier(
						false,
						factory.createIdentifier('createDynamicChild'),
						factory.createIdentifier(helpers.dynamic)
					),
					...(sawDerived
						? [
								factory.createImportSpecifier(
									false,
									factory.createIdentifier('createDerived'),
									factory.createIdentifier(helpers.derived)
								)
							]
						: []),
					...(sawStateWrite
						? [
								factory.createImportSpecifier(
									false,
									factory.createIdentifier('writeReactiveLazy'),
									factory.createIdentifier(helpers.write)
								),
								factory.createImportSpecifier(
									false,
									factory.createIdentifier('updateReactiveValue'),
									factory.createIdentifier(helpers.update)
								),
								factory.createImportSpecifier(
									false,
									factory.createIdentifier('updateReactiveValueWithResult'),
									factory.createIdentifier(helpers.updateResult)
								),
								factory.createImportSpecifier(
									false,
									factory.createIdentifier('deleteReactiveValue'),
									factory.createIdentifier(helpers.remove)
								),
								factory.createImportSpecifier(
									false,
									factory.createIdentifier('mutateReactiveArray'),
									factory.createIdentifier(helpers.arrayMutation)
								)
							]
						: []),
					...(sawAbortOptions
						? [
								factory.createImportSpecifier(
									false,
									factory.createIdentifier('withAbortSignal'),
									factory.createIdentifier(helpers.abortOptions)
								)
							]
						: []),
					...[...taskResources].map((kind) => {
						const [imported, local] = taskResourceHelper(kind, helpers);
						return factory.createImportSpecifier(
							false,
							factory.createIdentifier(imported),
							factory.createIdentifier(local)
						);
					}),
					...(taskSignalModes.has('options')
						? [
								factory.createImportSpecifier(
									false,
									factory.createIdentifier('withTaskSignal'),
									factory.createIdentifier(helpers.taskOptionsSignal)
								)
							]
						: []),
					...(taskSignalModes.has('direct')
						? [
								factory.createImportSpecifier(
									false,
									factory.createIdentifier('combineTaskSignal'),
									factory.createIdentifier(helpers.taskCombinedSignal)
								)
							]
						: []),
					...(sawTaskAwait
						? [
								factory.createImportSpecifier(
									false,
									factory.createIdentifier('taskAwait'),
									factory.createIdentifier(helpers.taskAwait)
								)
							]
						: []),
					...(sawBoundary
						? [
								factory.createImportSpecifier(
									false,
									factory.createIdentifier('createServerBoundary'),
									factory.createIdentifier(helpers.boundary)
								)
							]
						: [])
				])
			),
			factory.createStringLiteral(helperModule)
		);

		return factory.updateSourceFile(
			visited,
			insertAfterDirectivePrologue(visited.statements, importDeclaration)
		);
	};
}

function transformImplicitLifecycleListener(
	node: ts.CallExpression,
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	helpers: HelperNames
): ts.Expression {
	const factory = context.factory;
	const signal = factory.createIdentifier(helpers.taskSignal);
	const args = node.arguments.map((argument) => ts.visitNode(argument, visitor) as ts.Expression);
	const options = args[2] ?? factory.createIdentifier('undefined');
	const managed = factory.createCallExpression(
		factory.createIdentifier(helpers.abortOptions),
		undefined,
		[options, signal]
	);
	const listener = factory.updateCallExpression(
		node,
		ts.visitNode(node.expression, visitor) as ts.Expression,
		node.typeArguments,
		args.length >= 3 ? [...args.slice(0, 2), managed, ...args.slice(3)] : [...args, managed]
	);
	const work = factory.createArrowFunction(
		undefined,
		undefined,
		[
			factory.createParameterDeclaration(
				undefined,
				undefined,
				factory.createObjectBindingPattern([
					factory.createBindingElement(undefined, factory.createIdentifier('signal'), signal)
				])
			)
		],
		undefined,
		factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
		listener
	);
	return factory.createCallExpression(
		factory.createPropertyAccessExpression(
			factory.createPropertyAccessExpression(factory.createThis(), 'task'),
			'client'
		),
		undefined,
		[work]
	);
}

function transformImplicitSetupTask(
	node: ts.CallExpression | ts.NewExpression,
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	helpers: HelperNames,
	markAbortOptions: () => void,
	resourceFor: (node: ts.Node) => ExpressionTaskResource | undefined,
	markResource: (kind: ExpressionTaskResourceKind) => void,
	markAwait: () => void,
	signalFor: (node: ts.Node) => ExpressionTaskSignalCall | undefined,
	markSignal: (mode: ExpressionTaskSignalCall['mode']) => void,
	setVisiting: (enter: boolean) => void
): ts.Expression {
	const factory = context.factory;
	setVisiting(true);
	let expression: ts.Expression;
	try {
		expression = ts.visitEachChild(node, visitor, context) as ts.Expression;
	} finally {
		setVisiting(false);
	}
	const work = factory.createArrowFunction(
		undefined,
		undefined,
		[],
		undefined,
		factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
		factory.createBlock([factory.createExpressionStatement(expression)], true)
	);
	const managed = transformTaskWork(
		work,
		0,
		context,
		helpers,
		markAbortOptions,
		resourceFor,
		markResource,
		markAwait,
		signalFor,
		markSignal
	);
	return factory.createCallExpression(
		factory.createPropertyAccessExpression(
			factory.createPropertyAccessExpression(factory.createThis(), 'task'),
			'client'
		),
		undefined,
		[managed]
	);
}

function parseTypeNode(source: string): ts.TypeNode {
	const file = ts.createSourceFile(
		'__exact_contextual_type.ts',
		`type __ExactContextualType = ${source};`,
		ts.ScriptTarget.Latest,
		false,
		ts.ScriptKind.TS
	);
	const declaration = file.statements[0];
	if (!declaration || !ts.isTypeAliasDeclaration(declaration))
		return ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword);
	return declaration.type;
}

function expressionWritePath(
	node: ts.Node,
	sourceFile: ts.SourceFile,
	plan?: ExpressionWritePlan
): readonly string[] | undefined {
	if (!plan || node.pos < 0 || node.end < 0) return undefined;
	return plan.sites.get(expressionEmissionId(node) ?? '')?.path;
}

function shouldOmitPlacement(placement: ExactPlacement, target: TransformTarget): boolean {
	if (target === 'default') return false;
	if (target === 'client') return placement === 'server';
	return placement === 'client';
}

function incompatibleEffect(
	effect: import('./types.js').ExactEnvironmentEffect,
	target: TransformTarget
): boolean {
	return target === 'client'
		? effect === 'server'
		: target === 'server'
			? effect === 'browser'
			: false;
}

function incompatibleSummary(
	summary: import('./types.js').ExactCallableSummaryIR,
	target: TransformTarget
): boolean {
	if (target === 'default') return false;
	return summary.artifactTargets.length > 0
		? !summary.artifactTargets.includes(target)
		: incompatibleEffect(summary.effect, target);
}

function transformJsxElement(
	sourceFile: ts.SourceFile,
	node: ts.JsxElement,
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	helpers: HelperNames,
	derivedReactiveLocals?: DerivedReactiveIndex,
	expressionJsx?: ExpressionJsxPlan
): ts.Expression {
	const opening = node.openingElement;
	const tagName = opening.tagName.getText();
	if (tagName === '_') {
		return callFragment(
			context,
			opening.attributes,
			node.children,
			visitor,
			helpers,
			sourceFile,
			derivedReactiveLocals
		);
	}

	return callElement(
		context,
		tagExpression(opening.tagName),
		opening.attributes,
		node.children,
		visitor,
		helpers,
		canonicalElementId(sourceFile, node, expressionJsx),
		sourceFile,
		derivedReactiveLocals,
		expressionJsx
	);
}

function transformJsxSelfClosingElement(
	sourceFile: ts.SourceFile,
	node: ts.JsxSelfClosingElement,
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	helpers: HelperNames,
	derivedReactiveLocals?: DerivedReactiveIndex,
	expressionJsx?: ExpressionJsxPlan
): ts.Expression {
	const tagName = node.tagName.getText();
	if (tagName === '_') {
		return callFragment(
			context,
			node.attributes,
			[],
			visitor,
			helpers,
			sourceFile,
			derivedReactiveLocals
		);
	}

	return callElement(
		context,
		tagExpression(node.tagName),
		node.attributes,
		[],
		visitor,
		helpers,
		canonicalElementId(sourceFile, node, expressionJsx),
		sourceFile,
		derivedReactiveLocals,
		expressionJsx
	);
}

function expressionElementId(
	sourceFile: ts.SourceFile,
	node: ts.Node,
	plan?: ExpressionJsxPlan
): string | undefined {
	return plan?.elements.get(expressionEmissionId(node) ?? '')?.exactId;
}

function canonicalElementId(
	sourceFile: ts.SourceFile,
	node: ts.Node,
	plan?: ExpressionJsxPlan
): string | undefined {
	const nodeId = expressionEmissionId(node);
	if (!nodeId)
		throw new Error(
			`Missing canonical expression identity for JSX emission in ${sourceFile.fileName}`
		);
	if (plan) return plan.elements.get(nodeId)?.exactId;
	return stableId(identityFilenameFor(sourceFile), 'element', nodeId);
}

function transformJsxFragment(
	node: ts.JsxFragment,
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	helpers: HelperNames,
	sourceFile?: ts.SourceFile,
	derivedReactiveLocals?: DerivedReactiveIndex,
	expressionJsx?: ExpressionJsxPlan
): ts.Expression {
	return callFragment(
		context,
		undefined,
		node.children,
		visitor,
		helpers,
		sourceFile,
		derivedReactiveLocals,
		expressionJsx
	);
}

function collectComponentLocalInfo(node: ts.FunctionDeclaration): ComponentLocalInfo {
	const functions = new Map<string, ts.Statement>();
	function visit(current: ts.Node): void {
		if (current !== node && ts.isFunctionDeclaration(current) && current.name) {
			functions.set(current.name.text, current);
			return;
		}
		if (current !== node && (ts.isFunctionLike(current) || ts.isClassLike(current))) return;
		if (ts.isVariableDeclaration(current)) {
			if (
				ts.isIdentifier(current.name) &&
				current.initializer &&
				isFunctionLikeExpression(current.initializer)
			) {
				functions.set(
					current.name.text,
					cloneableFunctionVariable(current.name, current.initializer)
				);
			}
		}
		ts.forEachChild(current, visit);
	}
	if (node.body) visit(node.body);
	return { functions };
}

/**
 * Materializes source expressions for variables whose reactive provenance was
 * established by @exact/expressions. The TypeScript nodes are retained only as
 * emission handles; deciding which declarations are derived is expression-owned.
 */
function collectExpressionDerivedLocals(
	sourceFile: ts.SourceFile,
	plan: ExpressionDerivedPlan
): DerivedReactiveIndex {
	const initializers = new Map<string, ts.Expression>();
	const requested = new Set([...plan.sites.values()].map((site) => site.initializerNodeId));
	function visit(current: ts.Node): void {
		if (ts.isVariableDeclaration(current) && current.initializer) {
			const key = expressionEmissionId(current.initializer);
			if (key && requested.has(key)) initializers.set(key, current.initializer);
		}
		ts.forEachChild(current, visit);
	}
	visit(sourceFile);
	const references = new Map<string, DerivedReactiveEntry>();
	const declarations = new Map<string, DerivedReactiveEntry>();
	for (const site of plan.sites.values()) {
		const initializer = initializers.get(site.initializerNodeId);
		if (initializer)
			references.set(site.nodeId, {
				variableId: site.variableId,
				initializer,
				cached: site.cached
			});
	}
	for (const declaration of plan.declarations.values()) {
		const initializer = initializers.get(declaration.initializerNodeId);
		if (initializer)
			declarations.set(declaration.nodeId, {
				variableId: declaration.variableId,
				initializer,
				cached: declaration.cached
			});
	}
	return { references, declarations };
}

function cloneableFunctionVariable(
	name: ts.Identifier,
	initializer: ts.Expression
): ts.VariableStatement {
	return ts.factory.createVariableStatement(
		undefined,
		ts.factory.createVariableDeclarationList(
			[ts.factory.createVariableDeclaration(name, undefined, undefined, initializer)],
			ts.NodeFlags.Const
		)
	);
}

function clientIslandCaptures(
	site: ExpressionClientIslandSite | undefined,
	locals: ComponentLocalInfo | undefined
): ClientIslandCaptures {
	if (!site) return { values: [], functions: [] };
	return {
		values: [...site.valueCaptures],
		functions: site.functionCaptures.flatMap((name) => {
			const declaration = locals?.functions.get(name);
			return declaration ? [declaration] : [];
		}),
		stateReads: [...site.stateReads]
	};
}

function createClientIslandBoundaryCall(
	sourceFile: ts.SourceFile,
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	helpers: HelperNames,
	componentName: string | undefined,
	islandCounts: Map<string, number>,
	attributes: ts.JsxAttributes,
	children?: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[],
	captures: ClientIslandCaptures = emptyClientIslandCaptures(),
	derivedReactiveLocals?: DerivedReactiveIndex,
	serverChildren?: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[]
): ts.Expression {
	const factory = context.factory;
	const owner = componentName ?? 'Anonymous';
	const next = (islandCounts.get(owner) ?? 0) + 1;
	islandCounts.set(owner, next);
	const generatedName = generatedComponentName(owner, 'client-island', next);
	const id = stableId(identityFilenameFor(sourceFile), owner, 'client-island', String(next));
	return factory.createCallExpression(factory.createIdentifier(helpers.boundary), undefined, [
		factory.createStringLiteral(id),
		factory.createStringLiteral(generatedName),
		islandProps(context, attributes, children, captures.values, captures.stateReads),
		...(serverChildren
			? childrenExpressions(
					context,
					serverChildren,
					visitor,
					helpers,
					sourceFile,
					derivedReactiveLocals
				)
			: [])
	]);
}

function recordClientIslandDefinition(
	sourceFile: ts.SourceFile,
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	helpers: HelperNames,
	componentName: string | undefined,
	islandCounts: Map<string, number>,
	node: ClientIslandElementNode,
	definitions: ts.FunctionDeclaration[],
	captures: ClientIslandCaptures = emptyClientIslandCaptures()
): void {
	const owner = componentName ?? 'Anonymous';
	const next = (islandCounts.get(owner) ?? 0) + 1;
	islandCounts.set(owner, next);
	definitions.push(
		createClientIslandDefinition(sourceFile, context, visitor, helpers, owner, next, node, captures)
	);
}

function createClientIslandDefinition(
	sourceFile: ts.SourceFile,
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	helpers: HelperNames,
	owner: string,
	index: number,
	node: ClientIslandElementNode,
	captures: ClientIslandCaptures
): ts.FunctionDeclaration {
	const factory = context.factory;
	const props = factory.createIdentifier('props');
	const generatedName = generatedComponentName(owner, 'client-island', index);
	const tagName = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
	const attributes = ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;
	const children = captures.serverSlotChildren
		? undefined
		: ts.isJsxElement(node)
			? node.children
			: [];
	return factory.createFunctionDeclaration(
		[factory.createModifier(ts.SyntaxKind.ExportKeyword)],
		undefined,
		factory.createIdentifier(generatedName),
		undefined,
		[
			factory.createParameterDeclaration(
				undefined,
				undefined,
				factory.createIdentifier('this'),
				undefined,
				factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)
			),
			factory.createParameterDeclaration(
				undefined,
				undefined,
				props,
				undefined,
				factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
				factory.createObjectLiteralExpression([], false)
			)
		],
		undefined,
		factory.createBlock(
			[
				...capturedFunctionDeclarations(context, captures.functions, props, captures.values),
				createClientIslandStateInit(factory, props),
				factory.createReturnStatement(
					factory.createArrowFunction(
						undefined,
						undefined,
						[],
						undefined,
						factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
						factory.createCallExpression(factory.createIdentifier(helpers.element), undefined, [
							tagExpression(tagName),
							clientIslandElementProps(
								sourceFile,
								context,
								tagName,
								attributes,
								node,
								props,
								captures.values
							),
							...clientIslandChildrenExpressions(
								context,
								children,
								visitor,
								helpers,
								props,
								captures.values,
								captures.serverSlotChildren
							)
						])
					)
				)
			],
			true
		)
	);
}

function createClientIslandStateInit(factory: ts.NodeFactory, props: ts.Identifier): ts.Statement {
	return factory.createIfStatement(
		factory.createPropertyAccessExpression(props, '__exactState'),
		factory.createExpressionStatement(
			factory.createCallExpression(
				factory.createPropertyAccessExpression(factory.createIdentifier('Object'), 'assign'),
				undefined,
				[
					factory.createPropertyAccessExpression(factory.createThis(), 'state'),
					factory.createPropertyAccessExpression(props, '__exactState')
				]
			)
		)
	);
}

function appendServerPartExportAliases(
	sourceFile: ts.SourceFile,
	transformed: ts.SourceFile,
	factory: ts.NodeFactory,
	islandCounts: Map<string, number>,
	componentPlacements: Map<string, ExactPlacement>,
	semanticGraph: ExactSemanticGraphIR
): ts.SourceFile {
	const exportedNames = collectExports(sourceFile, semanticGraph);
	const aliases: ts.ExportDeclaration[] = [];
	for (const [name, count] of [...islandCounts].sort(([left], [right]) =>
		left.localeCompare(right)
	)) {
		if (count <= 0) continue;
		if (!exportedNames.has(name)) continue;
		if (componentPlacements.get(name) === 'client') continue;
		aliases.push(
			factory.createExportDeclaration(
				undefined,
				false,
				factory.createNamedExports([
					factory.createExportSpecifier(
						false,
						factory.createIdentifier(name),
						factory.createIdentifier(generatedComponentName(name, 'server-part', 1))
					)
				]),
				undefined
			)
		);
	}
	return aliases.length
		? factory.updateSourceFile(transformed, [...transformed.statements, ...aliases])
		: transformed;
}

function clientIslandElementProps(
	sourceFile: ts.SourceFile,
	context: ts.TransformationContext,
	tagName: ts.JsxTagNameExpression,
	attributes: ts.JsxAttributes,
	node: ts.Node,
	props: ts.Identifier,
	captures: readonly string[]
): ts.ObjectLiteralExpression {
	const factory = context.factory;
	const properties: ts.ObjectLiteralElementLike[] = [];
	const exactId = jsxTagIsIntrinsicElement(tagName)
		? canonicalElementId(sourceFile, node)
		: undefined;
	if (exactId) {
		properties.push(
			factory.createPropertyAssignment(
				factory.createStringLiteral('data-exact-id'),
				factory.createStringLiteral(exactId)
			)
		);
	}
	for (const attribute of attributes.properties) {
		if (ts.isJsxSpreadAttribute(attribute)) {
			properties.push(factory.createSpreadAssignment(props));
			continue;
		}
		const name = attribute.name.getText(sourceFile);
		if (!attribute.initializer) {
			properties.push(
				factory.createPropertyAssignment(
					propName(name),
					factory.createPropertyAccessExpression(props, name)
				)
			);
			continue;
		}
		if (/^on[A-Z]/.test(name) || name === 'ref') {
			if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
				properties.push(
					factory.createPropertyAssignment(
						propName(name),
						rewriteCapturedNode(context, attribute.initializer.expression, props, captures)
					)
				);
			}
			continue;
		}
		properties.push(
			factory.createPropertyAssignment(
				propName(name),
				factory.createPropertyAccessExpression(props, name)
			)
		);
	}
	return factory.createObjectLiteralExpression(properties, false);
}

function clientIslandChildrenExpressions(
	context: ts.TransformationContext,
	children: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[] | undefined,
	visitor: ts.Visitor,
	helpers: HelperNames,
	props: ts.Identifier,
	captures: readonly string[],
	serverSlotChildren = false
): ts.Expression[] {
	if (serverSlotChildren) {
		return [context.factory.createPropertyAccessExpression(props, 'children')];
	}
	const rewritten = (children ?? []).map((child) =>
		rewriteCapturedNode(context, child, props, captures)
	);
	return childrenExpressions(context, rewritten, visitor, helpers);
}

function rewriteCapturedNode<T extends ts.Node>(
	context: ts.TransformationContext,
	node: T,
	props: ts.Identifier,
	captures: readonly string[]
): T {
	if (!captures.length) return node;
	const captureSet = new Set(captures);
	const visitor: ts.Visitor = (current) => {
		if (
			ts.isIdentifier(current) &&
			captureSet.has(current.text) &&
			!isIdentifierDeclarationName(current) &&
			!isPropertyAccessName(current)
		) {
			return context.factory.createPropertyAccessExpression(
				context.factory.createPropertyAccessExpression(props, '__exactCapture'),
				current.text
			);
		}
		return ts.visitEachChild(current, visitor, context);
	};
	return ts.visitNode(node, visitor) as T;
}

function capturedFunctionDeclarations(
	context: ts.TransformationContext,
	functions: readonly ts.Statement[],
	props: ts.Identifier,
	captures: readonly string[]
): ts.Statement[] {
	return functions.map((fn) => rewriteCapturedNode(context, fn, props, captures));
}

function emptyClientIslandCaptures(): ClientIslandCaptures {
	return { values: [], functions: [] };
}

function createComponentIslandBoundaryCall(
	sourceFile: ts.SourceFile,
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	helpers: HelperNames,
	componentInfo: Map<string, ExactImportedComponentIR>,
	node: ts.Node,
	tagName: ts.JsxTagNameExpression,
	attributes: ts.JsxAttributes,
	children?: ts.Expression,
	serverChildren?: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[]
): ts.Expression {
	const factory = context.factory;
	const componentName = componentBoundaryName(tagName, componentInfo, sourceFile);
	const nodeId = expressionEmissionId(node);
	if (!nodeId)
		throw new Error(
			`Missing canonical expression identity for component boundary emission in ${sourceFile.fileName}`
		);
	const id = clientComponentBoundaryId(sourceFile.fileName, componentName, nodeId);
	const props = islandProps(context, attributes);
	return factory.createCallExpression(factory.createIdentifier(helpers.boundary), undefined, [
		factory.createStringLiteral(id),
		factory.createStringLiteral(componentName),
		children === undefined ? props : appendObjectProperty(context, props, 'children', children),
		...(serverChildren ? childrenExpressions(context, serverChildren, visitor, helpers) : [])
	]);
}

function createClientComponentServerStub(
	sourceFile: ts.SourceFile,
	context: ts.TransformationContext,
	helpers: HelperNames,
	node: ts.FunctionDeclaration
): ts.FunctionDeclaration {
	const factory = context.factory;
	const componentName = node.name!.text;
	const props = factory.createIdentifier('props');
	const id = stableId(identityFilenameFor(sourceFile), componentName, 'component-island');
	return factory.updateFunctionDeclaration(
		node,
		node.modifiers,
		node.asteriskToken,
		node.name,
		undefined,
		[
			factory.createParameterDeclaration(
				undefined,
				undefined,
				props,
				undefined,
				undefined,
				factory.createObjectLiteralExpression([], false)
			)
		],
		undefined,
		factory.createBlock(
			[
				factory.createReturnStatement(
					factory.createArrowFunction(
						undefined,
						undefined,
						[],
						undefined,
						factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
						factory.createCallExpression(factory.createIdentifier(helpers.boundary), undefined, [
							factory.createStringLiteral(id),
							factory.createStringLiteral(componentName),
							props
						])
					)
				)
			],
			true
		)
	);
}

function islandProps(
	context: ts.TransformationContext,
	attributes: ts.JsxAttributes,
	children?: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[],
	captures: readonly string[] = [],
	plannedStateReads: readonly string[] = []
): ts.ObjectLiteralExpression {
	const props: ts.ObjectLiteralElementLike[] = [];
	const factory = context.factory;
	if (plannedStateReads.length) {
		props.push(
			factory.createPropertyAssignment(
				factory.createStringLiteral('__exactState'),
				stateSnapshotObject(factory, plannedStateReads)
			)
		);
	}
	if (captures.length) {
		props.push(
			factory.createPropertyAssignment(
				factory.createStringLiteral('__exactCapture'),
				factory.createObjectLiteralExpression(
					captures.map((name) =>
						factory.createPropertyAssignment(propName(name), factory.createIdentifier(name))
					),
					false
				)
			)
		);
	}
	for (const attribute of attributes.properties) {
		if (ts.isJsxSpreadAttribute(attribute)) {
			props.push(factory.createSpreadAssignment(attribute.expression));
			continue;
		}
		const name = attribute.name.getText();
		if (/^on[A-Z]/.test(name) || name === 'ref') continue;
		if (!attribute.initializer) {
			props.push(factory.createPropertyAssignment(propName(name), factory.createTrue()));
			continue;
		}
		if (ts.isStringLiteral(attribute.initializer)) {
			props.push(
				factory.createPropertyAssignment(
					propName(name),
					factory.createStringLiteral(attribute.initializer.text)
				)
			);
			continue;
		}
		if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
			const expression = attribute.initializer.expression;
			props.push(factory.createPropertyAssignment(propName(name), expression));
		}
	}
	return factory.createObjectLiteralExpression(props, false);
}

function stateSnapshotObject(
	factory: ts.NodeFactory,
	paths: readonly string[]
): ts.ObjectLiteralExpression {
	const root: StateSnapshotTree = new Map();
	for (const path of paths) {
		let cursor = root;
		const segments = path.split('.');
		for (const segment of segments.slice(0, -1)) {
			if (!cursor.has(segment)) cursor.set(segment, new Map());
			const next = cursor.get(segment);
			if (!(next instanceof Map)) break;
			cursor = next;
		}
		cursor.set(segments[segments.length - 1]!, stateAccessExpression(factory, segments));
	}
	return mapToObjectLiteral(factory, root);
}

function mapToObjectLiteral(
	factory: ts.NodeFactory,
	map: StateSnapshotTree
): ts.ObjectLiteralExpression {
	return factory.createObjectLiteralExpression(
		[...map.entries()].map(([name, value]) =>
			factory.createPropertyAssignment(
				propName(name),
				value instanceof Map ? mapToObjectLiteral(factory, value) : value
			)
		),
		false
	);
}

function appendObjectProperty(
	context: ts.TransformationContext,
	object: ts.ObjectLiteralExpression,
	name: string,
	value: ts.Expression
): ts.ObjectLiteralExpression {
	return context.factory.updateObjectLiteralExpression(object, [
		...object.properties,
		context.factory.createPropertyAssignment(propName(name), value)
	]);
}

function stateAccessExpression(
	factory: ts.NodeFactory,
	segments: readonly string[]
): ts.Expression {
	let expression: ts.Expression = factory.createPropertyAccessExpression(
		factory.createThis(),
		'state'
	);
	for (const segment of segments) {
		expression = isIdentifierText(segment)
			? factory.createPropertyAccessExpression(expression, segment)
			: factory.createElementAccessExpression(expression, factory.createStringLiteral(segment));
	}
	return expression;
}

function isIdentifierText(value: string): boolean {
	return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);
}

function callElement(
	context: ts.TransformationContext,
	tag: ts.Expression,
	attributes: ts.JsxAttributes | undefined,
	children: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[],
	visitor: ts.Visitor,
	helpers: HelperNames,
	exactId?: string,
	sourceFile?: ts.SourceFile,
	derivedReactiveLocals?: DerivedReactiveIndex,
	expressionJsx?: ExpressionJsxPlan
): ts.Expression {
	return context.factory.createCallExpression(
		context.factory.createIdentifier(helpers.element),
		undefined,
		[
			tag,
			propsObject(
				context,
				attributes,
				visitor,
				helpers,
				exactId,
				sourceFile,
				derivedReactiveLocals,
				expressionJsx
			),
			...childrenExpressions(
				context,
				children,
				visitor,
				helpers,
				sourceFile,
				derivedReactiveLocals,
				expressionJsx
			)
		]
	);
}

function callFragment(
	context: ts.TransformationContext,
	attributes: ts.JsxAttributes | undefined,
	children: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[],
	visitor: ts.Visitor,
	helpers: HelperNames,
	sourceFile?: ts.SourceFile,
	derivedReactiveLocals?: DerivedReactiveIndex,
	expressionJsx?: ExpressionJsxPlan
): ts.Expression {
	return context.factory.createCallExpression(
		context.factory.createIdentifier(helpers.fragment),
		undefined,
		[
			propsObject(
				context,
				attributes,
				visitor,
				helpers,
				undefined,
				sourceFile,
				derivedReactiveLocals,
				expressionJsx
			),
			...childrenExpressions(
				context,
				children,
				visitor,
				helpers,
				sourceFile,
				derivedReactiveLocals,
				expressionJsx
			)
		]
	);
}

function propsObject(
	context: ts.TransformationContext,
	attributes: ts.JsxAttributes | undefined,
	visitor: ts.Visitor,
	helpers: HelperNames,
	exactId?: string,
	sourceFile?: ts.SourceFile,
	derivedReactiveLocals?: DerivedReactiveIndex,
	expressionJsx?: ExpressionJsxPlan
): ts.Expression {
	const factory = context.factory;
	const properties: ts.ObjectLiteralElementLike[] = [];
	if (exactId) {
		properties.push(
			factory.createPropertyAssignment(
				factory.createStringLiteral('data-exact-id'),
				factory.createStringLiteral(exactId)
			)
		);
	}

	for (const property of attributes?.properties ?? []) {
		if (ts.isJsxSpreadAttribute(property)) {
			properties.push(
				factory.createSpreadAssignment(ts.visitNode(property.expression, visitor) as ts.Expression)
			);
			continue;
		}

		const name = property.name.getText();
		if (!property.initializer) {
			properties.push(factory.createPropertyAssignment(propName(name), factory.createTrue()));
			continue;
		}

		if (ts.isStringLiteral(property.initializer)) {
			properties.push(factory.createPropertyAssignment(propName(name), property.initializer));
			continue;
		}

		if (ts.isJsxExpression(property.initializer)) {
			const expression = property.initializer.expression;
			if (!expression) continue;
			const plannedCell = isPlannedJsxCell(
				property.initializer,
				'jsx-attribute',
				sourceFile,
				expressionJsx
			);
			properties.push(
				factory.createPropertyAssignment(
					propName(name),
					shouldWrapAttribute(name, expression) && plannedCell
						? wrapExpression(
								context,
								expression,
								visitor,
								helpers,
								sourceFile,
								derivedReactiveLocals
							)
						: (ts.visitNode(expression, visitor) as ts.Expression)
				)
			);
		}
	}

	return factory.createObjectLiteralExpression(properties, false);
}

function propName(name: string): ts.PropertyName {
	return /^[$A-Z_a-z][$\w]*$/.test(name)
		? ts.factory.createIdentifier(name)
		: ts.factory.createStringLiteral(name);
}

function childrenExpressions(
	context: ts.TransformationContext,
	children: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[],
	visitor: ts.Visitor,
	helpers: HelperNames,
	sourceFile?: ts.SourceFile,
	derivedReactiveLocals?: DerivedReactiveIndex,
	expressionJsx?: ExpressionJsxPlan
): ts.Expression[] {
	const output: ts.Expression[] = [];

	for (const child of children) {
		if (ts.isJsxText(child)) {
			const text = child.text.replace(/\s+/g, ' ');
			if (text.trim()) output.push(context.factory.createStringLiteral(text));
			continue;
		}

		if (ts.isJsxExpression(child)) {
			if (child.expression)
				output.push(
					isPlannedJsxCell(child, 'jsx-child', sourceFile, expressionJsx)
						? wrapDynamicChild(
								context,
								child.expression,
								visitor,
								helpers,
								sourceFile,
								derivedReactiveLocals
							)
						: (ts.visitNode(child.expression, visitor) as ts.Expression)
				);
			continue;
		}

		output.push(ts.visitNode(child, visitor) as ts.Expression);
	}

	return output;
}

function isPlannedJsxCell(
	node: ts.JsxExpression,
	kind: 'jsx-child' | 'jsx-attribute',
	sourceFile?: ts.SourceFile,
	plan?: ExpressionJsxPlan
): boolean {
	if (!plan || !sourceFile) return true;
	return plan.cells.get(expressionEmissionId(node) ?? '')?.kind === kind;
}

function shouldWrapAttribute(name: string, expression: ts.Expression): boolean {
	if (name === 'key') return false;
	if (name === 'ref') return false;
	if (/^on[A-Z]/.test(name)) return false;
	if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) return false;
	return true;
}

function wrapDynamicChild(
	context: ts.TransformationContext,
	expression: ts.Expression,
	visitor: ts.Visitor,
	helpers: HelperNames,
	sourceFile?: ts.SourceFile,
	derivedReactiveLocals?: DerivedReactiveIndex
): ts.Expression {
	const factory = context.factory;
	return factory.createCallExpression(factory.createIdentifier(helpers.dynamic), undefined, [
		factory.createArrowFunction(
			undefined,
			undefined,
			[],
			undefined,
			factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
			visitReactiveSinkExpression(context, expression, visitor, sourceFile, derivedReactiveLocals)
		)
	]);
}

function wrapExpression(
	context: ts.TransformationContext,
	expression: ts.Expression,
	visitor: ts.Visitor,
	helpers: HelperNames,
	sourceFile?: ts.SourceFile,
	derivedReactiveLocals?: DerivedReactiveIndex
): ts.Expression {
	const factory = context.factory;
	return factory.createCallExpression(factory.createIdentifier(helpers.expression), undefined, [
		factory.createArrowFunction(
			undefined,
			undefined,
			[],
			undefined,
			factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
			visitReactiveSinkExpression(context, expression, visitor, sourceFile, derivedReactiveLocals)
		)
	]);
}

function visitReactiveSinkExpression(
	context: ts.TransformationContext,
	expression: ts.Expression,
	visitor: ts.Visitor,
	sourceFile?: ts.SourceFile,
	derivedReactiveLocals?: DerivedReactiveIndex
): ts.Expression {
	const rewritten =
		sourceFile && derivedReactiveLocals?.references.size
			? rewriteDerivedReactiveExpression(context, expression, sourceFile, derivedReactiveLocals)
			: expression;
	return ts.visitNode(rewritten, visitor) as ts.Expression;
}

function rewriteDerivedReactiveExpression(
	context: ts.TransformationContext,
	expression: ts.Expression,
	sourceFile: ts.SourceFile,
	derivedReactiveLocals: DerivedReactiveIndex,
	active = new Set<string>()
): ts.Expression {
	const visitor: ts.Visitor = (node) => {
		if (ts.isCallExpression(node) && (isThisMethodCall(node, 'map') || isThisTaskCall(node))) {
			const preserved = isThisMethodCall(node, 'map')
				? new Set([0])
				: new Set(node.arguments.map((_, index) => index).slice(0, -1));
			return context.factory.updateCallExpression(
				node,
				ts.visitNode(node.expression, visitor) as ts.Expression,
				node.typeArguments,
				node.arguments.map((argument, index) =>
					preserved.has(index) ? argument : (ts.visitNode(argument, visitor) as ts.Expression)
				)
			);
		}
		if (ts.isShorthandPropertyAssignment(node)) {
			const derived = derivedReactiveLocals.references.get(expressionEmissionId(node.name) ?? '');
			if (derived?.cached) {
				return context.factory.createPropertyAssignment(
					context.factory.createIdentifier(node.name.text),
					context.factory.createCallExpression(
						context.factory.createPropertyAccessExpression(
							context.factory.createIdentifier(node.name.text),
							'get'
						),
						undefined,
						[]
					)
				);
			}
		}
		if (
			ts.isIdentifier(node) &&
			!isIdentifierDeclarationName(node) &&
			!isPropertyAccessName(node)
		) {
			const derived = derivedReactiveLocals.references.get(expressionEmissionId(node) ?? '');
			if (derived && !active.has(derived.variableId)) {
				if (derived.cached) {
					return context.factory.createCallExpression(
						context.factory.createPropertyAccessExpression(
							context.factory.createIdentifier(node.text),
							'get'
						),
						undefined,
						[]
					);
				}
				active.add(derived.variableId);
				const rewritten = rewriteDerivedReactiveExpression(
					context,
					derived.initializer,
					sourceFile,
					derivedReactiveLocals,
					active
				);
				active.delete(derived.variableId);
				return context.factory.createParenthesizedExpression(rewritten);
			}
		}
		return ts.visitEachChild(node, visitor, context);
	};
	return ts.visitNode(expression, visitor) as ts.Expression;
}

function tagExpression(tagName: ts.JsxTagNameExpression): ts.Expression {
	if (ts.isIdentifier(tagName)) {
		const text = tagName.text;
		return /^[a-z]/.test(text)
			? ts.factory.createStringLiteral(text)
			: ts.factory.createIdentifier(text);
	}

	if (ts.isPropertyAccessExpression(tagName)) {
		return ts.factory.createPropertyAccessExpression(
			tagExpression(tagName.expression as ts.JsxTagNameExpression),
			tagName.name
		);
	}

	return ts.factory.createStringLiteral(tagName.getText());
}

function transformCapturedCall(
	sourceFile: ts.SourceFile,
	node: ts.CallExpression,
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	derivedReactiveLocals?: DerivedReactiveIndex,
	helpers?: HelperNames,
	markAbortOptions?: () => void,
	resourceFor?: (node: ts.Node) => ExpressionTaskResource | undefined,
	markResource?: (kind: ExpressionTaskResourceKind) => void,
	markAwait?: () => void,
	signalFor?: (node: ts.Node) => ExpressionTaskSignalCall | undefined,
	markSignal?: (mode: ExpressionTaskSignalCall['mode']) => void
): ts.Expression {
	if (isThisMethodCall(node, 'reactive')) {
		return transformReactiveCall(sourceFile, node, context, visitor, derivedReactiveLocals);
	}

	if (isThisTaskCall(node)) {
		return transformTaskCall(
			sourceFile,
			node,
			context,
			visitor,
			derivedReactiveLocals,
			helpers,
			markAbortOptions,
			resourceFor,
			markResource,
			markAwait,
			signalFor,
			markSignal
		);
	}

	if (isThisMethodCall(node, 'map')) {
		return transformMapCall(sourceFile, node, context, visitor, derivedReactiveLocals);
	}

	return ts.visitEachChild(node, visitor, context);
}

function transformReactiveTaggedTemplate(
	node: ts.TaggedTemplateExpression,
	context: ts.TransformationContext,
	visitor: ts.Visitor
): ts.Expression {
	if (!isThisMethodAccess(node.tag, 'reactive')) {
		return ts.visitEachChild(node, visitor, context);
	}

	return context.factory.createCallExpression(
		ts.visitNode(node.tag, visitor) as ts.Expression,
		node.typeArguments,
		[captureArgument(context, templateToExpression(node.template), visitor)]
	);
}

function transformReactiveCall(
	sourceFile: ts.SourceFile,
	node: ts.CallExpression,
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	derivedReactiveLocals?: DerivedReactiveIndex
): ts.Expression {
	if (node.arguments.length !== 1) return ts.visitEachChild(node, visitor, context);
	const [argument] = node.arguments;
	if (!argument || isFunctionLikeExpression(argument))
		return ts.visitEachChild(node, visitor, context);

	return context.factory.updateCallExpression(
		node,
		ts.visitNode(node.expression, visitor) as ts.Expression,
		node.typeArguments,
		[captureArgument(context, argument, visitor, sourceFile, derivedReactiveLocals)]
	);
}

function transformTaskCall(
	sourceFile: ts.SourceFile,
	node: ts.CallExpression,
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	derivedReactiveLocals?: DerivedReactiveIndex,
	helpers?: HelperNames,
	markAbortOptions?: () => void,
	resourceFor?: (node: ts.Node) => ExpressionTaskResource | undefined,
	markResource?: (kind: ExpressionTaskResourceKind) => void,
	markAwait?: () => void,
	signalFor?: (node: ts.Node) => ExpressionTaskSignalCall | undefined,
	markSignal?: (mode: ExpressionTaskSignalCall['mode']) => void
): ts.Expression {
	if (node.arguments.length < 1) return ts.visitEachChild(node, visitor, context);
	const work = node.arguments[node.arguments.length - 1]!;
	if (!isFunctionLikeExpression(work)) return ts.visitEachChild(node, visitor, context);
	const visitedWork = ts.visitNode(work, visitor) as ts.ArrowFunction | ts.FunctionExpression;
	const transformedWork = helpers
		? transformTaskWork(
				visitedWork,
				node.arguments.length - 1,
				context,
				helpers,
				markAbortOptions ?? (() => {}),
				resourceFor ?? (() => undefined),
				markResource ?? (() => {}),
				markAwait ?? (() => {}),
				signalFor ?? (() => undefined),
				markSignal ?? (() => {})
			)
		: visitedWork;

	const nextArguments = node.arguments.map((argument, index) => {
		if (index === node.arguments.length - 1) return transformedWork;
		if (isFunctionLikeExpression(argument)) {
			return ts.visitNode(argument, visitor) as ts.Expression;
		}
		const derived = ts.isIdentifier(argument)
			? derivedReactiveLocals?.references.get(expressionEmissionId(argument) ?? '')
			: undefined;
		if (derived?.cached) return argument;
		return context.factory.createCallExpression(
			context.factory.createPropertyAccessExpression(context.factory.createThis(), 'reactive'),
			undefined,
			[captureArgument(context, argument, visitor, sourceFile, derivedReactiveLocals)]
		);
	});

	return context.factory.updateCallExpression(
		node,
		ts.visitNode(node.expression, visitor) as ts.Expression,
		node.typeArguments,
		nextArguments
	);
}

function transformTaskWork(
	work: ts.ArrowFunction | ts.FunctionExpression,
	dependencyCount: number,
	context: ts.TransformationContext,
	helpers: HelperNames,
	markAbortOptions: () => void,
	resourceFor: (node: ts.Node) => ExpressionTaskResource | undefined,
	markResource: (kind: ExpressionTaskResourceKind) => void,
	markAwait: () => void,
	signalFor: (node: ts.Node) => ExpressionTaskSignalCall | undefined,
	markSignal: (mode: ExpressionTaskSignalCall['mode']) => void
): ts.Expression {
	if (!containsManagedTaskWork(work, resourceFor, signalFor)) return work;
	const factory = context.factory;
	const parameters = [...work.parameters];
	let signal: ts.Expression;
	const contextParameter =
		parameters.length > dependencyCount ? parameters[parameters.length - 1] : undefined;
	if (contextParameter && ts.isIdentifier(contextParameter.name)) {
		signal = factory.createPropertyAccessExpression(contextParameter.name, 'signal');
	} else if (contextParameter && ts.isObjectBindingPattern(contextParameter.name)) {
		const binding = contextParameter.name.elements.find((element) => {
			const property = element.propertyName;
			return property && ts.isIdentifier(property)
				? property.text === 'signal'
				: ts.isIdentifier(element.name) && element.name.text === 'signal';
		});
		if (binding && ts.isIdentifier(binding.name)) {
			signal = binding.name;
		} else {
			const local = factory.createIdentifier(helpers.taskSignal);
			const pattern = factory.updateObjectBindingPattern(contextParameter.name, [
				...contextParameter.name.elements,
				factory.createBindingElement(undefined, factory.createIdentifier('signal'), local)
			]);
			parameters[parameters.length - 1] = factory.updateParameterDeclaration(
				contextParameter,
				contextParameter.modifiers,
				contextParameter.dotDotDotToken,
				pattern,
				contextParameter.questionToken,
				contextParameter.type,
				contextParameter.initializer
			);
			signal = local;
		}
	} else {
		const local = factory.createIdentifier(helpers.taskSignal);
		parameters.push(
			factory.createParameterDeclaration(
				undefined,
				undefined,
				factory.createObjectBindingPattern([
					factory.createBindingElement(undefined, factory.createIdentifier('signal'), local)
				])
			)
		);
		signal = local;
	}

	const taskVisitor: ts.Visitor = (current) => {
		if (ts.isAwaitExpression(current)) {
			markAwait();
			return factory.updateAwaitExpression(
				current,
				factory.createCallExpression(factory.createIdentifier(helpers.taskAwait), undefined, [
					signal,
					ts.visitNode(current.expression, taskVisitor) as ts.Expression
				])
			);
		}
		const resource = resourceFor(current);
		if (resource) {
			markResource(resource.kind);
			if (
				resource.kind === 'owned' &&
				(ts.isCallExpression(current) || ts.isNewExpression(current))
			) {
				const value = ts.visitEachChild(current, taskVisitor, context) as ts.Expression;
				return factory.createCallExpression(
					factory.createIdentifier(helpers.taskResource),
					undefined,
					[
						signal,
						value,
						...(resource.disposal ? [factory.createStringLiteral(resource.disposal)] : [])
					]
				);
			}
			if (resource.kind === 'observer' && ts.isNewExpression(current)) {
				const observer = factory.updateNewExpression(
					current,
					current.expression,
					current.typeArguments,
					current.arguments?.map((argument) => ts.visitNode(argument, taskVisitor) as ts.Expression)
				);
				return factory.createCallExpression(
					factory.createIdentifier(helpers.taskObserver),
					undefined,
					[signal, observer]
				);
			}
			if (ts.isCallExpression(current)) {
				const args = current.arguments.map(
					(argument) => ts.visitNode(argument, taskVisitor) as ts.Expression
				);
				const helper = taskResourceHelper(resource.kind, helpers)[1];
				const managedArgs =
					resource.kind === 'fetch'
						? [signal, ts.visitNode(current.expression, taskVisitor) as ts.Expression, ...args]
						: [signal, ...args];
				return factory.createCallExpression(
					factory.createIdentifier(helper),
					current.typeArguments,
					managedArgs
				);
			}
		}
		const signalCall = signalFor(current);
		if (signalCall && ts.isCallExpression(current)) {
			if (signalCall.eventOptions) {
				markAbortOptions();
				const args = current.arguments.map(
					(argument) => ts.visitNode(argument, taskVisitor) as ts.Expression
				);
				while (args.length < signalCall.parameter) args.push(factory.createIdentifier('undefined'));
				args[signalCall.parameter] = factory.createCallExpression(
					factory.createIdentifier(helpers.abortOptions),
					undefined,
					[args[signalCall.parameter] ?? factory.createIdentifier('undefined'), signal]
				);
				return factory.updateCallExpression(
					current,
					ts.visitNode(current.expression, taskVisitor) as ts.Expression,
					current.typeArguments,
					args
				);
			}
			markSignal(signalCall.mode);
			const args = current.arguments.map(
				(argument) => ts.visitNode(argument, taskVisitor) as ts.Expression
			);
			while (args.length < signalCall.parameter) args.push(factory.createIdentifier('undefined'));
			const existing = args[signalCall.parameter];
			args[signalCall.parameter] =
				signalCall.mode === 'options'
					? factory.createCallExpression(
							factory.createIdentifier(helpers.taskOptionsSignal),
							undefined,
							[existing ?? factory.createIdentifier('undefined'), signal]
						)
					: factory.createCallExpression(
							factory.createIdentifier(helpers.taskCombinedSignal),
							undefined,
							[signal, ...(existing ? [existing] : [])]
						);
			return factory.updateCallExpression(
				current,
				ts.visitNode(current.expression, taskVisitor) as ts.Expression,
				current.typeArguments,
				args
			);
		}
		return ts.visitEachChild(current, taskVisitor, context);
	};
	const body = ts.visitNode(work.body, taskVisitor) as ts.ConciseBody;
	if (ts.isArrowFunction(work)) {
		return factory.updateArrowFunction(
			work,
			work.modifiers,
			work.typeParameters,
			parameters,
			work.type,
			work.equalsGreaterThanToken,
			body
		);
	}
	return factory.updateFunctionExpression(
		work,
		work.modifiers,
		work.asteriskToken,
		work.name,
		work.typeParameters,
		parameters,
		work.type,
		body as ts.Block
	);
}

function containsManagedTaskWork(
	node: ts.Node,
	resourceFor: (node: ts.Node) => ExpressionTaskResource | undefined,
	signalFor: (node: ts.Node) => ExpressionTaskSignalCall | undefined
): boolean {
	let found = false;
	const visit = (current: ts.Node): void => {
		if (found) return;
		if (ts.isAwaitExpression(current) || resourceFor(current) || signalFor(current)) {
			found = true;
			return;
		}
		ts.forEachChild(current, visit);
	};
	visit(node);
	return found;
}

function containsGlobalAddEventListener(node: ts.Node): boolean {
	let found = false;
	const visit = (current: ts.Node): void => {
		if (found) return;
		if (ts.isCallExpression(current) && isGlobalAddEventListener(current)) {
			found = true;
			return;
		}
		ts.forEachChild(current, visit);
	};
	visit(node);
	return found;
}

function isGlobalAddEventListener(node: ts.CallExpression): boolean {
	return (
		ts.isPropertyAccessExpression(node.expression) &&
		node.expression.name.text === 'addEventListener' &&
		ts.isIdentifier(node.expression.expression) &&
		['window', 'document', 'globalThis'].includes(node.expression.expression.text)
	);
}

function taskResourceHelper(
	kind: ExpressionTaskResourceKind,
	helpers: HelperNames
): readonly [string, string] {
	if (kind === 'timeout') return ['taskTimeout', helpers.taskTimeout];
	if (kind === 'interval') return ['taskInterval', helpers.taskInterval];
	if (kind === 'animation-frame') return ['taskAnimationFrame', helpers.taskAnimationFrame];
	if (kind === 'idle-callback') return ['taskIdleCallback', helpers.taskIdleCallback];
	if (kind === 'observer') return ['taskObserver', helpers.taskObserver];
	if (kind === 'owned') return ['ownTaskResource', helpers.taskResource];
	return ['taskFetch', helpers.taskFetch];
}

function transformMapCall(
	sourceFile: ts.SourceFile,
	node: ts.CallExpression,
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	derivedReactiveLocals?: DerivedReactiveIndex,
	identityOverride?: string
): ts.Expression {
	if (node.arguments.length !== 3) return ts.visitEachChild(node, visitor, context);
	const nodeId = identityOverride ?? expressionEmissionId(node);
	if (!nodeId)
		throw new Error(
			`Missing canonical expression identity for this.map() emission in ${sourceFile.fileName}`
		);
	const id = stableId(identityFilenameFor(sourceFile), 'list', nodeId);
	const source = node.arguments[0]!;
	// Reactive sinks are rewritten before their nested calls are visited.  A
	// derived local therefore reaches this transform either as its identifier
	// (when used directly) or as its already-expanded collection expression.
	// Handle both forms so `const visible = tasks.filter(...); this.map(visible)`
	// remains a live list instead of becoming a one-time array snapshot.
	const sourceDerived = ts.isIdentifier(source)
		? derivedReactiveLocals?.references.get(expressionEmissionId(source) ?? '')
		: undefined;
	const initializer = sourceDerived?.initializer;
	const derivedCollection =
		initializer ?? (isDerivedCollectionExpression(source) ? source : undefined);
	const provenance = derivedCollection ? derivedCollectionSource(derivedCollection) : undefined;
	const keyIdentity = keyExtractorIdentity(node.arguments[1]!);
	const collection = sourceDerived?.cached
		? source
		: derivedCollection
			? context.factory.createCallExpression(
					context.factory.createPropertyAccessExpression(context.factory.createThis(), 'reactive'),
					undefined,
					[captureArgument(context, derivedCollection, visitor, sourceFile, derivedReactiveLocals)]
				)
			: (ts.visitNode(source, visitor) as ts.Expression);
	return context.factory.updateCallExpression(
		node,
		ts.visitNode(node.expression, visitor) as ts.Expression,
		node.typeArguments,
		[
			collection,
			...node.arguments
				.slice(1)
				.map((argument) => ts.visitNode(argument, visitor) as ts.Expression),
			context.factory.createStringLiteral(id),
			...(provenance || keyIdentity
				? [
						provenance
							? (ts.visitNode(provenance, visitor) as ts.Expression)
							: context.factory.createIdentifier('undefined')
					]
				: []),
			...(keyIdentity ? [context.factory.createStringLiteral(keyIdentity)] : [])
		]
	);
}

function transformAnnotatedMapCall(
	sourceFile: ts.SourceFile,
	node: ts.CallExpression,
	list: ExpressionJsxListSite,
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	derivedReactiveLocals?: DerivedReactiveIndex
): ts.Expression {
	const factory = context.factory;
	const item = factory.createUniqueName('__exactItem');
	const keyBody = list.primitive
		? item
		: list.method
			? factory.createCallExpression(
					factory.createPropertyAccessExpression(item, list.member!),
					undefined,
					[]
				)
			: factory.createPropertyAccessExpression(item, list.member!);
	const keyed = factory.createCallExpression(
		factory.createPropertyAccessExpression(factory.createThis(), 'map'),
		undefined,
		[
			(node.expression as ts.PropertyAccessExpression).expression,
			factory.createArrowFunction(
				undefined,
				undefined,
				[factory.createParameterDeclaration(undefined, undefined, item)],
				undefined,
				factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
				keyBody
			),
			node.arguments[0]!
		]
	);
	return transformMapCall(sourceFile, keyed, context, visitor, derivedReactiveLocals, list.nodeId);
}

function keyExtractorIdentity(expression: ts.Expression): string | undefined {
	if (!isFunctionLikeExpression(expression) || expression.parameters.length !== 1) return undefined;
	const parameter = expression.parameters[0]!.name;
	if (!ts.isIdentifier(parameter)) return undefined;
	let body: ts.Expression | undefined;
	if (ts.isBlock(expression.body)) {
		const returns = expression.body.statements.filter(ts.isReturnStatement);
		if (returns.length !== 1) return undefined;
		body = returns[0]!.expression;
	} else {
		body = expression.body;
	}
	if (!body) return undefined;
	const segments: string[] = [];
	let current = withoutParentheses(body);
	while (ts.isPropertyAccessExpression(current)) {
		segments.unshift(current.name.text);
		current = withoutParentheses(current.expression);
	}
	if (!ts.isIdentifier(current) || current.text !== parameter.text || !segments.length)
		return undefined;
	return `member:${segments.join('.')}`;
}

function isDerivedCollectionExpression(expression: ts.Expression): boolean {
	const current = withoutParentheses(expression);
	return (
		ts.isCallExpression(current) &&
		ts.isPropertyAccessExpression(current.expression) &&
		['filter', 'map', 'flatMap', 'slice', 'concat', 'toSorted', 'toReversed', 'toSpliced'].includes(
			current.expression.name.text
		)
	);
}

function derivedCollectionSource(expression: ts.Expression): ts.Expression | undefined {
	let current = withoutParentheses(expression);
	while (
		ts.isCallExpression(current) &&
		ts.isPropertyAccessExpression(current.expression) &&
		['filter', 'map', 'flatMap', 'slice', 'concat', 'toSorted', 'toReversed', 'toSpliced'].includes(
			current.expression.name.text
		)
	) {
		current = withoutParentheses(current.expression.expression);
	}
	if (!ts.isPropertyAccessExpression(current)) return undefined;
	if (
		ts.isPropertyAccessExpression(current.expression) &&
		current.expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
		current.expression.name.text === 'state'
	)
		return current;
	// Component props preserve the parent collection identity; registering the
	// key against this value reaches the same raw reactive array at runtime.
	return ts.isIdentifier(current.expression) && current.expression.text === 'props'
		? current
		: undefined;
}

function withoutParentheses(expression: ts.Expression): ts.Expression {
	let current = expression;
	while (ts.isParenthesizedExpression(current)) current = current.expression;
	return current;
}

function captureArgument(
	context: ts.TransformationContext,
	expression: ts.Expression,
	visitor: ts.Visitor,
	sourceFile?: ts.SourceFile,
	derivedReactiveLocals?: DerivedReactiveIndex
): ts.ArrowFunction {
	return context.factory.createArrowFunction(
		undefined,
		undefined,
		[],
		undefined,
		context.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
		visitReactiveSinkExpression(context, expression, visitor, sourceFile, derivedReactiveLocals)
	);
}

function templateToExpression(template: ts.TemplateLiteral): ts.Expression {
	if (ts.isNoSubstitutionTemplateLiteral(template)) {
		return ts.factory.createStringLiteral(template.text);
	}

	return ts.factory.createTemplateExpression(
		template.head,
		template.templateSpans.map((span) =>
			ts.factory.createTemplateSpan(span.expression, span.literal)
		)
	);
}

const expressionEmissionIds = new WeakMap<ts.Node, string>();

function expressionEmissionId(node: ts.Node): string | undefined {
	return expressionEmissionIds.get(node) ?? expressionEmissionIds.get(ts.getOriginalNode(node));
}

/** Pairs emission handles by the canonical expression tree's structural child path. */
function bindExpressionEmissionNodes(
	sourceFile: ts.SourceFile,
	module: BoundModule,
	required: ReadonlySet<string>
): void {
	const bind = (syntax: ts.Node, expression: BoundModule['rootNode']): void => {
		const syntaxKind = emissionSyntaxKindName(syntax);
		if (syntaxKind !== expression.kind) {
			throw new Error(
				`Expression emission tree diverged at ${expression.id}: expected ${expression.kind}, received ${syntaxKind} in ${sourceFile.fileName}`
			);
		}
		if (required.has(expression.id)) expressionEmissionIds.set(syntax, expression.id);
		const syntaxChildren: ts.Node[] = [];
		ts.forEachChild(syntax, (child) => {
			syntaxChildren.push(child);
		});
		if (syntaxChildren.length !== expression.children.length) {
			throw new Error(
				`Expression emission child count diverged at ${expression.id} in ${sourceFile.fileName}`
			);
		}
		for (let index = 0; index < syntaxChildren.length; index++)
			bind(syntaxChildren[index]!, expression.children[index]!);
	};
	bind(sourceFile, module.rootNode);
}

function emissionSyntaxKindName(node: ts.Node): string {
	if (ts.isNumericLiteral(node)) return 'NumericLiteral';
	if (ts.isBigIntLiteral(node)) return 'BigIntLiteral';
	if (ts.isStringLiteral(node)) return 'StringLiteral';
	if (ts.isNoSubstitutionTemplateLiteral(node)) return 'NoSubstitutionTemplateLiteral';
	if (ts.isRegularExpressionLiteral(node)) return 'RegularExpressionLiteral';
	if (ts.isJsxText(node)) return 'JsxText';
	return ts.SyntaxKind[node.kind];
}

function emissionNodeIds(
	module: BoundModule,
	derived: ExpressionDerivedPlan,
	writes: ExpressionWritePlan,
	tasks: ExpressionTaskPlan,
	jsx: ExpressionJsxPlan,
	components: ExpressionComponentPlan,
	callableEffects: CallableEffectPlan
): ReadonlySet<string> {
	const ids = new Set<string>();
	const addKeys = (map: ReadonlyMap<string, unknown>) => {
		for (const key of map.keys()) ids.add(key);
	};
	addKeys(derived.sites);
	addKeys(derived.declarations);
	for (const site of derived.sites.values()) ids.add(site.initializerNodeId);
	for (const site of derived.declarations.values()) ids.add(site.initializerNodeId);
	addKeys(writes.sites);
	addKeys(tasks.sites);
	addKeys(tasks.resources);
	addKeys(tasks.lifecycleListeners);
	addKeys(tasks.setupTasks);
	addKeys(tasks.signalCalls);
	addKeys(jsx.elements);
	addKeys(jsx.cells);
	addKeys(jsx.contextualParameters);
	addKeys(jsx.lists);
	for (const site of components.sites.values()) {
		ids.add(site.id);
		for (const island of site.clientIslands) ids.add(island.nodeId);
		for (const render of site.renders) ids.add(render.nodeId);
	}
	for (const call of module.walk().calls()) if (call.target?.isMember('map')) ids.add(call.node.id);
	addKeys(callableEffects.byNodeId);
	return ids;
}
