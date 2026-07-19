import ts from 'typescript';
import type {
	ExpressionTaskResource,
	ExpressionTaskResourceKind,
	ExpressionTaskSignalCall
} from '../../expression/task-contracts.js';
import type { ExpressionWritePlan } from '../../expression/writes.js';
import type { ExactPlacement, HelperNames, TransformTarget } from '../../types.js';

import { expressionEmissionId } from './identity.js';
import { transformTaskWork } from './task-emission.js';
/** Transforms implicit lifecycle listener into its required representation. */
export function transformImplicitLifecycleListener(
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

/** Transforms implicit setup task into its required representation. */
export function transformImplicitSetupTask(
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

/** Reads a type node from its source representation. */
export function parseTypeNode(source: string): ts.TypeNode {
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

/** Performs the expression write path domain operation. */
export function expressionWritePath(
	node: ts.Node,
	sourceFile: ts.SourceFile,
	plan?: ExpressionWritePlan
): readonly string[] | undefined {
	if (!plan || node.pos < 0 || node.end < 0) return undefined;
	return plan.sites.get(expressionEmissionId(node) ?? '')?.path;
}

/** Reports whether omit placement. */
export function shouldOmitPlacement(placement: ExactPlacement, target: TransformTarget): boolean {
	if (target === 'default') return false;
	if (target === 'client') return placement === 'server';
	return placement === 'client';
}

/** Performs the incompatible effect domain operation. */
export function incompatibleEffect(
	effect: import('../../types.js').ExactEnvironmentEffect,
	target: TransformTarget
): boolean {
	return target === 'client'
		? effect === 'server'
		: target === 'server'
			? effect === 'browser'
			: false;
}

/** Performs the incompatible summary domain operation. */
export function incompatibleSummary(
	summary: import('../../types.js').ExactCallableSummaryIR,
	target: TransformTarget
): boolean {
	if (target === 'default') return false;
	return summary.artifactTargets.length > 0
		? !summary.artifactTargets.includes(target)
		: incompatibleEffect(summary.effect, target);
}
