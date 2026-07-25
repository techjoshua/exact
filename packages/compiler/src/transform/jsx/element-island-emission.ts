import type ts from 'typescript';
import {
	clientComponentChildrenProp,
	jsxElementHasNoMeaningfulChildren,
	jsxElementIsClientIsland
} from './inspection.js';
import { createComponentIslandBoundaryCall } from './island-emission.js';
import {
	clientIslandCaptures,
	createClientIslandBoundaryCall,
	recordClientIslandDefinition
} from './island-planning.js';
import { componentOwnsClientMachine } from './distributed-task-emission.js';
import type { JsxVisitorEnvironment } from './visitor-environment.js';

/** Emits a component or intrinsic island boundary when an element needs extraction. */
export function transformJsxElementIsland(
	node: ts.JsxElement,
	visitor: ts.Visitor,
	environment: JsxVisitorEnvironment
): ts.Expression | undefined {
	const {
		sourceFile,
		context,
		helpers,
		state,
		target,
		serverComponents,
		componentInfo,
		componentPlacements,
		derivedReactiveLocals,
		expressionComponents,
		expressionJsx,
		isClientComponentTag,
		islandHasServerChildren,
		clientIslandSiteFor
	} = environment;
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
	const ownsClientMachine = componentOwnsClientMachine(
		state.componentStack.at(-1),
		componentPlacements,
		serverComponents
	);
	if (
		target === 'server' &&
		jsxElementIsClientIsland(node.openingElement.attributes) &&
		!ownsClientMachine
	) {
		if (!state.componentSiteStack.length) return undefined;
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
			node,
			serverChildren ? undefined : node.children,
			{ ...captures, serverSlotChildren: !!serverChildren },
			derivedReactiveLocals,
			serverChildren
		);
	}
	if (target !== 'client' || !jsxElementIsClientIsland(node.openingElement.attributes))
		return undefined;
	const ownerSite = state.componentSiteStack.at(-1);
	const owner = state.componentStack.at(-1);
	if (
		ownerSite &&
		state.clientIslandDepth === 0 &&
		!componentOwnsClientMachine(
			expressionComponents.sites.get(ownerSite)?.name,
			componentPlacements,
			serverComponents
		)
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
	return undefined;
}

/** Emits a component or intrinsic island boundary when a self-closing element needs extraction. */
export function transformJsxSelfClosingIsland(
	node: ts.JsxSelfClosingElement,
	visitor: ts.Visitor,
	environment: JsxVisitorEnvironment
): ts.Expression | undefined {
	const {
		sourceFile,
		context,
		helpers,
		state,
		target,
		serverComponents,
		componentInfo,
		componentPlacements,
		derivedReactiveLocals,
		expressionComponents,
		expressionJsx,
		isClientComponentTag,
		clientIslandSiteFor
	} = environment;
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
	const ownsClientMachine = componentOwnsClientMachine(
		state.componentStack.at(-1),
		componentPlacements,
		serverComponents
	);
	if (target === 'server' && jsxElementIsClientIsland(node.attributes) && !ownsClientMachine) {
		if (!state.componentSiteStack.length) return undefined;
		state.sawBoundary = true;
		return createClientIslandBoundaryCall(
			sourceFile,
			context,
			visitor,
			helpers,
			state.componentStack.at(-1),
			state.islandCounts,
			node,
			undefined,
			clientIslandCaptures(clientIslandSiteFor(node), state.componentLocalStack.at(-1)),
			derivedReactiveLocals
		);
	}
	if (target !== 'client' || !jsxElementIsClientIsland(node.attributes)) return undefined;
	const ownerSite = state.componentSiteStack.at(-1);
	if (
		ownerSite &&
		state.clientIslandDepth === 0 &&
		!componentOwnsClientMachine(
			expressionComponents.sites.get(ownerSite)?.name,
			componentPlacements,
			serverComponents
		)
	) {
		recordClientIslandDefinition(
			sourceFile,
			context,
			visitor,
			helpers,
			state.componentStack.at(-1),
			state.islandCounts,
			node,
			state.clientIslandDefinitions,
			clientIslandCaptures(clientIslandSiteFor(node), state.componentLocalStack.at(-1)),
			derivedReactiveLocals,
			expressionJsx
		);
	}
	return undefined;
}
