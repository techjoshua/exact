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
					const bindings: Array<Readonly<{ target: ts.Expression; access: string }>> = [];
					collectDestructuredStateBindings(
						sourceFile,
						expression.left,
						'__exactDestructured',
						bindings
					);
					if (!bindings.length) return;
					const valueName = `__exactDestructured_${candidate.getStart(sourceFile)}`;
					const body = bindings
						.map(
							(binding) =>
								`${binding.target.getText(sourceFile)} = ${binding.access.replace('__exactDestructured', valueName)};`
						)
						.join(' ');
					edits.push({
						start: candidate.getStart(sourceFile),
						end: candidate.end,
						text: `{ const ${valueName} = ${expression.right.getText(sourceFile)}; ${body} }`
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

function collectDestructuredStateBindings(
	sourceFile: ts.SourceFile,
	pattern: ts.ArrayLiteralExpression | ts.ObjectLiteralExpression,
	access: string,
	bindings: Array<Readonly<{ target: ts.Expression; access: string }>>
): void {
	if (ts.isArrayLiteralExpression(pattern)) {
		pattern.elements.forEach((element, index) => {
			if (ts.isOmittedExpression(element)) return;
			if (ts.isSpreadElement(element))
				throw componentComputationError(
					sourceFile,
					element,
					'error: rest targets are not supported in derived state destructuring'
				);
			collectDestructuredStateBinding(sourceFile, element, `${access}[${index}]`, bindings);
		});
		return;
	}
	for (const property of pattern.properties) {
		if (ts.isSpreadAssignment(property))
			throw componentComputationError(
				sourceFile,
				property,
				'error: rest targets are not supported in derived state destructuring'
			);
		if (!ts.isPropertyAssignment(property))
			throw componentComputationError(
				sourceFile,
				property,
				'error: every derived object-destructuring entry must explicitly target this.state'
			);
		collectDestructuredStateBinding(
			sourceFile,
			property.initializer,
			`${access}${propertyNameAccess(sourceFile, property.name)}`,
			bindings
		);
	}
}

function collectDestructuredStateBinding(
	sourceFile: ts.SourceFile,
	target: ts.Expression,
	access: string,
	bindings: Array<Readonly<{ target: ts.Expression; access: string }>>
): void {
	if (ts.isArrayLiteralExpression(target) || ts.isObjectLiteralExpression(target)) {
		collectDestructuredStateBindings(sourceFile, target, access, bindings);
		return;
	}
	if (!componentStatePath(target))
		throw componentComputationError(
			sourceFile,
			target,
			'error: every derived destructuring target must be a writable this.state location'
		);
	bindings.push({ target, access });
}

function propertyNameAccess(sourceFile: ts.SourceFile, name: ts.PropertyName): string {
	if (ts.isComputedPropertyName(name))
		throw componentComputationError(
			sourceFile,
			name,
			'error: computed keys are not supported in derived state destructuring'
		);
	if (ts.isIdentifier(name)) return `.${name.text}`;
	return `[${name.getText(sourceFile)}]`;
}
