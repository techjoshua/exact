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
	type ExpressionDiagnostic,
	type ExpressionDirective,
	type ExpressionCallParameter,
	type ExpressionCallSignature,
	type ExpressionNode,
	type ExpressionScope,
	type ExpressionSymbol,
	type ExpressionType,
	type ExpressionTypeProperty,
	type ExpressionTypeKind,
	type FunctionExpressionNode,
	type JsxExpressionNode,
	type JsxAttributeNode,
	type JsxElementNode,
	type NodeCategory,
	type NodeEffect,
	type ScopeKind,
	type SourceSpan,
	type Variable,
	type WalkOptions
} from './model.js';
export { NodeQuery, NodeRef } from './query.js';
export {
	buildControlFlowGraph,
	type ControlFlowGraph,
	type ControlFlowNode
} from './control-flow.js';
export {
	ExpressionModule,
	createModule,
	type BoundModule,
	type ModuleState,
	type SourceTrivia,
	type UnboundModule
} from './module.js';
export {
	ExpressionProject,
	ExpressionProjectError,
	createExpressionProject,
	findExpressionConfig,
	type ExpressionProjectOptions,
	type ExpressionProjectProfileEvent,
	type ExpressionProjectStats
} from './project.js';
export {
	ExpressionLanguageService,
	createExpressionLanguageService,
	type ExpressionLanguageServiceChange,
	type ExpressionLanguageServiceOptions,
	type ExpressionLanguageServiceStats,
	type ExpressionLanguageServiceUpdate
} from './language-service.js';
export {
	BlockBuilder,
	ClassBuilder,
	FunctionBuilder,
	ModuleBuilder,
	TypeBuilder,
	moduleBuilder,
	printNode,
	type FunctionOptions,
	type ImportOptions,
	type MethodOptions,
	type PropertyOptions
} from './builder.js';
export {
	ModuleRewriter,
	cloneWithVariables,
	lowerModuleText,
	rewriteModule,
	type TextLowerer,
	type TextLoweringContext
} from './rewrite.js';
export { validateExpressionTree } from './validation.js';
export {
	rewriteModuleReferences,
	type ModuleExportReplacement,
	type ModuleRewriteOptions,
	type ModuleRewriteResult
} from './module-rewrite.js';
export { createLineSourceMap, type GeneratedSourceMap } from './source-map.js';

import { moduleBuilder } from './builder.js';
import { createExpressionProject } from './project.js';

/** Concise namespace-style entry point for programmatic construction. */
export const expressions = Object.freeze({
	module: moduleBuilder,
	project: createExpressionProject
});
