import ts from 'typescript';
import { inspectComponentStatement } from './analysis.js';
import {
	componentComputationError,
	componentStateTargets,
	containsComponentJsx,
	isComponentTaskExpression,
	isNonReferenceComponentIdentifier,
	type ComponentComputationTextEdit,
	visitDirectComponentSyntax
} from './syntax.js';

/** Collects awaits owned directly by a component setup statement. */
export function collectDirectComponentAwaits(node: ts.Node): ts.AwaitExpression[] {
	const awaits: ts.AwaitExpression[] = [];
	visitDirectComponentSyntax(node, (current) => {
		if (ts.isAwaitExpression(current)) awaits.push(current);
	});
	return awaits;
}

/** Reports whether an await uses the legacy explicit value-bearing task spelling. */
export function isAwaitedComponentTask(node: ts.AwaitExpression): boolean {
	return (
		ts.isCallExpression(node.expression) && isComponentTaskExpression(node.expression.expression)
	);
}

/**
 * Plans one async component continuation while leaving leading synchronous initialization intact.
 */
export function planAsyncComponentComputation(
	sourceFile: ts.SourceFile,
	setupStatements: readonly ts.Statement[],
	renderReturn: ts.ReturnStatement | undefined,
	asyncModifier: ts.Modifier,
	edits: ComponentComputationTextEdit[]
): void {
	const statements = asyncComponentRegion(setupStatements);
	validateAsyncComponentRegion(sourceFile, statements, renderReturn);
	const first = statements[0]!;
	const last = statements.at(-1)!;
	edits.push(
		{
			start: asyncModifier.getStart(sourceFile),
			end: asyncModifier.end,
			text: ''
		},
		{
			start: first.getStart(sourceFile),
			end: first.getStart(sourceFile),
			text: 'this.task.blocking(async ({ signal: __exactComponentSignal }) => { ',
			order: 0
		},
		{
			start: last.end,
			end: last.end,
			text: ' });',
			order: 1
		}
	);

	for (const statement of statements) {
		visitDirectComponentSyntax(statement, (node) => {
			if (!ts.isCatchClause(node)) return;
			edits.push({
				start: node.block.getStart(sourceFile) + 1,
				end: node.block.getStart(sourceFile) + 1,
				text: ' if (__exactComponentSignal.aborted) throw __exactComponentSignal.reason;',
				order: 0
			});
		});
	}
}

function asyncComponentRegion(statements: readonly ts.Statement[]): readonly ts.Statement[] {
	const firstAwait = statements.findIndex(
		(statement) => collectDirectComponentAwaits(statement).length > 0
	);
	if (firstAwait < 0) return statements;
	let start = firstAwait;
	for (let index = firstAwait - 1; index >= 0; index--) {
		const statement = statements[index]!;
		if (isFrameworkSetupRegistration(statement) || hasDirectStateWrite(statement)) break;
		start = index;
	}
	return statements.slice(start);
}

function hasDirectStateWrite(statement: ts.Statement): boolean {
	let found = false;
	visitDirectComponentSyntax(statement, (node) => {
		if (
			!found &&
			ts.isBinaryExpression(node) &&
			node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
			node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
			componentStateTargets(node.left).length
		)
			found = true;
	});
	return found;
}

function isFrameworkSetupRegistration(statement: ts.Statement): boolean {
	if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression))
		return false;
	const expression = statement.expression.expression;
	if (isComponentTaskExpression(expression)) return true;
	if (
		!ts.isPropertyAccessExpression(expression) ||
		expression.expression.kind !== ts.SyntaxKind.ThisKeyword
	)
		return false;
	return ['onMount', 'onRender', 'onUnmount', 'onActivate', 'onDeactivate', 'setContext'].includes(
		expression.name.text
	);
}

function validateAsyncComponentRegion(
	sourceFile: ts.SourceFile,
	statements: readonly ts.Statement[],
	renderReturn: ts.ReturnStatement | undefined
): void {
	const readPaths = new Set<string>();
	const writes: Array<Readonly<{ node: ts.Node; path?: string }>> = [];
	for (const statement of statements) {
		const effects = inspectComponentStatement(statement, { reactive: new Set() });
		for (const path of effects.readPaths) readPaths.add(path);
		writes.push(...effects.writes);
	}
	for (const write of writes) {
		if (write.path && readPaths.has(write.path))
			throw componentComputationError(
				sourceFile,
				write.node,
				`error: async derived state assignment to ${write.path} reads its own target and would create a reactive cycle; use a local intermediate, peek(() => ...) for a snapshot, or an explicit this.task() feedback policy`
			);
	}

	const setupBindings = new Map<string, ts.Node>();
	for (const statement of statements) {
		visitDirectComponentSyntax(statement, (node) => {
			if (!ts.isVariableDeclaration(node)) return;
			for (const name of bindingNames(node.name)) setupBindings.set(name, node);
		});
		visitDirectComponentSyntax(statement, (node) => {
			if (
				node !== statement &&
				ts.isReturnStatement(node) &&
				node.expression &&
				(isRenderValue(node.expression) || containsComponentJsx(node.expression))
			)
				throw componentComputationError(
					sourceFile,
					node,
					'error: an async component may not select its render function from inside the managed continuation; assign the awaited result to this.state and return one final render function'
				);
		});
	}
	if (!renderReturn?.expression || !setupBindings.size) return;
	const escaped = new Set<string>();
	const visitRender = (node: ts.Node): void => {
		if (
			ts.isIdentifier(node) &&
			setupBindings.has(node.text) &&
			!isNonReferenceComponentIdentifier(node)
		)
			escaped.add(node.text);
		ts.forEachChild(node, visitRender);
	};
	visitRender(renderReturn.expression);
	if (escaped.size) {
		const name = [...escaped][0]!;
		throw componentComputationError(
			sourceFile,
			setupBindings.get(name)!,
			`error: async component local ${name} escapes into the render function before its continuation settles; assign the value to this.state instead`
		);
	}
}

function bindingNames(name: ts.BindingName): string[] {
	if (ts.isIdentifier(name)) return [name.text];
	return name.elements.flatMap((element) =>
		ts.isOmittedExpression(element) ? [] : bindingNames(element.name)
	);
}

function isRenderValue(expression: ts.Expression): boolean {
	return ts.isArrowFunction(expression) || ts.isFunctionExpression(expression);
}
