import ts from 'typescript';
import {
	applyComponentComputationEdits,
	componentComputationError,
	componentStatePath,
	isComponentComputationFunction,
	type ComponentComputationTextEdit,
	visitDirectComponentSyntax
} from './syntax.js';

/**
 * Rewrites destructured component-state destinations into explicit writes with one captured value.
 *
 * The surrounding owned computation supplies the reactive transaction, while explicit assignments
 * keep compiler state-effect and distributed-continuation contracts complete.
 */
export function preprocessComponentStateDestructuring(source: string, filename: string): string {
	const sourceFile = ts.createSourceFile(
		filename,
		source,
		ts.ScriptTarget.ES2022,
		true,
		ts.ScriptKind.TSX
	);
	const edits: ComponentComputationTextEdit[] = [];
	const visit = (node: ts.Node): void => {
		if (isComponentComputationFunction(node) && node.body && ts.isBlock(node.body)) {
			for (const statement of node.body.statements) {
				if (ts.isReturnStatement(statement)) continue;
				visitDirectComponentSyntax(statement, (candidate) => {
					const expression = ts.isExpressionStatement(candidate)
						? unwrapParentheses(candidate.expression)
						: undefined;
					if (
						!ts.isExpressionStatement(candidate) ||
						!expression ||
						!ts.isBinaryExpression(expression) ||
						expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken ||
						(!ts.isArrayLiteralExpression(expression.left) &&
							!ts.isObjectLiteralExpression(expression.left))
					)
						return;
					const bindings: Array<Readonly<{ target: ts.Expression; temporary: string }>> = [];
					const temporaryPrefix = `__exactDestructured_${candidate.getStart(sourceFile)}`;
					const pattern = rewriteDestructuredStatePattern(
						sourceFile,
						expression.left,
						temporaryPrefix,
						bindings
					);
					if (!bindings.length) return;
					const body = bindings
						.map((binding) => `${binding.target.getText(sourceFile)} = ${binding.temporary};`)
						.join(' ');
					edits.push({
						start: candidate.getStart(sourceFile),
						end: candidate.end,
						text: `{ const ${pattern} = ${expression.right.getText(sourceFile)}; ${body} }`
					});
				});
			}
			return;
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return applyComponentComputationEdits(source, edits);
}

function unwrapParentheses(expression: ts.Expression): ts.Expression {
	let current = expression;
	while (ts.isParenthesizedExpression(current)) current = current.expression;
	return current;
}

function rewriteDestructuredStatePattern(
	sourceFile: ts.SourceFile,
	pattern: ts.Expression,
	temporaryPrefix: string,
	bindings: Array<Readonly<{ target: ts.Expression; temporary: string }>>
): string {
	if (ts.isArrayLiteralExpression(pattern)) {
		return `[${pattern.elements
			.map((element) => {
				if (ts.isOmittedExpression(element)) return '';
				if (ts.isSpreadElement(element))
					return `...${rewriteDestructuredStateTarget(
						sourceFile,
						element.expression,
						temporaryPrefix,
						bindings
					)}`;
				return rewriteDestructuredStateTarget(sourceFile, element, temporaryPrefix, bindings);
			})
			.join(', ')}]`;
	}
	if (!ts.isObjectLiteralExpression(pattern))
		return rewriteDestructuredStateTarget(sourceFile, pattern, temporaryPrefix, bindings);
	return `{ ${pattern.properties
		.map((property) => {
			if (ts.isSpreadAssignment(property))
				return `...${rewriteDestructuredStateTarget(
					sourceFile,
					property.expression,
					temporaryPrefix,
					bindings
				)}`;
			if (!ts.isPropertyAssignment(property))
				throw componentComputationError(
					sourceFile,
					property,
					'error: every derived object-destructuring entry must explicitly target this.state'
				);
			return `${property.name.getText(sourceFile)}: ${rewriteDestructuredStateTarget(
				sourceFile,
				property.initializer,
				temporaryPrefix,
				bindings
			)}`;
		})
		.join(', ')} }`;
}

function rewriteDestructuredStateTarget(
	sourceFile: ts.SourceFile,
	target: ts.Expression,
	temporaryPrefix: string,
	bindings: Array<Readonly<{ target: ts.Expression; temporary: string }>>
): string {
	if (ts.isArrayLiteralExpression(target) || ts.isObjectLiteralExpression(target)) {
		return rewriteDestructuredStatePattern(sourceFile, target, temporaryPrefix, bindings);
	}
	if (ts.isBinaryExpression(target) && target.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
		return `${rewriteDestructuredStateTarget(
			sourceFile,
			target.left,
			temporaryPrefix,
			bindings
		)} = ${target.right.getText(sourceFile)}`;
	}
	if (!componentStatePath(target))
		throw componentComputationError(
			sourceFile,
			target,
			'error: every derived destructuring target must be a writable this.state location'
		);
	const temporary = `${temporaryPrefix}_${bindings.length}`;
	bindings.push({ target, temporary });
	return temporary;
}
