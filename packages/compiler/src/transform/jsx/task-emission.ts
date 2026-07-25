import ts from 'typescript';
import { isFunctionLikeExpression } from '../../calls.js';
import type {
	ExpressionTaskResource,
	ExpressionTaskResourceKind,
	ExpressionTaskSite,
	ExpressionTaskSignalCall
} from '../../expression/task-contracts.js';
import type { ExpressionTaskDependency } from '../../expression/task-dependencies.js';
import type { HelperNames } from '../../types.js';

import { captureArgument } from './collection-emission.js';
import type { DerivedReactiveIndex } from './contracts.js';
import { expressionEmissionId } from './identity.js';
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
	const dependencyParameters = allocateDependencyParameters(work, inferredDependencies.length);
	const rewrittenWork = inferredDependencies.length
		? rewriteTaskDependencyReads(work, inferredDependencies, dependencyParameters, context)
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
				markSignal ?? (() => {})
			) as ts.ArrowFunction | ts.FunctionExpression)
		: visitedWork;

	if (inferredDependencies.length)
		transformedWork = prependDependencyParameters(transformedWork, dependencyParameters, context);

	const nextDependencies =
		inferredDependencies.length > 0
			? inferredDependencies.map((dependency) => {
					const expression = findExpressionNode(work, dependency.nodeId);
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
		[...nextDependencies, transformedWork]
	);
}

/** Replaces a server task body with the client half of its distributed continuation. */
export function createDistributedTaskCall(
	node: ts.CallExpression,
	continuationId: string,
	context: ts.TransformationContext,
	helpers: HelperNames
): ts.CallExpression {
	const factory = context.factory;
	const dependencies = node.arguments.slice(0, -1);
	const dependencyParameters = dependencies.map((_, index) =>
		factory.createIdentifier(`__exactDependency${index || ''}`)
	);
	const signal = factory.createIdentifier(helpers.taskSignal);
	const work = factory.createArrowFunction(
		undefined,
		undefined,
		[
			...dependencyParameters.map((parameter) =>
				factory.createParameterDeclaration(undefined, undefined, parameter)
			),
			factory.createParameterDeclaration(
				undefined,
				undefined,
				factory.createObjectBindingPattern([
					factory.createBindingElement(
						undefined,
						factory.createIdentifier('signal'),
						signal
					)
				])
			)
		],
		undefined,
		factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
		factory.createCallExpression(
			factory.createIdentifier(helpers.dispatchContinuation),
			undefined,
			[
				factory.createThis(),
				factory.createStringLiteral(continuationId),
				factory.createArrayLiteralExpression(dependencyParameters),
				signal
			]
		)
	);
	return factory.updateCallExpression(
		node,
		factory.createPropertyAccessExpression(factory.createThis(), 'task'),
		node.typeArguments,
		[...dependencies, work]
	);
}

function prependDependencyParameters(
	work: ts.ArrowFunction | ts.FunctionExpression,
	names: readonly string[],
	context: ts.TransformationContext
): ts.ArrowFunction | ts.FunctionExpression {
	const parameters = names.map((name) =>
		context.factory.createParameterDeclaration(undefined, undefined, name)
	);
	parameters.push(...work.parameters);
	if (ts.isArrowFunction(work))
		return context.factory.updateArrowFunction(
			work,
			work.modifiers,
			work.typeParameters,
			parameters,
			work.type,
			work.equalsGreaterThanToken,
			work.body
		);
	return context.factory.updateFunctionExpression(
		work,
		work.modifiers,
		work.asteriskToken,
		work.name,
		work.typeParameters,
		parameters,
		work.type,
		work.body
	);
}

function allocateDependencyParameters(work: ts.FunctionLikeDeclaration, count: number): string[] {
	const used = new Set<string>();
	const collect = (node: ts.Node): void => {
		if (ts.isIdentifier(node)) used.add(node.text);
		ts.forEachChild(node, collect);
	};
	collect(work);
	const names: string[] = [];
	for (let index = 0; index < count; index++) {
		let name = `__exactDependency${index || ''}`;
		while (used.has(name)) name += '_';
		used.add(name);
		names.push(name);
	}
	return names;
}

function rewriteTaskDependencyReads(
	work: ts.ArrowFunction | ts.FunctionExpression,
	dependencies: readonly ExpressionTaskDependency[],
	parameters: readonly string[],
	context: ts.TransformationContext
): ts.ArrowFunction | ts.FunctionExpression {
	const replacements = new Map<string, ts.Identifier>();
	dependencies.forEach((dependency, index) => {
		const parameter = context.factory.createIdentifier(parameters[index]!);
		for (const nodeId of dependency.readNodeIds) replacements.set(nodeId, parameter);
	});
	const rewrite: ts.Visitor = (node) => {
		const replacement = replacements.get(expressionEmissionId(node) ?? '');
		return replacement ?? ts.visitEachChild(node, rewrite, context);
	};
	return ts.visitNode(work, rewrite) as ts.ArrowFunction | ts.FunctionExpression;
}

function findExpressionNode(work: ts.Node, nodeId: string): ts.Expression | undefined {
	let found: ts.Expression | undefined;
	const visit = (node: ts.Node): void => {
		if (found) return;
		if (expressionEmissionId(node) === nodeId && ts.isExpression(node)) {
			found = node;
			return;
		}
		ts.forEachChild(node, visit);
	};
	visit(work);
	return found;
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

/** Performs the task resource helper domain operation. */
export function taskResourceHelper(
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
