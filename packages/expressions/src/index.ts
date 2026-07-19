export {
	BlockBuilder,
	ClassBuilder,
	FunctionBuilder,
	ModuleBuilder,
	moduleBuilder,
	printNode,
	TypeBuilder,
	type FunctionOptions,
	type ImportOptions,
	type MethodOptions,
	type PropertyOptions
} from './builder.js';
export {
	buildControlFlowGraph,
	type ControlFlowGraph,
	type ControlFlowNode
} from './control-flow.js';
export {
	createExpressionLanguageService,
	ExpressionLanguageService,
	type ExpressionLanguageServiceChange,
	type ExpressionLanguageServiceOptions,
	type ExpressionLanguageServiceStats,
	type ExpressionLanguageServiceUpdate
} from './language-service.js';
export {
	isAssignmentExpression,
	isCallExpression,
	isFunctionExpression,
	isJsxAttribute,
	isJsxElement,
	isJsxExpression,
	type AssignmentExpressionNode,
	type CallExpressionNode,
	type EmitOptions,
	type EmitResult,
	type ExpressionCallParameter,
	type ExpressionCallSignature,
	type ExpressionDiagnostic,
	type ExpressionDirective,
	type ExpressionNode,
	type ExpressionScope,
	type ExpressionSymbol,
	type ExpressionType,
	type ExpressionTypeKind,
	type ExpressionTypeProperty,
	type FunctionExpressionNode,
	type JsxAttributeNode,
	type JsxElementNode,
	type JsxExpressionNode,
	type NodeCategory,
	type NodeEffect,
	type ScopeKind,
	type SourceSpan,
	type Variable,
	type WalkOptions
} from './model.js';
export {
	rewriteModuleReferences,
	type ModuleExportReplacement,
	type ModuleRewriteOptions,
	type ModuleRewriteResult
} from './module-rewrite.js';
export {
	createModule,
	ExpressionModule,
	type BoundModule,
	type ModuleState,
	type SourceTrivia,
	type UnboundModule
} from './module.js';
export {
	createExpressionProject,
	ExpressionProject,
	ExpressionProjectError,
	findExpressionConfig,
	type ExpressionProjectOptions,
	type ExpressionProjectProfileEvent,
	type ExpressionProjectStats
} from './project.js';
export { NodeQuery, NodeRef } from './query.js';
export {
	cloneWithVariables,
	lowerModuleText,
	ModuleRewriter,
	rewriteModule,
	type TextLowerer,
	type TextLoweringContext
} from './rewrite.js';
export { createLineSourceMap, type GeneratedSourceMap } from './source-map.js';
export { validateExpressionTree } from './validation.js';
export { expressions } from './namespace.js';
