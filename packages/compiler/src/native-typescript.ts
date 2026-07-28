import * as native from '@typescript/native/unstable/ast';
import * as nativeFactory from '@typescript/native/unstable/ast/factory';

export * from '@typescript/native/unstable/ast';

/** Minimal transformation context required by eXact's compiler-owned visitors. */
export type TransformationContext = Readonly<{ factory: NodeFactory }>;

/** Native source transformer factory used by the eXact lowering pipeline. */
export type TransformerFactory<T extends native.Node> = (
	context: TransformationContext
) => (node: T) => T;

/** Factory surface consumed by eXact transforms. Signatures follow TypeScript 6. */
export type NodeFactory = Record<string, (...args: any[]) => any>;
/** Result accepted from an eXact native visitor. */
export type VisitResult<T extends native.Node> = T | readonly T[] | undefined;
const originalNodes = new WeakMap<native.Node, native.Node>();

/** Creates an isolated native factory facade with deterministic generated names. */
export function createTransformationContext(): TransformationContext {
	const generatedNames = new Map<string, number>();
	const overrides: NodeFactory = {
		createBinaryExpression: (left, operator, right) =>
			nativeFactory.createBinaryExpression(undefined, left, undefined, token(operator), right),
		updateBinaryExpression: (node, left, operator, right) =>
			nativeFactory.updateBinaryExpression(
				node,
				node.modifiers,
				left,
				node.type,
				token(operator),
				right
			),
		createPropertyAccessExpression: (expression, name) =>
			nativeFactory.createPropertyAccessExpression(
				expression,
				undefined,
				propertyName(name) as native.MemberName,
				native.NodeFlags.None
			),
		createElementAccessExpression: (expression, argument) =>
			nativeFactory.createElementAccessExpression(
				expression,
				undefined,
				typeof argument === 'number'
					? nativeFactory.createNumericLiteral(String(argument), native.TokenFlags.None)
					: argument,
				native.NodeFlags.None
			),
		createCallExpression: (expression, typeArguments, args) =>
			nativeFactory.createCallExpression(
				expression,
				undefined,
				typeArguments,
				args,
				native.NodeFlags.None
			),
		updateCallExpression: (node, expression, typeArguments, args) =>
			nativeFactory.updateCallExpression(
				node,
				expression,
				node.questionDotToken,
				typeArguments,
				args
			),
		createStringLiteral: (text) => nativeFactory.createStringLiteral(text, native.TokenFlags.None),
		createNumericLiteral: (value) =>
			nativeFactory.createNumericLiteral(String(value), native.TokenFlags.None),
		createArrayLiteralExpression: (elements = [], multiLine) =>
			nativeFactory.createArrayLiteralExpression(elements, multiLine),
		createObjectLiteralExpression: (properties = [], multiLine) =>
			nativeFactory.createObjectLiteralExpression(properties, multiLine),
		createParameterDeclaration: (
			modifiers,
			dotDotDotToken,
			name,
			questionToken,
			type,
			initializer
		) =>
			nativeFactory.createParameterDeclaration(
				modifiers,
				dotDotDotToken,
				bindingName(name),
				questionToken,
				type,
				initializer
			),
		createVariableDeclaration: (name, exclamationToken, type, initializer) =>
			nativeFactory.createVariableDeclaration(
				bindingName(name),
				exclamationToken,
				type,
				initializer
			),
		createTypeReferenceNode: (name, typeArguments) =>
			nativeFactory.createTypeReferenceNode(entityName(name), typeArguments),
		createPropertySignature: (modifiers, name, questionToken, type) =>
			nativeFactory.createPropertySignatureDeclaration(
				modifiers,
				propertyName(name),
				questionToken,
				type,
				undefined as never
			),
		createPropertyAssignment: (name, initializer) =>
			nativeFactory.createPropertyAssignment(
				undefined,
				propertyName(name),
				undefined,
				undefined as never,
				initializer
			),
		createShorthandPropertyAssignment: (name, initializer) =>
			nativeFactory.createShorthandPropertyAssignment(
				undefined,
				propertyName(name),
				undefined,
				undefined as never,
				undefined,
				initializer
			),
		createImportClause: (isTypeOnly, name, bindings) =>
			nativeFactory.createImportClause(
				isTypeOnly ? native.SyntaxKind.TypeKeyword : undefined,
				name,
				bindings
			),
		updateImportClause: (node, _isTypeOnly, name, bindings) =>
			nativeFactory.updateImportClause(node, name, bindings),
		createExportAssignment: (modifiers, isExportEquals, expression) =>
			nativeFactory.createExportAssignment(
				modifiers,
				isExportEquals,
				undefined as never,
				expression
			),
		createExportDefault: (expression) =>
			nativeFactory.createExportAssignment(undefined, false, undefined as never, expression),
		createModifier: (kind) => nativeFactory.createToken(kind),
		createThis: () => nativeFactory.createKeywordExpression(native.SyntaxKind.ThisKeyword),
		createTrue: () => nativeFactory.createKeywordExpression(native.SyntaxKind.TrueKeyword),
		createFalse: () => nativeFactory.createKeywordExpression(native.SyntaxKind.FalseKeyword),
		createNull: () => nativeFactory.createKeywordExpression(native.SyntaxKind.NullKeyword),
		createUniqueName: (base) => {
			const index = generatedNames.get(base) ?? 1;
			generatedNames.set(base, index + 1);
			return nativeFactory.createIdentifier(`${base}_${index}`);
		},
		createCommaListExpression: (elements) =>
			elements
				.slice(1)
				.reduce(
					(left: native.Expression, right: native.Expression) =>
						nativeFactory.createBinaryExpression(
							undefined,
							left,
							undefined,
							nativeFactory.createToken(native.SyntaxKind.CommaToken),
							right
						),
					elements[0]
				),
		updatePropertyAccessExpression: (node, expression, name) =>
			nativeFactory.updatePropertyAccessExpression(
				node,
				expression,
				node.questionDotToken,
				propertyName(name) as native.MemberName
			),
		updateElementAccessExpression: (node, expression, argument) =>
			nativeFactory.updateElementAccessExpression(
				node,
				expression,
				node.questionDotToken,
				argument
			),
		updateSourceFile: (node, statements) =>
			nativeFactory.updateSourceFile(node, statements, node.endOfFileToken)
	};
	const updateWrappers = new Map<string, (...args: any[]) => any>();
	const factory = new Proxy(overrides, {
		get(target, property: string) {
			const operation = target[property] ?? (nativeFactory as unknown as NodeFactory)[property];
			if (!property.startsWith('update') || typeof operation !== 'function') return operation;
			let wrapper = updateWrappers.get(property);
			if (!wrapper) {
				wrapper = (...args: any[]) => {
					const updated = operation(...args);
					if (updated !== args[0] && isNode(updated) && isNode(args[0]))
						originalNodes.set(updated, getOriginalNode(args[0]));
					return updated;
				};
				updateWrappers.set(property, wrapper);
			}
			return wrapper;
		}
	});
	return Object.freeze({ factory });
}

/** Applies native transformer factories in declaration order. */
export function transformSourceFile(
	sourceFile: native.SourceFile,
	transformers: readonly TransformerFactory<native.SourceFile>[]
): native.SourceFile {
	let transformed = sourceFile;
	const context = createTransformationContext();
	for (const transformer of transformers) transformed = transformer(context)(transformed);
	return transformed;
}

/** Shared factory for small helpers that do not participate in a transform context. */
export const factory = createTransformationContext().factory;

/** Visits direct children while accepting the legacy ignored context argument. */
export function visitEachChild<T extends native.Node>(
	node: T,
	visitor: native.Visitor,
	_context?: TransformationContext
): T {
	const visited = native.visitEachChild(node, visitor);
	if (visited !== node) originalNodes.set(visited, getOriginalNode(node));
	return visited;
}

/** Visits one node through the native visitor API. */
export function visitNode<T extends native.Node>(
	node: T | undefined,
	visitor: native.Visitor
): native.Node | undefined {
	return native.visitNode(node, visitor);
}

/** Walks direct children using the node-owned native traversal. */
export function forEachChild<T>(
	node: native.Node,
	visitor: (child: native.Node) => T
): T | undefined {
	return node.forEachChild(visitor);
}

/** TypeScript 6 compatibility name for the native function-like predicate. */
export const isFunctionLike = native.isFunctionLikeDeclaration;
/** TypeScript 6 compatibility name for the native class-like predicate. */
export const isClassLike = native.isClassLikeDeclaration;
/** TypeScript 6 compatibility name for the native parameter predicate. */
export const isParameter = native.isParameterDeclaration;
/** TypeScript 6 compatibility name for native type assertions. */
export const isTypeAssertionExpression = native.isTypeAssertion;

/** Narrows string-like literal nodes used for static property names. */
export function isStringLiteralLike(
	node: native.Node
): node is native.StringLiteral | native.NoSubstitutionTemplateLiteral {
	return native.isStringLiteral(node) || native.isNoSubstitutionTemplateLiteral(node);
}

/** Returns modifiers directly from native declarations that carry them. */
export function getModifiers(node: native.Node): readonly native.ModifierLike[] | undefined {
	return (node as native.Node & { modifiers?: readonly native.ModifierLike[] }).modifiers;
}

/** Reports whether a native node structurally carries modifiers. */
export function canHaveModifiers(
	node: native.Node
): node is native.Node & { modifiers?: readonly native.ModifierLike[] } {
	return 'modifiers' in node;
}

/** Returns the parsed node from which a native updated node was derived. */
export function getOriginalNode<T extends native.Node>(node: T): T {
	return (originalNodes.get(node) as T | undefined) ?? node;
}

/**
 * Records a synthetic leading comment request.
 *
 * The native emitter does not yet expose its comment attachment API. The node
 * remains structurally unchanged until pure annotations move to the generated
 * text metadata pass.
 */
export function addSyntheticLeadingComment<T extends native.Node>(
	node: T,
	_kind: native.SyntaxKind,
	_text: string,
	_trailingNewLine: boolean
): T {
	return node;
}

function propertyName(value: string | native.PropertyName): native.PropertyName {
	return typeof value === 'string' ? nativeFactory.createIdentifier(value) : value;
}

function entityName(value: string | native.EntityName): native.EntityName {
	return typeof value === 'string' ? nativeFactory.createIdentifier(value) : value;
}

function bindingName(value: string | native.BindingName): native.BindingName {
	return typeof value === 'string' ? nativeFactory.createIdentifier(value) : value;
}

function token<T extends native.TokenSyntaxKind>(value: T | native.Token<T>): native.Token<T> {
	return typeof value === 'number' ? nativeFactory.createToken(value) : value;
}

function isNode(value: unknown): value is native.Node {
	return typeof value === 'object' && value !== null && 'kind' in value;
}
