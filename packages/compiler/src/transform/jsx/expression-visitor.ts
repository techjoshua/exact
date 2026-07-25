import ts from 'typescript';
import { isIdentifierDeclarationName, isPropertyAccessName } from '../../ast.js';
import { isThisTaskCall } from '../../calls.js';
import { expressionEmissionId } from './identity.js';
import { transformAnnotatedMapCall } from './collection-emission.js';
import {
	transformJsxElement,
	transformJsxFragment,
	transformJsxSelfClosingElement
} from './element-emission.js';
import {
	transformJsxElementIsland,
	transformJsxSelfClosingIsland
} from './element-island-emission.js';
import { jsxElementIsClientIsland } from './inspection.js';
import {
	transformImplicitLifecycleListener,
	transformImplicitSetupTask
} from './lifecycle-emission.js';
import { transformCapturedCall, transformReactiveTaggedTemplate } from './reactive-emission.js';
import {
	componentOwnsClientMachine,
	continuationContextWrites,
	createDistributedTaskCall,
	registerContinuationContextBindings,
	resolvedTaskPlacement,
	shouldOmitTaskPlacement
} from './distributed-task-emission.js';
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
		serverComponents,
		componentPlacements,
		continuationContextWrites: continuationWriteContracts,
		derivedReactiveLocals,
		expressionJsx,
		expressionResourceFor,
		expressionListenerFor,
		expressionSetupFor,
		expressionSignalFor,
		expressionTaskFor,
		taskPlacementFor
	} = environment;

	if (ts.isJsxElement(node)) {
		state.sawJsx = true;
		const island = transformJsxElementIsland(node, visitor, environment);
		if (island) return island;
		if (target === 'client' && jsxElementIsClientIsland(node.openingElement.attributes)) {
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
		const island = transformJsxSelfClosingIsland(node, visitor, environment);
		if (island) return island;
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
		const requestedTaskPlacement = isThisTaskCall(node) ? resolvedTaskPlacement(node) : undefined;
		const omitTask =
			isThisTaskCall(node) &&
			shouldOmitTaskPlacement(requestedTaskPlacement, taskPlacementFor(node), target);
		if (omitTask) {
			const task = expressionTaskFor(node);
			if (
				target === 'client' &&
				(requestedTaskPlacement === 'server' || task?.placement === 'server')
			) {
				if (
					!componentOwnsClientMachine(
						state.componentStack.at(-1),
						componentPlacements,
						serverComponents
					)
				)
					return factory.createVoidExpression(factory.createNumericLiteral(0));
				if (!task?.continuationId)
					throw new Error(
						`Missing distributed continuation identity for server task in ${sourceFile.fileName}`
					);
				const transformed = transformCapturedCall(
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
					(mode) => state.taskSignalModes.add(mode),
					task
				);
				state.sawDistributedContinuation = true;
				state.sawContinuationTask = true;
				const contextWrites = continuationContextWrites(
					node,
					continuationWriteContracts.get(task.continuationId)
				);
				if (contextWrites.length) state.sawContinuationContexts = true;
				return createDistributedTaskCall(
					transformed as ts.CallExpression,
					task.continuationId,
					contextWrites,
					context,
					helpers
				);
			}
			return factory.createVoidExpression(factory.createNumericLiteral(0));
		}
		const task = isThisTaskCall(node) ? expressionTaskFor(node) : undefined;
		if (task?.continuationId && (task.placement === 'server' || task.placement === 'isomorphic'))
			state.sawContinuationTask = true;
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
		const transformed = transformCapturedCall(
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
			(mode) => state.taskSignalModes.add(mode),
			expressionTaskFor(node)
		);
		if (!task?.continuationId) return transformed;
		const contextWrites = continuationContextWrites(
			node,
			continuationWriteContracts.get(task.continuationId)
		);
		if (!contextWrites.length) return transformed;
		state.sawContinuationContexts = true;
		return registerContinuationContextBindings(
			transformed as ts.Expression,
			contextWrites,
			context,
			helpers
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
