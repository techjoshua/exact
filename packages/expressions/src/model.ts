/** A half-open source range in the original module. */
export type SourceSpan = Readonly<{
	start: number;
	end: number;
	line: number;
	column: number;
}>;

/** Defines the node category type contract. */
export type NodeCategory =
	| 'module'
	| 'statement'
	| 'expression'
	| 'declaration'
	| 'pattern'
	| 'jsx'
	| 'type'
	| 'token';

/** Source-level compiler metadata projected without exposing TypeScript trivia. */
export interface ExpressionDirective {
	readonly namespace: string;
	readonly key: string;
	readonly value?: string;
	readonly span?: SourceSpan;
}

/** Defines the expression type kind type contract. */
export type ExpressionTypeKind =
	| 'any'
	| 'unknown'
	| 'never'
	| 'void'
	| 'undefined'
	| 'null'
	| 'boolean'
	| 'number'
	| 'bigint'
	| 'string'
	| 'symbol'
	| 'object'
	| 'function'
	| 'union'
	| 'intersection'
	| 'type-parameter';

/** Defines the expression call parameter interface contract. */
export interface ExpressionCallParameter {
	readonly name: string;
	readonly type: ExpressionType;
	readonly optional: boolean;
	readonly rest: boolean;
	readonly directives?: readonly ExpressionDirective[];
}

/** Defines the expression call signature interface contract. */
export interface ExpressionCallSignature {
	readonly display: string;
	readonly parameters: readonly ExpressionCallParameter[];
	readonly returnType: ExpressionType;
	readonly typeParameters: readonly string[];
	/** Package-owned provenance for distinguishing platform intrinsics from lookalikes. */
	readonly declarationSource?: string;
	readonly directives?: readonly ExpressionDirective[];
	readonly returnDirectives?: readonly ExpressionDirective[];
}

/** Defines the expression type property interface contract. */
export interface ExpressionTypeProperty {
	readonly name: string;
	readonly type: ExpressionType;
	readonly optional: boolean;
	readonly readonly: boolean;
	readonly directives?: readonly ExpressionDirective[];
}

/** TypeScript type information expressed without leaking compiler objects. */
export interface ExpressionType {
	readonly id: string;
	readonly kind: ExpressionTypeKind;
	readonly display: string;
	readonly nullable: boolean;
	readonly callable: boolean;
	readonly properties: readonly string[];
	readonly propertyTypes: readonly ExpressionTypeProperty[];
	readonly unionMembers: readonly ExpressionType[];
	readonly callSignatures: readonly ExpressionCallSignature[];
	readonly typeArguments: readonly ExpressionType[];
	readonly typeParameters: readonly string[];
	/** Compiler-owned intrinsic collection classification. */
	readonly collectionKind?: 'array' | 'readonly-array' | 'tuple';
	readonly directives?: readonly ExpressionDirective[];
}

/** Defines the scope kind type contract. */
export type ScopeKind = 'module' | 'function' | 'class' | 'block' | 'catch';

/** Defines the expression scope interface contract. */
export interface ExpressionScope {
	readonly id: string;
	readonly kind: ScopeKind;
	readonly parent?: ExpressionScope;
	readonly variables: readonly Variable[];
}

/** Project-owned symbol identity that survives TypeChecker and module rebuilds. */
export interface ExpressionSymbol {
	readonly id: string;
	readonly name: string;
}

/** Canonical binding identity shared by declarations and every use. */
export interface Variable {
	/** Stable across project rebuilds while this declaration remains equivalent. */
	readonly id: string;
	readonly symbol: ExpressionSymbol;
	readonly name: string;
	readonly declarationKind: string;
	/** Whether ordinary source code may assign a new value to this binding. */
	readonly mutable: boolean;
	readonly scope: ExpressionScope;
	readonly type?: ExpressionType;
	readonly exported: boolean;
	readonly importedFrom?: string;
	/** True when this binding exists only in the TypeScript type namespace. */
	readonly typeOnly: boolean;
	readonly synthetic: boolean;
	readonly directives?: readonly ExpressionDirective[];
}

/** Defines the expression node interface contract. */
export interface ExpressionNode {
	readonly id: string;
	/** A stable, descriptive TypeScript syntax name such as CallExpression. */
	readonly kind: string;
	readonly category: NodeCategory;
	readonly span?: SourceSpan;
	readonly children: readonly ExpressionNode[];
	readonly synthetic: boolean;
	readonly scope: ExpressionScope;
	readonly type?: ExpressionType;
	readonly variable?: Variable;
	readonly text?: string;
	readonly name?: string;
	readonly operator?: string;
	readonly generatedText?: string;
	/** The overload selected by TypeScript for this call expression, when known. */
	readonly resolvedSignature?: ExpressionCallSignature;
	readonly directives?: readonly ExpressionDirective[];
}

/** Defines the call expression node interface contract. */
export interface CallExpressionNode extends ExpressionNode {
	readonly kind: 'CallExpression' | 'NewExpression';
	readonly target: ExpressionNode;
	readonly arguments: readonly ExpressionNode[];
	readonly resolvedSignature?: ExpressionCallSignature;
}

/** Defines the function expression node interface contract. */
export interface FunctionExpressionNode extends ExpressionNode {
	readonly kind:
		| 'FunctionDeclaration'
		| 'FunctionExpression'
		| 'ArrowFunction'
		| 'MethodDeclaration';
	readonly parameters: readonly Variable[];
	readonly captures: readonly Variable[];
}

/** Defines the assignment expression node interface contract. */
export interface AssignmentExpressionNode extends ExpressionNode {
	readonly kind: 'BinaryExpression' | 'PrefixUnaryExpression' | 'PostfixUnaryExpression';
	readonly operator: string;
}

/** Defines the jsx expression node interface contract. */
export interface JsxExpressionNode extends ExpressionNode {
	readonly category: 'jsx';
}

/** Defines the jsx element node interface contract. */
export interface JsxElementNode extends JsxExpressionNode {
	readonly kind: 'JsxElement' | 'JsxSelfClosingElement' | 'JsxFragment';
	readonly tagName?: string;
	readonly attributes: readonly JsxAttributeNode[];
	readonly jsxChildren: readonly ExpressionNode[];
}

/** Defines the jsx attribute node interface contract. */
export interface JsxAttributeNode extends JsxExpressionNode {
	readonly kind: 'JsxAttribute' | 'JsxSpreadAttribute';
	readonly name?: string;
	readonly initializer?: ExpressionNode;
}

/** Defines the expression diagnostic interface contract. */
export interface ExpressionDiagnostic {
	readonly code: string;
	readonly message: string;
	readonly severity: 'error' | 'warning';
	readonly phase?: 'configuration' | 'syntax' | 'semantic' | 'structure';
	readonly filename?: string;
	readonly span?: SourceSpan;
}

/** Defines the node effect interface contract. */
export interface NodeEffect {
	readonly node: ExpressionNode;
	readonly variable: Variable;
	readonly kind: 'read' | 'write' | 'capture';
}

/** Configures emit. */
export interface EmitOptions {
	readonly format?: 'preserve' | 'generated';
	readonly sourceMap?: boolean;
	readonly newline?: 'lf' | 'crlf';
	readonly quote?: 'single' | 'double';
	readonly semicolons?: boolean;
}

/** Describes the result produced by emit. */
export interface EmitResult {
	readonly code: string;
	readonly map?: Readonly<{
		version: 3;
		file: string;
		sources: readonly string[];
		sourcesContent: readonly string[];
		names: readonly string[];
		mappings: string;
	}>;
}

/** Configures walk. */
export interface WalkOptions {
	readonly includeSelf?: boolean;
	readonly nestedFunctions?: boolean;
	readonly nestedClasses?: boolean;
	readonly jsx?: boolean;
	readonly types?: boolean;
}

/** Reports whether call expression. */
export function isCallExpression(node: ExpressionNode): node is CallExpressionNode {
	return node.kind === 'CallExpression' || node.kind === 'NewExpression';
}

/** Reports whether function expression. */
export function isFunctionExpression(node: ExpressionNode): node is FunctionExpressionNode {
	return (
		node.kind === 'FunctionDeclaration' ||
		node.kind === 'FunctionExpression' ||
		node.kind === 'ArrowFunction' ||
		node.kind === 'MethodDeclaration'
	);
}

/** Reports whether assignment expression. */
export function isAssignmentExpression(node: ExpressionNode): node is AssignmentExpressionNode {
	return (
		(node.kind === 'BinaryExpression' ||
			node.kind === 'PrefixUnaryExpression' ||
			node.kind === 'PostfixUnaryExpression') &&
		typeof node.operator === 'string'
	);
}

/** Reports whether jsx expression. */
export function isJsxExpression(node: ExpressionNode): node is JsxExpressionNode {
	return node.category === 'jsx';
}

/** Reports whether jsx element. */
export function isJsxElement(node: ExpressionNode): node is JsxElementNode {
	return (
		node.kind === 'JsxElement' ||
		node.kind === 'JsxSelfClosingElement' ||
		node.kind === 'JsxFragment'
	);
}

/** Reports whether jsx attribute. */
export function isJsxAttribute(node: ExpressionNode): node is JsxAttributeNode {
	return node.kind === 'JsxAttribute' || node.kind === 'JsxSpreadAttribute';
}
