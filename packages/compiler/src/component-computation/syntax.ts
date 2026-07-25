import ts from 'typescript';

/** One source-preserving edit applied by component computation normalization. */
export type ComponentComputationTextEdit = Readonly<{
	start: number;
	end: number;
	text: string;
	order?: number;
}>;

/** Applies source edits from right to left so original offsets remain stable. */
export function applyComponentComputationEdits(
	source: string,
	edits: readonly ComponentComputationTextEdit[]
): string {
	let output = source;
	for (const edit of [...edits].sort(
		(left, right) =>
			right.start - left.start || right.end - left.end || (right.order ?? 0) - (left.order ?? 0)
	)) {
		output = `${output.slice(0, edit.start)}${edit.text}${output.slice(edit.end)}`;
	}
	return output;
}

/** Creates a compiler diagnostic anchored to an authored syntax node. */
export function componentComputationError(
	sourceFile: ts.SourceFile,
	node: ts.Node,
	message: string
): Error {
	const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
	return new Error(
		`${sourceFile.fileName}:${location.line + 1}:${location.character + 1} - ${message}`
	);
}

/** Visits a control-flow region without entering nested functions. */
export function visitDirectComponentSyntax(node: ts.Node, visit: (node: ts.Node) => void): void {
	const walk = (current: ts.Node): void => {
		if (current !== node && ts.isFunctionLike(current)) return;
		visit(current);
		ts.forEachChild(current, walk);
	};
	walk(node);
}

/** Returns the canonical state path for a statically writable component-state expression. */
export function componentStatePath(node: ts.Node): string | undefined {
	if (!ts.isExpression(node)) return undefined;
	const segments: string[] = [];
	let current: ts.Expression = node;
	while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
		if (
			ts.isPropertyAccessExpression(current) &&
			current.expression.kind === ts.SyntaxKind.ThisKeyword &&
			current.name.text === 'state'
		)
			return segments.length ? `this.state.${segments.join('.')}` : 'this.state';
		if (ts.isPropertyAccessExpression(current)) segments.unshift(current.name.text);
		else if (current.argumentExpression && ts.isStringLiteralLike(current.argumentExpression))
			segments.unshift(current.argumentExpression.text);
		else return undefined;
		current = current.expression;
	}
	return undefined;
}

/** Collects statically writable state leaves from a direct or destructured assignment target. */
export function componentStateTargets(node: ts.Expression): ts.Expression[] {
	if (componentStatePath(node)) return [node];
	if (ts.isArrayLiteralExpression(node))
		return node.elements.flatMap((element) =>
			ts.isOmittedExpression(element) || ts.isSpreadElement(element)
				? []
				: componentStateTargets(element)
		);
	if (ts.isObjectLiteralExpression(node))
		return node.properties.flatMap((property) => {
			if (ts.isPropertyAssignment(property)) return componentStateTargets(property.initializer);
			if (ts.isShorthandPropertyAssignment(property)) return componentStateTargets(property.name);
			return [];
		});
	return [];
}

/** Reports whether an identifier is syntax rather than a value reference. */
export function isNonReferenceComponentIdentifier(node: ts.Identifier): boolean {
	const parent = node.parent;
	return (
		(ts.isPropertyAccessExpression(parent) && parent.name === node) ||
		(ts.isPropertyAssignment(parent) && parent.name === node) ||
		(ts.isMethodDeclaration(parent) && parent.name === node) ||
		(ts.isPropertyDeclaration(parent) && parent.name === node)
	);
}

/** Reports whether a call explicitly suppresses reactive observation. */
export function isComponentPeekCall(node: ts.CallExpression): boolean {
	return ts.isIdentifier(node.expression) && node.expression.text === 'peek';
}

/** Reports whether an expression selects this.task or one of its public facets. */
export function isComponentTaskExpression(expression: ts.Expression): boolean {
	let current = expression;
	while (ts.isPropertyAccessExpression(current)) current = current.expression;
	return (
		ts.isPropertyAccessExpression(expression) &&
		current.kind === ts.SyntaxKind.ThisKeyword &&
		taskRootName(expression) === 'task'
	);
}

/** Reports whether a syntax subtree contains authored JSX. */
export function containsComponentJsx(node: ts.Node): boolean {
	let found = false;
	const visit = (current: ts.Node): void => {
		if (found) return;
		if (
			ts.isJsxElement(current) ||
			ts.isJsxSelfClosingElement(current) ||
			ts.isJsxFragment(current)
		) {
			found = true;
			return;
		}
		ts.forEachChild(current, visit);
	};
	visit(node);
	return found;
}

/** Recognizes component functions from their receiver contract or conventional declaration shape. */
export function isComponentComputationFunction(node: ts.Node): node is ts.FunctionLikeDeclaration {
	if (
		!ts.isFunctionDeclaration(node) &&
		!ts.isFunctionExpression(node) &&
		!ts.isArrowFunction(node)
	)
		return false;
	if (
		node.parameters.some((parameter) => {
			if (!ts.isIdentifier(parameter.name) || parameter.name.text !== 'this') return false;
			return /(?:^|\W)Component(?:<|$)/.test(parameter.type?.getText() ?? '');
		})
	)
		return true;
	if (ts.isArrowFunction(node)) return false;
	const name = node.name?.text;
	return !!name && /^\p{Lu}/u.test(name) && !!node.body && containsComponentJsx(node.body);
}

function taskRootName(expression: ts.PropertyAccessExpression): string | undefined {
	let current: ts.Expression = expression;
	let name: string | undefined;
	while (ts.isPropertyAccessExpression(current)) {
		name = current.name.text;
		if (current.expression.kind === ts.SyntaxKind.ThisKeyword) return name;
		current = current.expression;
	}
	return undefined;
}
