import ts from 'typescript';
import type { ExpressionJsxPlan } from '../../expression/jsx.js';
import type { HelperNames } from '../../types.js';

import type { DerivedReactiveIndex } from './contracts.js';
import { expressionEmissionId } from './identity.js';
import { visitReactiveSinkExpression } from './reactive-emission.js';
/** Runs element with the supplied execution context. */
export function callElement(
	context: ts.TransformationContext,
	tag: ts.Expression,
	attributes: ts.JsxAttributes | undefined,
	children: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[],
	visitor: ts.Visitor,
	helpers: HelperNames,
	exactId?: string,
	sourceFile?: ts.SourceFile,
	derivedReactiveLocals?: DerivedReactiveIndex,
	expressionJsx?: ExpressionJsxPlan
): ts.Expression {
	return context.factory.createCallExpression(
		context.factory.createIdentifier(helpers.element),
		undefined,
		[
			tag,
			propsObject(
				context,
				attributes,
				visitor,
				helpers,
				exactId,
				sourceFile,
				derivedReactiveLocals,
				expressionJsx
			),
			...childrenExpressions(
				context,
				children,
				visitor,
				helpers,
				sourceFile,
				derivedReactiveLocals,
				expressionJsx
			)
		]
	);
}

/** Runs fragment with the supplied execution context. */
export function callFragment(
	context: ts.TransformationContext,
	attributes: ts.JsxAttributes | undefined,
	children: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[],
	visitor: ts.Visitor,
	helpers: HelperNames,
	sourceFile?: ts.SourceFile,
	derivedReactiveLocals?: DerivedReactiveIndex,
	expressionJsx?: ExpressionJsxPlan
): ts.Expression {
	return context.factory.createCallExpression(
		context.factory.createIdentifier(helpers.fragment),
		undefined,
		[
			propsObject(
				context,
				attributes,
				visitor,
				helpers,
				undefined,
				sourceFile,
				derivedReactiveLocals,
				expressionJsx
			),
			...childrenExpressions(
				context,
				children,
				visitor,
				helpers,
				sourceFile,
				derivedReactiveLocals,
				expressionJsx
			)
		]
	);
}

/** Performs the props object domain operation. */
export function propsObject(
	context: ts.TransformationContext,
	attributes: ts.JsxAttributes | undefined,
	visitor: ts.Visitor,
	helpers: HelperNames,
	exactId?: string,
	sourceFile?: ts.SourceFile,
	derivedReactiveLocals?: DerivedReactiveIndex,
	expressionJsx?: ExpressionJsxPlan
): ts.Expression {
	const factory = context.factory;
	const properties: ts.ObjectLiteralElementLike[] = [];
	if (exactId) {
		properties.push(
			factory.createPropertyAssignment(
				factory.createStringLiteral('data-exact-id'),
				factory.createStringLiteral(exactId)
			)
		);
	}

	for (const property of attributes?.properties ?? []) {
		if (ts.isJsxSpreadAttribute(property)) {
			properties.push(
				factory.createSpreadAssignment(ts.visitNode(property.expression, visitor) as ts.Expression)
			);
			continue;
		}

		const name = property.name.getText();
		if (!property.initializer) {
			properties.push(factory.createPropertyAssignment(propName(name), factory.createTrue()));
			continue;
		}

		if (ts.isStringLiteral(property.initializer)) {
			properties.push(factory.createPropertyAssignment(propName(name), property.initializer));
			continue;
		}

		if (ts.isJsxExpression(property.initializer)) {
			const expression = property.initializer.expression;
			if (!expression) continue;
			const binding = expressionJsx?.bindings.get(expressionEmissionId(property.initializer) ?? '');
			if (binding) {
				const visited = ts.visitNode(expression, visitor) as ts.Expression;
				const valueAttribute = attributes?.properties.find(
					(candidate): candidate is ts.JsxAttribute =>
						ts.isJsxAttribute(candidate) && candidate.name.getText() === 'value'
				);
				properties.push(
					...bindingPropertyAssignments(
						context,
						visited,
						binding,
						valueAttribute,
						visitor,
						helpers,
						sourceFile,
						derivedReactiveLocals
					)
				);
				continue;
			}
			const plannedCell = isPlannedJsxCell(
				property.initializer,
				'jsx-attribute',
				sourceFile,
				expressionJsx
			);
			properties.push(
				factory.createPropertyAssignment(
					propName(name),
					shouldWrapAttribute(name, expression) && plannedCell
						? wrapExpression(
								context,
								expression,
								visitor,
								helpers,
								sourceFile,
								derivedReactiveLocals
							)
						: (ts.visitNode(expression, visitor) as ts.Expression)
				)
			);
		}
	}

	return factory.createObjectLiteralExpression(properties, false);
}

/** Lowers one namespaced reactive form attribute to its projected prop and private listener. */
export function bindingPropertyAssignments(
	context: ts.TransformationContext,
	target: ts.Expression,
	binding: import('../../expression/jsx.js').ExpressionJsxBinding,
	valueAttribute: ts.JsxAttribute | undefined,
	visitor: ts.Visitor,
	helpers: HelperNames,
	sourceFile?: ts.SourceFile,
	derivedReactiveLocals?: DerivedReactiveIndex
): ts.PropertyAssignment[] {
	const factory = context.factory;
	const boundProperty =
		binding.control === 'checked' ||
		binding.control === 'checkbox-group' ||
		binding.control === 'radio'
			? 'checked'
			: 'value';
	const projection =
		binding.control === 'radio'
			? factory.createBinaryExpression(
					target,
					factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
					bindingOptionExpression(valueAttribute, visitor)
				)
			: binding.control === 'checkbox-group'
				? factory.createCallExpression(
						factory.createPropertyAccessExpression(
							factory.createParenthesizedExpression(
								factory.createBinaryExpression(
									target,
									factory.createToken(ts.SyntaxKind.QuestionQuestionToken),
									factory.createArrayLiteralExpression()
								)
							),
							'includes'
						),
						undefined,
						[
							convertBindingValue(
								factory,
								bindingOptionExpression(valueAttribute, visitor),
								binding
							)
						]
					)
				: createBindingProjection(factory, target, binding);
	return [
		factory.createPropertyAssignment(
			propName(boundProperty),
			wrapExpression(context, projection, visitor, helpers, sourceFile, derivedReactiveLocals)
		),
		factory.createPropertyAssignment(
			propName(binding.event === 'input' ? '__exactBindInput' : '__exactBindChange'),
			createBindingHandler(context, target, binding, valueAttribute, visitor)
		)
	];
}

function createBindingProjection(
	factory: ts.NodeFactory,
	value: ts.Expression,
	binding: import('../../expression/jsx.js').ExpressionJsxBinding
): ts.Expression {
	if (binding.control === 'checked')
		return factory.createBinaryExpression(
			value,
			factory.createToken(ts.SyntaxKind.QuestionQuestionToken),
			factory.createFalse()
		);
	if (binding.control === 'multiple')
		return factory.createBinaryExpression(
			value,
			factory.createToken(ts.SyntaxKind.QuestionQuestionToken),
			factory.createArrayLiteralExpression()
		);
	if (binding.valueKind === 'number') {
		const empty = factory.createBinaryExpression(
			value,
			factory.createToken(ts.SyntaxKind.EqualsEqualsToken),
			factory.createNull()
		);
		const nan = factory.createCallExpression(
			factory.createPropertyAccessExpression(factory.createIdentifier('Number'), 'isNaN'),
			undefined,
			[value]
		);
		return factory.createConditionalExpression(
			factory.createBinaryExpression(empty, factory.createToken(ts.SyntaxKind.BarBarToken), nan),
			factory.createToken(ts.SyntaxKind.QuestionToken),
			factory.createStringLiteral(''),
			factory.createToken(ts.SyntaxKind.ColonToken),
			factory.createCallExpression(factory.createIdentifier('String'), undefined, [value])
		);
	}
	if (binding.valueKind === 'string')
		return factory.createBinaryExpression(
			value,
			factory.createToken(ts.SyntaxKind.QuestionQuestionToken),
			factory.createStringLiteral('')
		);
	return value;
}

function bindingOptionExpression(
	attribute: ts.JsxAttribute | undefined,
	visitor: ts.Visitor
): ts.Expression {
	if (!attribute?.initializer) return ts.factory.createStringLiteral('');
	if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer;
	if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression)
		return ts.visitNode(attribute.initializer.expression, visitor) as ts.Expression;
	return ts.factory.createStringLiteral('');
}

function convertBindingValue(
	factory: ts.NodeFactory,
	value: ts.Expression,
	binding: import('../../expression/jsx.js').ExpressionJsxBinding,
	widenString = false
): ts.Expression {
	return binding.valueKind === 'number'
		? factory.createCallExpression(factory.createIdentifier('Number'), undefined, [value])
		: binding.valueKind === 'date'
			? factory.createNewExpression(factory.createIdentifier('Date'), undefined, [value])
			: binding.valueKind === 'string' && widenString
				? factory.createAsExpression(value, factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword))
				: value;
}

function createBindingHandler(
	context: ts.TransformationContext,
	target: ts.Expression,
	binding: import('../../expression/jsx.js').ExpressionJsxBinding,
	valueAttribute: ts.JsxAttribute | undefined,
	visitor: ts.Visitor
): ts.ArrowFunction {
	const factory = context.factory;
	const event = factory.createIdentifier('event');
	const current = factory.createPropertyAccessExpression(event, 'currentTarget');
	const empty =
		binding.empty === 'null'
			? factory.createNull()
			: binding.empty === 'undefined'
				? factory.createIdentifier('undefined')
				: binding.valueKind === 'number'
					? factory.createPropertyAccessExpression(factory.createIdentifier('Number'), 'NaN')
					: binding.valueKind === 'date'
						? factory.createNewExpression(factory.createIdentifier('Date'), undefined, [
								factory.createPropertyAccessExpression(factory.createIdentifier('Number'), 'NaN')
							])
						: factory.createStringLiteral('');
	const convert = (value: ts.Expression): ts.Expression =>
		convertBindingValue(factory, value, binding, true);
	if (binding.control === 'checkbox-group') {
		const item = factory.createIdentifier('item');
		const values = factory.createIdentifier('values');
		const next = factory.createIdentifier('next');
		const option = factory.createIdentifier('value');
		const currentValues = factory.createBinaryExpression(
			target,
			factory.createToken(ts.SyntaxKind.QuestionQuestionToken),
			factory.createArrayLiteralExpression()
		);
		const added = factory.createConditionalExpression(
			factory.createCallExpression(
				factory.createPropertyAccessExpression(values, 'includes'),
				undefined,
				[option]
			),
			factory.createToken(ts.SyntaxKind.QuestionToken),
			values,
			factory.createToken(ts.SyntaxKind.ColonToken),
			factory.createArrayLiteralExpression([factory.createSpreadElement(values), option], false)
		);
		const removed = factory.createCallExpression(
			factory.createPropertyAccessExpression(values, 'filter'),
			undefined,
			[
				factory.createArrowFunction(
					undefined,
					undefined,
					[factory.createParameterDeclaration(undefined, undefined, item)],
					undefined,
					factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
					factory.createBinaryExpression(
						item,
						factory.createToken(ts.SyntaxKind.ExclamationEqualsEqualsToken),
						option
					)
				)
			]
		);
		const assignedValue =
			binding.empty === 'value'
				? next
				: factory.createConditionalExpression(
						factory.createPropertyAccessExpression(next, 'length'),
						factory.createToken(ts.SyntaxKind.QuestionToken),
						next,
						factory.createToken(ts.SyntaxKind.ColonToken),
						empty
					);
		return factory.createArrowFunction(
			undefined,
			undefined,
			[
				factory.createParameterDeclaration(
					undefined,
					undefined,
					event,
					undefined,
					bindingEventType(factory, binding)
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
									option,
									undefined,
									undefined,
									convert(factory.createPropertyAccessExpression(current, 'value'))
								)
							],
							ts.NodeFlags.Const
						)
					),
					factory.createVariableStatement(
						undefined,
						factory.createVariableDeclarationList(
							[factory.createVariableDeclaration(values, undefined, undefined, currentValues)],
							ts.NodeFlags.Const
						)
					),
					factory.createVariableStatement(
						undefined,
						factory.createVariableDeclarationList(
							[
								factory.createVariableDeclaration(
									next,
									undefined,
									undefined,
									factory.createConditionalExpression(
										factory.createPropertyAccessExpression(current, 'checked'),
										factory.createToken(ts.SyntaxKind.QuestionToken),
										added,
										factory.createToken(ts.SyntaxKind.ColonToken),
										removed
									)
								)
							],
							ts.NodeFlags.Const
						)
					),
					factory.createExpressionStatement(
						factory.createBinaryExpression(
							target,
							factory.createToken(ts.SyntaxKind.EqualsToken),
							assignedValue
						)
					)
				],
				true
			)
		);
	}
	let read: ts.Expression;
	if (binding.control === 'checked') {
		read = factory.createPropertyAccessExpression(current, 'checked');
	} else if (binding.control === 'radio') {
		read = convert(bindingOptionExpression(valueAttribute, visitor));
	} else if (binding.control === 'multiple') {
		const option = factory.createIdentifier('option');
		const values = factory.createCallExpression(
			factory.createPropertyAccessExpression(factory.createIdentifier('Array'), 'from'),
			undefined,
			[
				factory.createPropertyAccessExpression(current, 'selectedOptions'),
				factory.createArrowFunction(
					undefined,
					undefined,
					[factory.createParameterDeclaration(undefined, undefined, option)],
					undefined,
					factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
					convert(factory.createPropertyAccessExpression(option, 'value'))
				)
			]
		);
		read =
			binding.empty === 'value'
				? values
				: factory.createConditionalExpression(
						factory.createPropertyAccessExpression(
							factory.createPropertyAccessExpression(current, 'selectedOptions'),
							'length'
						),
						factory.createToken(ts.SyntaxKind.QuestionToken),
						values,
						factory.createToken(ts.SyntaxKind.ColonToken),
						empty
					);
	} else {
		const value = factory.createPropertyAccessExpression(current, 'value');
		const converted =
			binding.valueKind === 'number'
				? binding.element === 'input'
					? factory.createPropertyAccessExpression(current, 'valueAsNumber')
					: convert(value)
				: binding.valueKind === 'date'
					? factory.createPropertyAccessExpression(current, 'valueAsDate')
					: convert(value);
		read =
			binding.valueKind === 'string' && binding.empty === 'value'
				? converted
				: factory.createConditionalExpression(
						factory.createBinaryExpression(
							value,
							factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
							factory.createStringLiteral('')
						),
						factory.createToken(ts.SyntaxKind.QuestionToken),
						empty,
						factory.createToken(ts.SyntaxKind.ColonToken),
						converted
					);
	}
	const assignment = factory.createBinaryExpression(
		target,
		factory.createToken(ts.SyntaxKind.EqualsToken),
		read
	);
	const body =
		binding.control === 'radio'
			? factory.createBinaryExpression(
					factory.createPropertyAccessExpression(current, 'checked'),
					factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
					factory.createParenthesizedExpression(assignment)
				)
			: assignment;
	return factory.createArrowFunction(
		undefined,
		undefined,
		[
			factory.createParameterDeclaration(
				undefined,
				undefined,
				event,
				undefined,
				bindingEventType(factory, binding)
			)
		],
		undefined,
		factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
		body
	);
}

function bindingEventType(
	factory: ts.NodeFactory,
	binding: import('../../expression/jsx.js').ExpressionJsxBinding
): ts.TypeNode {
	const element =
		binding.element === 'select'
			? 'HTMLSelectElement'
			: binding.element === 'textarea'
				? 'HTMLTextAreaElement'
				: 'HTMLInputElement';
	return factory.createIntersectionTypeNode([
		factory.createTypeReferenceNode('Event'),
		factory.createTypeLiteralNode([
			factory.createPropertySignature(
				[factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)],
				'currentTarget',
				undefined,
				factory.createTypeReferenceNode(element)
			)
		])
	]);
}

/** Performs the prop name domain operation. */
export function propName(name: string): ts.PropertyName {
	return /^[$A-Z_a-z][$\w]*$/.test(name)
		? ts.factory.createIdentifier(name)
		: ts.factory.createStringLiteral(name);
}

/** Performs the children expressions domain operation. */
export function childrenExpressions(
	context: ts.TransformationContext,
	children: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[],
	visitor: ts.Visitor,
	helpers: HelperNames,
	sourceFile?: ts.SourceFile,
	derivedReactiveLocals?: DerivedReactiveIndex,
	expressionJsx?: ExpressionJsxPlan
): ts.Expression[] {
	const output: ts.Expression[] = [];

	for (const child of children) {
		if (ts.isJsxText(child)) {
			const text = child.text.replace(/\s+/g, ' ');
			if (text.trim()) output.push(context.factory.createStringLiteral(text));
			continue;
		}

		if (ts.isJsxExpression(child)) {
			if (child.expression)
				output.push(
					isPlannedJsxCell(child, 'jsx-child', sourceFile, expressionJsx)
						? wrapDynamicChild(
								context,
								child.expression,
								visitor,
								helpers,
								sourceFile,
								derivedReactiveLocals
							)
						: (ts.visitNode(child.expression, visitor) as ts.Expression)
				);
			continue;
		}

		output.push(ts.visitNode(child, visitor) as ts.Expression);
	}

	return output;
}

/** Reports whether planned jsx cell. */
export function isPlannedJsxCell(
	node: ts.JsxExpression,
	kind: 'jsx-child' | 'jsx-attribute',
	sourceFile?: ts.SourceFile,
	plan?: ExpressionJsxPlan
): boolean {
	if (!plan || !sourceFile) return true;
	const site = plan.cells.get(expressionEmissionId(node) ?? '');
	return site?.kind === kind && !site.preserveNative;
}

/** Reports whether wrap attribute. */
export function shouldWrapAttribute(name: string, expression: ts.Expression): boolean {
	if (name === 'key') return false;
	if (name === 'ref') return false;
	if (/^on[A-Z]/.test(name)) return false;
	if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) return false;
	return true;
}

/** Performs the wrap dynamic child domain operation. */
export function wrapDynamicChild(
	context: ts.TransformationContext,
	expression: ts.Expression,
	visitor: ts.Visitor,
	helpers: HelperNames,
	sourceFile?: ts.SourceFile,
	derivedReactiveLocals?: DerivedReactiveIndex
): ts.Expression {
	const factory = context.factory;
	return factory.createCallExpression(factory.createIdentifier(helpers.dynamic), undefined, [
		factory.createArrowFunction(
			undefined,
			undefined,
			[],
			undefined,
			factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
			visitReactiveSinkExpression(context, expression, visitor, sourceFile, derivedReactiveLocals)
		)
	]);
}

/** Performs the wrap expression domain operation. */
export function wrapExpression(
	context: ts.TransformationContext,
	expression: ts.Expression,
	visitor: ts.Visitor,
	helpers: HelperNames,
	sourceFile?: ts.SourceFile,
	derivedReactiveLocals?: DerivedReactiveIndex
): ts.Expression {
	const factory = context.factory;
	return factory.createCallExpression(factory.createIdentifier(helpers.expression), undefined, [
		factory.createArrowFunction(
			undefined,
			undefined,
			[],
			undefined,
			factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
			visitReactiveSinkExpression(context, expression, visitor, sourceFile, derivedReactiveLocals)
		)
	]);
}
