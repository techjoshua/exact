import ts from 'typescript';
import { isThisTaskCall } from './calls.js';
import type { ExactContinuationIR } from './types.js';

/** Compiler-created executable half of one server continuation contract. */
export type ContinuationExecutorEmission = Readonly<{
	id: string;
	componentId: string;
	execute: ts.Expression;
}>;

/**
 * Extracts server task bodies from a transformed component into request-local
 * continuation functions. Component setup is not replayed during invocation.
 */
export function createContinuationExecutorEmissions(
	component: ts.FunctionLikeDeclaration,
	continuations: readonly ExactContinuationIR[],
	context: ts.TransformationContext,
	filename: string
): readonly ContinuationExecutorEmission[] {
	if (!continuations.length) return [];
	if (!component.body)
		throw new Error(`Cannot emit continuations for bodyless component in ${filename}`);
	const tasks = directComponentTasks(component);
	if (tasks.length !== continuations.length) {
		throw new Error(
			`Cannot pair ${continuations.length} server continuations with ${tasks.length} emitted tasks in ${filename}`
		);
	}
	const aliases = componentContextAliases(component);
	return continuations.map((continuation, index) => {
		const task = tasks[index]!;
		const work = continuationTaskWork(task, continuation.id);
		if (!work) {
			throw new Error(`Cannot extract server continuation ${continuation.id} in ${filename}`);
		}
		return Object.freeze({
			id: continuation.id,
			componentId: continuation.componentId,
			execute: continuationExecutor(work, continuation, aliases, context, filename)
		});
	});
}

/** Unwraps the compiler tag around continuation work before extracting its server body. */
function continuationTaskWork(
	task: ts.CallExpression,
	continuationId: string
): ts.ArrowFunction | ts.FunctionExpression | undefined {
	const candidate = task.arguments.at(-1);
	if (!candidate) return undefined;
	if (ts.isArrowFunction(candidate) || ts.isFunctionExpression(candidate)) return candidate;
	if (
		!ts.isCallExpression(candidate) ||
		candidate.arguments.length !== 2 ||
		!ts.isStringLiteral(candidate.arguments[0]) ||
		candidate.arguments[0].text !== continuationId
	)
		return undefined;
	const work = candidate.arguments[1];
	return work && (ts.isArrowFunction(work) || ts.isFunctionExpression(work)) ? work : undefined;
}

/** Collects task registrations whose nearest function owner is the component. */
function directComponentTasks(component: ts.FunctionLikeDeclaration): ts.CallExpression[] {
	const tasks: ts.CallExpression[] = [];
	const visit = (node: ts.Node): void => {
		if (node !== component && ts.isFunctionLike(node)) return;
		if (ts.isCallExpression(node) && isThisTaskCall(node)) tasks.push(node);
		ts.forEachChild(node, visit);
	};
	visit(component.body!);
	return tasks.sort((left, right) => left.getStart() - right.getStart());
}

type ContextAlias = Readonly<{
	name: string;
	token: ts.Expression;
	tokenName: string;
}>;

/** Finds component-scope aliases created directly from a context lookup. */
function componentContextAliases(component: ts.FunctionLikeDeclaration): readonly ContextAlias[] {
	if (!component.body || !ts.isBlock(component.body)) return [];
	const aliases: ContextAlias[] = [];
	for (const statement of component.body.statements) {
		if (!ts.isVariableStatement(statement)) continue;
		for (const declaration of statement.declarationList.declarations) {
			if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
			const lookup = contextLookup(declaration.initializer);
			if (!lookup) continue;
			aliases.push({
				name: declaration.name.text,
				token: lookup,
				tokenName: lookup.getText()
			});
		}
	}
	return aliases;
}

/** Returns the token from a direct this.getContext(token) expression. */
function contextLookup(expression: ts.Expression): ts.Expression | undefined {
	if (
		!ts.isCallExpression(expression) ||
		expression.arguments.length !== 1 ||
		!ts.isPropertyAccessExpression(expression.expression) ||
		expression.expression.name.text !== 'getContext' ||
		expression.expression.expression.kind !== ts.SyntaxKind.ThisKeyword
	)
		return undefined;
	return expression.arguments[0];
}

/** Creates one async executor whose only mutable authority is its activation state. */
function continuationExecutor(
	work: ts.ArrowFunction | ts.FunctionExpression,
	continuation: ExactContinuationIR,
	aliases: readonly ContextAlias[],
	context: ts.TransformationContext,
	filename: string
): ts.ArrowFunction {
	const factory = context.factory;
	const activation = factory.createUniqueName('__exactActivation');
	const execution = factory.createUniqueName('__exactExecution');
	const component = factory.createUniqueName('__exactComponent');
	const referenced = referencedFreeNames(work);
	const aliasStatements = aliases
		.filter((alias) => referenced.has(alias.name))
		.map((alias) =>
			factory.createVariableStatement(
				undefined,
				factory.createVariableDeclarationList(
					[
						factory.createVariableDeclaration(
							alias.name,
							undefined,
							undefined,
							contextValueExpression(
								alias.token,
								alias.tokenName,
								continuation,
								activation,
								execution,
								factory,
								filename
							)
						)
					],
					ts.NodeFlags.Const
				)
			)
		);
	const rewrittenWork = annotateExecutorParameters(
		rewriteContinuationWork(
			work,
			continuation,
			activation,
			execution,
			component,
			context,
			filename
		),
		factory
	);
	const invoke = factory.createCallExpression(
		factory.createParenthesizedExpression(rewrittenWork),
		undefined,
		[
			...continuation.activation.dependencies.map((_dependency, index) =>
				factory.createElementAccessExpression(
					factory.createPropertyAccessExpression(activation, 'dependencies'),
					index
				)
			),
			factory.createObjectLiteralExpression([
				factory.createPropertyAssignment(
					'signal',
					factory.createPropertyAccessExpression(execution, 'signal')
				)
			])
		]
	);
	return factory.createArrowFunction(
		[factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
		undefined,
		[
			factory.createParameterDeclaration(
				undefined,
				undefined,
				activation,
				undefined,
				factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)
			),
			factory.createParameterDeclaration(
				undefined,
				undefined,
				execution,
				undefined,
				factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)
			)
		],
		undefined,
		factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
		factory.createBlock(
			[
				factory.createVariableStatement(
					undefined,
					factory.createVariableDeclarationList(
						[
							factory.createVariableDeclaration(
								component,
								undefined,
								undefined,
								factory.createObjectLiteralExpression([
									factory.createPropertyAssignment(
										'state',
										factory.createPropertyAccessExpression(activation, 'state')
									)
								])
							)
						],
						ts.NodeFlags.Const
					)
				),
				...aliasStatements,
				factory.createExpressionStatement(factory.createAwaitExpression(invoke)),
				factory.createReturnStatement(
					factory.createObjectLiteralExpression([
						factory.createPropertyAssignment(
							'state',
							factory.createPropertyAccessExpression(component, 'state')
						)
					])
				)
			],
			true
		)
	);
}

/** Preserves contextual task parameter permissiveness after extracting the callback. */
function annotateExecutorParameters(
	work: ts.ArrowFunction | ts.FunctionExpression,
	factory: ts.NodeFactory
): ts.ArrowFunction | ts.FunctionExpression {
	const parameters = work.parameters.map((parameter) =>
		parameter.type
			? parameter
			: factory.updateParameterDeclaration(
					parameter,
					parameter.modifiers,
					parameter.dotDotDotToken,
					parameter.name,
					parameter.questionToken,
					factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
					parameter.initializer
				)
	);
	if (ts.isArrowFunction(work))
		return factory.updateArrowFunction(
			work,
			work.modifiers,
			work.typeParameters,
			parameters,
			work.type,
			work.equalsGreaterThanToken,
			work.body
		);
	return factory.updateFunctionExpression(
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

/** Rewrites component receiver and direct context reads for stateless execution. */
function rewriteContinuationWork(
	work: ts.ArrowFunction | ts.FunctionExpression,
	continuation: ExactContinuationIR,
	activation: ts.Identifier,
	execution: ts.Identifier,
	component: ts.Identifier,
	context: ts.TransformationContext,
	filename: string
): ts.ArrowFunction | ts.FunctionExpression {
	const factory = context.factory;
	const visit: ts.Visitor = (node) => {
		if (node !== work && ts.isFunctionExpression(node)) return node;
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			node.expression.expression.kind === ts.SyntaxKind.ThisKeyword
		) {
			if (node.expression.name.text === 'getContext' && node.arguments.length === 1) {
				const token = node.arguments[0]!;
				return contextValueExpression(
					token,
					token.getText(),
					continuation,
					activation,
					execution,
					factory,
					filename
				);
			}
			if (node.expression.name.text === 'setContext') {
				throw new Error(
					`Server continuation ${continuation.id} writes component context, which is not yet transportable in ${filename}`
				);
			}
		}
		if (
			ts.isPropertyAccessExpression(node) &&
			node.expression.kind === ts.SyntaxKind.ThisKeyword &&
			node.name.text !== 'state' &&
			node.name.text !== 'getContext' &&
			node.name.text !== 'setContext'
		) {
			throw new Error(
				`Server continuation ${continuation.id} uses unsupported component member this.${node.name.text} in ${filename}`
			);
		}
		if (node.kind === ts.SyntaxKind.ThisKeyword) return component;
		return ts.visitEachChild(node, visit, context);
	};
	return ts.visitNode(work, visit) as ts.ArrowFunction | ts.FunctionExpression;
}

/** Resolves public projections from the activation and server resources locally. */
function contextValueExpression(
	token: ts.Expression,
	tokenName: string,
	continuation: ExactContinuationIR,
	activation: ts.Identifier,
	execution: ts.Identifier,
	factory: ts.NodeFactory,
	filename: string
): ts.Expression {
	if (continuation.activation.publicContexts.some((effect) => effect.token === tokenName)) {
		return factory.createElementAccessExpression(
			factory.createPropertyAccessExpression(activation, 'publicContext'),
			factory.createStringLiteral(tokenName)
		);
	}
	if (continuation.activation.serverContexts.some((effect) => effect.token === tokenName)) {
		return factory.createCallExpression(
			factory.createPropertyAccessExpression(execution, 'getContext'),
			undefined,
			[token]
		);
	}
	throw new Error(
		`Server continuation ${continuation.id} reads undeclared context ${tokenName} in ${filename}`
	);
}

/** Finds identifier reads that are not declared by the task callback itself. */
function referencedFreeNames(work: ts.FunctionLikeDeclaration): ReadonlySet<string> {
	const declared = new Set<string>();
	for (const parameter of work.parameters) collectBindingNames(parameter.name, declared);
	const collectDeclarations = (node: ts.Node): void => {
		if (node !== work && ts.isFunctionLike(node)) return;
		if (ts.isVariableDeclaration(node)) collectBindingNames(node.name, declared);
		if (ts.isFunctionDeclaration(node) && node.name) declared.add(node.name.text);
		ts.forEachChild(node, collectDeclarations);
	};
	collectDeclarations(work.body!);
	const referenced = new Set<string>();
	const collectReferences = (node: ts.Node): void => {
		if (node !== work && ts.isFunctionLike(node)) return;
		if (ts.isIdentifier(node) && !declared.has(node.text) && isIdentifierRead(node))
			referenced.add(node.text);
		ts.forEachChild(node, collectReferences);
	};
	collectReferences(work.body!);
	return referenced;
}

/** Adds every identifier introduced by one binding pattern. */
function collectBindingNames(name: ts.BindingName, output: Set<string>): void {
	if (ts.isIdentifier(name)) {
		output.add(name.text);
		return;
	}
	for (const element of name.elements)
		if (!ts.isOmittedExpression(element)) collectBindingNames(element.name, output);
}

/** Excludes syntax positions whose identifier text is not a value read. */
function isIdentifierRead(node: ts.Identifier): boolean {
	const parent = node.parent;
	if (!parent) return true;
	if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
	if (ts.isPropertyAssignment(parent) && parent.name === node && parent.initializer !== node)
		return false;
	if (ts.isVariableDeclaration(parent) && parent.name === node) return false;
	if (ts.isParameter(parent) && parent.name === node) return false;
	return true;
}
