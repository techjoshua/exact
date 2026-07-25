import ts from 'typescript';
import type { ClientIslandElementNode, HelperNames } from '../../types.js';
import type { DerivedReactiveIndex } from './contracts.js';
import { canonicalElementId } from './element-emission.js';
import {
	jsxElementIsClientIsland,
	staticJsxPropertyName,
	staticJsxSpreadProperties,
	unwrapJsxSpreadExpression
} from './inspection.js';
import { childrenExpressions } from './node-emission.js';
import { propName } from './property-emission.js';
import { tagExpression } from './reactive-emission.js';

/** Reports whether an extracted intrinsic island is safe to leave dormant until interaction. */
export function isInteractionHydrationIsland(
	node: ClientIslandElementNode,
	hasServerOnlyChildren: boolean
): boolean {
	if (hasServerOnlyChildren) return false;
	const attributes = ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;
	const activationEvents = new Set([
		'onAuxClick',
		'onAuxClickCapture',
		'onBeforeInput',
		'onBeforeInputCapture',
		'onBlur',
		'onBlurCapture',
		'onChange',
		'onChangeCapture',
		'onClick',
		'onClickCapture',
		'onCompositionEnd',
		'onCompositionEndCapture',
		'onCompositionStart',
		'onCompositionStartCapture',
		'onCompositionUpdate',
		'onCompositionUpdateCapture',
		'onContextMenu',
		'onContextMenuCapture',
		'onDoubleClick',
		'onDoubleClickCapture',
		'onDragEnd',
		'onDragEndCapture',
		'onDragEnter',
		'onDragEnterCapture',
		'onDragLeave',
		'onDragLeaveCapture',
		'onDragOver',
		'onDragOverCapture',
		'onDragStart',
		'onDragStartCapture',
		'onDrop',
		'onDropCapture',
		'onFocus',
		'onFocusCapture',
		'onFocusIn',
		'onFocusInCapture',
		'onFocusOut',
		'onFocusOutCapture',
		'onInput',
		'onInputCapture',
		'onKeyDown',
		'onKeyDownCapture',
		'onKeyUp',
		'onKeyUpCapture',
		'onMouseDown',
		'onMouseDownCapture',
		'onMouseUp',
		'onMouseUpCapture',
		'onPointerDown',
		'onPointerDownCapture',
		'onPointerUp',
		'onPointerUpCapture',
		'onSubmit',
		'onSubmitCapture',
		'onTouchEnd',
		'onTouchEndCapture',
		'onTouchStart',
		'onTouchStartCapture',
		'onWheel',
		'onWheelCapture'
	]);
	for (const attribute of attributes.properties) {
		if (ts.isJsxSpreadAttribute(attribute)) {
			if (!isSafeInteractionSpread(attribute.expression, activationEvents)) return false;
			continue;
		}
		const name = attribute.name.getText();
		if (name === 'ref') return false;
		if (/^on[A-Z]/.test(name) && !activationEvents.has(name)) return false;
	}
	if (ts.isJsxElement(node) && containsNestedClientIsland(node)) return false;
	return true;
}

function isSafeInteractionSpread(
	expression: ts.Expression,
	activationEvents: Set<string>
): boolean {
	const properties = staticJsxSpreadProperties(expression);
	if (!properties) return false;
	for (const { name } of properties) {
		if (name === 'ref') return false;
		if (/^on[A-Z]/.test(name) && !activationEvents.has(name)) return false;
	}
	return true;
}

/** Adds compiler-private hydration policy and inert SSR output to boundary props. */
export function addInteractionHydrationMetadata(
	sourceFile: ts.SourceFile,
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	helpers: HelperNames,
	node: ClientIslandElementNode,
	props: ts.ObjectLiteralExpression,
	derivedReactiveLocals?: DerivedReactiveIndex
): ts.ObjectLiteralExpression {
	const factory = context.factory;
	return factory.updateObjectLiteralExpression(props, [
		...props.properties,
		factory.createPropertyAssignment(
			'__exactHydration',
			factory.createStringLiteral('interaction')
		),
		factory.createPropertyAssignment(
			'__exactHydrationFallback',
			createInteractionHydrationFallback(
				sourceFile,
				context,
				visitor,
				helpers,
				node,
				derivedReactiveLocals
			)
		)
	]);
}

function containsNestedClientIsland(node: ts.JsxElement): boolean {
	let nestedClientIsland = false;
	const inspect = (current: ts.Node): void => {
		if (nestedClientIsland) return;
		if (
			(ts.isJsxElement(current) && jsxElementIsClientIsland(current.openingElement.attributes)) ||
			(ts.isJsxSelfClosingElement(current) && jsxElementIsClientIsland(current.attributes))
		) {
			nestedClientIsland = true;
			return;
		}
		ts.forEachChild(current, inspect);
	};
	for (const child of node.children) inspect(child);
	return nestedClientIsland;
}

/** Creates the inert intrinsic tree adopted when an interaction activates an island. */
function createInteractionHydrationFallback(
	sourceFile: ts.SourceFile,
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	helpers: HelperNames,
	node: ClientIslandElementNode,
	derivedReactiveLocals?: DerivedReactiveIndex
): ts.Expression {
	const tagName = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
	const attributes = ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;
	const children = ts.isJsxElement(node) ? node.children : [];
	return context.factory.createCallExpression(
		context.factory.createIdentifier(helpers.element),
		undefined,
		[
			tagExpression(tagName),
			interactionFallbackProps(sourceFile, context, visitor, node, attributes),
			...childrenExpressions(context, children, visitor, helpers, sourceFile, derivedReactiveLocals)
		]
	);
}

/** Reproduces server-safe intrinsic props while omitting client handlers and refs. */
function interactionFallbackProps(
	sourceFile: ts.SourceFile,
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	node: ClientIslandElementNode,
	attributes: ts.JsxAttributes
): ts.ObjectLiteralExpression {
	const factory = context.factory;
	const properties: ts.ObjectLiteralElementLike[] = [];
	const exactId = canonicalElementId(sourceFile, node);
	if (exactId)
		properties.push(
			factory.createPropertyAssignment(
				propName('data-exact-id'),
				factory.createStringLiteral(exactId)
			)
		);
	for (const attribute of attributes.properties) {
		if (ts.isJsxSpreadAttribute(attribute)) {
			properties.push(
				factory.createSpreadAssignment(
					interactionFallbackSpread(context, visitor, attribute.expression)
				)
			);
			continue;
		}
		const name = attribute.name.getText(sourceFile);
		if (name === 'ref' || /^on[A-Z]/.test(name)) continue;
		const fallbackName =
			name === 'value:input' || name === 'value:change'
				? 'value'
				: name === 'checked:change'
					? 'checked'
					: name;
		if (!attribute.initializer) {
			properties.push(
				factory.createPropertyAssignment(propName(fallbackName), factory.createTrue())
			);
		} else if (ts.isStringLiteral(attribute.initializer)) {
			properties.push(
				factory.createPropertyAssignment(
					propName(fallbackName),
					factory.createStringLiteral(attribute.initializer.text)
				)
			);
		} else if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
			properties.push(
				factory.createPropertyAssignment(
					propName(fallbackName),
					ts.visitNode(attribute.initializer.expression, visitor) as ts.Expression
				)
			);
		}
	}
	return factory.createObjectLiteralExpression(properties, false);
}

function interactionFallbackSpread(
	context: ts.TransformationContext,
	visitor: ts.Visitor,
	expression: ts.Expression
): ts.Expression {
	const value = unwrapJsxSpreadExpression(expression);
	if (!ts.isObjectLiteralExpression(value))
		return ts.visitNode(expression, visitor) as ts.Expression;
	return context.factory.updateObjectLiteralExpression(
		value,
		value.properties
			.filter((property) => {
				const name = property.name && staticJsxPropertyName(property.name);
				return name !== 'ref' && !(name && /^on[A-Z]/.test(name));
			})
			.map((property) => ts.visitNode(property, visitor) as ts.ObjectLiteralElementLike)
	);
}
