import * as ts from '../../native-typescript.js';
import { isFunctionLikeExpression } from '../../calls.js';
import type {
	ExpressionTaskResource,
	ExpressionTaskResourceKind,
	ExpressionTaskSite,
	ExpressionTaskSignalCall
} from '../../expression/task-contracts.js';
import type { HelperNames } from '../../types.js';

import { captureArgument } from './collection-emission.js';
import type { DerivedReactiveIndex } from './contracts.js';
import { markContinuationTask } from './distributed-task-emission.js';
import { expressionEmissionId } from './identity.js';
import { taskResourceHelper } from './task-resource-emission.js';
import {
	allocateDependencyParameters,
	findTaskExpressionNode,
	prependDependencyParameters,
	rewriteTaskDependencyReads
} from './task-dependency-emission.js';
/** Transforms task call into its required representation. */
export function transformTaskCall(
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
	markSignal?: (mode: ExpressionTaskSignalCall['mode']) => void,
	taskSite?: ExpressionTaskSite
): ts.Expression {
	if (node.arguments.length < 1) return ts.visitEachChild(node, visitor, context);
	const work = node.arguments[node.arguments.length - 1]!;
	if (!isFunctionLikeExpression(work)) return ts.visitEachChild(node, visitor, context);
	const explicitDependencies = node.arguments.slice(0, -1);
	const inferredDependencies =
		explicitDependencies.length === 0 ? (taskSite?.dependencies ?? []) : [];
	// Context dependencies are resolved from the trusted server invocation. They
	// must remain free reads in the server callback and never become client
	// reactive values or transported dependency slots.
	const transportedDependencies =
		taskSite?.placement === 'server'
			? inferredDependencies.filter((dependency) => dependency.source !== 'context')
			: inferredDependencies;
	const dependencyParameters = allocateDependencyParameters(work, transportedDependencies);
	const rewrittenWork = transportedDependencies.length
		? rewriteTaskDependencyReads(work, transportedDependencies, dependencyParameters, context)
		: work;
	const visitedWork = ts.visitNode(rewrittenWork, visitor) as
		| ts.ArrowFunction
		| ts.FunctionExpression;
	let transformedWork: ts.ArrowFunction | ts.FunctionExpression = helpers
		? (transformTaskWork(
				visitedWork,
				node.arguments.length - 1,
				context,
				helpers,
				markAbortOptions ?? (() => {}),
				resourceFor ?? (() => undefined),
				markResource ?? (() => {}),
				markAwait ?? (() => {}),
				signalFor ?? (() => undefined),
				markSignal ?? (() => {}),
				taskSite?.readiness === 'blocking'
			) as ts.ArrowFunction | ts.FunctionExpression)
		: visitedWork;

	if (transportedDependencies.length)
		transformedWork = prependDependencyParameters(transformedWork, dependencyParameters, context);
	const emittedWork =
		taskSite?.continuationId &&
		(taskSite.placement === 'server' || taskSite.placement === 'isomorphic') &&
		helpers
			? markContinuationTask(transformedWork, taskSite.continuationId, context, helpers)
			: transformedWork;

	const nextDependencies =
		transportedDependencies.length > 0
			? transportedDependencies.map((dependency) => {
					const expression = findTaskExpressionNode(work, dependency.nodeId);
					if (!expression)
						throw new Error(
							`Missing task dependency expression ${dependency.nodeId} in ${sourceFile.fileName}`
						);
					return context.factory.createCallExpression(
						context.factory.createPropertyAccessExpression(
							context.factory.createThis(),
							'reactive'
						),
						undefined,
						[captureArgument(context, expression, visitor, sourceFile, derivedReactiveLocals)]
					);
				})
			: explicitDependencies.map((argument) => {
					if (isFunctionLikeExpression(argument)) {
						return ts.visitNode(argument, visitor) as ts.Expression;
					}
					const derived = ts.isIdentifier(argument)
						? derivedReactiveLocals?.references.get(expressionEmissionId(argument) ?? '')
						: undefined;
					if (derived?.cached) return argument;
					return context.factory.createCallExpression(
						context.factory.createPropertyAccessExpression(
							context.factory.createThis(),
							'reactive'
						),
						undefined,
						[captureArgument(context, argument, visitor, sourceFile, derivedReactiveLocals)]
					);
				});

	return context.factory.updateCallExpression(
		node,
		ts.visitNode(node.expression, visitor) as ts.Expression,
		node.typeArguments,
		[...nextDependencies, emittedWork]
	);
}

/** Transforms task work into its required representation. */
export function transformTaskWork(
	work: ts.ArrowFunction | ts.FunctionExpression,
	dependencyCount: number,
	context: ts.TransformationContext,
	helpers: HelperNames,
	markAbortOptions: () => void,
	resourceFor: (node: ts.Node) => ExpressionTaskResource | undefined,
	markResource: (kind: ExpressionTaskResourceKind) => void,
	markAwait: () => void,
	signalFor: (node: ts.Node) => ExpressionTaskSignalCall | undefined,
	markSignal: (mode: ExpressionTaskSignalCall['mode']) => void,
	stageMutations = false
): ts.Expression {
	if (!containsManagedTaskWork(work, resourceFor, signalFor)) return work;
	const factory = context.factory;
	const parameters = [...work.parameters];
	let signal: ts.Expression;
	const contextParameter =
		parameters.length > dependencyCount ? parameters[parameters.length - 1] : undefined;
	if (contextParameter?.name && ts.isIdentifier(contextParameter.name)) {
		signal = factory.createPropertyAccessExpression(contextParameter.name, 'signal');
	} else if (contextParameter?.name && ts.isObjectBindingPattern(contextParameter.name)) {
		const binding = contextParameter.name.elements.find((element) => {
			const property = element.propertyName;
			return property && ts.isIdentifier(property)
				? property.text === 'signal'
				: !!element.name && ts.isIdentifier(element.name) && element.name.text === 'signal';
		});
		if (binding?.name && ts.isIdentifier(binding.name)) {
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
		if (
			stageMutations &&
			ts.isExpressionStatement(current) &&
			isGeneratedStateMutation(current.expression, helpers)
		) {
			return factory.updateExpressionStatement(
				current,
				factory.createCallExpression(
					factory.createIdentifier(helpers.stageTaskMutation),
					undefined,
					[
						signal,
						factory.createArrowFunction(
							undefined,
							undefined,
							[],
							undefined,
							factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
							ts.visitNode(current.expression, taskVisitor) as ts.Expression
						)
					]
				)
			);
		}
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

function isGeneratedStateMutation(expression: ts.Expression, helpers: HelperNames): boolean {
	return (
		ts.isCallExpression(expression) &&
		ts.isIdentifier(expression.expression) &&
		[
			helpers.write,
			helpers.update,
			helpers.updateResult,
			helpers.remove,
			helpers.arrayMutation
		].includes(expression.expression.text)
	);
}

/** Reports whether managed task work. */
export function containsManagedTaskWork(
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
