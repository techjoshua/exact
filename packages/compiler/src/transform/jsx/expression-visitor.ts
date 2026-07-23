import ts from 'typescript';
import { isIdentifierDeclarationName, isPropertyAccessName } from '../../ast.js';
import { isThisTaskCall } from '../../calls.js';
import { expressionEmissionId } from './identity.js';
import {
	clientComponentChildrenProp,
	jsxElementHasNoMeaningfulChildren,
	jsxElementIsClientIsland
} from './inspection.js';
import { transformAnnotatedMapCall } from './collection-emission.js';
import {
	transformJsxElement,
	transformJsxFragment,
	transformJsxSelfClosingElement
} from './element-emission.js';
import { createComponentIslandBoundaryCall } from './island-emission.js';
import {
	clientIslandCaptures,
	createClientIslandBoundaryCall,
	recordClientIslandDefinition
} from './island-planning.js';
import {
	shouldOmitPlacement,
	transformImplicitLifecycleListener,
	transformImplicitSetupTask
} from './lifecycle-emission.js';
import { transformCapturedCall, transformReactiveTaggedTemplate } from './reactive-emission.js';
import type { JsxVisitorEnvironment } from './visitor-environment.js';

/**
 * Lowers JSX, task calls, and reactive reads after statement-level filtering.
 */
export function visitJsxExpression(
	node: ts.Node,
	visitor: ts.Visitor,
	environment: JsxVisitorEnvironment
): ts.VisitResult<ts.Node> {
	const {
		context,
		sourceFile,
		factory,
		helpers,
		state,
		target,
		componentInfo,
		componentPlacements,
		derivedReactiveLocals,
		expressionComponents,
		expressionJsx,
		expressionResourceFor,
		expressionListenerFor,
		expressionSetupFor,
		expressionSignalFor,
		taskPlacementFor,
		isClientComponentTag,
		islandHasServerChildren,
		clientIslandSiteFor
	} = environment;

	if (ts.isJsxElement(node)) {
		state.sawJsx = true;
		if (target === 'server' && isClientComponentTag(node.openingElement.tagName)) {
			const childrenProp = clientComponentChildrenProp(context, node);
			const serverChildren =
				!jsxElementHasNoMeaningfulChildren(node) && childrenProp === undefined
					? node.children
					: undefined;
			state.sawBoundary = true;
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
			if (!state.componentSiteStack.length)
				return transformJsxElement(
					sourceFile,
					node,
					context,
					visitor,
					helpers,
					derivedReactiveLocals,
					expressionJsx
				);
			const serverChildren = islandHasServerChildren(node) ? node.children : undefined;
			state.sawBoundary = true;
			const captures = clientIslandCaptures(
				clientIslandSiteFor(node),
				state.componentLocalStack.at(-1)
			);
			return createClientIslandBoundaryCall(
				sourceFile,
				context,
				visitor,
				helpers,
				state.componentStack.at(-1),
				state.islandCounts,
				node.openingElement.attributes,
				serverChildren ? undefined : node.children,
				{ ...captures, serverSlotChildren: !!serverChildren },
				derivedReactiveLocals,
				serverChildren
			);
		}
		if (target === 'client' && jsxElementIsClientIsland(node.openingElement.attributes)) {
			const ownerSite = state.componentSiteStack.at(-1);
			const owner = state.componentStack.at(-1);
			if (
				ownerSite &&
				state.clientIslandDepth === 0 &&
				componentPlacements.get(expressionComponents.sites.get(ownerSite)?.name ?? '') !== 'client'
			) {
				const serverSlotChildren = islandHasServerChildren(node);
				state.clientIslandDepth++;
				const captures = clientIslandCaptures(
					clientIslandSiteFor(node),
					state.componentLocalStack.at(-1)
				);
				recordClientIslandDefinition(
					sourceFile,
					context,
					visitor,
					helpers,
					owner,
					state.islandCounts,
					node,
					state.clientIslandDefinitions,
					{ ...captures, serverSlotChildren },
					derivedReactiveLocals,
					expressionJsx
				);
				state.clientIslandDepth--;
			}
			state.clientIslandDepth++;
			const transformed = transformJsxElement(
				sourceFile,
				node,
				context,
				visitor,
				helpers,
				derivedReactiveLocals,
				expressionJsx
			);
			state.clientIslandDepth--;
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
		state.sawJsx = true;
		if (target === 'client' && jsxElementIsClientIsland(node.attributes)) {
			const ownerSite = state.componentSiteStack.at(-1);
			const owner = state.componentStack.at(-1);
			if (
				ownerSite &&
				state.clientIslandDepth === 0 &&
				componentPlacements.get(expressionComponents.sites.get(ownerSite)?.name ?? '') !== 'client'
			) {
				recordClientIslandDefinition(
					sourceFile,
					context,
					visitor,
					helpers,
					owner,
					state.islandCounts,
					node,
					state.clientIslandDefinitions,
					clientIslandCaptures(clientIslandSiteFor(node), state.componentLocalStack.at(-1)),
					derivedReactiveLocals,
					expressionJsx
				);
			}
		}
		if (target === 'server' && isClientComponentTag(node.tagName)) {
			state.sawBoundary = true;
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
			if (!state.componentSiteStack.length)
				return transformJsxSelfClosingElement(
					sourceFile,
					node,
					context,
					visitor,
					helpers,
					derivedReactiveLocals,
					expressionJsx
				);
			state.sawBoundary = true;
			return createClientIslandBoundaryCall(
				sourceFile,
				context,
				visitor,
				helpers,
				state.componentStack.at(-1),
				state.islandCounts,
				node.attributes,
				undefined,
				clientIslandCaptures(clientIslandSiteFor(node), state.componentLocalStack.at(-1)),
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
		state.sawJsx = true;
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
		state.setupTaskDepth === 0 &&
		expressionSetupFor(node)
	) {
		if (target === 'server') return factory.createVoidExpression(factory.createNumericLiteral(0));
		return transformImplicitSetupTask(
			node,
			context,
			visitor,
			helpers,
			() => {
				state.sawAbortOptions = true;
			},
			expressionResourceFor,
			(kind) => state.taskResources.add(kind),
			() => {
				state.sawTaskAwait = true;
			},
			expressionSignalFor,
			(mode) => state.taskSignalModes.add(mode),
			(enter) => {
				state.setupTaskDepth += enter ? 1 : -1;
			}
		);
	}
	if (ts.isCallExpression(node)) {
		if (expressionListenerFor(node) && state.setupTaskDepth === 0) {
			if (target === 'server') return factory.createVoidExpression(factory.createNumericLiteral(0));
			state.sawAbortOptions = true;
			return transformImplicitLifecycleListener(node, context, visitor, helpers);
		}
		if (isThisTaskCall(node) && shouldOmitPlacement(taskPlacementFor(node), target))
			return factory.createVoidExpression(factory.createNumericLiteral(0));
		const annotatedList = expressionJsx.lists.get(expressionEmissionId(node) ?? '');
		if (
			annotatedList &&
			state.componentSiteStack.length &&
			ts.isPropertyAccessExpression(node.expression)
		) {
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
				state.sawAbortOptions = true;
			},
			expressionResourceFor,
			(kind) => state.taskResources.add(kind),
			() => {
				state.sawTaskAwait = true;
			},
			expressionSignalFor,
			(mode) => state.taskSignalModes.add(mode)
		);
	}
	if (node.pos >= 0 && ts.isShorthandPropertyAssignment(node)) {
		const derived = derivedReactiveLocals.references.get(expressionEmissionId(node.name) ?? '');
		if (derived?.cached) {
			return factory.createPropertyAssignment(
				factory.createIdentifier(node.name.text),
				factory.createCallExpression(
					factory.createPropertyAccessExpression(factory.createIdentifier(node.name.text), 'get'),
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
		if (derived?.cached)
			return factory.createCallExpression(
				factory.createPropertyAccessExpression(node, 'get'),
				undefined,
				[]
			);
	}
	if (ts.isTaggedTemplateExpression(node))
		return transformReactiveTaggedTemplate(node, context, visitor);
	return ts.visitEachChild(node, visitor, context);
}
