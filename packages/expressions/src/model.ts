/** A half-open source range in the original module. */
export type SourceSpan = Readonly<{
  start: number;
  end: number;
  line: number;
  column: number;
}>;

export type NodeCategory =
  | "module"
  | "statement"
  | "expression"
  | "declaration"
  | "pattern"
  | "jsx"
  | "type"
  | "token";

export type ExpressionTypeKind =
  | "any"
  | "unknown"
  | "never"
  | "void"
  | "undefined"
  | "null"
  | "boolean"
  | "number"
  | "bigint"
  | "string"
  | "symbol"
  | "object"
  | "function"
  | "union"
  | "intersection"
  | "type-parameter";

export interface ExpressionCallParameter {
  readonly name: string;
  readonly type: ExpressionType;
  readonly optional: boolean;
  readonly rest: boolean;
}

export interface ExpressionCallSignature {
  readonly display: string;
  readonly parameters: readonly ExpressionCallParameter[];
  readonly returnType: ExpressionType;
  readonly typeParameters: readonly string[];
}

/** TypeScript type information expressed without leaking compiler objects. */
export interface ExpressionType {
  readonly id: string;
  readonly kind: ExpressionTypeKind;
  readonly display: string;
  readonly nullable: boolean;
  readonly callable: boolean;
  readonly properties: readonly string[];
  readonly unionMembers: readonly ExpressionType[];
  readonly callSignatures: readonly ExpressionCallSignature[];
  readonly typeArguments: readonly ExpressionType[];
  readonly typeParameters: readonly string[];
}

export type ScopeKind = "module" | "function" | "class" | "block" | "catch";

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
  readonly scope: ExpressionScope;
  readonly type?: ExpressionType;
  readonly exported: boolean;
  readonly importedFrom?: string;
  readonly synthetic: boolean;
}

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
}

export interface CallExpressionNode extends ExpressionNode {
  readonly kind: "CallExpression" | "NewExpression";
  readonly target: ExpressionNode;
  readonly arguments: readonly ExpressionNode[];
}

export interface FunctionExpressionNode extends ExpressionNode {
  readonly kind: "FunctionDeclaration" | "FunctionExpression" | "ArrowFunction" | "MethodDeclaration";
  readonly parameters: readonly Variable[];
  readonly captures: readonly Variable[];
}

export interface AssignmentExpressionNode extends ExpressionNode {
  readonly kind: "BinaryExpression" | "PrefixUnaryExpression" | "PostfixUnaryExpression";
  readonly operator: string;
}

export interface JsxExpressionNode extends ExpressionNode {
  readonly category: "jsx";
}

export interface JsxElementNode extends JsxExpressionNode {
  readonly kind: "JsxElement" | "JsxSelfClosingElement" | "JsxFragment";
  readonly tagName?: string;
  readonly attributes: readonly JsxAttributeNode[];
  readonly jsxChildren: readonly ExpressionNode[];
}

export interface JsxAttributeNode extends JsxExpressionNode {
  readonly kind: "JsxAttribute" | "JsxSpreadAttribute";
  readonly name?: string;
  readonly initializer?: ExpressionNode;
}

export interface ExpressionDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: "error" | "warning";
  readonly phase?: "configuration" | "syntax" | "semantic" | "structure";
  readonly filename?: string;
  readonly span?: SourceSpan;
}

export interface NodeEffect {
  readonly node: ExpressionNode;
  readonly variable: Variable;
  readonly kind: "read" | "write" | "capture";
}

export interface EmitOptions {
  readonly format?: "preserve" | "generated";
  readonly sourceMap?: boolean;
  readonly newline?: "lf" | "crlf";
  readonly quote?: "single" | "double";
  readonly semicolons?: boolean;
}

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

export interface WalkOptions {
  readonly includeSelf?: boolean;
  readonly nestedFunctions?: boolean;
  readonly nestedClasses?: boolean;
  readonly jsx?: boolean;
  readonly types?: boolean;
}

export function isCallExpression(node: ExpressionNode): node is CallExpressionNode {
  return node.kind === "CallExpression" || node.kind === "NewExpression";
}

export function isFunctionExpression(node: ExpressionNode): node is FunctionExpressionNode {
  return node.kind === "FunctionDeclaration" || node.kind === "FunctionExpression"
    || node.kind === "ArrowFunction" || node.kind === "MethodDeclaration";
}

export function isAssignmentExpression(node: ExpressionNode): node is AssignmentExpressionNode {
  return (node.kind === "BinaryExpression" || node.kind === "PrefixUnaryExpression" || node.kind === "PostfixUnaryExpression")
    && typeof node.operator === "string";
}

export function isJsxExpression(node: ExpressionNode): node is JsxExpressionNode {
  return node.category === "jsx";
}

export function isJsxElement(node: ExpressionNode): node is JsxElementNode {
  return node.kind === "JsxElement" || node.kind === "JsxSelfClosingElement" || node.kind === "JsxFragment";
}

export function isJsxAttribute(node: ExpressionNode): node is JsxAttributeNode {
  return node.kind === "JsxAttribute" || node.kind === "JsxSpreadAttribute";
}
