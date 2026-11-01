import ts from 'typescript';
import { expect } from 'vitest';

function nodes(root: ts.Node): ts.Node[] {
	const result = [root];
	ts.forEachChild(root, (child) => {
		result.push(...nodes(child));
	});
	return result;
}
function expression(node: ts.Expression): ts.Expression {
	while (
		ts.isParenthesizedExpression(node) ||
		ts.isAsExpression(node) ||
		ts.isNonNullExpression(node)
	)
		node = node.expression;
	return node;
}
function source(text: string): ts.SourceFile {
	return ts.createSourceFile('artifact.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

/** Checks the implementation bound by the public island export and returns its actual input formal. */
export function islandInputFormal(text: string, name: string): string {
	const file = source(text);
	const declaration = file.statements
		.flatMap((statement) =>
			ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : []
		)
		.find((node) => ts.isIdentifier(node.name) && node.name.text === name);
	if (!declaration?.initializer) throw new Error(`Missing component export ${name}`);
	const call = expression(declaration.initializer);
	if (!ts.isCallExpression(call)) throw new Error('Component export is not an initializer call');
	const wrapper = expression(call.expression);
	if (!ts.isArrowFunction(wrapper) || !ts.isBlock(wrapper.body))
		throw new Error('Missing island implementation owner');
	const implementation = wrapper.body.statements.find(
		(node): node is ts.FunctionDeclaration =>
			ts.isFunctionDeclaration(node) && node.name?.text === name
	);
	const returned = wrapper.body.statements.find(ts.isReturnStatement);
	if (!implementation || !returned?.expression)
		throw new Error('Missing island implementation or return');
	const brand = expression(returned.expression);
	expect(ts.isCallExpression(brand) && brand.arguments[0]?.getText(file)).toBe(name);
	const [receiver, input] = implementation.parameters;
	expect(receiver?.name.getText(file)).toBe('this');
	expect(receiver?.type?.kind).toBe(ts.SyntaxKind.AnyKeyword);
	if (!input || !ts.isIdentifier(input.name)) throw new Error('Missing island input identifier');
	expect(input.type?.kind).toBe(ts.SyntaxKind.AnyKeyword);
	expect(
		input.initializer &&
			ts.isObjectLiteralExpression(input.initializer) &&
			input.initializer.properties.length
	).toBe(0);
	return input.name.text;
}

function commaTerms(node: ts.Node): ts.Node[] {
	if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node))
		return commaTerms(node.expression);
	return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.CommaToken
		? [...commaTerms(node.left), ...commaTerms(node.right)]
		: [node];
}

/** Reads selected-write dataflow from its enclosing generated assignment sequence, without temporary-name assumptions. */
export function stateWriteFacts(text: string) {
	const file = source(text);
	const helpers = new Map<string, string>();
	for (const statement of file.statements) {
		if (
			!ts.isImportDeclaration(statement) ||
			!ts.isStringLiteral(statement.moduleSpecifier) ||
			!['@exactjs/core/runtime/reactivity', '@exactjs/core/framework/server-task-helpers'].includes(
				statement.moduleSpecifier.text
			)
		)
			continue;
		const names = statement.importClause?.namedBindings;
		if (names && ts.isNamedImports(names))
			for (const name of names.elements)
				helpers.set(name.name.text, name.propertyName?.text ?? name.name.text);
	}
	return nodes(file).flatMap((node) => {
		if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return [];
		const helper = helpers.get(node.expression.text);
		if (helper !== 'writeReactiveLazy' && helper !== 'writeIndexedReactiveValue') return [];
		const [receiver, key, input] = node.arguments;
		if (!receiver || !key || !input) return [];
		const groups: ts.Node[][] = [];
		let gate: ts.BinaryExpression | undefined;
		for (
			let parent: ts.Node | undefined = node.parent;
			parent && !ts.isBlock(parent);
			parent = parent.parent
		) {
			if (!ts.isBinaryExpression(parent)) continue;
			if (parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) gate = parent;
			if (parent.operatorToken.kind !== ts.SyntaxKind.CommaToken) continue;
			const terms = commaTerms(parent),
				index = terms.findIndex((term) => nodes(term).includes(node));
			groups.unshift(terms.slice(0, index));
		}
		const bindings = new Map<string, ts.Expression>();
		for (const term of groups.flat())
			if (
				ts.isBinaryExpression(term) &&
				term.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
				ts.isIdentifier(term.left)
			)
				bindings.set(term.left.text, term.right);
		const selected = (value: ts.Expression): ts.Expression =>
			ts.isIdentifier(expression(value))
				? (bindings.get(expression(value).getText(file)) ?? value)
				: value;
		const value =
			helper === 'writeReactiveLazy' && ts.isArrowFunction(input) && !ts.isBlock(input.body)
				? selected(input.body)
				: selected(input);
		const path = ts.isArrayLiteralExpression(key)
			? key.elements.map((element) =>
					ts.isStringLiteral(element) ? element.text : element.getText(file)
				)
			: Number(key.getText(file));
		const read = gate && selected(gate.left);
		let gateRead: string | undefined;
		if (read && ts.isElementAccessExpression(read))
			gateRead = `${selected(read.expression).getText(file)}[${read.argumentExpression.getText(file)}]`;
		const selectedReceiver = expression(selected(receiver));
		let activationState = false,
			taskGuarded = false;
		for (let parent: ts.Node | undefined = node.parent; parent; parent = parent.parent) {
			if (
				ts.isCallExpression(parent) &&
				ts.isIdentifier(parent.expression) &&
				helpers.get(parent.expression.text) === 'taskMutation'
			)
				taskGuarded = true;
			if (
				!ts.isArrowFunction(parent) ||
				!ts.isPropertyAssignment(parent.parent) ||
				parent.parent.name.getText(file) !== 'execute' ||
				!ts.isBlock(parent.body)
			)
				continue;
			if (
				!ts.isPropertyAccessExpression(selectedReceiver) ||
				selectedReceiver.name.text !== 'state'
			)
				continue;
			const owner = parent.body.statements
				.flatMap((statement) =>
					ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : []
				)
				.find(
					(declaration) =>
						declaration.name.getText(file) === selectedReceiver.expression.getText(file)
				);
			if (!owner?.initializer || !ts.isObjectLiteralExpression(owner.initializer)) continue;
			const state = owner.initializer.properties.find(
				(property): property is ts.PropertyAssignment =>
					ts.isPropertyAssignment(property) && property.name.getText(file) === 'state'
			);
			activationState =
				!!state &&
				expression(state.initializer).getText(file) ===
					`${parent.parameters[0]?.name.getText(file)}.state`;
		}
		return [
			{
				receiver: selectedReceiver.getText(file),
				path,
				value: value.getText(file),
				awaited: ts.isAwaitExpression(expression(value)),
				activationState,
				taskGuarded,
				gate: gate ? '??' : undefined,
				gateRead
			}
		];
	});
}
