import ts from 'typescript';
import { isServerOnlyModule } from '../imports.js';
import { browserPlatformGlobals } from '../platform-effects.js';
import {
	componentStatePath,
	componentStateTargets,
	isComponentPeekCall,
	isNonReferenceComponentIdentifier
} from './syntax.js';

/** Reactive and environment-sensitive local bindings visible to one component setup. */
export type ComponentComputationLocals = Readonly<{
	props?: string;
	reactive: ReadonlySet<string>;
}>;

/** Observable inputs and state destinations found in one replayable setup statement. */
export type ComponentStatementEffects = Readonly<{
	reactive: boolean;
	readPaths: ReadonlySet<string>;
	writes: readonly Readonly<{ node: ts.Node; path?: string }>[];
}>;

/** Resolves component-local aliases that carry reactive or environment-specific values. */
export function analyzeComponentComputationLocals(
	component: ts.FunctionLikeDeclaration,
	statements: readonly ts.Statement[],
	environmentBindings: ReadonlySet<string>
): ComponentComputationLocals {
	const propsParameter = component.parameters.find(
		(parameter) =>
			!(ts.isIdentifier(parameter.name) && parameter.name.text === 'this') &&
			ts.isIdentifier(parameter.name)
	);
	const props =
		propsParameter && ts.isIdentifier(propsParameter.name) ? propsParameter.name.text : undefined;
	const reactive = new Set<string>(environmentBindings);
	let changed = true;
	while (changed) {
		changed = false;
		for (const statement of statements) {
			if (!ts.isVariableStatement(statement)) continue;
			for (const declaration of statement.declarationList.declarations) {
				if (
					!ts.isIdentifier(declaration.name) ||
					!declaration.initializer ||
					reactive.has(declaration.name.text)
				)
					continue;
				if (containsReactiveRead(declaration.initializer, { props, reactive })) {
					reactive.add(declaration.name.text);
					changed = true;
				}
			}
		}
	}
	return { props, reactive };
}

/** Collects browser globals and bindings imported from server-only modules. */
export function componentEnvironmentBindings(sourceFile: ts.SourceFile): ReadonlySet<string> {
	const bindings = new Set(browserPlatformGlobals);
	for (const statement of sourceFile.statements) {
		if (
			!ts.isImportDeclaration(statement) ||
			!ts.isStringLiteral(statement.moduleSpecifier) ||
			!isServerOnlyModule(statement.moduleSpecifier.text) ||
			!statement.importClause
		)
			continue;
		const clause = statement.importClause;
		if (clause.name) bindings.add(clause.name.text);
		if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings))
			bindings.add(clause.namedBindings.name.text);
		else if (clause.namedBindings)
			for (const element of clause.namedBindings.elements) bindings.add(element.name.text);
	}
	return bindings;
}

/** Inspects one replayable statement without crossing into nested function bodies. */
export function inspectComponentStatement(
	statement: ts.Statement,
	locals: ComponentComputationLocals
): ComponentStatementEffects {
	const readPaths = new Set<string>();
	const writes: Array<Readonly<{ node: ts.Node; path?: string }>> = [];
	let reactive = false;

	const visit = (node: ts.Node, assignmentTarget = false): void => {
		if (node !== statement && ts.isFunctionLike(node)) return;
		if (ts.isCallExpression(node) && isComponentPeekCall(node)) return;
		if (
			ts.isBinaryExpression(node) &&
			node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
			node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
		) {
			for (const target of componentStateTargets(node.left))
				writes.push({ node: target, path: componentStatePath(target) });
			visit(node.left, true);
			visit(node.right);
			return;
		}
		if (
			(ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
			(node.operator === ts.SyntaxKind.PlusPlusToken ||
				node.operator === ts.SyntaxKind.MinusMinusToken)
		) {
			const path = componentStatePath(node.operand);
			if (path) writes.push({ node: node.operand, path });
			visit(node.operand, true);
			return;
		}
		const path = componentStatePath(node);
		if (path && !assignmentTarget) {
			reactive = true;
			readPaths.add(path);
			return;
		}
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			node.expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
			node.expression.name.text === 'getContext'
		)
			reactive = true;
		if (
			ts.isIdentifier(node) &&
			!assignmentTarget &&
			!isNonReferenceComponentIdentifier(node) &&
			(node.text === locals.props || locals.reactive.has(node.text))
		)
			reactive = true;
		ts.forEachChild(node, (child) => visit(child, assignmentTarget));
	};
	visit(statement);
	return { reactive, readPaths, writes };
}

function containsReactiveRead(node: ts.Node, locals: ComponentComputationLocals): boolean {
	let found = false;
	const visit = (current: ts.Node): void => {
		if (found || (current !== node && ts.isFunctionLike(current))) return;
		if (ts.isCallExpression(current) && isComponentPeekCall(current)) return;
		if (componentStatePath(current)) {
			found = true;
			return;
		}
		if (
			ts.isCallExpression(current) &&
			ts.isPropertyAccessExpression(current.expression) &&
			current.expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
			current.expression.name.text === 'getContext'
		) {
			found = true;
			return;
		}
		if (
			ts.isIdentifier(current) &&
			!isNonReferenceComponentIdentifier(current) &&
			(current.text === locals.props || locals.reactive.has(current.text))
		) {
			found = true;
			return;
		}
		ts.forEachChild(current, visit);
	};
	visit(node);
	return found;
}
