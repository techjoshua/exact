import ts from 'typescript';
import type { ExactImportedComponentIR } from '../../types.js';

/** Returns whether JSX attributes force an element into a client island. */
export function jsxElementIsClientIsland(attributes: ts.JsxAttributes): boolean {
	return attributes.properties.some((property) => {
		if (ts.isJsxSpreadAttribute(property)) return false;
		const name = property.name.getText();
		return /^on[A-Z]/.test(name) || name === 'ref' || isReactiveFormAttribute(name);
	});
}

/** Returns statically named properties from an inline JSX object spread. */
export function staticJsxSpreadProperties(
	expression: ts.Expression
): readonly Readonly<{ name: string; property: ts.ObjectLiteralElementLike }>[] | undefined {
	const value = unwrapJsxSpreadExpression(expression);
	if (!ts.isObjectLiteralExpression(value)) return undefined;
	const properties: Array<Readonly<{ name: string; property: ts.ObjectLiteralElementLike }>> = [];
	for (const property of value.properties) {
		if (ts.isSpreadAssignment(property) || !property.name) return undefined;
		const name = staticJsxPropertyName(property.name);
		if (!name) return undefined;
		properties.push({ name, property });
	}
	return properties;
}

/** Removes syntax-only wrappers from a JSX spread expression. */
export function unwrapJsxSpreadExpression(expression: ts.Expression): ts.Expression {
	let current = expression;
	while (
		ts.isParenthesizedExpression(current) ||
		ts.isAsExpression(current) ||
		ts.isSatisfiesExpression(current) ||
		ts.isTypeAssertionExpression(current)
	)
		current = current.expression;
	return current;
}

/** Returns a property name only when it is statically knowable. */
export function staticJsxPropertyName(name: ts.PropertyName): string | undefined {
	if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name))
		return name.text;
	return undefined;
}

/** Returns whether a JSX attribute is a compiler-owned reactive form relationship. */
export function isReactiveFormAttribute(name: string): boolean {
	return name === 'value:input' || name === 'value:change' || name === 'checked:change';
}

/** Returns the boundary name used for a JSX component tag. */
export function componentBoundaryName(
	tagName: ts.JsxTagNameExpression,
	componentInfo: Map<string, ExactImportedComponentIR>,
	sourceFile: ts.SourceFile
): string {
	const tagKey = tagName.getText(sourceFile);
	return componentInfo.get(tagKey)?.boundaryName ?? tagKey;
}

/** Returns whether a JSX tag is an intrinsic DOM-like element. */
export function jsxTagIsIntrinsicElement(tagName: ts.JsxTagNameExpression): boolean {
	if (ts.isIdentifier(tagName)) return /^[a-z]/.test(tagName.text);
	return ts.isJsxNamespacedName(tagName);
}

/** Returns whether a JSX element has only empty text children. */
export function jsxElementHasNoMeaningfulChildren(node: ts.JsxElement): boolean {
	return node.children.every((child) => ts.isJsxText(child) && !child.text.trim());
}

/** Converts simple client-component JSX children into a serializable children prop expression. */
export function clientComponentChildrenProp(
	context: ts.TransformationContext,
	node: ts.JsxElement
): ts.Expression | undefined {
	const values: ts.Expression[] = [];
	let text = '';
	for (const child of node.children) {
		if (ts.isJsxText(child)) {
			text += child.text;
			continue;
		}
		const normalized = text.replace(/\s+/g, ' ').trim();
		if (normalized) values.push(context.factory.createStringLiteral(normalized));
		text = '';

		if (ts.isJsxExpression(child)) {
			if (!child.expression) continue;
			if (containsJsx(child.expression)) return undefined;
			values.push(child.expression);
			continue;
		}
		return undefined;
	}
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (normalized) values.push(context.factory.createStringLiteral(normalized));
	if (!values.length) return undefined;
	if (values.length === 1) return values[0];
	return context.factory.createArrayLiteralExpression(values, false);
}

/** Returns whether client component children require a server slot boundary. */
export function clientComponentHasServerSlotChildren(node: ts.JsxElement): boolean {
	for (const child of node.children) {
		if (ts.isJsxText(child)) continue;
		if (ts.isJsxExpression(child)) {
			if (child.expression && containsJsx(child.expression)) return true;
			continue;
		}
		return true;
	}
	return false;
}

/** Returns whether a node subtree contains JSX syntax. */
export function containsJsx(node: ts.Node): boolean {
	let found = false;
	function visit(current: ts.Node): void {
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
	}
	visit(node);
	return found;
}
